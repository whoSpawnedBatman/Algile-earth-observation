import React, { useState } from 'react';
import type { SimulationResponse, StrategyKey, TaskRecord } from '../types/orbital';
import { formatMissionTime, validateCustomTaskInput } from '../utils/orbitalLogic';

interface TaskSchedulingSectionProps {
  simulation: SimulationResponse;
  activeStrategy: StrategyKey;
  onSelectStrategy: (strategy: StrategyKey) => void;
  onScheduleCustomTaskList: (
    tasks: Partial<TaskRecord>[],
    maxEnergyWh: number,
    maxStorageGb: number,
    maxCloudCover: number,
    mlThreshold: number,
    scenarioName: string
  ) => Promise<void>;
  isSubmitting: boolean;
}

export const TaskSchedulingSection: React.FC<TaskSchedulingSectionProps> = ({
  simulation,
  activeStrategy,
  onSelectStrategy,
  onScheduleCustomTaskList,
  isSubmitting,
}) => {
  const [targetName, setTargetName] = useState('Svalbard Ice Sheet Sector C');
  const [sensorType, setSensorType] = useState('OPTICAL_HI_RES');
  const [windowStart, setWindowStart] = useState(920);
  const [windowEnd, setWindowEnd] = useState(1040);
  const [imagingDuration, setImagingDuration] = useState(40);
  const [slewTime, setSlewTime] = useState(16);
  const [priority, setPriority] = useState(9);
  const [energyCost, setEnergyCost] = useState(19);
  const [storageCost, setStorageCost] = useState(10);
  const [cloudCoverage, setCloudCoverage] = useState(12);
  const [baseReward, setBaseReward] = useState(185);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const handleInjectTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const validation = validateCustomTaskInput({
      target_name: targetName,
      window_start: windowStart,
      window_end: windowEnd,
      imaging_duration: imagingDuration,
      slew_time: slewTime,
      priority,
      energy_cost: energyCost,
      storage_cost: storageCost,
      cloud_coverage: cloudCoverage,
      base_reward: baseReward,
    });

    if (!validation.valid) {
      setFormError(validation.error);
      return;
    }

    const nextIdx = simulation.candidate_tasks.length + 1;
    const newTask: Partial<TaskRecord> = {
      task_id: `USR-${String(nextIdx).padStart(3, '0')}`,
      target_name: targetName.trim(),
      target_lat: 45.2,
      target_lon: 18.4,
      window_start: windowStart,
      window_end: windowEnd,
      imaging_duration: imagingDuration,
      slew_time: slewTime,
      slew_angle_deg: Number((slewTime * 0.95).toFixed(1)),
      priority,
      energy_cost: energyCost,
      storage_cost: storageCost,
      cloud_coverage: cloudCoverage,
      solar_elevation_deg: 52.0,
      base_reward: baseReward,
      sensor_type: sensorType,
    };

    try {
      await onScheduleCustomTaskList(
        [...simulation.candidate_tasks, newTask],
        simulation.parameters.max_energy_wh,
        simulation.parameters.max_storage_gb,
        simulation.parameters.max_cloud_cover,
        simulation.parameters.ml_threshold,
        `${simulation.scenario_name} + Custom Task ${newTask.task_id}`
      );
      setFormSuccess(`Injected ${newTask.task_id} (${newTask.target_name}) and re-computed all 3 strategies.`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to schedule custom task');
    }
  };

  const strategies: StrategyKey[] = ['ml_assisted', 'priority_based', 'reward_efficiency'];

  return (
    <div className="space-y-6">
      {/* Section Header & Strategy Mathematical Formulations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {strategies.map((stratKey) => {
          const res = simulation.strategies[stratKey];
          const isSelected = activeStrategy === stratKey;
          const formulaDesc =
            stratKey === 'ml_assisted'
              ? 'Filters infeasible tasks via Random Forest P(feasible) >= threshold and ranks by ML-weighted expected science reward per resource unit.'
              : stratKey === 'priority_based'
              ? 'Schedules strictly by descending Priority Tier (10 -> 1), breaking ties by nominal reward and earliest window without ML cloud/agility screening.'
              : 'Ranks candidates greedily by Nominal Reward divided by weighted Energy (Wh), Storage (GB), and Manoeuvre Duration (s).';

          return (
            <div
              key={stratKey}
              onClick={() => onSelectStrategy(stratKey)}
              className={`p-4 rounded-lg border transition-colors cursor-pointer flex flex-col justify-between ${
                isSelected
                  ? 'bg-[#10192B] border-cyan-500/80'
                  : 'bg-[#0C121E] border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-cyan-400">
                    {stratKey === 'ml_assisted'
                      ? 'STRATEGY 01 · RECOMMENDED'
                      : stratKey === 'priority_based'
                      ? 'STRATEGY 02 · HEURISTIC'
                      : 'STRATEGY 03 · GREEDY'}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    {res.scheduled_count}/{res.total_candidates} Scheduled
                  </span>
                </div>
                <h3 className="text-base font-semibold text-slate-100 mt-1">
                  {res.strategy_label}
                </h3>
                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                  {formulaDesc}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 grid grid-cols-3 gap-2 font-mono tabular-nums">
                <div>
                  <div className="text-[11px] text-slate-500">REALIZED REWARD</div>
                  <div className="text-sm font-semibold text-cyan-300 mt-0.5">
                    {res.total_reward.toFixed(1)} pts
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">ENERGY DRAW</div>
                  <div className="text-sm font-semibold text-slate-200 mt-0.5">
                    {res.energy_consumption.toFixed(1)} Wh
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">IMG QUALITY</div>
                  <div className="text-sm font-semibold text-emerald-400 mt-0.5">
                    {res.mean_imagery_quality_pct.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Split: Inject Custom Observation Request + Side-by-Side Execution Queue */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left 4 Cols: Add Custom Observation Request to /api/schedule */}
        <div className="xl:col-span-4 bg-[#0C121E] border border-slate-800 rounded-lg p-5">
          <div className="text-xs font-mono text-cyan-400">
            DIRECT API SCHEDULER (POST /api/schedule)
          </div>
          <h3 className="text-base font-semibold text-slate-100 mt-1">
            Inject Custom Observation Request
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Add a custom ground target to the current candidate manifest and execute all three scheduling algorithms.
          </p>

          <form onSubmit={handleInjectTask} className="mt-4 space-y-3">
            <div>
              <label htmlFor="task-target-name" className="block text-xs font-mono text-slate-300 mb-1">
                Target Designation
              </label>
              <input
                id="task-target-name"
                type="text"
                value={targetName}
                onChange={(e) => setTargetName(e.target.value)}
                className="w-full px-3 py-1.5 text-xs font-mono bg-[#070B12] border border-slate-700 rounded text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="task-sensor" className="block text-xs font-mono text-slate-300 mb-1">
                  Payload Sensor
                </label>
                <select
                  id="task-sensor"
                  value={sensorType}
                  onChange={(e) => setSensorType(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-[#070B12] border border-slate-700 rounded text-slate-100 focus:outline-none focus:border-cyan-500"
                >
                  <option value="OPTICAL_HI_RES">OPTICAL_HI_RES</option>
                  <option value="MULTISPECTRAL">MULTISPECTRAL</option>
                  <option value="SAR_C_BAND">SAR_C_BAND</option>
                </select>
              </div>
              <div>
                <label htmlFor="task-priority" className="block text-xs font-mono text-slate-300 mb-1">
                  Priority (1-10)
                </label>
                <input
                  id="task-priority"
                  type="number"
                  min={1}
                  max={10}
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-xs font-mono bg-[#070B12] border border-slate-700 rounded text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="task-win-start" className="block text-xs font-mono text-slate-300 mb-1">
                  Window Start (s)
                </label>
                <input
                  id="task-win-start"
                  type="number"
                  min={0}
                  max={5300}
                  value={windowStart}
                  onChange={(e) => setWindowStart(Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-xs font-mono bg-[#070B12] border border-slate-700 rounded text-slate-100"
                />
              </div>
              <div>
                <label htmlFor="task-win-end" className="block text-xs font-mono text-slate-300 mb-1">
                  Window End (s)
                </label>
                <input
                  id="task-win-end"
                  type="number"
                  min={10}
                  max={5400}
                  value={windowEnd}
                  onChange={(e) => setWindowEnd(Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-xs font-mono bg-[#070B12] border border-slate-700 rounded text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="task-duration" className="block text-xs font-mono text-slate-300 mb-1">
                  Imaging Duration (s)
                </label>
                <input
                  id="task-duration"
                  type="number"
                  min={5}
                  max={180}
                  value={imagingDuration}
                  onChange={(e) => setImagingDuration(Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-xs font-mono bg-[#070B12] border border-slate-700 rounded text-slate-100"
                />
              </div>
              <div>
                <label htmlFor="task-slew" className="block text-xs font-mono text-slate-300 mb-1">
                  Slew Time (s)
                </label>
                <input
                  id="task-slew"
                  type="number"
                  min={2}
                  max={90}
                  value={slewTime}
                  onChange={(e) => setSlewTime(Number(e.target.value))}
                  className="w-full px-3 py-1.5 text-xs font-mono bg-[#070B12] border border-slate-700 rounded text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label htmlFor="task-energy" className="block text-xs font-mono text-slate-300 mb-1">
                  Energy (Wh)
                </label>
                <input
                  id="task-energy"
                  type="number"
                  min={1}
                  max={100}
                  value={energyCost}
                  onChange={(e) => setEnergyCost(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-[#070B12] border border-slate-700 rounded text-slate-100"
                />
              </div>
              <div>
                <label htmlFor="task-storage" className="block text-xs font-mono text-slate-300 mb-1">
                  Storage (GB)
                </label>
                <input
                  id="task-storage"
                  type="number"
                  min={1}
                  max={80}
                  value={storageCost}
                  onChange={(e) => setStorageCost(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-[#070B12] border border-slate-700 rounded text-slate-100"
                />
              </div>
              <div>
                <label htmlFor="task-cloud" className="block text-xs font-mono text-slate-300 mb-1">
                  Cloud (%)
                </label>
                <input
                  id="task-cloud"
                  type="number"
                  min={0}
                  max={100}
                  value={cloudCoverage}
                  onChange={(e) => setCloudCoverage(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 text-xs font-mono bg-[#070B12] border border-slate-700 rounded text-slate-100"
                />
              </div>
            </div>

            <div>
              <label htmlFor="task-reward" className="block text-xs font-mono text-slate-300 mb-1">
                Nominal Science Reward (pts)
              </label>
              <input
                id="task-reward"
                type="number"
                min={10}
                max={500}
                value={baseReward}
                onChange={(e) => setBaseReward(Number(e.target.value))}
                className="w-full px-3 py-1.5 text-xs font-mono bg-[#070B12] border border-slate-700 rounded text-slate-100"
              />
            </div>

            {formError && (
              <div className="p-2.5 bg-rose-950/50 border border-rose-800 rounded text-xs font-mono text-rose-300">
                ✖ {formError}
              </div>
            )}
            {formSuccess && (
              <div className="p-2.5 bg-emerald-950/50 border border-emerald-800 rounded text-xs font-mono text-emerald-300">
                ● {formSuccess}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-semibold text-xs font-mono rounded transition-colors cursor-pointer whitespace-nowrap"
            >
              {isSubmitting ? 'Scheduling...' : 'Add Custom Task & Re-Schedule'}
            </button>
          </form>
        </div>

        {/* Right 8 Cols: Active Strategy Scheduled vs Rejected Queue */}
        <div className="xl:col-span-8 bg-[#0C121E] border border-slate-800 rounded-lg p-5 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div>
              <div className="text-xs font-mono text-slate-400">
                CHRONOLOGICAL EXECUTION SEQUENCE · {simulation.strategies[activeStrategy].strategy_label}
              </div>
              <h3 className="text-base font-semibold text-slate-100 mt-0.5">
                Scheduled Observation Locks &amp; Pre-Emptive Rejections
              </h3>
            </div>
            <div className="text-xs font-mono text-slate-300 tabular-nums">
              Cloud-Wasted Acquisitions Avoided:{' '}
              <strong className="text-emerald-400">
                {simulation.advantage_analysis.cloud_waste_avoided_count}
              </strong>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="py-2 pr-3 font-medium">Task ID</th>
                  <th className="py-2 px-2 font-medium">Target</th>
                  <th className="py-2 px-2 text-right font-medium">Prio</th>
                  <th className="py-2 px-2 text-right font-medium">RF Prob</th>
                  <th className="py-2 px-2 text-right font-medium">Slew → Lock</th>
                  <th className="py-2 px-2 text-right font-medium">Cloud</th>
                  <th className="py-2 px-2 text-right font-medium">Reward</th>
                  <th className="py-2 pl-2 font-medium">Outcome / Constraint Diagnostic</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {simulation.strategies[activeStrategy].scheduled_tasks.slice(0, 12).map((task) => (
                  <tr key={task.task_id} className="hover:bg-slate-800/30 text-slate-200">
                    <td className="py-2 pr-3 text-cyan-300 font-semibold">{task.task_id}</td>
                    <td className="py-2 px-2 truncate max-w-[170px]">{task.target_name}</td>
                    <td className="py-2 px-2 text-right">{task.priority}</td>
                    <td className="py-2 px-2 text-right text-emerald-400">
                      {((task.ml_probability ?? 0) * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 px-2 text-right text-slate-300">
                      {formatMissionTime(task.manoeuvre_start)} → {formatMissionTime(task.execution_end)}
                    </td>
                    <td className="py-2 px-2 text-right">{task.cloud_coverage.toFixed(1)}%</td>
                    <td className="py-2 px-2 text-right font-semibold text-cyan-300">
                      {(task.effective_reward ?? task.base_reward).toFixed(1)}
                    </td>
                    <td className="py-2 pl-2 text-emerald-400">
                      ● SCHEDULED ({task.energy_cost.toFixed(1)} Wh, {task.storage_cost.toFixed(1)} GB)
                    </td>
                  </tr>
                ))}

                {simulation.strategies[activeStrategy].rejected_tasks.slice(0, 8).map((task) => (
                  <tr key={task.task_id} className="hover:bg-slate-800/20 text-slate-400">
                    <td className="py-2 pr-3 text-rose-400">{task.task_id}</td>
                    <td className="py-2 px-2 truncate max-w-[170px]">{task.target_name}</td>
                    <td className="py-2 px-2 text-right">{task.priority}</td>
                    <td className="py-2 px-2 text-right">
                      {((task.ml_probability ?? 0) * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 px-2 text-right text-slate-500">
                      Win {formatMissionTime(task.window_start)}
                    </td>
                    <td className="py-2 px-2 text-right">{task.cloud_coverage.toFixed(1)}%</td>
                    <td className="py-2 px-2 text-right text-slate-500">
                      0.0 ({task.base_reward.toFixed(0)})
                    </td>
                    <td className="py-2 pl-2 text-rose-400 truncate max-w-[240px]" title={task.rejection_reason ?? ''}>
                      ✖ {task.rejection_code}: {task.rejection_reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
