import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/customer-preparation',
  testMatch: 'ui.spec.ts',
  timeout: 90000,
  workers: 1,
  reporter: 'list',
  use: { storageState: { cookies: [], origins: [] } },
  webServer: {
    command: 'npm run dev -- --port 3020',
    url: 'http://localhost:3020',
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
})
