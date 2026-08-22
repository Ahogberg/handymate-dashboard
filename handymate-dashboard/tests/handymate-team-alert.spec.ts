import { test, expect } from '@playwright/test'
import {
  notifyHandymateSupportTeam,
  supportEscalationCustomerMessage,
} from '../lib/notifications/handymate-team-alert'

const ALERT = {
  businessName: 'Testfirman',
  category: 'human_requested',
  ticketId: 'stkt_test',
  summary: 'Behöver hjälp',
}

test.describe('Internt supportlarm — sanningsenligt leveransutfall', () => {
  test('saknade 46elks-credentials ger explicit felutfall utan försök', async () => {
    const result = await notifyHandymateSupportTeam(ALERT, { env: {} })

    expect(result).toEqual({
      delivered: false,
      attempted: 0,
      deliveredCount: 0,
      failure: 'missing_credentials',
    })
  })

  test('saknade mottagare ger explicit felutfall utan försök', async () => {
    const result = await notifyHandymateSupportTeam(ALERT, {
      env: { ELKS_API_USER: 'user', ELKS_API_PASSWORD: 'password' },
    })

    expect(result).toEqual({
      delivered: false,
      attempted: 0,
      deliveredCount: 0,
      failure: 'missing_recipients',
    })
  })

  test('46elks-fel till alla mottagare får aldrig rapporteras som levererat', async () => {
    const result = await notifyHandymateSupportTeam(ALERT, {
      env: {
        ELKS_API_USER: 'user',
        ELKS_API_PASSWORD: 'password',
        HANDYMATE_SUPPORT_ALERT_PHONES: '+46700000001,+46700000002',
      },
      fetchImpl: (async () => new Response('', { status: 402 })) as typeof fetch,
    })

    expect(result).toEqual({
      delivered: false,
      attempted: 2,
      deliveredCount: 0,
      failure: 'delivery_failed',
    })
    expect(supportEscalationCustomerMessage(result)).not.toContain('team är notifierat')
  })

  test('en lyckad mottagare räcker för sann teamnotifiering och partiellt utfall bevaras', async () => {
    let attempt = 0
    const result = await notifyHandymateSupportTeam(ALERT, {
      env: {
        ELKS_API_USER: 'user',
        ELKS_API_PASSWORD: 'password',
        HANDYMATE_SUPPORT_ALERT_PHONES: '+46700000001,+46700000002',
      },
      fetchImpl: (async () => {
        attempt += 1
        return new Response('', { status: attempt === 1 ? 200 : 500 })
      }) as typeof fetch,
    })

    expect(result).toEqual({ delivered: true, attempted: 2, deliveredCount: 1 })
    expect(supportEscalationCustomerMessage(result)).toContain('team är notifierat')
  })
})
