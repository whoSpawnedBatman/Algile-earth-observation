import type {
  ModelInfoResponse,
  SimulationResponse,
  HistoryResponse,
  TaskRecord,
} from '../types/orbital';

export interface RunSimulationPayload {
  scenario_name?: string;
  num_tasks?: number;
  max_energy_wh?: number;
  max_storage_gb?: number;
  horizon_seconds?: number;
  max_cloud_cover?: number;
  ml_threshold?: number;
  cloud_bias?: number;
  seed?: number;
  custom_tasks?: Partial<TaskRecord>[];
  action?: 'reset';
}

export interface ScheduleTasksPayload {
  scenario_name?: string;
  tasks: Partial<TaskRecord>[];
  max_energy_wh?: number;
  max_storage_gb?: number;
  max_cloud_cover?: number;
  ml_threshold?: number;
  record_in_history?: boolean;
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) {
    const detail = data?.detail || data?.error || `HTTP Error ${response.status}`;
    throw new Error(detail);
  }
  return data as T;
}

export const orbitalApi = {
  getHealth: () =>
    requestJson<{
      status: string;
      service: string;
      version: string;
      model_trained: boolean;
      model_backend: string;
      simulation_runs_recorded: number;
      timestamp_utc: string;
    }>('/api/health'),

  getModel: () => requestJson<ModelInfoResponse>('/api/model'),

  getHistory: () => requestJson<HistoryResponse>('/api/history'),

  runSimulation: (payload: RunSimulationPayload) =>
    requestJson<SimulationResponse>('/api/simulation', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  resetSimulation: () =>
    requestJson<SimulationResponse>('/api/simulation', {
      method: 'POST',
      body: JSON.stringify({ action: 'reset' }),
    }),

  scheduleTasks: (payload: ScheduleTasksPayload) =>
    requestJson<SimulationResponse>('/api/schedule', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getDoc: (docName: 'readme' | 'architecture' | 'model_report') =>
    requestJson<{ name: string; content: string }>(`/api/docs/${docName}`),
};
