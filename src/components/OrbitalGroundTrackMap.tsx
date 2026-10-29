import React, { useState } from 'react';
import type { OrbitalTelemetry, TaskRecord, StrategyKey } from '../types/orbital';
import { formatMissionTime, interpolateGroundTrackPoint } from '../utils/orbitalLogic';

interface OrbitalGroundTrackMapProps {
  telemetry: OrbitalTelemetry;
  scheduledTasks: TaskRecord[];
  rejectedTasks: TaskRecord[];
  activeStrategy: StrategyKey;
  horizonSeconds: number;
}

export const OrbitalGroundTrackMap: React.FC<OrbitalGroundTrackMapProps> = ({
  telemetry,
  scheduledTasks,
  rejectedTasks,
  activeStrategy,
  horizonSeconds,
}) => {
  const [scrubTimeSec, setScrubTimeSec] = useState<number>(1800);
  const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null);

  const currentSatPos = interpolateGroundTrackPoint(telemetry.ground_track, scrubTimeSec);

  // Convert lat [-90, 90] and lon [-180, 180] to SVG viewBox [0..960, 0..440]
  const W = 960;
  const H = 440;
  const project = (lat: number, lon: number): [number, number] => {
    const x = ((lon + 180) / 360) * W;
    const y = ((90 - lat) / 180) * H;
    return [Number(x.toFixed(1)), Number(y.toFixed(1))];
  };

  // Build SVG path segments for ground track (avoid wrap-around lines across anti-meridian)
  const trackSegments: string[] = [];
  let currentSegment: string[] = [];
  for (let i = 0; i < telemetry.ground_track.length; i++) {
    const pt = telemetry.ground_track[i];
    const [x, y] = project(pt.lat, pt.lon);
    if (i > 0) {
      const prevLon = telemetry.ground_track[i - 1].lon;
      if (Math.abs(pt.lon - prevLon) > 160) {
        if (currentSegment.length > 1) {
          trackSegments.push(currentSegment.join(' '));
        }
        currentSegment = [`M ${x} ${y}`];
        continue;
      }
    }
    currentSegment.push(`${currentSegment.length === 0 ? 'M' : 'L'} ${x} ${y}`);
  }
  if (currentSegment.length > 1) {
    trackSegments.push(currentSegment.join(' '));
  }

  const satXY = currentSatPos ? project(currentSatPos.lat, currentSatPos.lon) : [W / 2, H / 2];

  // Find if a task is actively slewing or imaging at scrubTimeSec
  const activeTaskAtTime = scheduledTasks.find(
    (t) =>
      t.manoeuvre_start !== null &&
      t.manoeuvre_start !== undefined &&
      t.execution_end !== null &&
      t.execution_end !== undefined &&
      scrubTimeSec >= t.manoeuvre_start &&
      scrubTimeSec <= t.execution_end
  );

  return (
    <div className="bg-[#0C121E] border border-slate-800 rounded-lg overflow-hidden flex flex-col">
      {/* Header Bar */}
      <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 bg-[#090E17]">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-cyan-400">
            <span>{telemetry.telemetry_label}</span>
            <span aria-hidden="true">·</span>
            <span className="text-slate-400">{telemetry.spacecraft_id}</span>
          </div>
          <h3 className="text-sm font-semibold text-slate-100 mt-0.5">
            Ground-Track Pass Projection &amp; Target Acquisition Geometry
          </h3>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono tabular-nums text-slate-300">
          <div>
            <span className="text-slate-500 mr-1.5">INC:</span>
            <span>{telemetry.inclination_deg.toFixed(1)}°</span>
          </div>
          <span aria-hidden="true" className="text-slate-700">/</span>
          <div>
            <span className="text-slate-500 mr-1.5">ALT:</span>
            <span>{currentSatPos ? `${currentSatPos.altitude_km.toFixed(1)} km` : '619.2 km'}</span>
          </div>
          <span aria-hidden="true" className="text-slate-700">/</span>
          <div>
            <span className="text-slate-500 mr-1.5">VEL:</span>
            <span>{currentSatPos ? `${currentSatPos.velocity_kms.toFixed(3)} km/s` : '7.545 km/s'}</span>
          </div>
        </div>
      </div>

      {/* SVG Map Stage */}
      <div className="relative w-full bg-[#060A12]" data-testid="orbital-ground-track-svg">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto block select-none cursor-crosshair"
          role="img"
          aria-label="Simulated satellite orbital ground track and target locations"
        >
          <defs>
            <linearGradient id="orbitTrackGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.35" />
              <stop offset="50%" stopColor="#22D3EE" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.7" />
            </linearGradient>
            <radialGradient id="swathPulse" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#06B6D4" stopOpacity="0.0" />
            </radialGradient>
          </defs>

          {/* Coordinate Grid Lines (Every 30 deg Lat / Lon) */}
          {[30, 60, 90, 120, 150].map((latOff) => {
            const y = (latOff / 180) * H;
            const isEquator = latOff === 90;
            return (
              <g key={`lat-${latOff}`}>
                <line
                  x1={0}
                  y1={y}
                  x2={W}
                  y2={y}
                  stroke={isEquator ? '#1E293B' : '#0F172A'}
                  strokeWidth={isEquator ? 1.2 : 1}
                  strokeDasharray={isEquator ? undefined : '3 3'}
                />
                <text
                  x={8}
                  y={y - 4}
                  fill="#475569"
                  fontSize="9"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {90 - latOff}°
                </text>
              </g>
            );
          })}

          {[60, 120, 180, 240, 300].map((lonOff) => {
            const x = (lonOff / 360) * W;
            const isPrime = lonOff === 180;
            return (
              <g key={`lon-${lonOff}`}>
                <line
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={H}
                  stroke={isPrime ? '#1E293B' : '#0F172A'}
                  strokeWidth={isPrime ? 1.2 : 1}
                  strokeDasharray={isPrime ? undefined : '3 3'}
                />
                <text
                  x={x + 4}
                  y={H - 8}
                  fill="#475569"
                  fontSize="9"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {lonOff - 180}°
                </text>
              </g>
            );
          })}

          {/* Simplified Stylized Continental Wireframe Polygons for Geographic Context */}
          <g fill="#0E1726" stroke="#1E293B" strokeWidth="0.9">
            {/* North America */}
            <polygon points="105,65 215,60 275,115 240,175 185,195 135,140" />
            {/* South America */}
            <polygon points="245,215 320,235 305,345 265,380 245,295" />
            {/* Europe */}
            <polygon points="455,65 565,55 585,115 510,135 450,115" />
            {/* Africa */}
            <polygon points="450,145 565,145 605,235 555,335 495,335 445,215" />
            {/* Asia */}
            <polygon points="585,55 815,65 845,155 755,205 645,185 585,125" />
            {/* Australia */}
            <polygon points="755,275 855,275 865,345 775,355" />
            {/* Antarctica */}
            <polygon points="60,405 900,405 920,432 40,432" />
          </g>

          {/* Eclipse / Orbital Shadow Zone */}
          <rect
            x={W * 0.64}
            y={0}
            width={W * 0.24}
            height={H}
            fill="#020617"
            fillOpacity="0.52"
          />
          <text
            x={W * 0.65}
            y={18}
            fill="#64748B"
            fontSize="9"
            fontFamily="IBM Plex Mono, monospace"
          >
            ORBITAL ECLIPSE WINDOW
          </text>

          {/* Ground Track Trajectory Path */}
          {trackSegments.map((seg, idx) => (
            <path
              key={idx}
              d={seg}
              fill="none"
              stroke="url(#orbitTrackGrad)"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          ))}

          {/* Rejected Candidate Tasks (Muted Rose Crosses) */}
          {rejectedTasks.map((task) => {
            const [tx, ty] = project(task.target_lat, task.target_lon);
            const isSelected = selectedTask?.task_id === task.task_id;
            return (
              <g
                key={task.task_id}
                onClick={() => setSelectedTask(task)}
                className="cursor-pointer"
              >
                <circle
                  cx={tx}
                  cy={ty}
                  r={isSelected ? 7 : 4.2}
                  fill="#090D16"
                  stroke="#F43F5E"
                  strokeWidth={isSelected ? 2 : 1.3}
                  strokeOpacity="0.8"
                />
              </g>
            );
          })}

          {/* Scheduled Observation Tasks (Cyan Sensor Locks) */}
          {scheduledTasks.map((task) => {
            const [tx, ty] = project(task.target_lat, task.target_lon);
            const isSelected = selectedTask?.task_id === task.task_id;
            const isCurrentlyAcquiring = activeTaskAtTime?.task_id === task.task_id;
            return (
              <g
                key={task.task_id}
                onClick={() => setSelectedTask(task)}
                className="cursor-pointer"
              >
                <circle
                  cx={tx}
                  cy={ty}
                  r={isCurrentlyAcquiring ? 16 : 9}
                  fill="#06B6D4"
                  fillOpacity={isCurrentlyAcquiring ? 0.28 : 0.12}
                />
                <circle
                  cx={tx}
                  cy={ty}
                  r={isSelected || isCurrentlyAcquiring ? 5.5 : 4}
                  fill="#22D3EE"
                  stroke="#083344"
                  strokeWidth="1.5"
                />
                <text
                  x={tx + 7}
                  y={ty + 3}
                  fill="#E2E8F0"
                  fontSize="9"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {task.task_id}
                </text>
              </g>
            );
          })}

          {/* Active Slew/Acquisition Vector from Satellite to Target */}
          {activeTaskAtTime && (
            <line
              x1={satXY[0]}
              y1={satXY[1]}
              x2={project(activeTaskAtTime.target_lat, activeTaskAtTime.target_lon)[0]}
              y2={project(activeTaskAtTime.target_lat, activeTaskAtTime.target_lon)[1]}
              stroke="#22D3EE"
              strokeWidth="1.5"
              strokeDasharray="4 2"
            />
          )}

          {/* Spacecraft Position Marker */}
          <g transform={`translate(${satXY[0]}, ${satXY[1]})`}>
            <circle cx={0} cy={0} r={22} fill="url(#swathPulse)" />
            <circle cx={0} cy={0} r={10} fill="none" stroke="#22D3EE" strokeWidth="1.2" strokeDasharray="2 2" />
            <rect x={-4} y={-4} width={8} height={8} fill="#F8FAFC" stroke="#06B6D4" strokeWidth="1.5" />
            <line x1={-12} y1={0} x2={-5} y2={0} stroke="#38BDF8" strokeWidth="2" />
            <line x1={5} y1={0} x2={12} y2={0} stroke="#38BDF8" strokeWidth="2" />
            <text
              x={14}
              y={-8}
              fill="#22D3EE"
              fontSize="10"
              fontWeight="600"
              fontFamily="IBM Plex Mono, monospace"
            >
              {telemetry.spacecraft_id} ({formatMissionTime(scrubTimeSec)})
            </text>
          </g>
        </svg>

        {/* Bottom Overlay Legend & Selected Target Readout */}
        <div className="px-4 py-2.5 bg-[#090E17]/95 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-5 text-slate-300 font-mono">
            <span className="text-cyan-400">
              ● Scheduled Target ({scheduledTasks.length})
            </span>
            <span className="text-rose-400">
              ○ Rejected Candidate ({rejectedTasks.length})
            </span>
            <span className="text-slate-400">
              Strategy: {activeStrategy.replace('_', ' ').toUpperCase()}
            </span>
          </div>

          {selectedTask ? (
            <div className="flex items-center gap-3 font-mono text-xs text-slate-200">
              <span className="text-cyan-300 font-semibold">{selectedTask.task_id}</span>
              <span>{selectedTask.target_name}</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>
                LAT {selectedTask.target_lat.toFixed(2)}° / LON {selectedTask.target_lon.toFixed(2)}°
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>
                ML Prob: {((selectedTask.ml_probability ?? 0) * 100).toFixed(1)}%
              </span>
            </div>
          ) : (
            <div className="font-mono text-slate-400">
              {activeTaskAtTime
                ? `ACTIVE LOCK: ${activeTaskAtTime.task_id} — ${activeTaskAtTime.target_name}`
                : 'Click any target node on the ground track to inspect coordinates'}
            </div>
          )}
        </div>
      </div>

      {/* Orbital Time Scrubber Control */}
      <div className="px-4 py-3 bg-[#0B101B] border-t border-slate-800 flex items-center gap-4">
        <label
          htmlFor="orbit-time-scrubber"
          className="text-xs font-mono text-slate-400 whitespace-nowrap shrink-0"
        >
          PASS EPOCH SCRUBBER: <strong className="text-cyan-300 ml-1">{formatMissionTime(scrubTimeSec)}</strong>
        </label>
        <input
          id="orbit-time-scrubber"
          type="range"
          min={0}
          max={horizonSeconds}
          step={15}
          value={scrubTimeSec}
          onChange={(e) => setScrubTimeSec(Number(e.target.value))}
          aria-label="Orbital pass time scrubber"
          className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
        />
        <div className="text-xs font-mono text-slate-400 whitespace-nowrap shrink-0 tabular-nums">
          {currentSatPos ? (
            <span>
              {currentSatPos.lat >= 0 ? `${currentSatPos.lat.toFixed(1)}°N` : `${Math.abs(currentSatPos.lat).toFixed(1)}°S`},{' '}
              {currentSatPos.lon >= 0 ? `${currentSatPos.lon.toFixed(1)}°E` : `${Math.abs(currentSatPos.lon).toFixed(1)}°W`}
            </span>
          ) : (
            '0.0°N, 0.0°E'
          )}
        </div>
      </div>
    </div>
  );
};
