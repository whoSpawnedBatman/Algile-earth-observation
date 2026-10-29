import React, { useState } from 'react';
import { Download, Search } from 'lucide-react';
import type { SimulationResponse, StrategyKey } from '../types/orbital';
import {
  formatMissionTime,
  filterAndSortTasks,
  generateTaskManifestCsv,
} from '../utils/orbitalLogic';

interface TaskManifestSectionProps {
  simulation: SimulationResponse;
  activeStrategy: StrategyKey;
  onSelectStrategy: (strategy: StrategyKey) => void;
}

export const TaskManifestSection: React.FC<TaskManifestSectionProps> = ({
  simulation,
  activeStrategy,
  onSelectStrategy,
}) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'SCHEDULED' | 'REJECTED'>('ALL');
  const [sensorFilter, setSensorFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortBy, setSortBy] = useState<
    'window_start' | 'priority' | 'ml_probability' | 'effective_reward' | 'energy_cost'
  >('window_start');
  const [sortDesc, setSortDesc] = useState<boolean>(false);
  const [csvExportNotice, setCsvExportNotice] = useState<string | null>(null);

  const currentStrat = simulation.strategies[activeStrategy];
  const filteredTasks = filterAndSortTasks(
    currentStrat.scheduled_tasks,
    currentStrat.rejected_tasks,
    {
      statusFilter,
      sensorFilter,
      searchQuery,
      sortBy,
      sortDesc,
    }
  );

  const handleExportCsv = () => {
    const csvString = generateTaskManifestCsv(
      filteredTasks,
      currentStrat.strategy_label,
      simulation.simulation_id
    );
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `orbital_manifest_${simulation.simulation_id}_${activeStrategy}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setCsvExportNotice(
      `Exported ${filteredTasks.length} tasks (${simulation.simulation_id} · ${activeStrategy}) to CSV.`
    );
  };

  return (
    <div className="space-y-6" data-testid="task-manifest-section">
      {/* Filter & Export Control Bar */}
      <div className="bg-[#0C121E] border border-slate-800 rounded-lg p-4 flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Strategy Selector */}
          <div className="flex items-center gap-1 p-1 bg-[#070A12] border border-slate-800 rounded-lg">
            {(['ml_assisted', 'priority_based', 'reward_efficiency'] as StrategyKey[]).map((strat) => (
              <button
                key={strat}
                type="button"
                onClick={() => onSelectStrategy(strat)}
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

          {/* Status Filter */}
          <div className="flex items-center gap-1 p-1 bg-[#070A12] border border-slate-800 rounded-lg">
            {(['ALL', 'SCHEDULED', 'REJECTED'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 text-xs font-mono rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  statusFilter === st
                    ? 'bg-slate-800 text-cyan-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st === 'ALL'
                  ? `All (${currentStrat.total_candidates})`
                  : st === 'SCHEDULED'
                  ? `Scheduled (${currentStrat.scheduled_count})`
                  : `Rejected (${currentStrat.rejected_count})`}
              </button>
            ))}
          </div>

          {/* Sensor Filter */}
          <select
            aria-label="Filter by sensor type"
            value={sensorFilter}
            onChange={(e) => setSensorFilter(e.target.value)}
            className="px-3 py-2 text-xs font-mono bg-[#070A12] border border-slate-800 rounded-lg text-slate-200"
          >
            <option value="ALL">All Sensors</option>
            <option value="OPTICAL_HI_RES">OPTICAL_HI_RES</option>
            <option value="MULTISPECTRAL">MULTISPECTRAL</option>
            <option value="SAR_C_BAND">SAR_C_BAND</option>
          </select>

          {/* Sort Selector */}
          <select
            aria-label="Sort tasks by attribute"
            value={`${sortBy}:${sortDesc ? 'desc' : 'asc'}`}
            onChange={(e) => {
              const [field, dir] = e.target.value.split(':');
              setSortBy(field as typeof sortBy);
              setSortDesc(dir === 'desc');
            }}
            className="px-3 py-2 text-xs font-mono bg-[#070A12] border border-slate-800 rounded-lg text-slate-200"
          >
            <option value="window_start:asc">Sort: Window Start (Earliest)</option>
            <option value="priority:desc">Sort: Priority (Highest)</option>
            <option value="ml_probability:desc">Sort: ML Feasibility (Highest)</option>
            <option value="effective_reward:desc">Sort: Effective Reward (Highest)</option>
            <option value="energy_cost:asc">Sort: Energy Cost (Lowest)</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-60">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ID, target, reason..."
              aria-label="Search tasks by ID, target name, or rejection reason"
              className="w-full pl-8 pr-3 py-2 text-xs font-mono bg-[#070A12] border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            data-testid="export-csv-btn"
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs font-mono rounded-lg flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {csvExportNotice && (
        <div
          data-testid="csv-export-confirmation"
          className="px-4 py-2.5 bg-emerald-950/50 border border-emerald-800/80 rounded-lg text-xs font-mono text-emerald-300 flex items-center justify-between"
        >
          <span>● {csvExportNotice}</span>
          <button
            type="button"
            onClick={() => setCsvExportNotice(null)}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Full Task Manifest Table */}
      <div className="bg-[#0C121E] border border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
            <thead>
              <tr className="bg-[#090E17] text-slate-400 border-b border-slate-800">
                <th className="py-3 px-3 font-medium">Task ID</th>
                <th className="py-3 px-3 font-medium">Target Name</th>
                <th className="py-3 px-2 font-medium">Sensor</th>
                <th className="py-3 px-2 text-right font-medium">Prio</th>
                <th className="py-3 px-2 text-right font-medium">Window</th>
                <th className="py-3 px-2 text-right font-medium">Dur+Slew</th>
                <th className="py-3 px-2 text-right font-medium">Cloud</th>
                <th className="py-3 px-2 text-right font-medium">Energy</th>
                <th className="py-3 px-2 text-right font-medium">Storage</th>
                <th className="py-3 px-2 text-right font-medium">RF Prob</th>
                <th className="py-3 px-2 text-right font-medium">Reward</th>
                <th className="py-3 px-3 font-medium">Status &amp; Constraint Diagnostic</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-slate-400">
                    No tasks match the current filter criteria.
                  </td>
                </tr>
              ) : (
                filteredTasks.map((task) => {
                  const isSched = task.status === 'SCHEDULED';
                  return (
                    <tr
                      key={task.task_id}
                      className={`transition-colors ${
                        isSched
                          ? 'text-slate-200 hover:bg-slate-800/40'
                          : 'text-slate-400 hover:bg-slate-800/20'
                      }`}
                    >
                      <td className="py-2.5 px-3 font-semibold text-cyan-300 whitespace-nowrap">
                        {task.task_id}
                      </td>
                      <td className="py-2.5 px-3 max-w-[200px] truncate" title={task.target_name}>
                        {task.target_name}
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap text-slate-300">
                        {task.sensor_type}
                      </td>
                      <td className="py-2.5 px-2 text-right">{task.priority}</td>
                      <td className="py-2.5 px-2 text-right whitespace-nowrap">
                        {formatMissionTime(task.window_start)}–{formatMissionTime(task.window_end)}
                      </td>
                      <td className="py-2.5 px-2 text-right whitespace-nowrap">
                        {task.imaging_duration.toFixed(0)}s + {task.slew_time.toFixed(0)}s
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        {task.cloud_coverage.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        {task.energy_cost.toFixed(1)} Wh
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        {task.storage_cost.toFixed(1)} GB
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold text-cyan-300">
                        {((task.ml_probability ?? 0) * 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-2 text-right font-semibold">
                        {isSched
                          ? `${(task.effective_reward ?? task.base_reward).toFixed(1)}`
                          : `0.0 (${task.base_reward.toFixed(0)})`}
                      </td>
                      <td className="py-2.5 px-3 max-w-[260px] truncate" title={task.rejection_reason ?? 'Scheduled'}>
                        {isSched ? (
                          <span className="text-emerald-400">
                            ● SCHEDULED ({formatMissionTime(task.manoeuvre_start)}–{formatMissionTime(task.execution_end)})
                          </span>
                        ) : (
                          <span className="text-rose-400">
                            ✖ {task.rejection_code}: {task.rejection_reason}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
