import React, { useState } from 'react';
import type { SimulationResponse, StrategyKey, TaskRecord } from '../types/orbital';
import { formatMissionTime, verifyZeroTimelineConflicts } from '../utils/orbitalLogic';

interface OrbitalTimelineSectionProps {
  simulation: SimulationResponse;
  activeStrategy: StrategyKey;
  onSelectStrategy: (strategy: StrategyKey) => void;
}

export const OrbitalTimelineSection: React.FC<OrbitalTimelineSectionProps> = ({
  simulation,
  activeStrategy,
  onSelectStrategy,
}) => {
  const currentStrat = simulation.strategies[activeStrategy];
  const horizon = Math.max(1800, simulation.parameters.horizon_seconds);
  const conflictStatus = verifyZeroTimelineConflicts(currentStrat.scheduled_tasks);
  const [inspectedTask, setInspectedTask] = useState<TaskRecord | null>(
    currentStrat.scheduled_tasks[0] ?? null
  );

  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1.0].map((f) => Math.round(horizon * f));

  return (
    <div className="space-y-6" data-testid="orbital-timeline-section">
      {/* Header & Strategy Switcher */}
      <div className="bg-[#0C121E] border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
            <span>PASS TIMELINE GANTT CHART</span>
            <span aria-hidden="true">·</span>
            <span className="text-emerald-400">
              ● {conflictStatus.valid ? 'ZERO SIMULTANEOUS CONFLICTS' : 'CONFLICT ALERT'}
            </span>
          </div>
          <h3 className="text-base font-semibold text-slate-100 mt-0.5">
            Attitude Slew Manoeuvres &amp; Sensor Integration Windows (0s – {horizon}s)
          </h3>
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-[#070A12] border border-slate-800 rounded-lg">
          {(['ml_assisted', 'priority_based', 'reward_efficiency'] as StrategyKey[]).map((strat) => (
            <button
              key={strat}
              type="button"
              onClick={() => {
                onSelectStrategy(strat);
                setInspectedTask(simulation.strategies[strat].scheduled_tasks[0] ?? null);
              }}
              className={`px-3 py-1.5 text-xs font-mono rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeStrategy === strat
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {strat === 'ml_assisted'
                ? 'ML-Assisted'
                : strat === 'priority_based'
                ? 'Priority-Based'
                : 'Reward-Efficiency'}
            </button>
          ))}
        </div>
      </div>

      {/* Multi-Strategy Aggregate Pass Ribbon */}
      <div className="bg-[#0C121E] border border-slate-800 rounded-lg p-5">
        <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-3">
          <span>COMPARATIVE PASS OCCUPANCY RIBBONS (SLEW + IMAGING LOCKS)</span>
          <div className="flex items-center gap-4">
            <span className="text-amber-400">■ Attitude Slew Interval</span>
            <span className="text-cyan-400">■ Sensor Imaging Lock</span>
            <span className="text-slate-500">□ Available Visibility Window</span>
          </div>
        </div>

        <div className="space-y-3">
          {(['ml_assisted', 'priority_based', 'reward_efficiency'] as StrategyKey[]).map((strat) => {
            const stratRes = simulation.strategies[strat];
            const isCurr = strat === activeStrategy;
            return (
              <div
                key={strat}
                onClick={() => onSelectStrategy(strat)}
                className={`p-3 rounded border cursor-pointer transition-colors ${
                  isCurr ? 'bg-[#10192B] border-cyan-500/70' : 'bg-[#080D16] border-slate-800/80'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-mono mb-2">
                  <span className={isCurr ? 'text-cyan-300 font-semibold' : 'text-slate-300'}>
                    {stratRes.strategy_label}
                  </span>
                  <span className="text-slate-400 tabular-nums">
                    {stratRes.scheduled_count} locks · {stratRes.total_reward.toFixed(1)} pts
                  </span>
                </div>
                <div className="relative w-full h-7 bg-[#05080F] border border-slate-800 rounded overflow-hidden">
                  {stratRes.scheduled_tasks.map((task) => {
                    const mStart = task.manoeuvre_start ?? task.window_start;
                    const eStart = task.execution_start ?? mStart + task.slew_time;
                    const eEnd = task.execution_end ?? eStart + task.imaging_duration;
                    const slewLeftPct = Math.max(0, Math.min(100, (mStart / horizon) * 100));
                    const slewWidthPct = Math.max(0.3, ((eStart - mStart) / horizon) * 100);
                    const imgLeftPct = Math.max(0, Math.min(100, (eStart / horizon) * 100));
                    const imgWidthPct = Math.max(0.4, ((eEnd - eStart) / horizon) * 100);

                    return (
                      <React.Fragment key={task.task_id}>
                        <div
                          style={{ left: `${slewLeftPct}%`, width: `${slewWidthPct}%` }}
                          className="absolute top-1 bottom-1 bg-amber-500/70"
                          title={`${task.task_id} Slew: ${formatMissionTime(mStart)} - ${formatMissionTime(eStart)}`}
                        />
                        <div
                          style={{ left: `${imgLeftPct}%`, width: `${imgWidthPct}%` }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectedTask(task);
                          }}
                          className="absolute top-1 bottom-1 bg-cyan-400 hover:bg-cyan-300 border-r border-slate-950"
                          title={`${task.task_id} Imaging: ${formatMissionTime(eStart)} - ${formatMissionTime(eEnd)}`}
                        />
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Time Axis Ticks */}
        <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-slate-500 tabular-nums px-1">
          {ticks.map((sec) => (
            <span key={sec}>{formatMissionTime(sec)} ({sec}s)</span>
          ))}
        </div>
      </div>

      {/* Detailed Per-Task Gantt Rows + Selected Task Telemetry Card */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-8 bg-[#0C121E] border border-slate-800 rounded-lg p-5">
          <div className="text-xs font-mono text-slate-400 mb-3">
            INDIVIDUAL SCHEDULED TASK WINDOWS ({currentStrat.scheduled_count} LOCKS IN {activeStrategy.toUpperCase()})
          </div>

          <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
            {currentStrat.scheduled_tasks.map((task) => {
              const winLeft = (task.window_start / horizon) * 100;
              const winWidth = Math.max(1, ((task.window_end - task.window_start) / horizon) * 100);
              const mStart = task.manoeuvre_start ?? task.window_start;
              const eStart = task.execution_start ?? mStart + task.slew_time;
              const eEnd = task.execution_end ?? eStart + task.imaging_duration;
              const slewLeft = (mStart / horizon) * 100;
              const slewWidth = Math.max(0.4, ((eStart - mStart) / horizon) * 100);
              const imgLeft = (eStart / horizon) * 100;
              const imgWidth = Math.max(0.5, ((eEnd - eStart) / horizon) * 100);

              const isSelected = inspectedTask?.task_id === task.task_id;

              return (
                <div
                  key={task.task_id}
                  onClick={() => setInspectedTask(task)}
                  className={`p-2.5 rounded border cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-[#121D33] border-cyan-500/70'
                      : 'bg-[#080C15] border-slate-800/80 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-cyan-300 font-semibold">{task.task_id}</span>
                      <span className="text-slate-300 truncate max-w-[200px]">{task.target_name}</span>
                      <span aria-hidden="true" className="text-slate-600">·</span>
                      <span className="text-slate-400">P{task.priority}</span>
                    </div>
                    <div className="text-slate-400 tabular-nums">
                      Slew {formatMissionTime(mStart)} · Lock {formatMissionTime(eStart)}–{formatMissionTime(eEnd)}
                    </div>
                  </div>

                  <div className="relative w-full h-4 bg-[#05080F] rounded overflow-hidden border border-slate-800/80">
                    {/* Available Visibility Window */}
                    <div
                      style={{ left: `${winLeft}%`, width: `${winWidth}%` }}
                      className="absolute top-0.5 bottom-0.5 bg-slate-700/40 border border-slate-600/50 rounded-xs"
                    />
                    {/* Attitude Slew Bar */}
                    <div
                      style={{ left: `${slewLeft}%`, width: `${slewWidth}%` }}
                      className="absolute top-0.5 bottom-0.5 bg-amber-500"
                    />
                    {/* Imaging Acquisition Lock */}
                    <div
                      style={{ left: `${imgLeft}%`, width: `${imgWidth}%` }}
                      className="absolute top-0.5 bottom-0.5 bg-cyan-400"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right 4 Cols: Selected Task Kinematic & Attitude Telemetry */}
        <div className="xl:col-span-4 bg-[#0C121E] border border-slate-800 rounded-lg p-5">
          <div className="text-xs font-mono text-cyan-400">
            KINEMATIC &amp; SLEW TELEMETRY INSPECTOR
          </div>
          {inspectedTask ? (
            <div className="mt-3 space-y-3 font-mono text-xs">
              <div>
                <div className="text-slate-400">SELECTED TASK</div>
                <div className="text-base font-semibold text-slate-100 mt-0.5">
                  {inspectedTask.task_id} — {inspectedTask.target_name}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800">
                <div>
                  <div className="text-slate-500">VISIBILITY WINDOW</div>
                  <div className="text-slate-200 mt-0.5 tabular-nums">
                    {inspectedTask.window_start.toFixed(1)}s – {inspectedTask.window_end.toFixed(1)}s
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">WINDOW SPAN</div>
                  <div className="text-slate-200 mt-0.5 tabular-nums">
                    {(inspectedTask.window_end - inspectedTask.window_start).toFixed(1)}s
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">ATTITUDE SLEW</div>
                  <div className="text-amber-300 mt-0.5 tabular-nums">
                    {inspectedTask.slew_time.toFixed(1)}s ({inspectedTask.slew_angle_deg.toFixed(1)}°)
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">SLEW AGILITY RATE</div>
                  <div className="text-slate-200 mt-0.5 tabular-nums">
                    {(inspectedTask.slew_angle_deg / Math.max(1, inspectedTask.slew_time)).toFixed(2)} deg/s
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">MANOEUVRE START</div>
                  <div className="text-cyan-300 mt-0.5 tabular-nums">
                    {formatMissionTime(inspectedTask.manoeuvre_start)} ({inspectedTask.manoeuvre_start}s)
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">ACQUISITION END</div>
                  <div className="text-cyan-300 mt-0.5 tabular-nums">
                    {formatMissionTime(inspectedTask.execution_end)} ({inspectedTask.execution_end}s)
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">RF FEASIBILITY</div>
                  <div className="text-emerald-400 mt-0.5 tabular-nums">
                    {((inspectedTask.ml_probability ?? 0) * 100).toFixed(1)}%
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">EFFECTIVE REWARD</div>
                  <div className="text-cyan-300 font-semibold mt-0.5 tabular-nums">
                    {(inspectedTask.effective_reward ?? inspectedTask.base_reward).toFixed(1)} pts
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs font-mono text-slate-400 mt-4">
              Select a scheduled task bar on the timeline to inspect attitude manoeuvre kinematics.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
