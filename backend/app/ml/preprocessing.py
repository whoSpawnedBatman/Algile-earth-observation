"""Feature Engineering and Preprocessing Pipeline for Satellite Task Feasibility Prediction."""
from __future__ import annotations
import math
import random
from typing import List, Dict, Any, Tuple

FEATURE_NAMES: List[str] = [
    "window_span",
    "imaging_duration",
    "slew_time",
    "slack_time",
    "window_utilization_ratio",
    "slew_rate_deg_per_sec",
    "effective_cloud_cover",
    "solar_elevation_deg",
    "energy_cost",
    "storage_cost",
    "ssr_write_rate_gb_s",
    "priority",
    "reward_per_energy",
]

FEATURE_DESCRIPTIONS: Dict[str, str] = {
    "window_span": "Available orbital visibility window duration (window_end - window_start) [s]",
    "imaging_duration": "Required sensor integration time on ground target [s]",
    "slew_time": "Attitude control manoeuvre time required prior to lock [s]",
    "slack_time": "Kinematic margin inside visibility window (window_span - imaging - slew) [s]",
    "window_utilization_ratio": "Fraction of visibility window consumed by manoeuvre + imaging",
    "slew_rate_deg_per_sec": "Angular agility velocity demanded from reaction wheels [deg/s]",
    "effective_cloud_cover": "Sensor-adjusted cloud obscuration (SAR C-Band weighted at 0.22x) [%]",
    "solar_elevation_deg": "Target sun elevation angle at acquisition epoch [deg]",
    "energy_cost": "Total electrical energy draw from spacecraft EPS bus [Wh]",
    "storage_cost": "Solid-State Recorder (SSR) memory footprint [GB]",
    "ssr_write_rate_gb_s": "Data ingestion rate into onboard solid-state storage [GB/s]",
    "priority": "Mission command priority tier [1-10]",
    "reward_per_energy": "Scientific observation reward normalized by energy consumption [pts/Wh]",
}


def extract_features_from_record(record: Dict[str, Any]) -> List[float]:
    """Transform a raw task dictionary into the 13-dimensional engineered feature vector."""
    window_start = float(record.get("window_start", 0.0))
    window_end = float(record.get("window_end", window_start + 60.0))
    imaging_duration = max(1.0, float(record.get("imaging_duration", 30.0)))
    slew_time = max(0.0, float(record.get("slew_time", 15.0)))
    slew_angle_deg = float(record.get("slew_angle_deg", slew_time * 0.9))
    cloud_coverage = float(record.get("cloud_coverage", 20.0))
    solar_elevation_deg = float(record.get("solar_elevation_deg", 45.0))
    energy_cost = max(0.5, float(record.get("energy_cost", 20.0)))
    storage_cost = max(0.5, float(record.get("storage_cost", 10.0)))
    priority = float(record.get("priority", 5))
    base_reward = float(record.get("base_reward", 100.0))
    sensor_type = str(record.get("sensor_type", "OPTICAL_HI_RES"))

    window_span = max(1.0, window_end - window_start)
    total_manoeuvre = imaging_duration + slew_time
    slack_time = window_span - total_manoeuvre
    window_utilization_ratio = total_manoeuvre / window_span
    slew_rate_deg_per_sec = slew_angle_deg / max(slew_time, 1.0)
    effective_cloud_cover = cloud_coverage * (0.22 if sensor_type == "SAR_C_BAND" else 1.0)
    ssr_write_rate_gb_s = storage_cost / imaging_duration
    reward_per_energy = base_reward / energy_cost

    return [
        round(window_span, 4),
        round(imaging_duration, 4),
        round(slew_time, 4),
        round(slack_time, 4),
        round(window_utilization_ratio, 4),
        round(slew_rate_deg_per_sec, 4),
        round(effective_cloud_cover, 4),
        round(solar_elevation_deg, 4),
        round(energy_cost, 4),
        round(storage_cost, 4),
        round(ssr_write_rate_gb_s, 4),
        round(priority, 4),
        round(reward_per_energy, 4),
    ]


class FeatureScaler:
    """Standard Z-score feature preprocessor with zero-variance protection."""

    def __init__(self) -> None:
        self.means_: List[float] = []
        self.stds_: List[float] = []
        self.is_fitted: bool = False

    def fit(self, X: List[List[float]]) -> "FeatureScaler":
        if not X:
            raise ValueError("Cannot fit FeatureScaler on empty feature matrix")
        n_samples = len(X)
        n_features = len(X[0])
        self.means_ = [0.0] * n_features
        self.stds_ = [1.0] * n_features

        for j in range(n_features):
            col = [row[j] for row in X]
            mean_val = sum(col) / n_samples
            variance = sum((val - mean_val) ** 2 for val in col) / max(1, n_samples - 1)
            std_val = math.sqrt(variance) if variance > 1e-12 else 1.0
            self.means_[j] = mean_val
            self.stds_[j] = std_val

        self.is_fitted = True
        return self

    def transform(self, X: List[List[float]]) -> List[List[float]]:
        if not self.is_fitted:
            raise RuntimeError("FeatureScaler must be fitted before calling transform()")
        transformed: List[List[float]] = []
        for row in X:
            transformed.append([
                round((row[j] - self.means_[j]) / self.stds_[j], 6)
                for j in range(len(row))
            ])
        return transformed

    def fit_transform(self, X: List[List[float]]) -> List[List[float]]:
        return self.fit(X).transform(X)


def stratified_train_test_split(
    X: List[List[float]],
    y: List[int],
    records: List[Dict[str, Any]],
    test_size: float = 0.20,
    seed: int = 42,
) -> Tuple[List[List[float]], List[List[float]], List[int], List[int], List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Deterministic stratified train/test split preserving class ratio."""
    rng = random.Random(seed)
    pos_indices = [i for i, label in enumerate(y) if label == 1]
    neg_indices = [i for i, label in enumerate(y) if label == 0]

    rng.shuffle(pos_indices)
    rng.shuffle(neg_indices)

    n_pos_test = max(1, int(round(len(pos_indices) * test_size)))
    n_neg_test = max(1, int(round(len(neg_indices) * test_size)))

    test_idx = pos_indices[:n_pos_test] + neg_indices[:n_neg_test]
    train_idx = pos_indices[n_pos_test:] + neg_indices[n_neg_test:]

    rng.shuffle(train_idx)
    rng.shuffle(test_idx)

    X_train = [X[i] for i in train_idx]
    X_test = [X[i] for i in test_idx]
    y_train = [y[i] for i in train_idx]
    y_test = [y[i] for i in test_idx]
    rec_train = [records[i] for i in train_idx]
    rec_test = [records[i] for i in test_idx]

    return X_train, X_test, y_train, y_test, rec_train, rec_test
