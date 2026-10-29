"""Simulation & Mission Orchestration Service for ORBITAL."""
from __future__ import annotations
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
import math

from ..models.schemas import ObservationTask, validate_task_payload
from ..ml.dataset import generate_candidate_mission_tasks, generate_synthetic_training_dataset
from ..ml.classifier import RandomForestFeasibilityModel
from ..scheduler.engine import compare_scheduling_strategies


class OrbitalSimulationService:
    """Manages the trained Random Forest model, mission simulations, telemetry generation, and history."""

    def __init__(self, default_seed: int = 42) -> None:
        self.default_seed = default_seed
        self.rf_model = RandomForestFeasibilityModel(
            n_estimators=45,
            max_depth=7,
            min_samples_split=4,
            seed=default_seed,
        )
        self.model_summary = self.rf_model.train_on_synthetic_dataset(n_samples=600)
        self.history: List[Dict[str, Any]] = []
        self._run_counter = 0
        # Seed initial baseline mission simulation on startup
        self.run_simulation(
            scenario_name="SSO-Pass-104 (Nominal Baseline)",
            num_tasks=28,
            max_energy_wh=320.0,
            max_storage_gb=165.0,
            horizon_seconds=5400.0,
            max_cloud_cover=65.0,
            ml_threshold=0.48,
            cloud_bias=0.0,
            seed=default_seed,
        )

    def get_health(self) -> Dict[str, Any]:
        return {
            "status": "ok",
            "service": "ORBITAL Satellite Task Scheduling Engine",
            "version": "1.0.0",
            "model_trained": self.rf_model.is_trained,
            "model_backend": self.model_summary.get("engine_backend", "Classical CART Random Forest"),
            "simulation_runs_recorded": len(self.history),
            "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        }

    def get_model_info(self) -> Dict[str, Any]:
        if not self.rf_model.is_trained:
            self.model_summary = self.rf_model.train_on_synthetic_dataset(n_samples=600)
        return {
            **self.model_summary,
            "sample_dataset_preview": self.rf_model.sample_dataset_preview,
        }

    def _generate_orbital_telemetry(
        self,
        horizon_seconds: float,
        ml_schedule: Dict[str, Any],
        max_energy_wh: float,
        max_storage_gb: float,
    ) -> Dict[str, Any]:
        """Generate simulated orbital ground-track coordinates and clearly labelled pass telemetry."""
        points: List[Dict[str, Any]] = []
        steps = 36
        inclination_rad = math.radians(97.8)  # Sun-synchronous retrograde LEO
        for i in range(steps + 1):
            t_sec = round((horizon_seconds * i) / steps, 1)
            phase = (2.0 * math.pi * i) / steps
            lat = round(math.degrees(math.asin(math.sin(inclination_rad) * math.sin(phase))), 2)
            lon = round(((i * (360.0 / steps)) - 165.0 + 180.0) % 360.0 - 180.0, 2)
            altitude_km = round(618.5 + 3.2 * math.cos(phase * 2.0), 2)
            velocity_kms = round(7.545 - 0.004 * math.cos(phase * 2.0), 3)
            in_sunlight = not (0.62 <= (i / steps) <= 0.88)
            points.append({
                "time_s": t_sec,
                "lat": lat,
                "lon": lon,
                "altitude_km": altitude_km,
                "velocity_kms": velocity_kms,
                "in_sunlight": in_sunlight,
            })

        return {
            "is_simulated_telemetry": True,
            "telemetry_label": "SIMULATED TELEMETRY — ORBITAL PROPAGATOR (J2 PERTURBED LEO)",
            "spacecraft_id": "EOSAT-AGILE-01",
            "orbit_regime": "620 km Sun-Synchronous Low Earth Orbit (LTAN 10:30)",
            "inclination_deg": 97.8,
            "orbital_period_min": round(horizon_seconds / 60.0, 1),
            "ground_track": points,
            "bus_telemetry": {
                "solar_array_output_w": 410.0,
                "battery_capacity_wh": max_energy_wh,
                "battery_dod_limit_pct": 80.0,
                "ssr_capacity_gb": max_storage_gb,
                "reaction_wheel_max_slew_deg_s": 2.35,
                "downlink_band": "X-Band 8.2 GHz (1.2 Gbps)",
            },
        }

    def schedule_tasks(
        self,
        tasks_payload: List[Dict[str, Any]],
        max_energy_wh: float = 320.0,
        max_storage_gb: float = 165.0,
        max_cloud_cover: float = 65.0,
        ml_threshold: float = 0.48,
        scenario_name: str = "Custom Task Manifest Schedule",
        record_in_history: bool = True,
    ) -> Dict[str, Any]:
        """Validate and schedule an explicit list of candidate tasks across all 3 strategies."""
        if not isinstance(tasks_payload, list) or len(tasks_payload) == 0:
            raise ValueError("tasks list must be a non-empty array of observation task objects")
        if max_energy_wh <= 0 or max_energy_wh > 5000:
            raise ValueError("max_energy_wh must be between 1 and 5000 Wh")
        if max_storage_gb <= 0 or max_storage_gb > 10000:
            raise ValueError("max_storage_gb must be between 1 and 10000 GB")
        if not (0.0 <= max_cloud_cover <= 100.0):
            raise ValueError("max_cloud_cover must be between 0 and 100")
        if not (0.05 <= ml_threshold <= 0.95):
            raise ValueError("ml_threshold must be between 0.05 and 0.95")

        parsed_tasks: List[ObservationTask] = []
        for idx, raw in enumerate(tasks_payload):
            if not isinstance(raw, dict):
                raise ValueError(f"Task at index {idx} must be a JSON object")
            errs = validate_task_payload(raw)
            if errs:
                raise ValueError(f"Invalid task at index {idx} ({raw.get('task_id', 'unknown')}): {'; '.join(errs)}")
            parsed_tasks.append(ObservationTask.from_dict(raw))

        comparison = compare_scheduling_strategies(
            tasks=parsed_tasks,
            rf_model=self.rf_model,
            max_energy_wh=max_energy_wh,
            max_storage_gb=max_storage_gb,
            max_cloud_cover=max_cloud_cover,
            ml_threshold=ml_threshold,
        )

        horizon_seconds = max((t.window_end for t in parsed_tasks), default=5400.0)
        telemetry = self._generate_orbital_telemetry(
            horizon_seconds=max(1800.0, horizon_seconds),
            ml_schedule=comparison["strategies"]["ml_assisted"],
            max_energy_wh=max_energy_wh,
            max_storage_gb=max_storage_gb,
        )

        self._run_counter += 1
        sim_id = f"SIM-{self._run_counter:03d}"
        timestamp_utc = datetime.now(timezone.utc).isoformat()

        result_payload = {
            "simulation_id": sim_id,
            "scenario_name": scenario_name,
            "timestamp_utc": timestamp_utc,
            "parameters": {
                "num_tasks": len(parsed_tasks),
                "max_energy_wh": max_energy_wh,
                "max_storage_gb": max_storage_gb,
                "horizon_seconds": horizon_seconds,
                "max_cloud_cover": max_cloud_cover,
                "ml_threshold": ml_threshold,
            },
            "candidate_tasks": [t.to_dict() for t in parsed_tasks],
            **comparison,
            "telemetry": telemetry,
        }

        if record_in_history:
            self._append_history_entry(result_payload)

        return result_payload

    def run_simulation(
        self,
        scenario_name: str = "Orbital Pass Simulation",
        num_tasks: int = 28,
        max_energy_wh: float = 320.0,
        max_storage_gb: float = 165.0,
        horizon_seconds: float = 5400.0,
        max_cloud_cover: float = 65.0,
        ml_threshold: float = 0.48,
        cloud_bias: float = 0.0,
        seed: int = 42,
        custom_tasks: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Generate candidate tasks for a mission scenario (plus optional custom injected tasks) and run all 3 schedulers."""
        if num_tasks < 1 or num_tasks > 150:
            raise ValueError("num_tasks must be between 1 and 150")
        if max_energy_wh <= 0 or max_energy_wh > 5000:
            raise ValueError("max_energy_wh must be between 1 and 5000 Wh")
        if max_storage_gb <= 0 or max_storage_gb > 10000:
            raise ValueError("max_storage_gb must be between 1 and 10000 GB")
        if horizon_seconds < 300.0 or horizon_seconds > 86400.0:
            raise ValueError("horizon_seconds must be between 300 and 86400 seconds")

        tasks = generate_candidate_mission_tasks(
            num_tasks=num_tasks,
            horizon_seconds=horizon_seconds,
            cloud_bias=cloud_bias,
            seed=seed,
        )

        if custom_tasks:
            for idx, ct in enumerate(custom_tasks):
                errs = validate_task_payload(ct)
                if errs:
                    raise ValueError(f"Invalid custom task at index {idx}: {'; '.join(errs)}")
                tasks.append(ObservationTask.from_dict(ct))
            tasks.sort(key=lambda t: (t.window_start, -t.priority))

        comparison = compare_scheduling_strategies(
            tasks=tasks,
            rf_model=self.rf_model,
            max_energy_wh=max_energy_wh,
            max_storage_gb=max_storage_gb,
            max_cloud_cover=max_cloud_cover,
            ml_threshold=ml_threshold,
        )

        telemetry = self._generate_orbital_telemetry(
            horizon_seconds=horizon_seconds,
            ml_schedule=comparison["strategies"]["ml_assisted"],
            max_energy_wh=max_energy_wh,
            max_storage_gb=max_storage_gb,
        )

        self._run_counter += 1
        sim_id = f"SIM-{self._run_counter:03d}"
        timestamp_utc = datetime.now(timezone.utc).isoformat()

        result_payload = {
            "simulation_id": sim_id,
            "scenario_name": scenario_name,
            "timestamp_utc": timestamp_utc,
            "parameters": {
                "num_tasks": len(tasks),
                "max_energy_wh": max_energy_wh,
                "max_storage_gb": max_storage_gb,
                "horizon_seconds": horizon_seconds,
                "max_cloud_cover": max_cloud_cover,
                "ml_threshold": ml_threshold,
                "cloud_bias": cloud_bias,
                "seed": seed,
            },
            "candidate_tasks": [t.to_dict() for t in tasks],
            **comparison,
            "telemetry": telemetry,
        }

        self._append_history_entry(result_payload)
        return result_payload

    def _append_history_entry(self, sim_payload: Dict[str, Any]) -> None:
        ml_strat = sim_payload["strategies"]["ml_assisted"]
        prio_strat = sim_payload["strategies"]["priority_based"]
        eff_strat = sim_payload["strategies"]["reward_efficiency"]

        summary_entry = {
            "simulation_id": sim_payload["simulation_id"],
            "scenario_name": sim_payload["scenario_name"],
            "timestamp_utc": sim_payload["timestamp_utc"],
            "parameters": sim_payload["parameters"],
            "ml_scheduled": ml_strat["scheduled_count"],
            "ml_reward": ml_strat["total_reward"],
            "ml_efficiency": ml_strat["scheduling_efficiency"],
            "ml_energy_wh": ml_strat["energy_consumption"],
            "ml_storage_gb": ml_strat["storage_consumption"],
            "priority_reward": prio_strat["total_reward"],
            "efficiency_reward": eff_strat["total_reward"],
            "comparison_summary": sim_payload["comparison_summary"],
            "full_result": sim_payload,
        }
        self.history.insert(0, summary_entry)
        # Keep most recent 25 runs in memory
        if len(self.history) > 25:
            self.history = self.history[:25]

    def get_history(self) -> Dict[str, Any]:
        return {
            "count": len(self.history),
            "latest_simulation": self.history[0]["full_result"] if self.history else None,
            "runs": [
                {k: v for k, v in entry.items() if k != "full_result"}
                for entry in self.history
            ],
        }

    def reset_to_baseline(self) -> Dict[str, Any]:
        self.history = []
        self._run_counter = 0
        return self.run_simulation(
            scenario_name="SSO-Pass-104 (Nominal Baseline)",
            num_tasks=28,
            max_energy_wh=320.0,
            max_storage_gb=165.0,
            horizon_seconds=5400.0,
            max_cloud_cover=65.0,
            ml_threshold=0.48,
            cloud_bias=0.0,
            seed=self.default_seed,
        )
