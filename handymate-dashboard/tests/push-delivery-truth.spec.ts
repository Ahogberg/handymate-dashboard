import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { summarizeExpoTickets } from '../lib/notifications/expo-push'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

test.describe('P1-4 — Expo redovisar provideracceptans, inte falsk leverans', () => {
  test('sammanfattar accepterade, nekade och saknade tickets', () => {
    expect(summarizeExpoTickets({ data: [
      { status: 'ok', id: 'ticket-1' },
      { status: 'error', message: 'DeviceNotRegistered' },
    ] }, 3)).toEqual({
      attempted: 3,
      accepted: 1,
      rejected: 2,
      tickets: ['ticket-1'],
      reason: 'provider_error',
    })
  })

  test('alla provideraccepterade tickets ger inget felpåstående', () => {
    expect(summarizeExpoTickets({ data: [
      { status: 'ok', id: 'ticket-1' },
      { status: 'ok', id: 'ticket-2' },
    ] }, 2)).toEqual({
      attempted: 2,
      accepted: 2,
      rejected: 0,
      tickets: ['ticket-1', 'ticket-2'],
    })
  })

  test('push-rutten awaitar Expo och särredovisar kanaler', () => {
    const source = read('app/api/push/send/route.ts')
    expect(source).toContain('await sendExpoPushNotification(')
    expect(source).toContain('channels:')
    expect(source).toContain('expo:')
    expect(source).toContain('web:')
  })

  test('tokenregistrering kräver verifierad aktuell användare och har ingen ägarfallback', () => {
    const source = read('app/api/push-tokens/route.ts')
    expect(source).toContain('getCurrentUser(request, business.business_id)')
    expect(source).toContain('if (!currentUser?.user_id)')
    expect(source).not.toContain('currentUser?.user_id || business.user_id')
    expect(source).not.toContain('registrerar utan user_id')
  })
})
