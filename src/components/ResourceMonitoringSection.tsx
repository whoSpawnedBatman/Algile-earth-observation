import React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import type { SimulationResponse, StrategyKey } from '../types/orbital';

interface ResourceMonitoringSectionProps {
  simulation: SimulationResponse;
  activeStrategy: StrategyKey;
  onSelectStrategy: (strategy: StrategyKey) => void;
}

export const ResourceMonitoringSection: React.FC<ResourceMonitoringSectionProps> = ({
  simulation,
  activeStrategy,
  onSelectStrategy,
}) => {
  const currentStrat = simulation.strategies[activeStrategy];
  const bus = simulation.telemetry.bus_telemetry;

  return (
    <div className="space-y-6" data-testid="resource-monitoring-section">
      {/* Spacecraft Bus Hardware Specifications & Active Utilization Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#0C121E] border border-slate-800 rounded-lg p-4">
          <div className="text-xs font-mono text-slate-400">EPS ELECTRICAL ENERGY BUDGET</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-mono font-semibold text-cyan-400 tabular-nums">
              {currentStrat.energy_consumption.toFixed(1)} Wh
            </span>
            <span className="text-xs font-mono text-slate-400">
              / {currentStrat.max_energy_wh} Wh
            </span>
          </div>
          <div className="mt-2 w-full h-1.5 bg-slate-900 rounded overflow-hidden">
            <div
              className="h-full bg-cyan-400"
              style={{ width: `${Math.min(100, currentStrat.energy_utilization_pct)}%` }}
            />
          </div>
          <div className="mt-1.5 text-xs font-mono text-slate-400">
            Utilization: {currentStrat.energy_utilization_pct}% · Margin: {(currentStrat.max_energy_wh - currentStrat.energy_consumption).toFixed(1)} Wh
          </div>
        </div>

        <div className="bg-[#0C121E] border border-slate-800 rounded-lg p-4">
          <div className="text-xs font-mono text-slate-400">SOLID-STATE RECORDER (SSR)</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-mono font-semibold text-violet-400 tabular-nums">
              {currentStrat.storage_consumption.toFixed(1)} GB
            </span>
            <span className="text-xs font-mono text-slate-400">
              / {currentStrat.max_storage_gb} GB
            </span>
          </div>
          <div className="mt-2 w-full h-1.5 bg-slate-900 rounded overflow-hidden">
            <div
              className="h-full bg-violet-400"
              style={{ width: `${Math.min(100, currentStrat.storage_utilization_pct)}%` }}
            />
          </div>
          <div className="mt-1.5 text-xs font-mono text-slate-400">
            Utilization: {currentStrat.storage_utilization_pct}% · Free: {(currentStrat.max_storage_gb - currentStrat.storage_consumption).toFixed(1)} GB
          </div>
        </div>

        <div className="bg-[#0C121E] border border-slate-800 rounded-lg p-4">
          <div className="text-xs font-mono text-slate-400">ENERGY EFFICIENCY YIELD</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-mono font-semibold text-emerald-400 tabular-nums">
              {currentStrat.reward_per_wh.toFixed(2)}
            </span>
            <span className="text-xs font-mono text-slate-400">PTS / Wh</span>
          </div>
          <div className="mt-2 text-xs font-mono text-slate-400">
            Solar Array Bus: {bus.solar_array_output_w} W Nominal
          </div>
        </div>

        <div className="bg-[#0C121E] border border-slate-800 rounded-lg p-4">
          <div className="text-xs font-mono text-slate-400">REACTION WHEEL &amp; DOWNLINK</div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-mono font-semibold text-slate-100 tabular-nums">
              {bus.reaction_wheel_max_slew_deg_s}
            </span>
            <span className="text-xs font-mono text-slate-400">DEG / S MAX</span>
          </div>
          <div className="mt-2 text-xs font-mono text-slate-400">
            {bus.downlink_band}
          </div>
        </div>
      </div>

      {/* Strategy Switcher for Resource Curves */}
      <div className="bg-[#0C121E] border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="text-xs font-mono text-slate-300">
          SIMULATED TELEMETRY · CUMULATIVE PASS RESOURCE DEPLETION ({currentStrat.strategy_label})
        </div>
        <div className="flex items-center gap-1.5 p-1 bg-[#070A12] border border-slate-800 rounded-lg">
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
      </div>

      {/* Dual Charts: Energy Consumption Trajectory & Storage Accumulation Trajectory */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Energy Chart */}
        <div className="bg-[#0C121E] border border-slate-800 rounded-lg p-5">
          <div className="text-xs font-mono text-cyan-400">
            ELECTRICAL POWER SUBSYSTEM (EPS) · CUMULATIVE DRAW [Wh]
          </div>
          <h3 className="text-base font-semibold text-slate-100 mt-0.5">
            Energy Consumption vs. {currentStrat.max_energy_wh} Wh Pass Ceiling
          </h3>
          <div className="h-72 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={currentStrat.resource_timeline} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="energyFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#06B6D4" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="time_label" stroke="#94A3B8" fontSize={11} />
                <YAxis stroke="#94A3B8" fontSize={11} domain={[0, Math.ceil(currentStrat.max_energy_wh * 1.08)]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#090E17',
                    borderColor: '#1E293B',
                    fontSize: '12px',
                    fontFamily: 'IBM Plex Mono, monospace',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'IBM Plex Mono, monospace' }} />
                <ReferenceLine
                  y={currentStrat.max_energy_wh}
                  stroke="#F43F5E"
                  strokeDasharray="4 4"
                  label={{
                    value: `MAX BUDGET (${currentStrat.max_energy_wh} Wh)`,
                    fill: '#F43F5E',
                    fontSize: 10,
                    position: 'insideTopRight',
                  }}
                />
                <Area
                  type="stepAfter"
                  dataKey="energy_used_wh"
                  name="Cumulative Energy Used (Wh)"
                  stroke="#06B6D4"
                  strokeWidth={2}
                  fill="url(#energyFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Storage Chart */}
        <div className="bg-[#0C121E] border border-slate-800 rounded-lg p-5">
          <div className="text-xs font-mono text-violet-400">
            ONBOARD DATA HANDLING (OBDH) · SOLID-STATE RECORDER [GB]
          </div>
          <h3 className="text-base font-semibold text-slate-100 mt-0.5">
            SSR Data Volume vs. {currentStrat.max_storage_gb} GB Recorder Limit
          </h3>
          <div className="h-72 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={currentStrat.resource_timeline} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="storageFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="time_label" stroke="#94A3B8" fontSize={11} />
                <YAxis stroke="#94A3B8" fontSize={11} domain={[0, Math.ceil(currentStrat.max_storage_gb * 1.08)]} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#090E17',
                    borderColor: '#1E293B',
                    fontSize: '12px',
                    fontFamily: 'IBM Plex Mono, monospace',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'IBM Plex Mono, monospace' }} />
                <ReferenceLine
                  y={currentStrat.max_storage_gb}
                  stroke="#F43F5E"
                  strokeDasharray="4 4"
                  label={{
                    value: `SSR LIMIT (${currentStrat.max_storage_gb} GB)`,
                    fill: '#F43F5E',
                    fontSize: 10,
                    position: 'insideTopRight',
                  }}
                />
                <Area
                  type="stepAfter"
                  dataKey="storage_used_gb"
                  name="Cumulative Storage Used (GB)"
                  stroke="#8B5CF6"
                  strokeWidth={2}
                  fill="url(#storageFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
