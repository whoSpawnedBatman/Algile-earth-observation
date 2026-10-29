"""Pydantic / Data schemas for ORBITAL Satellite Task Scheduling Platform."""
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Optional, Any

try:
    from pydantic import BaseModel, Field
    HAS_PYDANTIC = True
except ImportError:
    HAS_PYDANTIC = False
    class BaseModel:  # type: ignore
        def __init__(self, **kwargs: Any):
            for k, v in kwargs.items():
                setattr(self, k, v)
        def model_dump(self) -> Dict[str, Any]:
            return self.__dict__
    def Field(default: Any = None, **kwargs: Any) -> Any:  # type: ignore
        return default


@dataclass
class ObservationTask:
    task_id: str
    target_name: str
    target_lat: float
    target_lon: float
    window_start: float        # seconds from mission epoch (0 to 5400s for 90-min LEO orbit)
    window_end: float          # seconds from mission epoch
    imaging_duration: float    # seconds required on target (15s to 120s)
    priority: int              # 1 (lowest) to 10 (highest emergency/defense priority)
    energy_cost: float         # Wh required for sensor payload + attitude control (8 to 55 Wh)
    storage_cost: float        # GB of raw SAR/Optical imagery generated (2 to 32 GB)
    slew_time: float           # seconds required for agility attitude manoeuvre (5s to 65s)
    slew_angle_deg: float      # off-nadir roll/pitch agility angle in degrees (2° to 45°)
    cloud_coverage: float      # percentage 0.0 to 100.0
    solar_elevation_deg: float # target sun elevation angle (-15° to 85°)
    base_reward: float         # scientific/operational value (20 to 250 pts)
    sensor_type: str = "OPTICAL_HI_RES"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ObservationTask":
        window_start = float(data.get("window_start", 0.0))
        imaging_duration = float(data.get("imaging_duration", 30.0))
        window_end = float(data.get("window_end", window_start + imaging_duration + 60.0))
        return cls(
            task_id=str(data.get("task_id", "TSK-000")),
            target_name=str(data.get("target_name", "Target-Alpha")),
            target_lat=float(data.get("target_lat", 28.61)),
            target_lon=float(data.get("target_lon", 77.20)),
            window_start=window_start,
            window_end=window_end,
            imaging_duration=imaging_duration,
            priority=int(data.get("priority", 5)),
            energy_cost=float(data.get("energy_cost", 20.0)),
            storage_cost=float(data.get("storage_cost", 10.0)),
            slew_time=float(data.get("slew_time", 18.0)),
            slew_angle_deg=float(data.get("slew_angle_deg", 15.0)),
            cloud_coverage=float(data.get("cloud_coverage", 20.0)),
            solar_elevation_deg=float(data.get("solar_elevation_deg", 45.0)),
            base_reward=float(data.get("base_reward", 100.0)),
            sensor_type=str(data.get("sensor_type", "OPTICAL_HI_RES")),
        )


def validate_task_payload(data: Dict[str, Any]) -> List[str]:
    """Validate incoming task dictionary and return list of human-readable errors."""
    errors: List[str] = []
    required_fields = [
        "task_id", "window_start", "window_end", "imaging_duration",
        "priority", "energy_cost", "storage_cost", "slew_time",
        "cloud_coverage", "base_reward"
    ]
    for req in required_fields:
        if req not in data or data[req] is None:
            errors.append(f"Missing required field: '{req}'")
    if errors:
        return errors

    try:
        ws = float(data["window_start"])
        we = float(data["window_end"])
        dur = float(data["imaging_duration"])
        prio = int(data["priority"])
        energy = float(data["energy_cost"])
        storage = float(data["storage_cost"])
        slew = float(data["slew_time"])
        cloud = float(data["cloud_coverage"])
        reward = float(data["base_reward"])
    except (ValueError, TypeError) as exc:
        errors.append(f"Invalid numeric type in task payload: {exc}")
        return errors

    if ws < 0:
        errors.append("window_start must be >= 0")
    if we <= ws:
        errors.append("window_end must be strictly greater than window_start")
    if dur <= 0:
        errors.append("imaging_duration must be > 0")
    if not (1 <= prio <= 10):
        errors.append("priority must be between 1 and 10")
    if energy <= 0:
        errors.append("energy_cost must be > 0")
    if storage <= 0:
        errors.append("storage_cost must be > 0")
    if slew < 0:
        errors.append("slew_time must be >= 0")
    if not (0.0 <= cloud <= 100.0):
        errors.append("cloud_coverage must be between 0 and 100")
    if reward <= 0:
        errors.append("base_reward must be > 0")

    return errors
