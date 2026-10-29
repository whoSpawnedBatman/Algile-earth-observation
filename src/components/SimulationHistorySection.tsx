import React, { useState } from 'react';
import type { SimulationHistoryRun, SimulationResponse } from '../types/orbital';

interface SimulationHistorySectionProps {
  historyRuns: SimulationHistoryRun[];
  currentSimulation: SimulationResponse;
  onRunPresetScenario: (preset: {
    scenario_name: string;
    num_tasks: number;
    max_energy_wh: number;
    max_storage_gb: number;
    cloud_bias: number;
    seed: number;
  }) => Promise<void>;
  isRunning: boolean;
}

export const SimulationHistorySection: React.FC<SimulationHistorySectionProps> = ({
  historyRuns,
  currentSimulation,
  onRunPresetScenario,
  isRunning,
}) => {
  const [activeDocTab, setActiveDocTab] = useState<'history' | 'viva' | 'architecture'>('history');

  const presetScenarios = [
    {
      scenario_name: 'SSO-Pass-104 (Nominal Baseline)',
      num_tasks: 28,
      max_energy_wh: 320,
      max_storage_gb: 165,
      cloud_bias: 0,
      seed: 42,
      desc: 'Balanced sun-synchronous pass with standard 320 Wh EPS budget and mixed optical/SAR targets.',
    },
    {
      scenario_name: 'Monsoon Heavy Cloud Corridor',
      num_tasks: 34,
      max_energy_wh: 300,
      max_storage_gb: 150,
      cloud_bias: 26,
      seed: 108,
      desc: 'Elevated tropical cloud cover (+26% bias) demonstrating how Random Forest avoids wasted optical locks.',
    },
    {
      scenario_name: 'Eclipse Power-Constrained Pass',
      num_tasks: 30,
      max_energy_wh: 185,
      max_storage_gb: 110,
      cloud_bias: 5,
      seed: 77,
      desc: 'Tight battery depth-of-discharge envelope (185 Wh max) testing energy-aware scheduling efficiency.',
    },
  ];

  return (
    <div className="space-y-6" data-testid="simulation-history-section">
      {/* Sub-navigation between Simulation History Log, Viva Notes, and Architecture Spec */}
      <div className="bg-[#0C121E] border border-slate-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono text-cyan-400">
            MISSION ARCHIVE &amp; ACADEMIC VIVA REFERENCE
          </div>
          <h3 className="text-base font-semibold text-slate-100 mt-0.5">
            Executed Simulation Runs ({historyRuns.length}) &amp; Engineering Documentation
          </h3>
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-[#070A12] border border-slate-800 rounded-lg">
          {[
            { id: 'history', label: `Simulation Runs (${historyRuns.length})` },
            { id: 'viva', label: 'Viva Preparation Notes' },
            { id: 'architecture', label: 'System Architecture & Limitations' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveDocTab(tab.id as typeof activeDocTab)}
              className={`px-3 py-1.5 text-xs font-mono rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                activeDocTab === tab.id
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeDocTab === 'history' && (
        <>
          {/* Benchmark Mission Presets */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {presetScenarios.map((preset) => (
              <div
                key={preset.scenario_name}
                className="bg-[#0C121E] border border-slate-800 rounded-lg p-4 flex flex-col justify-between"
              >
                <div>
                  <div className="text-xs font-mono text-cyan-400">
                    BENCHMARK SCENARIO · SEED {preset.seed}
                  </div>
                  <h4 className="text-sm font-semibold text-slate-100 mt-1">
                    {preset.scenario_name}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                    {preset.desc}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-mono text-slate-400">
                    {preset.num_tasks} tasks · {preset.max_energy_wh} Wh · {preset.max_storage_gb} GB
                  </span>
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => onRunPresetScenario(preset)}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-cyan-500 hover:text-slate-950 text-cyan-300 text-xs font-mono rounded transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    Execute Scenario
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Recorded Simulation History Table */}
          <div className="bg-[#0C121E] border border-slate-800 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
              <span className="text-xs font-mono text-slate-400">
                BACKEND SIMULATION AUDIT LOG (GET /api/history)
              </span>
              <span className="text-xs font-mono text-cyan-400">
                Active Run: {currentSimulation.simulation_id}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                <thead>
                  <tr className="bg-[#090E17] text-slate-400 border-b border-slate-800">
                    <th className="py-3 px-4 font-medium">Run ID</th>
                    <th className="py-3 px-4 font-medium">Scenario Name</th>
                    <th className="py-3 px-3 text-right font-medium">Candidates</th>
                    <th className="py-3 px-3 text-right font-medium">ML Scheduled</th>
                    <th className="py-3 px-3 text-right font-medium">ML Reward</th>
                    <th className="py-3 px-3 text-right font-medium">Priority Reward</th>
                    <th className="py-3 px-3 text-right font-medium">Efficiency Reward</th>
                    <th className="py-3 px-3 text-right font-medium">Energy / Storage</th>
                    <th className="py-3 px-4 text-right font-medium">Timestamp (UTC)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {historyRuns.map((run) => {
                    const isCurrent = run.simulation_id === currentSimulation.simulation_id;
                    return (
                      <tr
                        key={run.simulation_id}
                        className={isCurrent ? 'bg-cyan-950/25 text-slate-100' : 'text-slate-300 hover:bg-slate-800/30'}
                      >
                        <td className="py-2.5 px-4 font-semibold text-cyan-300">
                          {run.simulation_id} {isCurrent ? '●' : ''}
                        </td>
                        <td className="py-2.5 px-4">{run.scenario_name}</td>
                        <td className="py-2.5 px-3 text-right">{run.parameters.num_tasks}</td>
                        <td className="py-2.5 px-3 text-right text-emerald-400">
                          {run.ml_scheduled}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-cyan-300">
                          {run.ml_reward.toFixed(1)} pts
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {run.priority_reward.toFixed(1)} pts
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {run.efficiency_reward.toFixed(1)} pts
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {run.ml_energy_wh.toFixed(1)} Wh / {run.ml_storage_gb.toFixed(1)} GB
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-400">
                          {new Date(run.timestamp_utc).toLocaleTimeString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeDocTab === 'viva' && (
        <div className="bg-[#0C121E] border border-slate-800 rounded-lg p-6 space-y-5">
          <div>
            <div className="text-xs font-mono text-cyan-400">
              ACADEMIC DEFENSE &amp; VIVA PREPARATION NOTES
            </div>
            <h3 className="text-lg font-semibold text-slate-100 mt-1">
              Explaining ORBITAL in Clear Aerospace &amp; Machine Learning Engineering Terms
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed text-slate-300">
            <div className="p-4 bg-[#080D16] border border-slate-800 rounded-lg space-y-2">
              <h4 className="font-mono font-semibold text-cyan-300">
                Q1: Why use a Random Forest Classifier instead of Deep Learning or RL?
              </h4>
              <p>
                Earth observation satellite task feasibility depends on structured, tabular physical features
                (window slack, reaction wheel slew rate, cloud cover, energy draw, and SSR bandwidth). Classical
                Random Forests provide strong generalization on tabular constraints, require zero GPU hardware
                onboard or at the ground station, train deterministically in under 1 second, and expose interpretable
                Gini feature importances so mission controllers can audit why a task was flagged infeasible.
              </p>
            </div>

            <div className="p-4 bg-[#080D16] border border-slate-800 rounded-lg space-y-2">
              <h4 className="font-mono font-semibold text-cyan-300">
                Q2: Does the ML model replace the constraint scheduler?
              </h4>
              <p>
                No. A classifier alone cannot enforce multi-task timeline non-overlap or cumulative battery/storage
                ceilings. Instead, ORBITAL uses a two-stage hybrid architecture: Stage 1 uses the Random Forest
                classifier to predict per-task physical feasibility probability P(feasible|x) and filter out
                cloud-obscured or agility-infeasible requests; Stage 2 runs a deterministic constraint-aware
                combinatorial scheduler that guarantees zero overlapping tasks and strict adherence to Wh and GB budgets.
              </p>
            </div>

            <div className="p-4 bg-[#080D16] border border-slate-800 rounded-lg space-y-2">
              <h4 className="font-mono font-semibold text-cyan-300">
                Q3: Why does ML-Assisted Scheduling outperform Priority-Based Scheduling?
              </h4>
              <p>
                A naive Priority-Based scheduler blindly locks onto high-priority optical targets even when cloud
                obscuration exceeds 60% or window slack is marginal. Those acquisitions consume orbital timeline slots,
                electrical energy (Wh), and solid-state storage (GB) while yielding severely degraded imagery.
                ML-Assisted Scheduling screens out low-probability acquisitions pre-emptively, preserving satellite
                bus resources for high-yield, clear-sky or SAR C-Band targets.
              </p>
            </div>

            <div className="p-4 bg-[#080D16] border border-slate-800 rounded-lg space-y-2">
              <h4 className="font-mono font-semibold text-cyan-300">
                Q4: What is the difference between Synthetic Training Accuracy and Operational Performance?
              </h4>
              <p>
                Synthetic training metrics (Accuracy, Precision, Recall, F1) evaluate the Random Forest on held-out
                individual historical task records (80/20 stratified split, seed=42). Operational performance measures
                the complete pass schedule under multi-task contention, where even a physically feasible task may be
                rejected due to a time-window conflict with an earlier higher-ranked task or battery depletion.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeDocTab === 'architecture' && (
        <div className="bg-[#0C121E] border border-slate-800 rounded-lg p-6 space-y-4 text-xs text-slate-300 leading-relaxed">
          <div className="text-xs font-mono text-cyan-400">
            SYSTEM ARCHITECTURE &amp; KNOWN ENGINEERING LIMITATIONS
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-[#080D16] border border-slate-800 rounded-lg">
              <div className="font-mono font-semibold text-slate-100 mb-1.5">
                1. Feature Engineering Pipeline (13 Features)
              </div>
              <p className="text-slate-400">
                Transforms raw target requests into kinematic slack time, window utilization ratio, angular slew velocity
                (deg/s), sensor-weighted cloud obscuration, SSR write bandwidth (GB/s), and reward-to-energy efficiency,
                standardized via Z-score scaling.
              </p>
            </div>
            <div className="p-4 bg-[#080D16] border border-slate-800 rounded-lg">
              <div className="font-mono font-semibold text-slate-100 mb-1.5">
                2. Constraint-Aware Scheduler
              </div>
              <p className="text-slate-400">
                Enforces hard physical invariants: reaction wheel slew limit (2.35 deg/s), visibility window containment
                [window_start, window_end], strict non-overlapping interval allocation [manoeuvre_start, execution_end],
                and cumulative EPS Wh / SSR GB ceilings.
              </p>
            </div>
            <div className="p-4 bg-[#080D16] border border-slate-800 rounded-lg">
              <div className="font-mono font-semibold text-slate-100 mb-1.5">
                3. Known Scope &amp; Limitations
              </div>
              <p className="text-slate-400">
                Models a single agile LEO spacecraft over a 90-minute pass using a simplified J2 ground-track propagator
                and sequence-independent slew times. Multi-satellite constellation handoffs and ground-station X-band
                downlink contact windows are abstracted as pass-level capacities.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
