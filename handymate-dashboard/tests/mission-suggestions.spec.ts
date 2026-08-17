/**
 * FACIT — lib/mission/suggestions.ts (Goal-to-Plan V1, Etapp C,
 * tasks/jaunty-pondering-hummingbird.md).
 *
 * composeSuggestions är ren: den hittar ALDRIG på ett chip utan en verklig
 * signal, och prioriteringen (förfallet > tunn vecka > återaktivering >
 * marginalrisk) är deterministisk. Kapacitetssignalen räknas bara när
 * `configured` är sant (source==='settings') — en gissad kapacitet får
 * aldrig trigga ett förslagschip.
 *
 * Körs: npx playwright test tests/mission-suggestions.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { composeSuggestions, type MissionSuggestion } from '../lib/mission/suggestions'

function noSignals() {
  return composeSuggestions({ pengar: null, capacity: null, reactivation: null })
}

test.describe('composeSuggestions — inga påhittade chips utan signal', () => {
  test('inga signaler alls → tom lista', () => {
    expect(noSignals()).toEqual([])
  })

  test('pengar-objekt utan faktiska signaler (0 kr, 0 risker) → tom lista', () => {
    const res = composeSuggestions({
      pengar: { forfallet_kr: 0, marginalrisk_count: 0 },
      capacity: { thin: false, configured: true },
      reactivation: null,
    })
    expect(res).toEqual([])
  })
})

test.describe('composeSuggestions — varje signal ensam ger exakt sitt chip', () => {
  test('förfallet ensam', () => {
    const res = composeSuggestions({
      pengar: { forfallet_kr: 42000, marginalrisk_count: 0 },
      capacity: null,
      reactivation: null,
    })
    expect(res).toHaveLength(1)
    expect(res[0].signalKind).toBe('forfallet')
    expect(res[0].label).toBe('Få in pengar före fredag')
    expect(res[0].prefillText).toBe(
      'Jag vill få in pengarna från de förfallna fakturorna före fredag. Gör en plan: vilka kunder, vilka belopp, och i vilken ordning vi agerar.',
    )
  })

  test('tunn vecka ensam (konfigurerad OCH tunn)', () => {
    const res = composeSuggestions({
      pengar: null,
      capacity: { thin: true, configured: true },
      reactivation: null,
    })
    expect(res).toHaveLength(1)
    expect(res[0].signalKind).toBe('tunn_vecka')
    expect(res[0].label).toBe('Fyll nästa veckas luckor')
    expect(res[0].prefillText).toBe(
      'Nästa vecka ser tunn ut i kalendern. Hjälp mig fylla luckorna — gå igenom öppna offerter och tidigare kunder och föreslå en plan.',
    )
  })

  test('kapacitet tunn men INTE konfigurerad (fallback-gissning) → inget tunn-vecka-chip', () => {
    const res = composeSuggestions({
      pengar: null,
      capacity: { thin: true, configured: false },
      reactivation: null,
    })
    expect(res).toEqual([])
  })

  test('återaktivering ensam', () => {
    const res = composeSuggestions({
      pengar: null,
      capacity: null,
      reactivation: { job_type: 'badrum', count: 7, quietMonths: 6 },
    })
    expect(res).toHaveLength(1)
    expect(res[0].signalKind).toBe('reaktivering')
    expect(res[0].id).toBe('reaktivering-badrum')
    expect(res[0].label).toBe('Återaktivera tidigare badrumskunder')
    expect(res[0].prefillText).toBe(
      'Jag vill återaktivera tidigare badrums-kunder som varit tysta. Väg in kapacitet och pågående kundkontakter innan du föreslår något.',
    )
  })

  test('okänd jobbtyp i återaktivering → versaliserad rå sträng, ingen påhittad grammatik', () => {
    const res = composeSuggestions({
      pengar: null,
      capacity: null,
      reactivation: { job_type: 'snickeri', count: 6, quietMonths: 6 },
    })
    expect(res[0].label).toBe('Återaktivera tidigare Snickerikunder')
    expect(res[0].prefillText).toContain('tidigare Snickeri-kunder')
  })

  test('marginalrisk ensam', () => {
    const res = composeSuggestions({
      pengar: { forfallet_kr: 0, marginalrisk_count: 3 },
      capacity: null,
      reactivation: null,
    })
    expect(res).toHaveLength(1)
    expect(res[0].signalKind).toBe('marginalrisk')
    expect(res[0].label).toBe('Skydda marginalen i riskprojekten')
    expect(res[0].prefillText).toBe(
      'Skydda marginalen i projekten som ligger risigt till. Visa vilka projekt det gäller och vad vi kan göra nu.',
    )
  })
})

test.describe('composeSuggestions — alla fyra signaler: max 3, rätt prioritetsordning', () => {
  test('förfallet > tunn_vecka > reaktivering, marginalrisk faller bort (redan 3)', () => {
    const res: MissionSuggestion[] = composeSuggestions({
      pengar: { forfallet_kr: 42000, marginalrisk_count: 2 },
      capacity: { thin: true, configured: true },
      reactivation: { job_type: 'kök', count: 6, quietMonths: 6 },
    })
    expect(res).toHaveLength(3)
    expect(res.map(s => s.signalKind)).toEqual(['forfallet', 'tunn_vecka', 'reaktivering'])
  })

  test('utan förfallet: tunn_vecka > reaktivering > marginalrisk (fortfarande bara 3 möjliga, alla ryms)', () => {
    const res = composeSuggestions({
      pengar: { forfallet_kr: 0, marginalrisk_count: 2 },
      capacity: { thin: true, configured: true },
      reactivation: { job_type: 'kök', count: 6, quietMonths: 6 },
    })
    expect(res.map(s => s.signalKind)).toEqual(['tunn_vecka', 'reaktivering', 'marginalrisk'])
  })
})
