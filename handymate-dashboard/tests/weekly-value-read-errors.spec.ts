import { test, expect } from '@playwright/test'
import { getWeeklyValue } from '../lib/weekly-value'
import { getRecoveredRevenue } from '../lib/value/recovered-revenue'

function failingDb(message: string) {
  return {
    from() {
      const chain = new Proxy({}, {
        get(_, key) {
          if (key === 'then') return (resolve: (value: unknown) => void) => resolve({
            data: null,
            count: null,
            error: { message, code: 'XX000' },
          })
          return () => chain
        },
      }) as any
      return chain
    },
  } as any
}

test('veckorapportens strikta läge skickar aldrig nollor när en grundquery felar', async () => {
  await expect(getWeeklyValue(failingDb('agent_runs unavailable'), 'b1', 7, {
    failOnReadError: true,
  })).rejects.toThrow('weekly_value_read_failed: agent_runs unavailable')
})

test('dashboardens befintliga weekly-value-läge förblir fail-soft', async () => {
  const value = await getWeeklyValue(failingDb('dashboard read unavailable'), 'b1', 7)
  expect(value.confirmed_kr).toBe(0)
  expect(value.captured_count).toBe(0)
})

test('återvunnen intäkt kastar i strikt cronläge men inte i dashboardläge', async () => {
  await expect(getRecoveredRevenue(failingDb('attribution unavailable'), 'b1', {
    failOnReadError: true,
  })).rejects.toMatchObject({ message: 'attribution unavailable' })
  await expect(getRecoveredRevenue(failingDb('attribution unavailable'), 'b1')).resolves.toMatchObject({
    total_recovered_kr: 0,
    attributions: [],
  })
})
