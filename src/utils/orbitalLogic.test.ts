import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMissionTime,
  verifyZeroTimelineConflicts,
  validateCustomTaskInput,
  filterAndSortTasks,
  generateTaskManifestCsv,
  interpolateGroundTrackPoint,
} from './orbitalLogic';
import type { TaskRecord } from '../types/orbital';

const sampleTask = (overrides: Partial<TaskRecord>): TaskRecord => ({
  task_id: 'ORB-001',
  target_name: 'Svalbard Glacier',
  target_lat: 78.22,
  target_lon: 15.63,
  window_start: 120,
  window_end: 240,
  imaging_duration: 40,
  priority: 8,
  energy_cost: 22,
  storage_cost: 11,
  slew_time: 15,
  slew_angle_deg: 12,
  cloud_coverage: 10,
  solar_elevation_deg: 45,
  base_reward: 160,
  sensor_type: 'OPTICAL_HI_RES',
  status: 'SCHEDULED',
  manoeuvre_start: 120,
  execution_start: 135,
  execution_end: 175,
  ml_probability: 0.88,
  effective_reward: 155.2,
  ...overrides,
});

test('formatMissionTime formats seconds into T+MM:SS notation', () => {
  assert.equal(formatMissionTime(0), 'T+00:00');
  assert.equal(formatMissionTime(125), 'T+02:05');
  assert.equal(formatMissionTime(5400), 'T+90:00');
  assert.equal(formatMissionTime(null), '—');
});

test('verifyZeroTimelineConflicts detects non-overlapping and overlapping tasks', () => {
  const nonOverlapping = [
    sampleTask({ task_id: 'ORB-001', manoeuvre_start: 100, execution_end: 160 }),
    sampleTask({ task_id: 'ORB-002', manoeuvre_start: 160, execution_end: 220 }),
    sampleTask({ task_id: 'ORB-003', manoeuvre_start: 250, execution_end: 310 }),
  ];
  assert.deepEqual(verifyZeroTimelineConflicts(nonOverlapping), {
    valid: true,
    conflictPair: null,
  });

  const overlapping = [
    sampleTask({ task_id: 'ORB-001', manoeuvre_start: 100, execution_end: 180 }),
    sampleTask({ task_id: 'ORB-002', manoeuvre_start: 165, execution_end: 220 }),
  ];
  assert.deepEqual(verifyZeroTimelineConflicts(overlapping), {
    valid: false,
    conflictPair: ['ORB-001', 'ORB-002'],
  });
});

test('validateCustomTaskInput enforces physical and priority bounds', () => {
  const validRes = validateCustomTaskInput({
    target_name: 'Rotterdam Port',
    window_start: 300,
    window_end: 450,
    imaging_duration: 45,
    slew_time: 20,
    priority: 9,
    energy_cost: 24,
    storage_cost: 12,
    cloud_coverage: 15,
    base_reward: 190,
  });
  assert.equal(validRes.valid, true);

  const badWindow = validateCustomTaskInput({
    target_name: 'Rotterdam Port',
    window_start: 500,
    window_end: 450,
    imaging_duration: 45,
    slew_time: 20,
    priority: 9,
    energy_cost: 24,
    storage_cost: 12,
    cloud_coverage: 15,
    base_reward: 190,
  });
  assert.equal(badWindow.valid, false);
});

test('filterAndSortTasks filters by status, sensor, and search query', () => {
  const scheduled = [
    sampleTask({ task_id: 'ORB-001', target_name: 'Arctic Ice', priority: 9, sensor_type: 'SAR_C_BAND' }),
    sampleTask({ task_id: 'ORB-002', target_name: 'Nile Delta', priority: 5, sensor_type: 'MULTISPECTRAL' }),
  ];
  const rejected = [
    sampleTask({
      task_id: 'ORB-003',
      target_name: 'Amazon Basin',
      priority: 7,
      status: 'REJECTED',
      rejection_reason: 'Cloud cover exceeded',
    }),
  ];

  const onlyScheduled = filterAndSortTasks(scheduled, rejected, {
    statusFilter: 'SCHEDULED',
    sensorFilter: 'ALL',
    searchQuery: '',
    sortBy: 'priority',
    sortDesc: true,
  });
  assert.equal(onlyScheduled.length, 2);
  assert.equal(onlyScheduled[0].task_id, 'ORB-001');

  const searchCloud = filterAndSortTasks(scheduled, rejected, {
    statusFilter: 'ALL',
    sensorFilter: 'ALL',
    searchQuery: 'cloud cover',
    sortBy: 'priority',
    sortDesc: true,
  });
  assert.equal(searchCloud.length, 1);
  assert.equal(searchCloud[0].task_id, 'ORB-003');
});

test('generateTaskManifestCsv creates header and escaped CSV rows', () => {
  const tasks = [
    sampleTask({
      task_id: 'ORB-001',
      target_name: 'Svalbard, Sector A',
      status: 'SCHEDULED',
    }),
  ];
  const csv = generateTaskManifestCsv(tasks, 'ML-Assisted Scheduling', 'SIM-001');
  const lines = csv.split('\n');
  assert.equal(lines.length, 2);
  assert.ok(lines[0].includes('Simulation_ID,Strategy,Task_ID'));
  assert.ok(lines[1].includes('"Svalbard, Sector A"'));
});

test('interpolateGroundTrackPoint interpolates latitude and longitude accurately', () => {
  const track = [
    { time_s: 0, lat: 0, lon: -100, altitude_km: 620, velocity_kms: 7.54, in_sunlight: true },
    { time_s: 100, lat: 20, lon: -80, altitude_km: 622, velocity_kms: 7.54, in_sunlight: false },
  ];
  const mid = interpolateGroundTrackPoint(track, 50);
  assert.ok(mid);
  assert.equal(mid.lat, 10);
  assert.equal(mid.lon, -90);
});
