import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')

test('dashboardens flexskal får krympa till mobilbredd', () => {
  const layout = fs.readFileSync(path.join(ROOT, 'app/dashboard/layout.tsx'), 'utf8')
  const main = layout.match(/<main className="([^"]+)"/)

  expect(main, 'dashboard-layouten ska ha ett huvudområde').not.toBeNull()
  expect(main?.[1]).toContain('flex-1')
  expect(main?.[1]).toContain('min-w-0')
})
