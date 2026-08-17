/**
 * Facit för värdekvittot natt 1 (Tur 4 etapp 7) — fyra ärlighetsregler.
 *
 * Kvittot är garantimodellens bevisartefakt: betala direkt, se svart på
 * vitt vad teamet bekräftat dragit in. En artefakt som ljuger en enda gång
 * är värdelös för alltid — därför testas reglerna hårdare än mappningen.
 *
 *   npx playwright test tests/vardekvitto.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  byggVardekvitto,
  manadsfonster,
  manadensAttributioner,
  VARDEKVITTO_METHOD_VERSION,
} from '../lib/value/vardekvitto'
import type { Attribution } from '../lib/value/recovered-revenue'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const attribution = (over: Partial<Attribution> = {}): Attribution => ({
  card_id: 'appr_1',
  approval_type: 'quote_nudge',
  agent: 'daniel',
  event_kind: 'quote_accepted',
  event_id: 'q_1',
  customer_id: 'c_1',
  amount_kr: 48750,
  occurred_at_ms: Date.UTC(2026, 7, 5), // 5 augusti
  card_resolved_at_ms: Date.UTC(2026, 7, 1),
  label: 'Offert accepterad: Takbyte',
  ...over,
})

test.describe('regel 1 — ingen schablon når confirmed_kr', () => {
  test('en bokning är en händelse, inte en krona', () => {
    const kvitto = byggVardekvitto({
      period: '2026-08',
      attributions: [attribution({ event_kind: 'booking_created', amount_kr: 0, event_id: 'b_1' })],
      potentialKr: null,
    })
    expect(kvitto.confirmed_kr).toBe(0)
    expect(kvitto.confirmed_items).toEqual([])
  })

  test('bara verkliga belopp summeras — nollrader fyller aldrig listan', () => {
    const kvitto = byggVardekvitto({
      period: '2026-08',
      attributions: [
        attribution(),
        attribution({ event_kind: 'booking_created', amount_kr: 0, event_id: 'b_1' }),
      ],
      potentialKr: null,
    })
    expect(kvitto.confirmed_kr).toBe(48750)
    expect(kvitto.confirmed_items).toHaveLength(1)
    expect(kvitto.confirmed_items[0].approval_id).toBe('appr_1')
    expect(kvitto.confirmed_items[0].dagar).toBe(4)
  })
})

test.describe('regel 2 — en intäkt attribueras EN gång, även över månadsgräns', () => {
  test('händelsen hör till månaden den inträffade — inte kortets månad', () => {
    // Kortet godkändes 25 juli; offerten accepterades 1 augusti.
    const over = attribution({
      card_resolved_at_ms: Date.UTC(2026, 6, 25),
      occurred_at_ms: Date.UTC(2026, 7, 1, 9, 0),
    })
    const juli = byggVardekvitto({ period: '2026-07', attributions: [over], potentialKr: null })
    const augusti = byggVardekvitto({ period: '2026-08', attributions: [over], potentialKr: null })
    expect(juli.confirmed_kr).toBe(0)
    expect(augusti.confirmed_kr).toBe(48750)
    // Exakt EN förekomst över de två månaderna tillsammans.
    expect(juli.confirmed_items.length + augusti.confirmed_items.length).toBe(1)
  })

  test('fönstret är halvöppet — midnatt första nästa månad hör till nästa månad', () => {
    const gransfall = attribution({ occurred_at_ms: Date.UTC(2026, 8, 1) }) // 1 sep 00:00
    expect(manadensAttributioner([gransfall], '2026-08')).toEqual([])
    expect(manadensAttributioner([gransfall], '2026-09')).toHaveLength(1)
  })
})

test.describe('regel 3 — tom månad är en ärlig nolla', () => {
  test('inga attributioner ger 0 kr och tom lista, aldrig null', () => {
    const kvitto = byggVardekvitto({ period: '2026-06', attributions: [], potentialKr: null })
    expect(kvitto.confirmed_kr).toBe(0)
    expect(kvitto.confirmed_items).toEqual([])
    expect(kvitto.period).toBe('2026-06')
    expect(kvitto.method_version).toBe(VARDEKVITTO_METHOD_VERSION)
  })
})

test.describe('regel 4 — potential och bekräftat går inte att slå ihop', () => {
  test('stor potential rubbar aldrig bekräftat', () => {
    const kvitto = byggVardekvitto({ period: '2026-08', attributions: [attribution()], potentialKr: 250000 })
    expect(kvitto.confirmed_kr).toBe(48750)
    expect(kvitto.potential_kr).toBe(250000)
  })

  test('oläst potential är null — aldrig en påhittad nolla', () => {
    expect(byggVardekvitto({ period: '2026-08', attributions: [], potentialKr: null }).potential_kr).toBeNull()
  })

  test('ingen kod i modulen adderar fälten', () => {
    const s = read('lib/value/vardekvitto.ts')
    expect(s).not.toMatch(/confirmed_kr\s*\+\s*potential|potential_kr\s*\+\s*confirmed/)
  })

  test('posten är oföränderlig — ett kvitto redigeras inte', () => {
    const kvitto = byggVardekvitto({ period: '2026-08', attributions: [attribution()], potentialKr: 100 })
    expect(Object.isFrozen(kvitto)).toBe(true)
    expect(Object.isFrozen(kvitto.confirmed_items)).toBe(true)
    expect(Object.isFrozen(kvitto.confirmed_items[0])).toBe(true)
  })
})

test.describe('månadsfönstret', () => {
  test('giltig period ger UTC-gränser', () => {
    const f = manadsfonster('2026-08')!
    expect(f.fromMs).toBe(Date.UTC(2026, 7, 1))
    expect(f.toMs).toBe(Date.UTC(2026, 8, 1))
  })

  test('skräpperioder ger null — aldrig en gissad månad', () => {
    for (const period of ['2026-13', '2026-0', '2026-8', 'augusti', '', '2026-08-01']) {
      expect(manadsfonster(period), `"${period}" accepterades`).toBeNull()
    }
  })
})

test.describe('rutten och ytan', () => {
  test('rutten är ägargrindad och BARA läsning', () => {
    const s = read('app/api/value/kvitto/route.ts')
    expect(s).toContain('isOwnerOrAdmin')
    expect(s).toContain('Endast ägare och administratör')
    expect(s).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/)
  })

  test('kvittot på hemskärmen är information — aldrig ett beslutskort', () => {
    // Etapp C6 (2026-08-17): den ramlösa textraden blev grad-tint-teasern.
    // Garantierna består: renderas bara när bekräftade kronor finns, inga
    // beslutsknappar, och de vilande kronorna sägs INTE här en gång till
    // (de bor i Pengar just nu/Firman just nu — ingen andra sanning).
    const s = read('components/jarvis/JarvisHome.tsx')
    const i = s.indexOf('Värdekvitto · Handymate i {')
    expect(i, 'kvittoteaser saknas på hemskärmen').toBeGreaterThan(-1)
    const block = s.slice(i - 800, i + 1200)
    expect(block).toContain('kvitto.confirmed_kr > 0')
    expect(block).toContain('bg-grad-tint')
    expect(block).toContain('Se varje krona')
    expect(block).not.toContain('AgentDecisionCard')
    expect(block).not.toContain('Godkänn')
    expect(block).not.toContain('pengarData')
  })
})
