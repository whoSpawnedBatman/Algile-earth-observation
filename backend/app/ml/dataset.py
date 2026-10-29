"""Synthetic Earth Observation Satellite Task Dataset Generator.

Generates reproducible synthetic candidate imaging tasks and historical training
records for an Agile Earth Observation Satellite (AEOS) in a 620 km Sun-Synchronous
Low Earth Orbit (97.8 deg inclination, ~5400s orbital period).
"""
from __future__ import annotations
import math
import random
from typing import List, Dict, Any, Tuple
from ..models.schemas import ObservationTask

GROUND_TARGETS: List[Tuple[str, float, float, str]] = [
    ("Svalbard Glacier Mass Balance", 78.22, 15.63, "OPTICAL_HI_RES"),
    ("Rotterdam Maritime Port Corridor", 51.95, 4.14, "SAR_C_BAND"),
    ("Nile Delta Agricultural Basin", 30.85, 31.12, "MULTISPECTRAL"),
    ("Atacama Solar Irradiance Array", -23.86, -69.13, "OPTICAL_HI_RES"),
    ("Sundarbans Mangrove Estuary", 21.95, 89.18, "MULTISPECTRAL"),
    ("Panama Canal Lock Operations", 9.08, -79.68, "SAR_C_BAND"),
    ("Amazon Deforestation Sector B4", -3.46, -62.21, "MULTISPECTRAL"),
    ("Reykjanes Geothermal Rift Zone", 63.88, -22.43, "SAR_C_BAND"),
    ("Ganges Alluvial Floodplain", 25.43, 81.84, "MULTISPECTRAL"),
    ("Malacca Strait Vessel Traffic", 2.50, 101.80, "SAR_C_BAND"),
    ("California Wildfire Perimeter N7", 39.72, -121.60, "MULTISPECTRAL"),
    ("Thwaites Ice Shelf Grounding Line", -75.08, -105.58, "SAR_C_BAND"),
    ("Tokyo Bay Coastal Subsidence", 35.61, 139.83, "OPTICAL_HI_RES"),
    ("Danube River Hydrological Gauge", 45.22, 28.75, "MULTISPECTRAL"),
    ("Suez Maritime Chokepoint North", 30.58, 32.33, "OPTICAL_HI_RES"),
    ("Himalayan Glacial Lake Outburst", 27.98, 86.92, "SAR_C_BAND"),
    ("Murray-Darling Irrigation Grid", -34.18, 142.16, "MULTISPECTRAL"),
    ("Rotterdam Wind Offshore Array", 52.35, 3.85, "SAR_C_BAND"),
    ("East African Rift Fault Trace", -1.29, 36.82, "OPTICAL_HI_RES"),
    ("Bering Strait Sea Ice Lead", 65.75, -168.95, "SAR_C_BAND"),
]


def evaluate_physical_feasibility(
    window_start: float,
    window_end: float,
    imaging_duration: float,
    slew_time: float,
    slew_angle_deg: float,
    cloud_coverage: float,
    solar_elevation_deg: float,
    energy_cost: float,
    storage_cost: float,
    sensor_type: str,
    rng: random.Random,
    include_stochastic_noise: bool = True,
) -> Tuple[int, float, List[str]]:
    """Evaluate physical and operational feasibility of a single satellite observation task.

    Returns:
        (label, latent_score, failure_modes)
    """
    window_span = window_end - window_start
    total_time_required = imaging_duration + slew_time
    slack = window_span - total_time_required
    slew_rate = slew_angle_deg / max(slew_time, 1.0)  # deg/s (Reaction wheels limit ~2.4 deg/s)

    failure_modes: List[str] = []
    score = 1.0

    # 1. Kinematic time window constraint
    if slack < 0:
        failure_modes.append("WINDOW_DURATION_DEFICIT")
        score -= 0.65
    elif slack < 12.0:
        score -= 0.18 * (12.0 - slack) / 12.0

    # 2. Attitude control agility / CMG & reaction wheel slew rate limit
    if slew_rate > 2.35:
        failure_modes.append("MAX_SLEW_TORQUE_EXCEEDED")
        score -= 0.55
    elif slew_rate > 1.85:
        score -= 0.22 * (slew_rate - 1.85) / 0.5

    # 3. Cloud coverage vs payload optics (SAR penetrates clouds; optical/multispectral blocked)
    effective_cloud = cloud_coverage * (0.22 if sensor_type == "SAR_C_BAND" else 1.0)
    if effective_cloud > 52.0:
        failure_modes.append("EXCESSIVE_CLOUD_OBSCURATION")
        score -= 0.58 * ((effective_cloud - 40.0) / 60.0)
    elif effective_cloud > 34.0:
        score -= 0.20 * ((effective_cloud - 34.0) / 18.0)

    # 4. Solar elevation constraint for passive optical sensors
    if sensor_type != "SAR_C_BAND" and solar_elevation_deg < 10.0:
        failure_modes.append("INSUFFICIENT_SOLAR_ILLUMINATION")
        score -= 0.50

    # 5. Per-task peak power / thermal dissipation envelope
    if energy_cost > 44.0 and imaging_duration > 70.0:
        failure_modes.append("PAYLOAD_THERMAL_ENVELOPE_EXCEEDED")
        score -= 0.42
    elif energy_cost > 48.0:
        score -= 0.28

    # 6. High-rate solid-state recorder write bandwidth constraint
    write_rate_gb_per_s = storage_cost / max(imaging_duration, 1.0)
    if write_rate_gb_per_s > 0.55:
        failure_modes.append("SSR_WRITE_BANDWIDTH_SATURATED")
        score -= 0.38

    if include_stochastic_noise:
        # Realistic atmospheric & attitude jitter uncertainty (+/- 0.08)
        score += rng.gauss(0.0, 0.065)

    clamped_score = max(0.0, min(1.0, score))
    label = 1 if clamped_score >= 0.52 and "WINDOW_DURATION_DEFICIT" not in failure_modes else 0
    return label, round(clamped_score, 4), failure_modes


def generate_synthetic_training_dataset(
    n_samples: int = 600,
    seed: int = 42,
) -> List[Dict[str, Any]]:
    """Generate a reproducible synthetic dataset of historical satellite observation requests."""
    rng = random.Random(seed)
    records: List[Dict[str, Any]] = []

    for i in range(n_samples):
        target_name, lat, lon, default_sensor = GROUND_TARGETS[i % len(GROUND_TARGETS)]
        sensor_type = default_sensor if rng.random() < 0.75 else rng.choice(
            ["OPTICAL_HI_RES", "MULTISPECTRAL", "SAR_C_BAND"]
        )

        window_start = round(rng.uniform(40.0, 5100.0), 1)
        imaging_duration = round(rng.uniform(18.0, 95.0), 1)
        slew_time = round(rng.uniform(8.0, 52.0), 1)
        # Span ranges from tight/infeasible (-15s slack) to generous (+95s slack)
        slack_offset = rng.uniform(-16.0, 88.0)
        window_end = round(window_start + imaging_duration + slew_time + slack_offset, 1)
        if window_end <= window_start + 10.0:
            window_end = round(window_start + 15.0, 1)

        slew_angle_deg = round(rng.uniform(3.0, 44.0), 1)
        priority = rng.randint(1, 10)
        cloud_coverage = round(rng.betavariate(1.8, 2.6) * 95.0, 1)
        solar_elevation_deg = round(rng.uniform(4.0, 78.0), 1)

        # Energy and storage correlate realistically with sensor type and duration
        sensor_power_factor = 0.48 if sensor_type == "SAR_C_BAND" else 0.34
        energy_cost = round(
            8.0 + imaging_duration * sensor_power_factor + slew_time * 0.18 + rng.uniform(-2.0, 4.5),
            2,
        )
        storage_rate = 0.28 if sensor_type == "OPTICAL_HI_RES" else (0.32 if sensor_type == "SAR_C_BAND" else 0.21)
        storage_cost = round(max(1.5, imaging_duration * storage_rate + rng.uniform(-1.0, 3.0)), 2)

        # Observation reward combines priority, target value, and duration
        base_reward = round(
            25.0 + priority * 16.5 + imaging_duration * 0.55 + rng.uniform(-10.0, 22.0),
            1,
        )

        label, latent_score, failure_modes = evaluate_physical_feasibility(
            window_start=window_start,
            window_end=window_end,
            imaging_duration=imaging_duration,
            slew_time=slew_time,
            slew_angle_deg=slew_angle_deg,
            cloud_coverage=cloud_coverage,
            solar_elevation_deg=solar_elevation_deg,
            energy_cost=energy_cost,
            storage_cost=storage_cost,
            sensor_type=sensor_type,
            rng=rng,
            include_stochastic_noise=True,
        )

        records.append({
            "sample_id": f"HIST-{i + 1:04d}",
            "target_name": target_name,
            "target_lat": round(lat + rng.uniform(-0.8, 0.8), 3),
            "target_lon": round(lon + rng.uniform(-0.8, 0.8), 3),
            "sensor_type": sensor_type,
            "window_start": window_start,
            "window_end": window_end,
            "imaging_duration": imaging_duration,
            "priority": priority,
            "energy_cost": energy_cost,
            "storage_cost": storage_cost,
            "slew_time": slew_time,
            "slew_angle_deg": slew_angle_deg,
            "cloud_coverage": cloud_coverage,
            "solar_elevation_deg": solar_elevation_deg,
            "base_reward": base_reward,
            "feasible": label,
            "physical_feasibility_score": latent_score,
            "failure_modes": failure_modes,
        })

    return records


def generate_candidate_mission_tasks(
    num_tasks: int = 28,
    horizon_seconds: float = 5400.0,
    cloud_bias: float = 0.0,
    seed: int = 42,
) -> List[ObservationTask]:
    """Generate a realistic set of candidate satellite imaging tasks across a single orbital pass.

    Includes overlapping time windows, diverse priorities, varying cloud cover, and realistic
    energy/storage footprints so scheduling strategies make distinct trade-offs.
    """
    rng = random.Random(seed + 1009)
    tasks: List[ObservationTask] = []

    # Create clusters of tasks along the orbital ground track to induce realistic window conflicts
    num_clusters = max(6, num_tasks // 3)
    cluster_centers = [
        round(120.0 + (horizon_seconds - 360.0) * (c / max(1, num_clusters - 1)), 1)
        for c in range(num_clusters)
    ]

    for idx in range(num_tasks):
        base_name, lat, lon, default_sensor = GROUND_TARGETS[idx % len(GROUND_TARGETS)]
        sector_suffix = f"Pass-{(idx // len(GROUND_TARGETS)) + 1}" if idx >= len(GROUND_TARGETS) else "Primary"
        target_name = f"{base_name} ({sector_suffix})"

        sensor_type = default_sensor if rng.random() < 0.8 else rng.choice(
            ["OPTICAL_HI_RES", "MULTISPECTRAL", "SAR_C_BAND"]
        )

        center = cluster_centers[idx % len(cluster_centers)]
        jitter = rng.uniform(-95.0, 95.0)
        window_start = round(max(30.0, min(horizon_seconds - 240.0, center + jitter)), 1)
        imaging_duration = round(rng.uniform(22.0, 72.0), 1)
        slew_time = round(rng.uniform(10.0, 38.0), 1)

        # Most candidate tasks have positive window slack, some have tight or infeasible windows
        if idx % 7 == 5:
            slack = rng.uniform(-8.0, 6.0)
        else:
            slack = rng.uniform(18.0, 110.0)

        window_end = round(min(horizon_seconds, window_start + imaging_duration + slew_time + slack), 1)
        if window_end <= window_start + 15.0:
            window_end = round(window_start + imaging_duration + 25.0, 1)

        slew_angle_deg = round(min(42.0, slew_time * rng.uniform(0.55, 1.95)), 1)
        priority = rng.randint(2, 10)

        raw_cloud = rng.betavariate(1.6, 2.8) * 88.0 + cloud_bias
        cloud_coverage = round(max(0.0, min(98.0, raw_cloud)), 1)
        solar_elevation_deg = round(rng.uniform(12.0, 74.0), 1)

        sensor_power_factor = 0.44 if sensor_type == "SAR_C_BAND" else 0.31
        energy_cost = round(
            7.5 + imaging_duration * sensor_power_factor + slew_time * 0.16 + rng.uniform(0.0, 3.5),
            2,
        )
        storage_rate = 0.25 if sensor_type == "OPTICAL_HI_RES" else (0.29 if sensor_type == "SAR_C_BAND" else 0.19)
        storage_cost = round(max(2.0, imaging_duration * storage_rate + rng.uniform(0.0, 2.2)), 2)

        # Create strategic variance: some lower-priority tasks have high reward efficiency,
        # while some high-priority tasks are resource-heavy or cloud-obscured
        efficiency_bonus = 45.0 if (idx % 4 == 1) else 0.0
        base_reward = round(
            30.0 + priority * 15.0 + imaging_duration * 0.6 + efficiency_bonus + rng.uniform(-8.0, 18.0),
            1,
        )

        tasks.append(
            ObservationTask(
                task_id=f"ORB-{idx + 1:03d}",
                target_name=target_name,
                target_lat=round(lat + rng.uniform(-0.35, 0.35), 3),
                target_lon=round(lon + rng.uniform(-0.35, 0.35), 3),
                window_start=window_start,
                window_end=window_end,
                imaging_duration=imaging_duration,
                priority=priority,
                energy_cost=energy_cost,
                storage_cost=storage_cost,
                slew_time=slew_time,
                slew_angle_deg=slew_angle_deg,
                cloud_coverage=cloud_coverage,
                solar_elevation_deg=solar_elevation_deg,
                base_reward=base_reward,
                sensor_type=sensor_type,
            )
        )

    tasks.sort(key=lambda t: (t.window_start, -t.priority))
    # Re-index task IDs in chronological order for clean mission manifests
    for i, t in enumerate(tasks):
        t.task_id = f"ORB-{i + 1:03d}"
    return tasks
