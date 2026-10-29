export type StrategyKey = 'ml_assisted' | 'priority_based' | 'reward_efficiency';

export type NavigationTab =
  | 'overview'
  | 'scheduling'
  | 'ml_performance'
  | 'orbital_timeline'
  | 'resource_monitoring'
  | 'task_manifest'
  | 'simulation_history';

export interface ConfusionMatrixData {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  matrix: number[][];
  labels: string[];
}

export interface RocCurvePoint {
  threshold: number;
  tpr: number;
  fpr: number;
}

export interface ClassificationMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1_score: number;
  specificity: number;
  roc_auc: number;
  confusion_matrix: ConfusionMatrixData;
  roc_curve: RocCurvePoint[];
  sample_count: number;
  positive_count: number;
  negative_count: number;
}

export interface FeatureImportanceItem {
  feature: string;
  label: string;
  importance: number;
  description: string;
}

export interface CalibrationBin {
  bin: string;
  predicted_probability: number;
  observed_feasible_rate: number;
  sample_count: number;
}

export interface ModelInfoResponse {
  model_name: string;
  engine_backend: string;
  random_seed: number;
  hyperparameters: {
    n_estimators: number;
    max_depth: number;
    min_samples_split: number;
    criterion: string;
    feature_count: number;
    train_test_split_ratio: string;
  };
  dataset_summary: {
    total_samples: number;
    train_samples: number;
    test_samples: number;
    feasible_ratio: number;
    infeasible_ratio: number;
    is_synthetic: boolean;
    domain_disclaimer: string;
  };
  test_metrics: ClassificationMetrics;
  train_metrics: ClassificationMetrics;
  feature_importances: FeatureImportanceItem[];
  calibration_curve: CalibrationBin[];
  sample_dataset_preview: Record<string, unknown>[];
}

export interface TaskRecord {
  task_id: string;
  target_name: string;
  target_lat: number;
  target_lon: number;
  window_start: number;
  window_end: number;
  imaging_duration: number;
  priority: number;
  energy_cost: number;
  storage_cost: number;
  slew_time: number;
  slew_angle_deg: number;
  cloud_coverage: number;
  solar_elevation_deg: number;
  base_reward: number;
  sensor_type: string;
  status?: 'SCHEDULED' | 'REJECTED';
  strategy?: StrategyKey;
  manoeuvre_start?: number | null;
  execution_start?: number | null;
  execution_end?: number | null;
  ml_probability?: number;
  ml_feasible?: number;
  effective_reward?: number;
  quality_factor?: number;
  rank_score?: number;
  cumulative_energy_wh?: number;
  cumulative_storage_gb?: number;
  rejection_code?: string | null;
  rejection_reason?: string | null;
}

export interface ResourceTimelinePoint {
  time_s: number;
  time_label: string;
  energy_used_wh: number;
  energy_remaining_pct: number;
  storage_used_gb: number;
  storage_utilization_pct: number;
  task_id: string;
}

export interface StrategyScheduleResult {
  strategy: StrategyKey;
  strategy_label: string;
  scheduled_tasks: TaskRecord[];
  rejected_tasks: TaskRecord[];
  scheduled_count: number;
  rejected_count: number;
  total_candidates: number;
  rejection_breakdown: Record<string, number>;
  total_nominal_reward: number;
  total_reward: number;
  energy_consumption: number;
  max_energy_wh: number;
  energy_utilization_pct: number;
  storage_consumption: number;
  max_storage_gb: number;
  storage_utilization_pct: number;
  scheduling_efficiency: number;
  scheduling_rate_pct: number;
  reward_per_wh: number;
  mean_imagery_quality_pct: number;
  cloud_wasted_acquisitions: number;
  resource_timeline: ResourceTimelinePoint[];
}

export interface StrategyComparisonItem {
  strategy: StrategyKey;
  strategy_label: string;
  scheduled_count: number;
  rejected_count: number;
  total_reward: number;
  total_nominal_reward: number;
  energy_consumption: number;
  storage_consumption: number;
  scheduling_efficiency: number;
  reward_per_wh: number;
  mean_imagery_quality_pct: number;
  cloud_wasted_acquisitions: number;
}

export interface GroundTrackPoint {
  time_s: number;
  lat: number;
  lon: number;
  altitude_km: number;
  velocity_kms: number;
  in_sunlight: boolean;
}

export interface OrbitalTelemetry {
  is_simulated_telemetry: boolean;
  telemetry_label: string;
  spacecraft_id: string;
  orbit_regime: string;
  inclination_deg: number;
  orbital_period_min: number;
  ground_track: GroundTrackPoint[];
  bus_telemetry: {
    solar_array_output_w: number;
    battery_capacity_wh: number;
    battery_dod_limit_pct: number;
    ssr_capacity_gb: number;
    reaction_wheel_max_slew_deg_s: number;
    downlink_band: string;
  };
}

export interface SimulationParameters {
  num_tasks: number;
  max_energy_wh: number;
  max_storage_gb: number;
  horizon_seconds: number;
  max_cloud_cover: number;
  ml_threshold: number;
  cloud_bias?: number;
  seed?: number;
}

export interface SimulationResponse {
  simulation_id: string;
  scenario_name: string;
  timestamp_utc: string;
  parameters: SimulationParameters;
  candidate_tasks: TaskRecord[];
  strategies: Record<StrategyKey, StrategyScheduleResult>;
  comparison_summary: StrategyComparisonItem[];
  advantage_analysis: {
    ml_vs_priority_reward_delta: number;
    ml_vs_efficiency_reward_delta: number;
    ml_quality_gain_vs_priority_pct: number;
    cloud_waste_avoided_count: number;
  };
  telemetry: OrbitalTelemetry;
}

export interface SimulationHistoryRun {
  simulation_id: string;
  scenario_name: string;
  timestamp_utc: string;
  parameters: SimulationParameters;
  ml_scheduled: number;
  ml_reward: number;
  ml_efficiency: number;
  ml_energy_wh: number;
  ml_storage_gb: number;
  priority_reward: number;
  efficiency_reward: number;
  comparison_summary: StrategyComparisonItem[];
}

export interface HistoryResponse {
  count: number;
  latest_simulation: SimulationResponse | null;
  runs: SimulationHistoryRun[];
}
