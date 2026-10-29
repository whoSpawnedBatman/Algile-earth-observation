import type { TaskRecord, GroundTrackPoint } from '../types/orbital';

/**
 * Formats seconds from mission epoch into T+MM:SS telemetry format.
 */
export function formatMissionTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) {
    return '—';
  }
  const clamped = Math.max(0, Math.round(seconds));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `T+${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Verifies that no two scheduled tasks overlap in their [manoeuvre_start, execution_end] intervals.
 */
export function verifyZeroTimelineConflicts(scheduledTasks: TaskRecord[]): {
  valid: boolean;
  conflictPair: [string, string] | null;
} {
  const sorted = [...scheduledTasks].sort(
    (a, b) => (a.manoeuvre_start ?? 0) - (b.manoeuvre_start ?? 0)
  );
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevEnd = prev.execution_end ?? 0;
    const currStart = curr.manoeuvre_start ?? 0;
    if (currStart < prevEnd - 1e-4) {
      return {
        valid: false,
        conflictPair: [prev.task_id, curr.task_id],
      };
    }
  }
  return { valid: true, conflictPair: null };
}

/**
 * Validates custom task input form fields before adding to mission manifest.
 */
export function validateCustomTaskInput(input: {
  target_name: string;
  window_start: number;
  window_end: number;
  imaging_duration: number;
  slew_time: number;
  priority: number;
  energy_cost: number;
  storage_cost: number;
  cloud_coverage: number;
  base_reward: number;
}): { valid: boolean; error: string | null } {
  if (!input.target_name || input.target_name.trim().length < 2) {
    return { valid: false, error: 'Target name must be at least 2 characters.' };
  }
  if (input.window_start < 0) {
    return { valid: false, error: 'Window start must be >= 0 seconds.' };
  }
  if (input.window_end <= input.window_start) {
    return { valid: false, error: 'Window end must be strictly greater than window start.' };
  }
  if (input.imaging_duration < 5 || input.imaging_duration > 300) {
    return { valid: false, error: 'Imaging duration must be between 5s and 300s.' };
  }
  if (input.slew_time < 0 || input.slew_time > 180) {
    return { valid: false, error: 'Slew time must be between 0s and 180s.' };
  }
  if (input.priority < 1 || input.priority > 10) {
    return { valid: false, error: 'Priority must be between 1 and 10.' };
  }
  if (input.energy_cost <= 0 || input.energy_cost > 250) {
    return { valid: false, error: 'Energy cost must be between 1 and 250 Wh.' };
  }
  if (input.storage_cost <= 0 || input.storage_cost > 200) {
    return { valid: false, error: 'Storage cost must be between 1 and 200 GB.' };
  }
  if (input.cloud_coverage < 0 || input.cloud_coverage > 100) {
    return { valid: false, error: 'Cloud coverage must be between 0% and 100%.' };
  }
  if (input.base_reward <= 0) {
    return { valid: false, error: 'Observation reward must be greater than 0.' };
  }
  return { valid: true, error: null };
}

/**
 * Filters and sorts tasks for the interactive Task Manifest table.
 */
export function filterAndSortTasks(
  scheduled: TaskRecord[],
  rejected: TaskRecord[],
  options: {
    statusFilter: 'ALL' | 'SCHEDULED' | 'REJECTED';
    sensorFilter: string;
    searchQuery: string;
    sortBy: 'window_start' | 'priority' | 'ml_probability' | 'effective_reward' | 'energy_cost';
    sortDesc: boolean;
  }
): TaskRecord[] {
  const combined: TaskRecord[] = [
    ...scheduled.map((t) => ({ ...t, status: 'SCHEDULED' as const })),
    ...rejected.map((t) => ({ ...t, status: 'REJECTED' as const })),
  ];

  const q = options.searchQuery.trim().toLowerCase();

  const filtered = combined.filter((t) => {
    if (options.statusFilter !== 'ALL' && t.status !== options.statusFilter) {
      return false;
    }
    if (options.sensorFilter !== 'ALL' && t.sensor_type !== options.sensorFilter) {
      return false;
    }
    if (q) {
      const matchId = t.task_id.toLowerCase().includes(q);
      const matchName = t.target_name.toLowerCase().includes(q);
      const matchReason = (t.rejection_reason ?? '').toLowerCase().includes(q);
      if (!matchId && !matchName && !matchReason) {
        return false;
      }
    }
    return true;
  });

  filtered.sort((a, b) => {
    const valA = Number(a[options.sortBy] ?? 0);
    const valB = Number(b[options.sortBy] ?? 0);
    const diff = valA - valB;
    if (diff !== 0) {
      return options.sortDesc ? -diff : diff;
    }
    return a.task_id.localeCompare(b.task_id);
  });

  return filtered;
}

/**
 * Generates RFC-4180 compliant CSV content for exporting mission scheduling manifests.
 */
export function generateTaskManifestCsv(
  tasks: TaskRecord[],
  strategyLabel: string,
  simulationId: string
): string {
  const headers = [
    'Simulation_ID',
    'Strategy',
    'Task_ID',
    'Target_Name',
    'Sensor_Type',
    'Status',
    'Priority',
    'Window_Start_s',
    'Window_End_s',
    'Imaging_Duration_s',
    'Slew_Time_s',
    'Manoeuvre_Start_s',
    'Execution_Start_s',
    'Execution_End_s',
    'ML_Feasibility_Prob',
    'Cloud_Coverage_Pct',
    'Energy_Cost_Wh',
    'Storage_Cost_GB',
    'Nominal_Reward',
    'Effective_Science_Reward',
    'Rejection_Code',
    'Rejection_Reason',
  ];

  const escapeCsvCell = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = tasks.map((t) =>
    [
      simulationId,
      strategyLabel,
      t.task_id,
      t.target_name,
      t.sensor_type,
      t.status ?? 'UNKNOWN',
      t.priority,
      t.window_start,
      t.window_end,
      t.imaging_duration,
      t.slew_time,
      t.manoeuvre_start ?? '',
      t.execution_start ?? '',
      t.execution_end ?? '',
      t.ml_probability !== undefined ? (t.ml_probability * 100).toFixed(1) + '%' : '',
      t.cloud_coverage,
      t.energy_cost,
      t.storage_cost,
      t.base_reward,
      t.effective_reward ?? t.base_reward,
      t.rejection_code ?? '',
      t.rejection_reason ?? '',
    ]
      .map(escapeCsvCell)
      .join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

/**
 * Interpolates satellite ground-track telemetry at a given orbital time (in seconds).
 */
export function interpolateGroundTrackPoint(
  track: GroundTrackPoint[],
  currentTimeSec: number
): GroundTrackPoint | null {
  if (!track || track.length === 0) return null;
  if (currentTimeSec <= track[0].time_s) return track[0];
  if (currentTimeSec >= track[track.length - 1].time_s) return track[track.length - 1];

  for (let i = 0; i < track.length - 1; i++) {
    const p0 = track[i];
    const p1 = track[i + 1];
    if (currentTimeSec >= p0.time_s && currentTimeSec <= p1.time_s) {
      const span = Math.max(1e-6, p1.time_s - p0.time_s);
      const alpha = (currentTimeSec - p0.time_s) / span;
      return {
        time_s: Math.round(currentTimeSec),
        lat: Number((p0.lat + (p1.lat - p0.lat) * alpha).toFixed(2)),
        lon: Number((p0.lon + (p1.lon - p0.lon) * alpha).toFixed(2)),
        altitude_km: Number((p0.altitude_km + (p1.altitude_km - p0.altitude_km) * alpha).toFixed(2)),
        velocity_kms: Number((p0.velocity_kms + (p1.velocity_kms - p0.velocity_kms) * alpha).toFixed(3)),
        in_sunlight: alpha < 0.5 ? p0.in_sunlight : p1.in_sunlight,
      };
    }
  }
  return track[0];
}
