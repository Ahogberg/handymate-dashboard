import { defineConfig } from '@playwright/test'
import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env.integration' })

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.integration\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: 'line',
  use: { storageState: undefined },
  projects: [{ name: 'database' }],
})
