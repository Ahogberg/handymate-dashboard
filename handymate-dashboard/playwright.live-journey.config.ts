import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/live-journey',
  testMatch: 'journey.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 180_000,
  outputDir: 'live-journey-results',
  reporter: [['list'], ['html', { outputFolder: 'live-journey-report', open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    storageState: { cookies: [], origins: [] },
    serviceWorkers: 'block',
    trace: 'off', video: 'off', screenshot: 'off',
    actionTimeout: 15_000, navigationTimeout: 30_000,
  },
})
