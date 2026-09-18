/**
 * Facit: kvittotexten säger skillnad på skickat och levererat (Spår 2).
 *
 * "Skickat 08:14" betydde bara att sändtjänsten svarade 200. Hantverkaren
 * läste det som "kunden har fått det" — och ringde inte upp. Nu finns ett
 * senare, sannare faktum: operatörens leveransbesked. Ren funktion, ingen I/O.
 *
 * Körs: npx playwright test tests/outbound-status.spec.ts --no-deps --project=chromium --reporter=line
 */
import { test, expect } from '@playwright/test'
import { outboundStatusText, leveransText } from '../lib/outbound/status'

const KL_0814 = '2026-09-18T06:14:00Z' // 08:14 svensk sommartid

test.describe('leveransText', () => {
  test('inget besked ⇒ null, aldrig ett påhittat "levererat"', () => {
    expect(leveransText({})).toBeNull()
    expect(leveransText({ delivery_status: null })).toBeNull()
  })

  test('delivered ⇒ Levererat med klockslag i svensk tid', () => {
    expect(leveransText({ delivery_status: 'delivered', delivered_at: KL_0814 })).toBe('Levererat 08:14')
  })

  test('delivered utan tidpunkt ⇒ Levererat, utan påhittad klocka', () => {
    expect(leveransText({ delivery_status: 'delivered' })).toBe('Levererat')
  })

  test('failed, bounced och complained säger alla samma sak till hantverkaren', () => {
    for (const s of ['failed', 'bounced', 'complained'] as const) {
      expect(leveransText({ delivery_status: s, delivered_at: KL_0814 })).toBe('Kom inte fram')
    }
  })

  test('delayed är varken levererat eller förlorat', () => {
    expect(leveransText({ delivery_status: 'delayed' })).toBe('Försenat hos operatören')
  })

  test('ogiltig tidsstämpel ⇒ Levererat utan klockslag, aldrig "Invalid Date"', () => {
    expect(leveransText({ delivery_status: 'delivered', delivered_at: 'inte-en-tid' })).toBe('Levererat')
  })
})

test.describe('outboundStatusText med leveransbesked', () => {
  test('sent utan besked ⇒ Skickat (oförändrat)', () => {
    expect(outboundStatusText({ status: 'sent', finished_at: KL_0814 })).toBe('Skickat 08:14')
  })

  test('sent + delivered ⇒ Levererat vinner, det är det senare faktumet', () => {
    expect(outboundStatusText({
      status: 'sent', finished_at: KL_0814, delivery_status: 'delivered', delivered_at: '2026-09-18T06:15:00Z',
    })).toBe('Levererat 08:15')
  })

  test('sent + failed leverans ⇒ Kom inte fram', () => {
    expect(outboundStatusText({ status: 'sent', finished_at: KL_0814, delivery_status: 'failed' })).toBe('Kom inte fram')
  })

  test('leveransbeskedet skriver aldrig om ett utskick som inte ens gick iväg', () => {
    // Status-maskinen äger sändningen. delivery_status får inte dölja att
    // utskicket avbröts eller aldrig lämnade huset.
    expect(outboundStatusText({ status: 'failed', delivery_status: 'delivered' })).toBe('Kunde inte skickas')
    expect(outboundStatusText({ status: 'unknown', delivery_status: 'delivered' })).toBe('Utfallet är inte bekräftat')
    expect(outboundStatusText({ status: 'skipped', delivery_status: 'delivered' })).toBe('Utskicket avbröts')
  })

  test('avstängning efter påbörjat utskick står kvar även när det levererades', () => {
    expect(outboundStatusText({
      status: 'sent', finished_at: KL_0814, delivery_status: 'delivered', delivered_at: KL_0814, cancel_requested: true,
    })).toBe('Levererat 08:14. Avstängningen kom efter att utskicket påbörjats.')
  })
})
