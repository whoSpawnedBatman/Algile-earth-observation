"""Comprehensive automated test suite for ORBITAL Python Backend.

Covers:
1. Synthetic dataset generation & reproducibility
2. Feature engineering & Z-score preprocessing
3. Random Forest training & evaluation metrics (Accuracy, Precision, Recall, F1, Confusion Matrix)
4. Single-task feasibility prediction
5. REST API endpoints (/api/health, /api/model, /api/schedule, /api/simulation, /api/history)
6. Scheduling constraints (energy limits, storage limits, time-window violations, slew rate limits)
7. Zero task conflicts guarantee across all 3 strategies
8. Deterministic outputs for fixed seeds
9. Graceful invalid input handling (400/422 responses)

Compatible with both `pytest` and `python3 -m unittest discover -s backend/tests -v`.
"""
from __future__ import annotations
import unittest
from typing import List, Dict, Any

from app.models.schemas import ObservationTask, validate_task_payload
from app.ml.dataset import (
    generate_synthetic_training_dataset,
    generate_candidate_mission_tasks,
)
from app.ml.preprocessing import (
    FEATURE_NAMES,
    FeatureScaler,
    extract_features_from_record,
    stratified_train_test_split,
)
from app.ml.classifier import RandomForestFeasibilityModel
from app.scheduler.engine import (
    run_single_strategy_schedule,
    compare_scheduling_strategies,
)
from app.api.routes import handle_api_request


class TestOrbitalPlatform(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.rf_model = RandomForestFeasibilityModel(n_estimators=35, max_depth=7, seed=42)
        cls.training_summary = cls.rf_model.train_on_synthetic_dataset(n_samples=400)

    def test_01_dataset_generation_and_determinism(self) -> None:
        """Dataset generator produces expected fields, realistic ranges, and deterministic outputs."""
        ds1 = generate_synthetic_training_dataset(n_samples=120, seed=42)
        ds2 = generate_synthetic_training_dataset(n_samples=120, seed=42)
        ds_diff = generate_synthetic_training_dataset(n_samples=120, seed=99)

        self.assertEqual(len(ds1), 120)
        self.assertEqual(ds1, ds2, "Fixed seed must produce identical synthetic dataset")
        self.assertNotEqual(ds1[0]["window_start"], ds_diff[0]["window_start"])

        required_keys = {
            "window_start", "window_end", "imaging_duration", "priority",
            "energy_cost", "storage_cost", "slew_time", "cloud_coverage",
            "base_reward", "feasible"
        }
        for row in ds1:
            self.assertTrue(required_keys.issubset(row.keys()))
            self.assertIn(row["feasible"], (0, 1))
            self.assertGreater(row["window_end"], row["window_start"])
            self.assertGreaterEqual(row["priority"], 1)
            self.assertLessEqual(row["priority"], 10)

    def test_02_feature_preprocessing_and_split(self) -> None:
        """Feature extraction produces 13 engineered features and scaler standardizes to zero mean."""
        ds = generate_synthetic_training_dataset(n_samples=100, seed=42)
        X = [extract_features_from_record(r) for r in ds]
        y = [int(r["feasible"]) for r in ds]

        self.assertEqual(len(X[0]), len(FEATURE_NAMES))
        scaler = FeatureScaler()
        X_scaled = scaler.fit_transform(X)
        self.assertEqual(len(X_scaled), 100)

        # Verify column means are ~0.0 after Z-score scaling
        for col_idx in range(len(FEATURE_NAMES)):
            col_mean = sum(row[col_idx] for row in X_scaled) / len(X_scaled)
            self.assertAlmostEqual(col_mean, 0.0, places=4)

        X_tr, X_te, y_tr, y_te, _, _ = stratified_train_test_split(X, y, ds, test_size=0.2, seed=42)
        self.assertEqual(len(X_tr) + len(X_te), 100)
        self.assertAlmostEqual(len(X_te), 20, delta=2)

    def test_03_random_forest_training_and_metrics(self) -> None:
        """Random Forest achieves strong validation metrics and produces a valid confusion matrix."""
        metrics = self.training_summary["test_metrics"]
        self.assertGreaterEqual(metrics["accuracy"], 0.75)
        self.assertGreaterEqual(metrics["precision"], 0.70)
        self.assertGreaterEqual(metrics["recall"], 0.70)
        self.assertGreaterEqual(metrics["f1_score"], 0.72)

        cm = metrics["confusion_matrix"]
        self.assertEqual(cm["tp"] + cm["fp"] + cm["tn"] + cm["fn"], metrics["sample_count"])
        self.assertEqual(len(self.training_summary["feature_importances"]), len(FEATURE_NAMES))

    def test_04_model_prediction_distinguishes_feasible_vs_infeasible(self) -> None:
        """Model predicts high probability for ideal task and low probability for impossible task."""
        ideal_task = {
            "task_id": "IDEAL-1",
            "window_start": 500.0,
            "window_end": 640.0,
            "imaging_duration": 35.0,
            "slew_time": 15.0,
            "slew_angle_deg": 12.0,
            "priority": 9,
            "energy_cost": 18.0,
            "storage_cost": 9.0,
            "cloud_coverage": 5.0,
            "solar_elevation_deg": 55.0,
            "base_reward": 180.0,
            "sensor_type": "OPTICAL_HI_RES",
        }
        infeasible_task = {
            "task_id": "BAD-1",
            "window_start": 500.0,
            "window_end": 530.0,  # 30s window for 60s imaging + 35s slew!
            "imaging_duration": 60.0,
            "slew_time": 35.0,
            "slew_angle_deg": 42.0,
            "priority": 4,
            "energy_cost": 50.0,
            "storage_cost": 28.0,
            "cloud_coverage": 92.0,
            "solar_elevation_deg": 4.0,
            "base_reward": 60.0,
            "sensor_type": "OPTICAL_HI_RES",
        }
        pred_good = self.rf_model.predict_task(ideal_task)
        pred_bad = self.rf_model.predict_task(infeasible_task)

        self.assertGreater(pred_good["feasibility_probability"], pred_bad["feasibility_probability"])
        self.assertEqual(pred_good["feasible_prediction"], 1)
        self.assertEqual(pred_bad["feasible_prediction"], 0)

    def test_05_no_task_conflicts_in_any_strategy(self) -> None:
        """Scheduler never schedules two overlapping tasks simultaneously under any strategy."""
        tasks = generate_candidate_mission_tasks(num_tasks=32, horizon_seconds=5400.0, seed=42)
        comparison = compare_scheduling_strategies(
            tasks=tasks,
            rf_model=self.rf_model,
            max_energy_wh=320.0,
            max_storage_gb=165.0,
        )

        for strat_name, strat_res in comparison["strategies"].items():
            scheduled = strat_res["scheduled_tasks"]
            self.assertGreater(len(scheduled), 0, f"Strategy {strat_name} should schedule tasks")
            # Sorted by manoeuvre_start
            for i in range(len(scheduled)):
                s_i = float(scheduled[i]["manoeuvre_start"])
                e_i = float(scheduled[i]["execution_end"])
                w_start = float(scheduled[i]["window_start"])
                w_end = float(scheduled[i]["window_end"])
                self.assertGreaterEqual(s_i, w_start - 1e-5)
                self.assertLessEqual(e_i, w_end + 1e-5)
                if i > 0:
                    prev_end = float(scheduled[i - 1]["execution_end"])
                    self.assertGreaterEqual(
                        s_i,
                        prev_end - 1e-5,
                        f"Overlap detected in {strat_name} between {scheduled[i-1]['task_id']} and {scheduled[i]['task_id']}",
                    )

    def test_06_energy_and_storage_limits_enforced(self) -> None:
        """Cumulative energy and storage never exceed configured satellite bus limits."""
        tasks = generate_candidate_mission_tasks(num_tasks=30, horizon_seconds=5400.0, seed=7)
        strict_energy = 75.0
        strict_storage = 40.0

        comparison = compare_scheduling_strategies(
            tasks=tasks,
            rf_model=self.rf_model,
            max_energy_wh=strict_energy,
            max_storage_gb=strict_storage,
        )

        for strat_name, res in comparison["strategies"].items():
            self.assertLessEqual(res["energy_consumption"], strict_energy + 1e-5)
            self.assertLessEqual(res["storage_consumption"], strict_storage + 1e-5)
            rej_codes = {r["rejection_code"] for r in res["rejected_tasks"]}
            self.assertTrue(
                "ENERGY_BUDGET_EXCEEDED" in rej_codes or "STORAGE_CAPACITY_EXCEEDED" in rej_codes,
                f"Expected resource limit rejections in {strat_name}",
            )

    def test_07_time_window_violations_and_conflicts_rejected(self) -> None:
        """Tasks violating time windows or overlapping identically are rejected with explicit reasons."""
        custom_tasks = [
            ObservationTask(
                task_id="T-VALID-1",
                target_name="Primary Target A",
                target_lat=10.0,
                target_lon=20.0,
                window_start=100.0,
                window_end=180.0,
                imaging_duration=45.0,
                priority=9,
                energy_cost=20.0,
                storage_cost=10.0,
                slew_time=20.0,
                slew_angle_deg=15.0,
                cloud_coverage=5.0,
                solar_elevation_deg=50.0,
                base_reward=180.0,
            ),
            ObservationTask(
                task_id="T-CONFLICT-2",
                target_name="Overlapping Target B",
                target_lat=10.2,
                target_lon=20.2,
                window_start=105.0,
                window_end=175.0,
                imaging_duration=45.0,
                priority=6,
                energy_cost=20.0,
                storage_cost=10.0,
                slew_time=20.0,
                slew_angle_deg=15.0,
                cloud_coverage=5.0,
                solar_elevation_deg=50.0,
                base_reward=120.0,
            ),
            ObservationTask(
                task_id="T-WIN-VIOLATION-3",
                target_name="Impossible Window Target C",
                target_lat=15.0,
                target_lon=25.0,
                window_start=400.0,
                window_end=430.0,  # Only 30s window, needs 50+20 = 70s
                imaging_duration=50.0,
                priority=10,
                energy_cost=20.0,
                storage_cost=10.0,
                slew_time=20.0,
                slew_angle_deg=15.0,
                cloud_coverage=5.0,
                solar_elevation_deg=50.0,
                base_reward=200.0,
            ),
        ]

        res = run_single_strategy_schedule(
            tasks=custom_tasks,
            strategy="priority_based",
            rf_model=self.rf_model,
            max_energy_wh=300.0,
            max_storage_gb=150.0,
        )

        sched_ids = [t["task_id"] for t in res["scheduled_tasks"]]
        rej_map = {t["task_id"]: t["rejection_code"] for t in res["rejected_tasks"]}

        self.assertEqual(sched_ids, ["T-VALID-1"])
        self.assertEqual(rej_map.get("T-CONFLICT-2"), "TIMELINE_CONFLICT")
        self.assertEqual(rej_map.get("T-WIN-VIOLATION-3"), "TIME_WINDOW_VIOLATION")

    def test_08_api_endpoints_and_error_handling(self) -> None:
        """All 5 REST API endpoints respond correctly and reject invalid input gracefully."""
        status_h, health = handle_api_request("GET", "/api/health")
        self.assertEqual(status_h, 200)
        self.assertEqual(health["status"], "ok")

        status_m, model_info = handle_api_request("GET", "/api/model")
        self.assertEqual(status_m, 200)
        self.assertIn("test_metrics", model_info)
        self.assertIn("confusion_matrix", model_info["test_metrics"])

        status_s, sim_res = handle_api_request(
            "POST",
            "/api/simulation",
            {"scenario_name": "Pytest Verification Pass", "num_tasks": 20, "seed": 42},
        )
        self.assertEqual(status_s, 200)
        self.assertEqual(len(sim_res["candidate_tasks"]), 20)
        self.assertIn("ml_assisted", sim_res["strategies"])

        status_sch, sched_res = handle_api_request(
            "POST",
            "/api/schedule",
            {
                "scenario_name": "Direct API Schedule",
                "max_energy_wh": 250.0,
                "max_storage_gb": 120.0,
                "tasks": sim_res["candidate_tasks"][:8],
            },
        )
        self.assertEqual(status_sch, 200)
        self.assertEqual(sched_res["parameters"]["num_tasks"], 8)

        status_hist, hist_res = handle_api_request("GET", "/api/history")
        self.assertEqual(status_hist, 200)
        self.assertGreaterEqual(hist_res["count"], 2)

        # Invalid input handling
        status_bad1, _ = handle_api_request("POST", "/api/schedule", {"tasks": []})
        self.assertEqual(status_bad1, 422)

        status_bad2, _ = handle_api_request("POST", "/api/simulation", {"num_tasks": -5})
        self.assertEqual(status_bad2, 422)


if __name__ == "__main__":
    unittest.main()
