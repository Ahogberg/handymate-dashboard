/**
 * Facit för beläggnings-aggregatet + GET /api/dashboard/belaggning
 * (Etapp C4, Command Center 2026-08-17).
 *
 * Aggregatet är en REN funktion över redan beräknade veckokapaciteter
 * (lib/capacity/week-capacity.ts) — testas direkt. Rutten är ett tunt
 * uppslagsskal utan egen matte, så dess facit är källskannande — samma
 * stil som tests/value-ledger-history.spec.ts och
 * tests/permission-contract.spec.ts använder för rutt-kontrakt.
 *
 * Det som låses:
 *
 *   1. Ingen konfiguration → ärligt tomt svar (pct null), aldrig en
 *      gissad procent. Raden i "Firman just nu" döljs då.
 *   2. Procenten viktas med veckans tillhandahållna timmar — aldrig ett
 *      rakt medelvärde av redan avrundade procenttal.
 *   3. Överbokning bevaras: en aggregerad beläggning ÖVER 100 % klipps
 *      inte i datat (bara stapeln i UI:t klipps).
 *   4. Rutten återanvänder getWeekCapacity + aggregeraBelaggning — den
 *      implementerar ingen egen kapacitetsberäkning, muterar ingenting,
 *      och grindas med getAuthenticatedBusiness (alla inloggade
 *      medlemmar — beläggning är schema, inte ekonomi).
 *
 *   npx playwright test tests/belaggning.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { aggregeraBelaggning, BELAGGNING_VECKOR } from '../lib/capacity/belaggning'
import type { WeekCapacity } from '../lib/capacity/week-capacity'

const ROUTE = path.join(
  __dirname, '..', 'app', 'api', 'dashboard', 'belaggning', 'route.ts',
)

/** Fixturbyggare — en konfigurerad vecka med rimliga default. */
function vecka(over: Partial<WeekCapacity> & { week_start: string }): WeekCapacity {
  return {
    provided_hours: 80,
    booked_hours: 0,
    open_hours: 0,
    utilization_pct: 0,
    thin_week: false,
    configured: true,
    source: 'settings',
    ...over,
  }
}

function okonfigurerad(week_start: string): WeekCapacity {
  return {
    week_start,
    provided_hours: null,
    booked_hours: 0,
    open_hours: null,
    utilization_pct: null,
    thin_week: null,
    configured: false,
    source: 'fallback',
  }
}

test.describe('aggregeraBelaggning — ren funktion över veckokapaciteter', () => {
  test('tre veckor är fönstret', () => {
    expect(BELAGGNING_VECKOR).toBe(3)
  })

  test('ingen konfigurerad vecka → ärligt tomt svar, aldrig en gissning', () => {
    const svar = aggregeraBelaggning([
      okonfigurerad('2026-01-05'),
      okonfigurerad('2026-01-12'),
      okonfigurerad('2026-01-19'),
    ])
    expect(svar.pct).toBeNull()
    expect(svar.fria_timmar_nasta_veckor).toBeNull()
    expect(svar.configured).toBe(false)
  })

  test('tom lista → samma tomma svar', () => {
    expect(aggregeraBelaggning([]).pct).toBeNull()
  })

  test('procenten viktas med tillhandahållna timmar — inte rakt snitt', () => {
    // 80h-veckan på 50 % + 40h-veckan på 100 %:
    // rakt snitt = 75, viktat = (50·80 + 100·40) / 120 = 66,7 → 67.
    const svar = aggregeraBelaggning([
      vecka({ week_start: '2026-01-05', provided_hours: 80, utilization_pct: 50, open_hours: 14 }),
      vecka({ week_start: '2026-01-12', provided_hours: 40, utilization_pct: 100, open_hours: 0 }),
    ])
    expect(svar.pct).toBe(67)
  })

  test('fria timmar är summan av veckornas öppna kapacitet', () => {
    const svar = aggregeraBelaggning([
      vecka({ week_start: '2026-01-05', open_hours: 10 }),
      vecka({ week_start: '2026-01-12', open_hours: 5.5 }),
      vecka({ week_start: '2026-01-19', open_hours: 0 }),
    ])
    expect(svar.fria_timmar_nasta_veckor).toBe(15.5)
  })

  test('överbokning bevaras — aggregatet klipps aldrig vid 100', () => {
    const svar = aggregeraBelaggning([
      vecka({ week_start: '2026-01-05', utilization_pct: 130, open_hours: 0 }),
      vecka({ week_start: '2026-01-12', utilization_pct: 110, open_hours: 0 }),
    ])
    expect(svar.pct).toBe(120)
  })

  test('gissad kapacitet (fallback) märks — configured är bara sant när ALLA veckor har en verklig inställning', () => {
    const svar = aggregeraBelaggning([
      vecka({ week_start: '2026-01-05' }),
      vecka({ week_start: '2026-01-12', configured: false, source: 'fallback' }),
    ])
    expect(svar.pct).not.toBeNull()
    expect(svar.configured).toBe(false)
  })

  test('veckonumren kommer ur ISO-veckan för första och sista veckostarten', () => {
    // 2026 vecka 1 innehåller 1 jan (torsdagsregeln) → måndag 2026-01-05 är v2.
    const svar = aggregeraBelaggning([
      vecka({ week_start: '2026-01-05' }),
      vecka({ week_start: '2026-01-12' }),
      vecka({ week_start: '2026-01-19' }),
    ])
    expect(svar.vecka_start).toBe(2)
    expect(svar.vecka_slut).toBe(4)
  })

  test('noll tillhandahållna timmar totalt → tomt svar (division med noll göms aldrig bakom ett tal)', () => {
    const svar = aggregeraBelaggning([
      vecka({ week_start: '2026-01-05', provided_hours: 0, utilization_pct: null }),
    ])
    expect(svar.pct).toBeNull()
  })
})

test.describe('belaggning-rutten — tunt skal, rätt grind, ren återanvändning', () => {
  function routeBody(): string {
    // Stryk importrader — en import är inget skydd (samma regel som
    // permission-contract.spec.ts).
    return fs
      .readFileSync(ROUTE, 'utf8')
      .split('\n')
      .filter(line => !/^\s*import\b/.test(line))
      .join('\n')
  }

  test('filen finns', () => {
    expect(fs.existsSync(ROUTE), `saknas: ${ROUTE}`).toBe(true)
  })

  test('grindas med getAuthenticatedBusiness på anropsstället — alla medlemmar, ingen ekonomigrind (beläggning är schema)', () => {
    const body = routeBody()
    expect(body).toMatch(/\bgetAuthenticatedBusiness\s*\(/)
    expect(body).toContain("status: 401")
  })

  test('endast GET — rutten muterar ingenting', () => {
    const body = routeBody()
    expect(body).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/)
    expect(body).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/)
  })

  test('återanvänder kapacitetslagret — ingen egen beräkning', () => {
    const body = routeBody()
    expect(body).toMatch(/\bgetWeekCapacity\s*\(/)
    expect(body).toMatch(/\baggregeraBelaggning\s*\(/)
    expect(body).toMatch(/\bcurrentWeekMonday\s*\(/)
    // Fönstret kommer ur konstanten, inte en egen magisk siffra.
    expect(body).toContain('BELAGGNING_VECKOR')
  })
})
