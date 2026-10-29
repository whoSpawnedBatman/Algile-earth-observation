import React, { useEffect, useState, useCallback } from 'react';
import {
  Play,
  RotateCcw,
  Download,
  SlidersHorizontal,
} from 'lucide-react';
import { orbitalApi } from './services/api';
import type {
  ModelInfoResponse,
  SimulationResponse,
  SimulationHistoryRun,
  StrategyKey,
  NavigationTab,
  TaskRecord,
} from './types/orbital';
import { generateTaskManifestCsv } from './utils/orbitalLogic';
import { MissionOverviewSection } from './components/MissionOverviewSection';
import { TaskSchedulingSection } from './components/TaskSchedulingSection';
import { MlPerformanceSection } from './components/MlPerformanceSection';
import { OrbitalTimelineSection } from './components/OrbitalTimelineSection';
import { ResourceMonitoringSection } from './components/ResourceMonitoringSection';
import { TaskManifestSection } from './components/TaskManifestSection';
import { SimulationHistorySection } from './components/SimulationHistorySection';

export default function App() {
  const [activeTab, setActiveTab] = useState<NavigationTab>('overview');
  const [activeStrategy, setActiveStrategy] = useState<StrategyKey>('ml_assisted');

  const [modelInfo, setModelInfo] = useState<ModelInfoResponse | null>(null);
  const [simulation, setSimulation] = useState<SimulationResponse | null>(null);
  const [historyRuns, setHistoryRuns] = useState<SimulationHistoryRun[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Interactive Simulation Parameters
  const [scenarioName, setScenarioName] = useState<string>('SSO-Pass-105 (Agile Multi-Target)');
  const [numTasks, setNumTasks] = useState<number>(28);
  const [maxEnergyWh, setMaxEnergyWh] = useState<number>(320);
  const [maxStorageGb, setMaxStorageGb] = useState<number>(165);
  const [mlThreshold, setMlThreshold] = useState<number>(0.48);
  const [seed, setSeed] = useState<number>(42);
  const [showParamPanel, setShowParamPanel] = useState<boolean>(false);

  const fetchInitialData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [modelRes, histRes] = await Promise.all([
        orbitalApi.getModel(),
        orbitalApi.getHistory(),
      ]);
      setModelInfo(modelRes);
      setHistoryRuns(histRes.runs);

      if (histRes.latest_simulation) {
        setSimulation(histRes.latest_simulation);
      } else {
        const simRes = await orbitalApi.runSimulation({
          scenario_name: 'SSO-Pass-104 (Nominal Baseline)',
          num_tasks: 28,
          max_energy_wh: 320,
          max_storage_gb: 165,
          ml_threshold: 0.48,
          seed: 42,
        });
        setSimulation(simRes);
        const updatedHist = await orbitalApi.getHistory();
        setHistoryRuns(updatedHist.runs);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to ORBITAL backend API');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const handleRunSimulation = async () => {
    setIsSimulating(true);
    setError(null);
    setStatusBanner(null);
    try {
      const nextSeed = seed + 1;
      setSeed(nextSeed);
      const simRes = await orbitalApi.runSimulation({
        scenario_name: scenarioName,
        num_tasks: numTasks,
        max_energy_wh: maxEnergyWh,
        max_storage_gb: maxStorageGb,
        ml_threshold: mlThreshold,
        seed: nextSeed,
      });
      setSimulation(simRes);
      const histRes = await orbitalApi.getHistory();
      setHistoryRuns(histRes.runs);
      setStatusBanner(
        `Simulation ${simRes.simulation_id} completed: ${simRes.strategies.ml_assisted.scheduled_count}/${simRes.parameters.num_tasks} tasks scheduled (${simRes.strategies.ml_assisted.total_reward.toFixed(1)} pts).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Simulation execution failed');
    } finally {
      setIsSimulating(false);
    }
  };

  const handleResetSimulation = async () => {
    setIsSimulating(true);
    setError(null);
    setStatusBanner(null);
    try {
      setNumTasks(28);
      setMaxEnergyWh(320);
      setMaxStorageGb(165);
      setMlThreshold(0.48);
      setSeed(42);
      setScenarioName('SSO-Pass-104 (Nominal Baseline)');
      const resetRes = await orbitalApi.resetSimulation();
      setSimulation(resetRes);
      const histRes = await orbitalApi.getHistory();
      setHistoryRuns(histRes.runs);
      setStatusBanner('Reset to baseline orbital scenario (SSO-Pass-104, Seed 42).');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setIsSimulating(false);
    }
  };

  const handleScheduleCustomTasks = async (
    tasks: Partial<TaskRecord>[],
    energyWh: number,
    storageGb: number,
    cloudCover: number,
    threshold: number,
    customScenarioName: string
  ) => {
    setIsSimulating(true);
    setError(null);
    try {
      const res = await orbitalApi.scheduleTasks({
        tasks,
        max_energy_wh: energyWh,
        max_storage_gb: storageGb,
        max_cloud_cover: cloudCover,
        ml_threshold: threshold,
        scenario_name: customScenarioName,
        record_in_history: true,
      });
      setSimulation(res);
      const histRes = await orbitalApi.getHistory();
      setHistoryRuns(histRes.runs);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleQuickExportCsv = () => {
    if (!simulation) return;
    const strat = simulation.strategies[activeStrategy];
    const allTasks: TaskRecord[] = [
      ...strat.scheduled_tasks.map((t) => ({ ...t, status: 'SCHEDULED' as const })),
      ...strat.rejected_tasks.map((t) => ({ ...t, status: 'REJECTED' as const })),
    ];
    const csv = generateTaskManifestCsv(allTasks, strat.strategy_label, simulation.simulation_id);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('download', `orbital_${simulation.simulation_id}_${activeStrategy}.csv`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatusBanner(
      `Exported CSV manifest for ${simulation.simulation_id} (${strat.strategy_label}, ${allTasks.length} rows).`
    );
  };

  const navItems: { id: NavigationTab; label: string; shortLabel: string }[] = [
    { id: 'overview', label: '1. Mission Overview', shortLabel: 'Overview' },
    { id: 'scheduling', label: '2. Task Scheduling', shortLabel: 'Scheduling' },
    { id: 'ml_performance', label: '3. ML Model Performance', shortLabel: 'ML Model' },
    { id: 'orbital_timeline', label: '4. Orbital Timeline', shortLabel: 'Timeline' },
    { id: 'resource_monitoring', label: '5. Resource Monitoring', shortLabel: 'Resources' },
    { id: 'task_manifest', label: '6. Task Manifest', shortLabel: 'Manifest' },
    { id: 'simulation_history', label: '7. Simulation History', shortLabel: 'History' },
  ];

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col">
      {/* Top Bar Contract: 3-zone header (Brand | 5 concise nav links | 1 primary CTA) */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-[#090D16] border-b border-slate-800/90 sticky top-0 z-30">
        <a
          href="#overview"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('overview');
          }}
          className="text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
        >
          ORBITAL
        </a>

        <nav
          aria-label="Primary Mission Sections"
          className="hidden lg:flex items-center gap-6 text-xs font-medium text-slate-300"
        >
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'overview' ? 'text-cyan-400 underline underline-offset-4' : ''
            }`}
          >
            Mission Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('scheduling')}
            className={`hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'scheduling' ? 'text-cyan-400 underline underline-offset-4' : ''
            }`}
          >
            Task Scheduling
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ml_performance')}
            className={`hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'ml_performance' ? 'text-cyan-400 underline underline-offset-4' : ''
            }`}
          >
            ML Model
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('orbital_timeline')}
            className={`hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'orbital_timeline' ? 'text-cyan-400 underline underline-offset-4' : ''
            }`}
          >
            Orbital Timeline
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('task_manifest')}
            className={`hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'task_manifest' ? 'text-cyan-400 underline underline-offset-4' : ''
            }`}
          >
            Task Manifest
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            disabled={isSimulating || loading}
            onClick={handleRunSimulation}
            data-testid="run-simulation-btn"
            className="px-4 py-2 text-xs font-mono font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{isSimulating ? 'Running Pass...' : 'Run Simulation'}</span>
          </button>
        </div>
      </header>

      {/* Secondary Mission Control Toolbar & Telemetry Ribbon */}
      <div className="bg-[#0A0F1A] border-b border-slate-800/80 px-6 py-2.5">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
            <span className="text-emerald-400 font-semibold">● SYSTEM NOMINAL</span>
            <span aria-hidden="true" className="text-slate-700">·</span>
            <span className="text-slate-300">
              Machine Learning-Based Task Scheduling for Agile Earth Observation Satellites
            </span>
            {simulation && (
              <>
                <span aria-hidden="true" className="text-slate-700">·</span>
                <span className="text-cyan-400" data-testid="active-simulation-id">
                  RUN {simulation.simulation_id} ({simulation.scenario_name})
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowParamPanel((prev) => !prev)}
              aria-expanded={showParamPanel}
              className="px-3 py-1.5 text-xs font-mono text-slate-300 hover:text-white bg-[#11192A] border border-slate-700/80 rounded flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
              <span>Pass Parameters</span>
            </button>

            <button
              type="button"
              disabled={isSimulating || loading}
              onClick={handleResetSimulation}
              data-testid="reset-simulation-btn"
              className="px-3 py-1.5 text-xs font-mono text-slate-300 hover:text-white bg-[#11192A] border border-slate-700/80 rounded flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Simulation</span>
            </button>

            <button
              type="button"
              disabled={!simulation}
              onClick={handleQuickExportCsv}
              data-testid="header-export-csv-btn"
              className="px-3 py-1.5 text-xs font-mono text-cyan-300 hover:text-cyan-200 bg-[#11192A] border border-cyan-800/60 rounded flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Collapsible Simulation Parameter Calibration Drawer */}
        {showParamPanel && (
          <div className="max-w-[1440px] mx-auto mt-3 pt-3 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs font-mono">
            <div>
              <label htmlFor="param-scenario" className="block text-slate-400 mb-1">
                Scenario Designation
              </label>
              <input
                id="param-scenario"
                type="text"
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-[#070A12] border border-slate-700 rounded text-slate-100"
              />
            </div>

            <div>
              <label htmlFor="param-tasks" className="block text-slate-400 mb-1">
                Candidate Tasks ({numTasks})
              </label>
              <input
                id="param-tasks"
                type="range"
                min={10}
                max={60}
                value={numTasks}
                onChange={(e) => setNumTasks(Number(e.target.value))}
                className="w-full accent-cyan-400 mt-1.5"
              />
            </div>

            <div>
              <label htmlFor="param-energy" className="block text-slate-400 mb-1">
                Max Energy Budget ({maxEnergyWh} Wh)
              </label>
              <input
                id="param-energy"
                type="range"
                min={120}
                max={500}
                step={10}
                value={maxEnergyWh}
                onChange={(e) => setMaxEnergyWh(Number(e.target.value))}
                className="w-full accent-cyan-400 mt-1.5"
              />
            </div>

            <div>
              <label htmlFor="param-storage" className="block text-slate-400 mb-1">
                Max SSR Storage ({maxStorageGb} GB)
              </label>
              <input
                id="param-storage"
                type="range"
                min={60}
                max={300}
                step={5}
                value={maxStorageGb}
                onChange={(e) => setMaxStorageGb(Number(e.target.value))}
                className="w-full accent-cyan-400 mt-1.5"
              />
            </div>

            <div>
              <label htmlFor="param-threshold" className="block text-slate-400 mb-1">
                RF Gate Threshold ({Math.round(mlThreshold * 100)}%)
              </label>
              <input
                id="param-threshold"
                type="range"
                min={0.25}
                max={0.8}
                step={0.02}
                value={mlThreshold}
                onChange={(e) => setMlThreshold(Number(e.target.value))}
                className="w-full accent-cyan-400 mt-1.5"
              />
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={handleRunSimulation}
                disabled={isSimulating}
                className="w-full py-1.5 px-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold rounded cursor-pointer"
              >
                Apply &amp; Execute Pass
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Section Navigation Bar (All 7 Required Sections) */}
      <div className="bg-[#080C14] border-b border-slate-800/80 px-6 py-2">
        <div className="max-w-[1440px] mx-auto flex items-center gap-1.5 overflow-x-auto">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                data-testid={`nav-tab-${item.id}`}
                className={`px-3.5 py-2 text-xs font-mono rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-[#121D31] text-cyan-300 border border-cyan-500/50 font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6">
        {error && (
          <div className="mb-6 p-4 bg-rose-950/60 border border-rose-800 rounded-lg text-xs font-mono text-rose-200 flex items-center justify-between">
            <span>✖ Backend Telemetry Error: {error}</span>
            <button
              type="button"
              onClick={fetchInitialData}
              className="px-3 py-1 bg-rose-800 hover:bg-rose-700 text-white rounded cursor-pointer"
            >
              Retry Connection
            </button>
          </div>
        )}

        {statusBanner && (
          <div
            data-testid="simulation-status-banner"
            className="mb-5 px-4 py-2.5 bg-[#0D192B] border border-cyan-800/70 rounded-lg text-xs font-mono text-cyan-200 flex items-center justify-between"
          >
            <span>● {statusBanner}</span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-slate-400 hover:text-white cursor-pointer ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {loading || !simulation || !modelInfo ? (
          <div className="space-y-4 py-12">
            <div className="text-xs font-mono text-cyan-400 text-center">
              INITIALIZING CLASSICAL RANDOM FOREST &amp; ORBITAL SCHEDULER...
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="h-24 bg-[#0C121E] border border-slate-800 rounded-lg" />
              ))}
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'overview' && (
              <MissionOverviewSection
                simulation={simulation}
                modelInfo={modelInfo}
                activeStrategy={activeStrategy}
                onSelectStrategy={setActiveStrategy}
                onNavigateTab={setActiveTab}
              />
            )}

            {activeTab === 'scheduling' && (
              <TaskSchedulingSection
                simulation={simulation}
                activeStrategy={activeStrategy}
                onSelectStrategy={setActiveStrategy}
                onScheduleCustomTaskList={handleScheduleCustomTasks}
                isSubmitting={isSimulating}
              />
            )}

            {activeTab === 'ml_performance' && (
              <MlPerformanceSection modelInfo={modelInfo} simulation={simulation} />
            )}

            {activeTab === 'orbital_timeline' && (
              <OrbitalTimelineSection
                simulation={simulation}
                activeStrategy={activeStrategy}
                onSelectStrategy={setActiveStrategy}
              />
            )}

            {activeTab === 'resource_monitoring' && (
              <ResourceMonitoringSection
                simulation={simulation}
                activeStrategy={activeStrategy}
                onSelectStrategy={setActiveStrategy}
              />
            )}

            {activeTab === 'task_manifest' && (
              <TaskManifestSection
                simulation={simulation}
                activeStrategy={activeStrategy}
                onSelectStrategy={setActiveStrategy}
              />
            )}

            {activeTab === 'simulation_history' && (
              <SimulationHistorySection
                historyRuns={historyRuns}
                currentSimulation={simulation}
                onRunPresetScenario={async (preset) => {
                  setIsSimulating(true);
                  try {
                    const res = await orbitalApi.runSimulation(preset);
                    setSimulation(res);
                    const hist = await orbitalApi.getHistory();
                    setHistoryRuns(hist.runs);
                    setStatusBanner(`Executed benchmark scenario: ${preset.scenario_name}`);
                  } finally {
                    setIsSimulating(false);
                  }
                }}
                isRunning={isSimulating}
              />
            )}
          </>
        )}
      </main>

      {/* Quiet Academic Project Footer */}
      <footer className="border-t border-slate-800/80 bg-[#080B12] px-6 py-4 text-xs font-mono text-slate-500">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div>
            ORBITAL — Machine Learning-Based Task Scheduling for Agile Earth Observation Satellites
          </div>
          <div className="flex items-center gap-4">
            <span>Classical Random Forest (CART Ensemble)</span>
            <span aria-hidden="true">·</span>
            <span>Constraint-Aware Multi-Strategy Scheduler</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
