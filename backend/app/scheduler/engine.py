"""Constraint-Aware Satellite Task Scheduling Engine.

Implements three comparative scheduling strategies:
1. ML-Assisted Scheduling (ml_assisted)
2. Priority-Based Scheduling (priority_based)
3. Reward-Efficiency-Based Scheduling (reward_efficiency)
"""
from __future__ import annotations
from typing import List, Dict, Any, Tuple, Optional
from ..models.schemas import ObservationTask
from ..ml.classifier import RandomForestFeasibilityModel


MAX_REACTION_WHEEL_SLEW_RATE_DEG_S = 2.35


def _find_earliest_conflict_free_slot(
    window_start: float,
    window_end: float,
    slew_time: float,
    imaging_duration: float,
    occupied_intervals: List[Tuple[float, float, str]],
) -> Tuple[Optional[Tuple[float, float, float]], Optional[str]]:
    """Find the earliest conflict-free [manoeuvre_start, execution_start, execution_end]
    inside [window_start, window_end] that does not overlap any existing scheduled interval.

    Returns:
        ((manoeuvre_start, execution_start, execution_end), conflicting_task_id)
    """
    total_needed = slew_time + imaging_duration
    if window_end - window_start < total_needed - 1e-6:
        return None, None

    # Sort occupied intervals chronologically
    sorted_occ = sorted(occupied_intervals, key=lambda item: item[0])

    # Candidate start times to test: window_start, or immediately after any occupied interval ends
    candidate_starts = [window_start]
    for occ_start, occ_end, _ in sorted_occ:
        if window_start <= occ_end <= window_end - total_needed:
            candidate_starts.append(round(occ_end, 2))
    candidate_starts.sort()

    conflicting_id: Optional[str] = None
    for cand_start in candidate_starts:
        cand_end = round(cand_start + total_needed, 2)
        if cand_end > window_end + 1e-6:
            continue
        overlap_found = False
        for occ_start, occ_end, occ_id in sorted_occ:
            # Strict non-overlap check: [cand_start, cand_end] vs [occ_start, occ_end]
            if cand_start < occ_end - 1e-6 and cand_end > occ_start + 1e-6:
                overlap_found = True
                conflicting_id = occ_id
                break
        if not overlap_found:
            exec_start = round(cand_start + slew_time, 2)
            return (round(cand_start, 2), exec_start, cand_end), None

    return None, conflicting_id


def _compute_effective_science_reward(task: ObservationTask) -> Tuple[float, float]:
    """Compute effective post-observation quality factor and realized science reward.

    Optical & Multispectral sensors lose usable imagery value when cloud cover is heavy
    or solar illumination is too low; C-Band SAR penetrates cloud cover.
    """
    if task.sensor_type == "SAR_C_BAND":
        cloud_factor = max(0.75, 1.0 - (task.cloud_coverage / 100.0) * 0.18)
        illum_factor = 1.0
    else:
        if task.cloud_coverage <= 25.0:
            cloud_factor = 1.0 - (task.cloud_coverage / 100.0) * 0.30
        elif task.cloud_coverage <= 50.0:
            cloud_factor = 0.925 - ((task.cloud_coverage - 25.0) / 25.0) * 0.45
        else:
            cloud_factor = max(0.08, 0.475 - ((task.cloud_coverage - 50.0) / 50.0) * 0.40)

        illum_factor = 1.0 if task.solar_elevation_deg >= 12.0 else 0.25

    quality = round(max(0.05, min(1.0, cloud_factor * illum_factor)), 4)
    effective_reward = round(task.base_reward * quality, 2)
    return effective_reward, quality


def run_single_strategy_schedule(
    tasks: List[ObservationTask],
    strategy: str,
    rf_model: RandomForestFeasibilityModel,
    max_energy_wh: float = 320.0,
    max_storage_gb: float = 165.0,
    max_cloud_cover: float = 65.0,
    ml_threshold: float = 0.48,
) -> Dict[str, Any]:
    """Schedule candidate tasks using a specified strategy while strictly enforcing all physical constraints."""
    annotated_tasks: List[Dict[str, Any]] = []
    for t in tasks:
        t_dict = t.to_dict()
        pred = rf_model.predict_task(t_dict)
        prob = pred["feasibility_probability"]
        eff_reward, quality_factor = _compute_effective_science_reward(t)

        # Compute strategy-specific ranking score
        resource_denom = 0.55 * t.energy_cost + 0.45 * t.storage_cost + 0.15 * (t.imaging_duration + t.slew_time)
        efficiency_ratio = t.base_reward / max(1.0, resource_denom)

        if strategy == "ml_assisted":
            # Combine ML feasibility probability, expected quality-adjusted reward, priority, and resource efficiency
            rank_score = (
                (prob ** 1.35)
                * t.base_reward
                * (1.0 + 0.085 * t.priority)
                / max(1.0, (0.55 * t.energy_cost + 0.45 * t.storage_cost) ** 0.42)
            )
        elif strategy == "priority_based":
            # Strict priority tier first, then base reward, then earliest window
            rank_score = t.priority * 10000.0 + t.base_reward * 10.0 - t.window_start * 0.001
        elif strategy == "reward_efficiency":
            # Greedy reward per resource unit
            rank_score = efficiency_ratio * 100.0 + t.priority * 0.5
        else:
            raise ValueError(f"Unsupported scheduling strategy: {strategy}")

        annotated_tasks.append({
            "task": t,
            "task_dict": t_dict,
            "ml_probability": prob,
            "ml_feasible": pred["feasible_prediction"],
            "ml_confidence": pred["confidence"],
            "effective_reward": eff_reward,
            "quality_factor": quality_factor,
            "efficiency_ratio": round(efficiency_ratio, 4),
            "rank_score": round(rank_score, 4),
        })

    # Sort descending by strategy rank_score (deterministic tie-break by window_start and task_id)
    ordered = sorted(
        annotated_tasks,
        key=lambda item: (-item["rank_score"], item["task"].window_start, item["task"].task_id),
    )

    scheduled_tasks: List[Dict[str, Any]] = []
    rejected_tasks: List[Dict[str, Any]] = []
    occupied_intervals: List[Tuple[float, float, str]] = []  # (manoeuvre_start, execution_end, task_id)
    rejection_Select_counts: Dict[str, int] = {}

    used_energy = 0.0
    used_storage = 0.0
    total_nominal_reward = 0.0
    total_effective_reward = 0.0

    for item in ordered:
        t: ObservationTask = item["task"]
        prob: float = item["ml_probability"]
        window_span = t.window_end - t.window_start
        total_time_req = t.slew_time + t.imaging_duration
        slew_rate = t.slew_angle_deg / max(t.slew_time, 1.0)

        rejection_code: Optional[str] = None
        rejection_reason: Optional[str] = None

        # 1. Hard Kinematic Time Window Check
        if window_span < total_time_req - 1e-6:
            rejection_code = "TIME_WINDOW_VIOLATION"
            rejection_reason = (
                f"Required slew ({t.slew_time:.1f}s) + imaging ({t.imaging_duration:.1f}s) = "
                f"{total_time_req:.1f}s exceeds window span ({window_span:.1f}s)"
            )
        # 2. Hard Reaction Wheel Attitude Slew Rate Check
        elif slew_rate > MAX_REACTION_WHEEL_SLEW_RATE_DEG_S:
            rejection_code = "SLEW_AGILITY_LIMIT"
            rejection_reason = (
                f"Slew rate {slew_rate:.2f} deg/s exceeds reaction wheel torque limit "
                f"({MAX_REACTION_WHEEL_SLEW_RATE_DEG_S} deg/s)"
            )
        # 3. ML-Assisted Pre-emptive Feasibility & Cloud Gate
        elif strategy == "ml_assisted" and prob < ml_threshold:
            rejection_code = "ML_INFEASIBLE_PREDICTION"
            rejection_reason = (
                f"Random Forest feasibility score ({prob * 100:.1f}%) below operational threshold "
                f"({ml_threshold * 100:.0f}%)"
            )
        elif (
            strategy == "ml_assisted"
            and t.sensor_type != "SAR_C_BAND"
            and t.cloud_coverage > max_cloud_cover
        ):
            rejection_code = "CLOUD_COVER_THRESHOLD"
            rejection_reason = (
                f"Optical cloud cover ({t.cloud_coverage:.1f}%) exceeds mission ceiling ({max_cloud_cover:.0f}%)"
            )
        # 4. Spacecraft Energy Budget Check
        elif used_energy + t.energy_cost > max_energy_wh + 1e-6:
            rejection_code = "ENERGY_BUDGET_EXCEEDED"
            rejection_reason = (
                f"Task requires {t.energy_cost:.1f} Wh; only {(max_energy_wh - used_energy):.1f} Wh remaining"
            )
        # 5. Solid-State Recorder Storage Check
        elif used_storage + t.storage_cost > max_storage_gb + 1e-6:
            rejection_code = "STORAGE_CAPACITY_EXCEEDED"
            rejection_reason = (
                f"Task requires {t.storage_cost:.1f} GB; only {(max_storage_gb - used_storage):.1f} GB remaining"
            )
        else:
            # 6. Non-Overlapping Timeline Slot Allocation
            slot, conflict_id = _find_earliest_conflict_free_slot(
                window_start=t.window_start,
                window_end=t.window_end,
                slew_time=t.slew_time,
                imaging_duration=t.imaging_duration,
                occupied_intervals=occupied_intervals,
            )
            if slot is None:
                rejection_code = "TIMELINE_CONFLICT"
                rejection_reason = (
                    f"Observation window [{t.window_start:.0f}s–{t.window_end:.0f}s] conflicts with "
                    f"scheduled task {conflict_id or 'in window'}"
                )
            else:
                manoeuvre_start, execution_start, execution_end = slot
                occupied_intervals.append((manoeuvre_start, execution_end, t.task_id))
                used_energy = round(used_energy + t.energy_cost, 2)
                used_storage = round(used_storage + t.storage_cost, 2)
                total_nominal_reward = round(total_nominal_reward + t.base_reward, 2)
                total_effective_reward = round(total_effective_reward + item["effective_reward"], 2)

                scheduled_tasks.append({
                    **item["task_dict"],
                    "status": "SCHEDULED",
                    "strategy": strategy,
                    "manoeuvre_start": manoeuvre_start,
                    "execution_start": execution_start,
                    "execution_end": execution_end,
                    "ml_probability": prob,
                    "ml_feasible": item["ml_feasible"],
                    "effective_reward": item["effective_reward"],
                    "quality_factor": item["quality_factor"],
                    "rank_score": item["rank_score"],
                    "cumulative_energy_wh": used_energy,
                    "cumulative_storage_gb": used_storage,
                    "rejection_code": None,
                    "rejection_reason": None,
                })

        if rejection_code is not None:
            rejection_Select_counts[rejection_code] = rejection_Select_counts.get(rejection_code, 0) + 1
            rejected_tasks.append({
                **item["task_dict"],
                "status": "REJECTED",
                "strategy": strategy,
                "manoeuvre_start": None,
                "execution_start": None,
                "execution_end": None,
                "ml_probability": prob,
                "ml_feasible": item["ml_feasible"],
                "effective_reward": item["effective_reward"],
                "quality_factor": item["quality_factor"],
                "rank_score": item["rank_score"],
                "rejection_code": rejection_code,
                "rejection_reason": rejection_reason,
            })

    # Sort scheduled tasks chronologically by manoeuvre_start and recompute cumulative resource trajectory
    scheduled_tasks.sort(key=lambda x: float(x["manoeuvre_start"]))
    running_energy = 0.0
    running_storage = 0.0
    resource_timeline: List[Dict[str, Any]] = [
        {
            "time_s": 0.0,
            "time_label": "T+00:00",
            "energy_used_wh": 0.0,
            "energy_remaining_pct": 100.0,
            "storage_used_gb": 0.0,
            "storage_utilization_pct": 0.0,
            "task_id": "EPOCH",
        }
    ]
    for st in scheduled_tasks:
        running_energy = round(running_energy + float(st["energy_cost"]), 2)
        running_storage = round(running_storage + float(st["storage_cost"]), 2)
        st["cumulative_energy_wh"] = running_energy
        st["cumulative_storage_gb"] = running_storage
        exec_end = float(st["execution_end"])
        mins = int(exec_end // 60)
        secs = int(exec_end % 60)
        resource_timeline.append({
            "time_s": exec_end,
            "time_label": f"T+{mins:02d}:{secs:02d}",
            "energy_used_wh": running_energy,
            "energy_remaining_pct": round(max(0.0, 100.0 * (1.0 - running_energy / max_energy_wh)), 1),
            "storage_used_gb": running_storage,
            "storage_utilization_pct": round(min(100.0, 100.0 * (running_storage / max_storage_gb)), 1),
            "task_id": st["task_id"],
        })

    total_candidates = max(1, len(tasks))
    scheduled_count = len(scheduled_tasks)
    scheduling_rate_pct = round(100.0 * scheduled_count / total_candidates, 2)
    reward_per_wh = round(total_effective_reward / max(1.0, used_energy), 2)
    mean_quality_pct = (
        round(100.0 * sum(s["quality_factor"] for s in scheduled_tasks) / scheduled_count, 1)
        if scheduled_count > 0
        else 0.0
    )
    high_cloud_scheduled = sum(
        1 for s in scheduled_tasks if s["sensor_type"] != "SAR_C_BAND" and float(s["cloud_coverage"]) > 45.0
    )

    # Composite scheduling efficiency index (0-100%)
    total_possible_reward = sum(t.base_reward for t in tasks) or 1.0
    reward_capture_ratio = total_effective_reward / total_possible_reward
    scheduling_efficiency = round(
        min(100.0, (reward_capture_ratio * 65.0) + (mean_quality_pct * 0.35)),
        2,
    )

    strategy_labels = {
        "ml_assisted": "ML-Assisted Scheduling (Random Forest + Constraint Solver)",
        "priority_based": "Priority-Based Heuristic Scheduling",
        "reward_efficiency": "Reward-Efficiency Greedy Scheduling",
    }

    return {
        "strategy": strategy,
        "strategy_label": strategy_labels.get(strategy, strategy),
        "scheduled_tasks": scheduled_tasks,
        "rejected_tasks": rejected_tasks,
        "scheduled_count": scheduled_count,
        "rejected_count": len(rejected_tasks),
        "total_candidates": len(tasks),
        "rejection_breakdown": rejection_Select_counts,
        "total_nominal_reward": total_nominal_reward,
        "total_reward": total_effective_reward,  # Primary operational science reward
        "energy_consumption": used_energy,
        "max_energy_wh": max_energy_wh,
        "energy_utilization_pct": round(100.0 * used_energy / max(1.0, max_energy_wh), 1),
        "storage_consumption": used_storage,
        "max_storage_gb": max_storage_gb,
        "storage_utilization_pct": round(100.0 * used_storage / max(1.0, max_storage_gb), 1),
        "scheduling_efficiency": scheduling_efficiency,
        "scheduling_rate_pct": scheduling_rate_pct,
        "reward_per_wh": reward_per_wh,
        "mean_imagery_quality_pct": mean_quality_pct,
        "cloud_wasted_acquisitions": high_cloud_scheduled,
        "resource_timeline": resource_timeline,
    }


def compare_scheduling_strategies(
    tasks: List[ObservationTask],
    rf_model: RandomForestFeasibilityModel,
    max_energy_wh: float = 320.0,
    max_storage_gb: float = 165.0,
    max_cloud_cover: float = 65.0,
    ml_threshold: float = 0.48,
) -> Dict[str, Any]:
    """Run all three scheduling strategies on the exact same input task set and compare outcomes."""
    strategies = ["ml_assisted", "priority_based", "reward_efficiency"]
    results_by_strategy: Dict[str, Any] = {}

    for strat in strategies:
        results_by_strategy[strat] = run_single_strategy_schedule(
            tasks=tasks,
            strategy=strat,
            rf_model=rf_model,
            max_energy_wh=max_energy_wh,
            max_storage_gb=max_storage_gb,
            max_cloud_cover=max_cloud_cover,
            ml_threshold=ml_threshold,
        )

    ml_res = results_by_strategy["ml_assisted"]
    prio_res = results_by_strategy["priority_based"]
    eff_res = results_by_strategy["reward_efficiency"]

    comparison_table = [
        {
            "strategy": s,
            "strategy_label": results_by_strategy[s]["strategy_label"],
            "scheduled_count": results_by_strategy[s]["scheduled_count"],
            "rejected_count": results_by_strategy[s]["rejected_count"],
            "total_reward": results_by_strategy[s]["total_reward"],
            "total_nominal_reward": results_by_strategy[s]["total_nominal_reward"],
            "energy_consumption": results_by_strategy[s]["energy_consumption"],
            "storage_consumption": results_by_strategy[s]["storage_consumption"],
            "scheduling_efficiency": results_by_strategy[s]["scheduling_efficiency"],
            "reward_per_wh": results_by_strategy[s]["reward_per_wh"],
            "mean_imagery_quality_pct": results_by_strategy[s]["mean_imagery_quality_pct"],
            "cloud_wasted_acquisitions": results_by_strategy[s]["cloud_wasted_acquisitions"],
        }
        for s in strategies
    ]

    reward_delta_vs_priority = round(ml_res["total_reward"] - prio_res["total_reward"], 2)
    reward_delta_vs_efficiency = round(ml_res["total_reward"] - eff_res["total_reward"], 2)

    return {
        "strategies": results_by_strategy,
        "comparison_summary": comparison_table,
        "advantage_analysis": {
            "ml_vs_priority_reward_delta": reward_delta_vs_priority,
            "ml_vs_efficiency_reward_delta": reward_delta_vs_efficiency,
            "ml_quality_gain_vs_priority_pct": round(
                ml_res["mean_imagery_quality_pct"] - prio_res["mean_imagery_quality_pct"], 1
            ),
            "cloud_waste_avoided_count": max(
                0, prio_res["cloud_wasted_acquisitions"] - ml_res["cloud_wasted_acquisitions"]
            ),
        },
    }
