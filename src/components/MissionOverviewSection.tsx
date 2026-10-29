import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import type {
  SimulationResponse,
  ModelInfoResponse,
  StrategyKey,
  NavigationTab,
} from '../types/orbital';
import { OrbitalGroundTrackMap } from './OrbitalGroundTrackMap';
import { verifyZeroTimelineConflicts } from '../utils/orbitalLogic';

interface MissionOverviewSectionProps {
  simulation: SimulationResponse;
  modelInfo: ModelInfoResponse;
  activeStrategy: StrategyKey;
  onSelectStrategy: (strategy: StrategyKey) => void;
  onNavigateTab: (tab: NavigationTab) => void;
}

export const MissionOverviewSection: React.FC<MissionOverviewSectionProps> = ({
  simulation,
  modelInfo,
  activeStrategy,
  onSelectStrategy,
  onNavigateTab,
}) => {
  const currentStrat = simulation.strategies[activeStrategy];
  const conflictCheck = verifyZeroTimelineConflicts(currentStrat.scheduled_tasks);

  const strategyChartData = simulation.comparison_summary.map((item) => ({
    name:
      item.strategy === 'ml_assisted'
        ? 'ML-Assisted'
        : item.strategy === 'priority_based'
        ? 'Priority-Based'
        : 'Reward-Efficiency',
    EffectiveReward: item.total_reward,
    NominalReward: item.total_nominal_reward,
    EnergyWh: item.energy_consumption,
    StorageGB: item.storage_consumption,
    EfficiencyPct: item.scheduling_efficiency,
  }));

  const rejectionEntries = Object.entries(currentStrat.rejection_breakdown);

  return (
    <div className="space-y-6">
      {/* Top 4-Column Telemetry KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0E1525] border border-slate-800 rounded-lg p-4">
          <div className="text-xs font-mono text-slate-400">
            SCHEDULED ACQUISITIONS ({activeStrategy.replace('_', ' ').toUpperCase()})
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-mono font-semibold text-slate-100 tabular-nums" data-testid="kpi-scheduled-count">
              {currentStrat.scheduled_count}
            </span>
            <span className="text-xs font-mono text-slate-400">
              / {currentStrat.total_candidates} CANDIDATES ({currentStrat.scheduling_rate_pct}%)
            </span>
          </div>
          <div className="mt-2 text-xs font-mono text-emerald-400">
            ● {conflictCheck.valid ? 'Zero Timeline Conflicts Verified' : 'Conflict Detected'}
          </div>
        </div>

        <div className="bg-[#0E1525] border border-slate-800 rounded-lg p-4">
          <div className="text-xs font-mono text-slate-400">
            REALIZED SCIENCE REWARD
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-mono font-semibold text-cyan-400 tabular-nums" data-testid="kpi-total-reward">
              {currentStrat.total_reward.toFixed(1)}
            </span>
            <span className="text-xs font-mono text-slate-400">PTS</span>
          </div>
          <div className="mt-2 text-xs font-mono text-slate-400">
            Delta vs Priority: {' '}
            <span className={simulation.advantage_analysis.ml_vs_priority_reward_delta >= 0 ? 'text-emerald-400' : 'text-amber-400'}>
              {simulation.advantage_analysis.ml_vs_priority_reward_delta >= 0 ? '+' : ''}
              {simulation.advantage_analysis.ml_vs_priority_reward_delta.toFixed(1)} pts
            </span>
          </div>
        </div>

        <div className="bg-[#0E1525] border border-slate-800 rounded-lg p-4">
          <div className="text-xs font-mono text-slate-400">
            EPS ENERGY &amp; SSR STORAGE
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-mono font-semibold text-slate-100 tabular-nums">
              {currentStrat.energy_consumption.toFixed(1)}
            </span>
            <span className="text-xs font-mono text-slate-400">
              / {currentStrat.max_energy_wh} Wh ({currentStrat.energy_utilization_pct}%)
            </span>
          </div>
          <div className="mt-2 text-xs font-mono text-slate-300">
            SSR Storage: {currentStrat.storage_consumption.toFixed(1)} / {currentStrat.max_storage_gb} GB ({currentStrat.storage_utilization_pct}%)
          </div>
        </div>

        <div className="bg-[#0E1525] border border-slate-800 rounded-lg p-4">
          <div className="text-xs font-mono text-slate-400">
            RANDOM FOREST F1-SCORE (TEST SPLIT)
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-mono font-semibold text-violet-400 tabular-nums" data-testid="kpi-model-f1">
              {(modelInfo.test_metrics.f1_score * 100).toFixed(1)}%
            </span>
            <span className="text-xs font-mono text-slate-400">
              ACC {(modelInfo.test_metrics.accuracy * 100).toFixed(1)}%
            </span>
          </div>
          <div className="mt-2 text-xs font-mono text-slate-400">
            Seed {modelInfo.random_seed} · N={modelInfo.dataset_summary.total_samples} Synthetic Pass Logs
          </div>
        </div>
      </div>

      {/* Strategy Selector Bar */}
      <div className="bg-[#0C121E] border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono text-slate-400">
            ACTIVE SCHEDULING STRATEGY INSPECTION
          </div>
          <p className="text-sm text-slate-300 mt-0.5">
            Switch strategies to inspect how classical ML feasibility predictions prevent cloud-obscured and slew-infeasible acquisitions.
          </p>
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-[#070A12] border border-slate-800 rounded-lg">
          {(['ml_assisted', 'priority_based', 'reward_efficiency'] as StrategyKey[]).map((strat) => {
            const labels: Record<StrategyKey, string> = {
              ml_assisted: 'ML-Assisted (RF)',
              priority_based: 'Priority-Based',
              reward_efficiency: 'Reward-Efficiency',
            };
            const isActive = activeStrategy === strat;
            return (
              <button
                key={strat}
                type="button"
                onClick={() => onSelectStrategy(strat)}
                className={`px-3.5 py-2 text-xs font-mono rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-cyan-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                {labels[strat]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Split: Orbital Ground-Track Visualizer + Strategy Comparison Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <div className="xl:col-span-7 flex flex-col">
          <OrbitalGroundTrackMap
            telemetry={simulation.telemetry}
            scheduledTasks={currentStrat.scheduled_tasks}
            rejectedTasks={currentStrat.rejected_tasks}
            activeStrategy={activeStrategy}
            horizonSeconds={simulation.parameters.horizon_seconds}
          />
        </div>

        <div className="xl:col-span-5 flex flex-col gap-6">
          {/* Multi-Strategy Reward & Resource Comparison Chart */}
          <div className="bg-[#0C121E] border border-slate-800 rounded-lg p-4 flex-1 flex flex-col">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <div className="text-xs font-mono text-slate-400">
                  MULTI-STRATEGY BENCHMARK (SAME SCENARIO)
                </div>
                <h3 className="text-sm font-semibold text-slate-100 mt-0.5">
                  Realized Science Reward vs. Resource Consumption
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('scheduling')}
                className="px-2.5 py-1 text-xs font-mono text-cyan-400 hover:text-cyan-300 border border-slate-700 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Open Scheduler
              </button>
            </div>

            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={strategyChartData} margin={{ top: 10, right: 12, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                  <XAxis dataKey="name" stroke="#94A3B8" fontSize={11} />
                  <YAxis stroke="#94A3B8" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#090E17',
                      borderColor: '#1E293B',
                      fontSize: '12px',
                      fontFamily: 'IBM Plex Mono, monospace',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'IBM Plex Mono, monospace' }} />
                  <Bar dataKey="EffectiveReward" name="Realized Reward (pts)" fill="#06B6D4" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="EnergyWh" name="Energy Used (Wh)" fill="#3B82F6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="StorageGB" name="Storage Used (GB)" fill="#8B5CF6" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Compact Strategy Comparison Matrix */}
            <div className="mt-4 pt-3 border-t border-slate-800/80 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800">
                    <th className="py-1.5 pr-2 font-medium">Strategy</th>
                    <th className="py-1.5 px-2 text-right font-medium">Tasks</th>
                    <th className="py-1.5 px-2 text-right font-medium">Reward</th>
                    <th className="py-1.5 px-2 text-right font-medium">Quality</th>
                    <th className="py-1.5 pl-2 text-right font-medium">Efficiency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {simulation.comparison_summary.map((row) => {
                    const isSelected = row.strategy === activeStrategy;
                    return (
                      <tr
                        key={row.strategy}
                        onClick={() => onSelectStrategy(row.strategy)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-cyan-950/30 text-cyan-200' : 'text-slate-300 hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-2 pr-2 font-medium">
                          {row.strategy === 'ml_assisted'
                            ? 'ML-Assisted'
                            : row.strategy === 'priority_based'
                            ? 'Priority-Based'
                            : 'Reward-Efficiency'}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {row.scheduled_count}/{currentStrat.total_candidates}
                        </td>
                        <td className="py-2 px-2 text-right font-semibold text-cyan-400">
                          {row.total_reward.toFixed(1)}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {row.mean_imagery_quality_pct.toFixed(1)}%
                        </td>
                        <td className="py-2 pl-2 text-right">
                          {row.scheduling_efficiency.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Constraint Rejection Telemetry Breakdown */}
          <div className="bg-[#0C121E] border border-slate-800 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-mono text-slate-400">
                REJECTION DIAGNOSTICS ({currentStrat.rejected_count} REJECTED TASKS)
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('task_manifest')}
                className="text-xs font-mono text-cyan-400 hover:underline cursor-pointer"
              >
                Inspect Manifest →
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {rejectionEntries.length === 0 ? (
                <p className="text-xs font-mono text-emerald-400">
                  All candidate tasks satisfied orbital constraints.
                </p>
              ) : (
                rejectionEntries.map(([code, count]) => {
                  const pct = Math.round((count / Math.max(1, currentStrat.rejected_count)) * 100);
                  return (
                    <div key={code} className="space-y-1">
                      <div className="flex items-center justify-between text-xs font-mono">
                        <span className="text-slate-300">{code}</span>
                        <span className="text-slate-400 tabular-nums">
                          {count} tasks ({pct}%)
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-900 rounded overflow-hidden">
                        <div
                          className="h-full bg-cyan-500/80"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
