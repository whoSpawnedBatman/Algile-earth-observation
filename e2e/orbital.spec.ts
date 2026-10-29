import { test, expect } from '@playwright/test';

test.describe('ORBITAL — Satellite Task Scheduling E2E Suite', () => {
  test('Full mission control workflow: load, model metrics, simulation run, charts, CSV export, zero console/API errors', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const failedApiRequests: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('response', (response) => {
      if (response.url().includes('/api/') && response.status() >= 400) {
        failedApiRequests.push(`${response.status()} ${response.url()}`);
      }
    });

    // 1. Dashboard loads
    await page.goto('http://localhost:3000');
    await expect(page.locator('header')).toContainText('ORBITAL');
    await expect(page.getByTestId('kpi-scheduled-count')).toBeVisible();
    await expect(page.getByTestId('kpi-total-reward')).toBeVisible();

    // 2. Model metrics appear
    const f1Text = await page.getByTestId('kpi-model-f1').textContent();
    expect(f1Text).toMatch(/\d+\.\d+%/);

    await page.getByTestId('nav-tab-ml_performance').click();
    await expect(page.getByTestId('ml-performance-section')).toBeVisible();
    await expect(page.getByTestId('confusion-matrix-grid')).toBeVisible();

    // 3. User runs a simulation & 4. Scheduling results update
    await page.getByTestId('nav-tab-overview').click();
    const initialRunId = await page.getByTestId('active-simulation-id').textContent();
    await page.getByTestId('run-simulation-btn').click();
    await expect(page.getByTestId('simulation-status-banner')).toBeVisible();
    const updatedRunId = await page.getByTestId('active-simulation-id').textContent();
    expect(updatedRunId).not.toEqual(initialRunId);

    // 5. Charts display results across Orbital Timeline & Resource Monitoring
    await page.getByTestId('nav-tab-orbital_timeline').click();
    await expect(page.getByTestId('orbital-timeline-section')).toBeVisible();

    await page.getByTestId('nav-tab-resource_monitoring').click();
    await expect(page.getByTestId('resource-monitoring-section')).toBeVisible();
    await expect(page.locator('.recharts-responsive-container').first()).toBeVisible();

    // 6. CSV export works
    await page.getByTestId('nav-tab-task_manifest').click();
    await expect(page.getByTestId('task-manifest-section')).toBeVisible();
    await page.getByTestId('export-csv-btn').click();
    await expect(page.getByTestId('csv-export-confirmation')).toBeVisible();

    // 7. No browser console errors & 8. No failed API requests
    expect(consoleErrors).toEqual([]);
    expect(failedApiRequests).toEqual([]);
  });
});
