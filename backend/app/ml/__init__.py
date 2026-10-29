"""Machine Learning module for ORBITAL."""
from .dataset import (
    generate_synthetic_training_dataset,
    generate_candidate_mission_tasks,
    evaluate_physical_feasibility,
)
from .preprocessing import (
    FEATURE_NAMES,
    FEATURE_DESCRIPTIONS,
    FeatureScaler,
    extract_features_from_record,
    stratified_train_test_split,
)
from .classifier import RandomForestFeasibilityModel, compute_classification_metrics

__all__ = [
    "generate_synthetic_training_dataset",
    "generate_candidate_mission_tasks",
    "evaluate_physical_feasibility",
    "FEATURE_NAMES",
    "FEATURE_DESCRIPTIONS",
    "FeatureScaler",
    "extract_features_from_record",
    "stratified_train_test_split",
    "RandomForestFeasibilityModel",
    "compute_classification_metrics",
]
