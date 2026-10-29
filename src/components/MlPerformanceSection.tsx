import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import type { ModelInfoResponse, SimulationResponse } from '../types/orbital';

interface MlPerformanceSectionProps {
  modelInfo: ModelInfoResponse;
  simulation: SimulationResponse;
}

export const MlPerformanceSection: React.FC<MlPerformanceSectionProps> = ({
  modelInfo,
  simulation,
}) => {
  const { test_metrics, train_metrics, feature_importances, calibration_curve, dataset_summary } = modelInfo;
  const cm = test_metrics.confusion_matrix;

  const topFeatures = feature_importances.slice(0, 10).map((f) => ({
    name: f.label,
    importancePct: Number((f.importance * 100).toFixed(2)),
    description: f.description,
  }));

  const mlStrat = simulation.strategies.ml_assisted;

  return (
    <div className="space-y-6" data-testid="ml-performance-section">
      {/* Synthetic vs Operational Distinction Banner */}
      <div className="bg-[#0E1628] border border-cyan-900/60 rounded-lg p-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono text-cyan-400">
            METHODOLOGY BOUNDARY · SYNTHETIC TRAINING VALIDATION VS. OPERATIONAL PASS EXECUTION
          </div>
          <p className="text-xs text-slate-300 mt-1 max-w-4xl leading-relaxed">
            {dataset_summary.domain_disclaimer}
          </p>
        </div>
        <div className="flex items-center gap-6 font-mono text-xs shrink-0 bg-[#080C15] px-4 py-2.5 rounded border border-slate-800">
          <div>
            <div className="text-slate-400">SYNTHETIC TEST SPLIT</div>
            <div className="text-cyan-300 font-semibold mt-0.5">
              N={dataset_summary.test_samples} Held-Out Samples
            </div>
          </div>
          <span aria-hidden="true" className="text-slate-700">/</span>
          <div>
            <div className="text-slate-400">OPERATIONAL PASS</div>
            <div className="text-emerald-400 font-semibold mt-0.5">
              {mlStrat.scheduled_count}/{mlStrat.total_candidates} Feasible &amp; Conflict-Free
            </div>
          </div>
        </div>
      </div>

      {/* Primary Classification Metrics Strip (Test vs Train) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          {
            label: 'TEST ACCURACY',
            val: `${(test_metrics.accuracy * 100).toFixed(2)}%`,
            sub: `Train: ${(train_metrics.accuracy * 100).toFixed(1)}%`,
            color: 'text-cyan-400',
          },
          {
            label: 'PRECISION',
            val: `${(test_metrics.precision * 100).toFixed(2)}%`,
            sub: `TP / (TP + FP) = ${cm.tp}/${cm.tp + cm.fp}`,
            color: 'text-slate-100',
          },
          {
            label: 'RECALL (SENSITIVITY)',
            val: `${(test_metrics.recall * 100).toFixed(2)}%`,
            sub: `TP / (TP + FN) = ${cm.tp}/${cm.tp + cm.fn}`,
            color: 'text-slate-100',
          },
          {
            label: 'F1-SCORE',
            val: `${(test_metrics.f1_score * 100).toFixed(2)}%`,
            sub: `Train: ${(train_metrics.f1_score * 100).toFixed(1)}%`,
            color: 'text-violet-400',
          },
          {
            label: 'SPECIFICITY (TNR)',
            val: `${(test_metrics.specificity * 100).toFixed(2)}%`,
            sub: `TN / (TN + FP) = ${cm.tn}/${cm.tn + cm.fp}`,
            color: 'text-slate-100',
          },
          {
            label: 'ROC-AUC SCORE',
            val: test_metrics.roc_auc.toFixed(4),
            sub: `${modelInfo.hyperparameters.n_estimators} CART Trees`,
            color: 'text-emerald-400',
          },
        ].map((item) => (
          <div key={item.label} className="bg-[#0C121E] border border-slate-800 rounded-lg p-4">
            <div className="text-[11px] font-mono text-slate-400">{item.label}</div>
            <div className={`text-2xl font-mono font-semibold mt-1.5 tabular-nums ${item.color}`}>
              {item.val}
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-1 tabular-nums">{item.sub}</div>
          </div>
        ))}
      </div>

      {/* Middle Row: Confusion Matrix + Feature Importance Bar Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Confusion Matrix (5 cols) */}
        <div className="xl:col-span-5 bg-[#0C121E] border border-slate-800 rounded-lg p-5 flex flex-col justify-between">
          <div>
            <div className="text-xs font-mono text-slate-400">
              HELD-OUT TEST SPLIT EVALUATION (N={test_metrics.sample_count})
            </div>
            <h3 className="text-base font-semibold text-slate-100 mt-0.5">
              Confusion Matrix — Feasibility Classification
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Evaluated with fixed random seed ({modelInfo.random_seed}) using {modelInfo.hyperparameters.train_test_split_ratio} split.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3 font-mono" data-testid="confusion-matrix-grid">
              <div className="p-4 rounded-lg bg-[#091422] border border-cyan-800/60">
                <div className="text-xs text-cyan-400">TRUE NEGATIVE (TN)</div>
                <div className="text-xs text-slate-400 mt-0.5">Actual Infeasible · Pred Infeasible</div>
                <div className="text-3xl font-semibold text-slate-100 mt-2 tabular-nums">
                  {cm.tn}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {((cm.tn / test_metrics.sample_count) * 100).toFixed(1)}% of test set
                </div>
              </div>

              <div className="p-4 rounded-lg bg-[#16101B] border border-amber-800/50">
                <div className="text-xs text-amber-400">FALSE POSITIVE (FP)</div>
                <div className="text-xs text-slate-400 mt-0.5">Actual Infeasible · Pred Feasible</div>
                <div className="text-3xl font-semibold text-amber-300 mt-2 tabular-nums">
                  {cm.fp}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Type I Error ({((cm.fp / test_metrics.sample_count) * 100).toFixed(1)}%)
                </div>
              </div>

              <div className="p-4 rounded-lg bg-[#191019] border border-rose-800/50">
                <div className="text-xs text-rose-400">FALSE NEGATIVE (FN)</div>
                <div className="text-xs text-slate-400 mt-0.5">Actual Feasible · Pred Infeasible</div>
                <div className="text-3xl font-semibold text-rose-300 mt-2 tabular-nums">
                  {cm.fn}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Type II Error ({((cm.fn / test_metrics.sample_count) * 100).toFixed(1)}%)
                </div>
              </div>

              <div className="p-4 rounded-lg bg-[#09191E] border border-emerald-800/60">
                <div className="text-xs text-emerald-400">TRUE POSITIVE (TP)</div>
                <div className="text-xs text-slate-400 mt-0.5">Actual Feasible · Pred Feasible</div>
                <div className="text-3xl font-semibold text-emerald-300 mt-2 tabular-nums">
                  {cm.tp}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {((cm.tp / test_metrics.sample_count) * 100).toFixed(1)}% of test set
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-800 text-xs font-mono text-slate-400 space-y-1">
            <div>Engine: <span className="text-slate-200">{modelInfo.engine_backend}</span></div>
            <div>
              Hyperparameters: n_estimators={modelInfo.hyperparameters.n_estimators} · max_depth={modelInfo.hyperparameters.max_depth} · min_samples_split={modelInfo.hyperparameters.min_samples_split}
            </div>
          </div>
        </div>

        {/* Feature Importances Horizontal Bar Chart (7 cols) */}
        <div className="xl:col-span-7 bg-[#0C121E] border border-slate-800 rounded-lg p-5 flex flex-col">
          <div className="text-xs font-mono text-slate-400">
            GINI IMPURITY REDUCTION IMPORTANCE ACROSS {modelInfo.hyperparameters.feature_count} ENGINEERED FEATURES
          </div>
          <h3 className="text-base font-semibold text-slate-100 mt-0.5">
            Random Forest Feature Importance Ranking
          </h3>

          <div className="h-80 w-full mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topFeatures}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 35, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis type="number" stroke="#94A3B8" fontSize={11} unit="%" />
                <YAxis type="category" dataKey="name" stroke="#CBD5E1" fontSize={11} width={145} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#090E17',
                    borderColor: '#1E293B',
                    fontSize: '12px',
                    fontFamily: 'IBM Plex Mono, monospace',
                  }}
                />
                <Bar dataKey="importancePct" name="Gini Importance (%)" fill="#06B6D4" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Bottom Row: ROC Curve & Calibration Curve + Sample Synthetic Dataset Preview */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className="xl:col-span-5 bg-[#0C121E] border border-slate-800 rounded-lg p-5">
          <div className="text-xs font-mono text-slate-400">
            PROBABILITY CALIBRATION &amp; DISCRIMINATION
          </div>
          <h3 className="text-base font-semibold text-slate-100 mt-0.5">
            Predicted Feasibility Probability vs. Observed Rate
          </h3>
          <div className="h-60 w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={calibration_curve} margin={{ top: 10, right: 15, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                <XAxis dataKey="bin" stroke="#94A3B8" fontSize={11} />
                <YAxis stroke="#94A3B8" fontSize={11} domain={[0, 100]} unit="%" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#090E17',
                    borderColor: '#1E293B',
                    fontSize: '12px',
                    fontFamily: 'IBM Plex Mono, monospace',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'IBM Plex Mono, monospace' }} />
                <Line
                  type="monotone"
                  dataKey="predicted_probability"
                  name="Mean RF Predicted (%)"
                  stroke="#06B6D4"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="observed_feasible_rate"
                  name="Empirical Feasible (%)"
                  stroke="#8B5CF6"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="xl:col-span-7 bg-[#0C121E] border border-slate-800 rounded-lg p-5">
          <div className="text-xs font-mono text-slate-400">
            SYNTHETIC TRAINING DATASET PREVIEW (SEED={modelInfo.random_seed}, N={dataset_summary.total_samples})
          </div>
          <h3 className="text-base font-semibold text-slate-100 mt-0.5">
            Historical Satellite Pass Training Records (First 8 Samples)
          </h3>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
              <thead>
                <tr className="text-slate-400 border-b border-slate-800">
                  <th className="py-2 pr-2 font-medium">Sample ID</th>
                  <th className="py-2 px-2 font-medium">Sensor</th>
                  <th className="py-2 px-2 text-right font-medium">Win Span</th>
                  <th className="py-2 px-2 text-right font-medium">Img+Slew</th>
                  <th className="py-2 px-2 text-right font-medium">Cloud</th>
                  <th className="py-2 px-2 text-right font-medium">Energy</th>
                  <th className="py-2 pl-2 text-right font-medium">Ground Truth</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {modelInfo.sample_dataset_preview.slice(0, 8).map((row) => {
                  const span = Number(row.window_end) - Number(row.window_start);
                  const req = Number(row.imaging_duration) + Number(row.slew_time);
                  const isFeasible = Number(row.feasible) === 1;
                  return (
                    <tr key={String(row.sample_id)} className="text-slate-300 hover:bg-slate-800/30">
                      <td className="py-1.5 pr-2 text-cyan-300">{String(row.sample_id)}</td>
                      <td className="py-1.5 px-2">{String(row.sensor_type)}</td>
                      <td className="py-1.5 px-2 text-right">{span.toFixed(1)}s</td>
                      <td className="py-1.5 px-2 text-right">{req.toFixed(1)}s</td>
                      <td className="py-1.5 px-2 text-right">{Number(row.cloud_coverage).toFixed(1)}%</td>
                      <td className="py-1.5 px-2 text-right">{Number(row.energy_cost).toFixed(1)} Wh</td>
                      <td className={`py-1.5 pl-2 text-right font-semibold ${isFeasible ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isFeasible ? '1 (FEASIBLE)' : '0 (INFEASIBLE)'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
