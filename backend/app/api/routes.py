"""REST API route handlers for ORBITAL."""
from __future__ import annotations
from typing import Dict, Any, Tuple
from ..services.simulation_service import OrbitalSimulationService

# Global singleton service instance
orbital_service = OrbitalSimulationService(default_seed=42)


def handle_api_request(
    method: str,
    path: str,
    body: Dict[str, Any] | None = None,
) -> Tuple[int, Dict[str, Any]]:
    """Framework-agnostic router for ORBITAL REST endpoints.

    Used by both FastAPI endpoints and the zero-dependency HTTP server / test harness.
    """
    clean_path = path.split("?")[0].rstrip("/") or "/"

    try:
        if method == "GET" and clean_path == "/api/health":
            return 200, orbital_service.get_health()

        if method == "GET" and clean_path == "/api/model":
            return 200, orbital_service.get_model_info()

        if method == "GET" and clean_path == "/api/history":
            return 200, orbital_service.get_history()

        if method == "POST" and clean_path == "/api/schedule":
            if body is None or not isinstance(body, dict):
                return 400, {"error": "Invalid JSON payload", "detail": "Request body must be a JSON object"}

            tasks_payload = body.get("tasks")
            if tasks_payload is None:
                return 422, {"error": "Validation Error", "detail": "Missing required field 'tasks'"}

            res = orbital_service.schedule_tasks(
                tasks_payload=tasks_payload,
                max_energy_wh=float(body.get("max_energy_wh", 320.0)),
                max_storage_gb=float(body.get("max_storage_gb", 165.0)),
                max_cloud_cover=float(body.get("max_cloud_cover", 65.0)),
                ml_threshold=float(body.get("ml_threshold", 0.48)),
                scenario_name=str(body.get("scenario_name", "Custom API Schedule")),
                record_in_history=bool(body.get("record_in_history", True)),
            )
            return 200, res

        if method == "POST" and clean_path == "/api/simulation":
            payload = body if isinstance(body, dict) else {}
            if payload.get("action") == "reset":
                res = orbital_service.reset_to_baseline()
                return 200, res

            res = orbital_service.run_simulation(
                scenario_name=str(payload.get("scenario_name", "Custom Orbital Pass Simulation")),
                num_tasks=int(payload.get("num_tasks", 28)),
                max_energy_wh=float(payload.get("max_energy_wh", 320.0)),
                max_storage_gb=float(payload.get("max_storage_gb", 165.0)),
                horizon_seconds=float(payload.get("horizon_seconds", 5400.0)),
                max_cloud_cover=float(payload.get("max_cloud_cover", 65.0)),
                ml_threshold=float(payload.get("ml_threshold", 0.48)),
                cloud_bias=float(payload.get("cloud_bias", 0.0)),
                seed=int(payload.get("seed", 42)),
                custom_tasks=payload.get("custom_tasks"),
            )
            return 200, res

        return 404, {"error": "Not Found", "detail": f"No endpoint matching {method} {clean_path}"}

    except ValueError as val_err:
        return 422, {"error": "Validation Error", "detail": str(val_err)}
    except (TypeError, KeyError) as type_err:
        return 400, {"error": "Bad Request", "detail": str(type_err)}
    except Exception as exc:
        return 500, {"error": "Internal Server Error", "detail": str(exc)}
