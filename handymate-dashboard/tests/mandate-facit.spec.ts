/**
 * Facit för lib/mandates/mandate-facit.ts (Mission Mandates V1, Etapp V —
 * mätinstrumentet, tasks/jaunty-pondering-hummingbird.md).
 *
 * Ren funktion, ingen I/O: räknar utförda/leveransfel/STOPP-inom-7-dagar
 * per åtgärdstyp för ett mandat. Låst här:
 *   - räknat rätt per typ, filtrerar bort andra mandats kort
 *   - ej_bedombart-ärligheten: saknad kundkoppling räknas aldrig som "rent"
 *   - STOPP-fönstret: före/efter/inom 7 dagar, dedup per kund
 *   - ägaråterkallelse + pausorsaker (nuvarande läge, ingen historik)
 *   - källkodsskanning: inget kausalitetspåstående i filen
 *
 * Körs: npx playwright test tests/mandate-facit.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  byggMandateFacit,
  type MandateFacitCardInput,
  type MandateFacitOptOutInput,
} from '../lib/mandates/mandate-facit'
import { MANDATE_ALLOWED_TYPES, type MandateRow } from '../lib/mandates/mission-mandate'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

function mandate(over: Partial<Pick<MandateRow, 'id' | 'allowed_action_types' | 'status' | 'pause_reason'>> = {}) {
  return {
    id: 'mnd_1',
    allowed_action_types: ['invoice_reminder', 'review_request'] as MandateRow['allowed_action_types'],
    status: 'active' as MandateRow['status'],
    pause_reason: null,
    ...over,
  }
}

/** Bygger ett mandat-stämplat kort. approval_type='invoice_reminder' kräver
    (precis som autonomyKeyFromApproval redan kräver för förtjänad autonomi)
    payload.autonomy_key satt — review_request mappar direkt via
    approval_type och behöver det inte. */
function card(over: Partial<{
  approval_type: string
  autonomy_key: string
  mandate_id: string
  customer_id: string | undefined
  outcome: string
  created_at: string
  status: string
}> = {}): MandateFacitCardInput {
  const v = {
    approval_type: 'invoice_reminder',
    autonomy_key: 'invoice_reminder',
    mandate_id: 'mnd_1',
    customer_id: 'cust_1' as string | undefined,
    outcome: 'success',
    created_at: '2026-08-10T09:00:00.000Z',
    status: 'auto_approved',
    ...over,
  }
  const payload: Record<string, unknown> = {
    mandate_id: v.mandate_id,
    autonomy_key: v.autonomy_key,
    execution_result: { outcome: v.outcome },
  }
  if (v.customer_id !== undefined) payload.customer_id = v.customer_id
  return { approval_type: v.approval_type, status: v.status, created_at: v.created_at, payload }
}

function optOut(over: Partial<MandateFacitOptOutInput> = {}): MandateFacitOptOutInput {
  return { customer_id: 'cust_1', occurred_at: '2026-08-12T09:00:00.000Z', ...over }
}

function rowFor(result: ReturnType<typeof byggMandateFacit>, type: string) {
  return result.per_type.find(r => r.action_type === type)
}

test.describe('byggMandateFacit — utförda/leveransfel per typ', () => {
  test('räknar lyckade utskick som utforda, per typ separat', () => {
    const result = byggMandateFacit({
      mandate: mandate(),
      cards: [
        card({ approval_type: 'invoice_reminder', autonomy_key: 'invoice_reminder', outcome: 'success', customer_id: 'cust_1' }),
        card({ approval_type: 'review_request', outcome: 'success', customer_id: 'cust_2' }),
      ],
      optOutEvents: [],
      contactedCustomerAt: new Map(),
    })
    expect(rowFor(result, 'invoice_reminder')?.utforda).toBe(1)
    expect(rowFor(result, 'review_request')?.utforda).toBe(1)
  })

  test('räknar misslyckade utskick som leveransfel', () => {
    const result = byggMandateFacit({
      mandate: mandate({ allowed_action_types: ['invoice_reminder'] }),
      cards: [card({ outcome: 'failed' }), card({ outcome: 'failed' }), card({ outcome: 'success' })],
      optOutEvents: [],
      contactedCustomerAt: new Map(),
    })
    expect(rowFor(result, 'invoice_reminder')?.leveransfel).toBe(2)
    expect(rowFor(result, 'invoice_reminder')?.utforda).toBe(1)
  })

  test('skipped-utfall räknas varken som utforda eller leveransfel', () => {
    const result = byggMandateFacit({
      mandate: mandate({ allowed_action_types: ['invoice_reminder'] }),
      cards: [card({ outcome: 'skipped' })],
      optOutEvents: [],
      contactedCustomerAt: new Map(),
    })
    expect(rowFor(result, 'invoice_reminder')).toEqual({
      action_type: 'invoice_reminder', utforda: 0, leveransfel: 0, stopp_inom_7d: 0, ej_bedombart: 0,
    })
  })

  test('filtrerar bort kort som tillhör ett ANNAT mandat', () => {
    const result = byggMandateFacit({
      mandate: mandate({ allowed_action_types: ['invoice_reminder'] }),
      cards: [card({ mandate_id: 'mnd_ANNAT' })],
      optOutEvents: [],
      contactedCustomerAt: new Map(),
    })
    expect(rowFor(result, 'invoice_reminder')?.utforda).toBe(0)
  })

  test('kort med typ utanför mandatets allowed_action_types ignoreras helt', () => {
    const result = byggMandateFacit({
      mandate: mandate({ allowed_action_types: ['invoice_reminder'] }), // review_request INTE med
      cards: [card({ approval_type: 'review_request', outcome: 'success' })],
      optOutEvents: [],
      contactedCustomerAt: new Map(),
    })
    expect(result.per_type).toHaveLength(1)
    expect(result.per_type[0].action_type).toBe('invoice_reminder')
  })

  test('kort utan giltig autonomy_key (okänd typ) ger ingen träff någonstans', () => {
    const result = byggMandateFacit({
      mandate: mandate({ allowed_action_types: ['invoice_reminder'] }),
      cards: [card({ approval_type: 'automation', autonomy_key: 'okand_typ' as any })],
      optOutEvents: [],
      contactedCustomerAt: new Map(),
    })
    expect(rowFor(result, 'invoice_reminder')?.utforda).toBe(0)
  })
})

test.describe('byggMandateFacit — ej_bedombart-ärligheten', () => {
  test('lyckat utskick utan customer_id på kortet → ej_bedombart, inte "rent"', () => {
    const result = byggMandateFacit({
      mandate: mandate({ allowed_action_types: ['invoice_reminder'] }),
      cards: [card({ customer_id: undefined })],
      optOutEvents: [],
      contactedCustomerAt: new Map([['cust_1', '2026-08-10T09:00:00.000Z']]),
    })
    const row = rowFor(result, 'invoice_reminder')!
    expect(row.utforda).toBe(1)
    expect(row.ej_bedombart).toBe(1)
  })

  test('lyckat utskick med customer_id men okänt kontakttillfälle → ej_bedombart', () => {
    const result = byggMandateFacit({
      mandate: mandate({ allowed_action_types: ['invoice_reminder'] }),
      cards: [card({ customer_id: 'cust_1' })],
      optOutEvents: [],
      contactedCustomerAt: new Map(), // tomt — inget känt kontakttillfälle
    })
    const row = rowFor(result, 'invoice_reminder')!
    expect(row.utforda).toBe(1)
    expect(row.ej_bedombart).toBe(1)
  })

  test('fullständig koppling (customer_id + kontakttillfälle) → INTE ej_bedombart', () => {
    const result = byggMandateFacit({
      mandate: mandate({ allowed_action_types: ['invoice_reminder'] }),
      cards: [card({ customer_id: 'cust_1' })],
      optOutEvents: [],
      contactedCustomerAt: new Map([['cust_1', '2026-08-10T09:00:00.000Z']]),
    })
    expect(rowFor(result, 'invoice_reminder')?.ej_bedombart).toBe(0)
  })
})

test.describe('byggMandateFacit — STOPP inom 7 dagar', () => {
  const contacted = new Map([['cust_1', '2026-08-10T09:00:00.000Z']])

  test('opt-out 3 dagar efter kontakttillfället → räknas', () => {
    const result = byggMandateFacit({
      mandate: mandate({ allowed_action_types: ['invoice_reminder'] }),
      cards: [card({ customer_id: 'cust_1' })],
      optOutEvents: [optOut({ occurred_at: '2026-08-13T09:00:00.000Z' })],
      contactedCustomerAt: contacted,
    })
    expect(rowFor(result, 'invoice_reminder')?.stopp_inom_7d).toBe(1)
  })

  test('opt-out exakt på 7-dagarsgränsen räknas (inklusive)', () => {
    const result = byggMandateFacit({
      mandate: mandate({ allowed_action_types: ['invoice_reminder'] }),
      cards: [card({ customer_id: 'cust_1' })],
      optOutEvents: [optOut({ occurred_at: '2026-08-17T09:00:00.000Z' })], // exakt +7d
      contactedCustomerAt: contacted,
    })
    expect(rowFor(result, 'invoice_reminder')?.stopp_inom_7d).toBe(1)
  })

  test('opt-out 8 dagar efter → räknas INTE', () => {
    const result = byggMandateFacit({
      mandate: mandate({ allowed_action_types: ['invoice_reminder'] }),
      cards: [card({ customer_id: 'cust_1' })],
      optOutEvents: [optOut({ occurred_at: '2026-08-18T10:00:00.000Z' })],
      contactedCustomerAt: contacted,
    })
    expect(rowFor(result, 'invoice_reminder')?.stopp_inom_7d).toBe(0)
  })

  test('opt-out FÖRE kontakttillfället → räknas INTE', () => {
    const result = byggMandateFacit({
      mandate: mandate({ allowed_action_types: ['invoice_reminder'] }),
      cards: [card({ customer_id: 'cust_1' })],
      optOutEvents: [optOut({ occurred_at: '2026-08-05T09:00:00.000Z' })],
      contactedCustomerAt: contacted,
    })
    expect(rowFor(result, 'invoice_reminder')?.stopp_inom_7d).toBe(0)
  })

  test('opt-out för en ANNAN kund → räknas INTE', () => {
    const result = byggMandateFacit({
      mandate: mandate({ allowed_action_types: ['invoice_reminder'] }),
      cards: [card({ customer_id: 'cust_1' })],
      optOutEvents: [optOut({ customer_id: 'cust_9999' })],
      contactedCustomerAt: contacted,
    })
    expect(rowFor(result, 'invoice_reminder')?.stopp_inom_7d).toBe(0)
  })

  test('samma kund räknas högst en gång även med flera opt-out-händelser', () => {
    const result = byggMandateFacit({
      mandate: mandate({ allowed_action_types: ['invoice_reminder'] }),
      cards: [card({ customer_id: 'cust_1' })],
      optOutEvents: [
        optOut({ occurred_at: '2026-08-11T09:00:00.000Z' }),
        optOut({ occurred_at: '2026-08-12T09:00:00.000Z' }),
      ],
      contactedCustomerAt: contacted,
    })
    expect(rowFor(result, 'invoice_reminder')?.stopp_inom_7d).toBe(1)
  })
})

test.describe('byggMandateFacit — ägaråterkallelse och pausorsaker', () => {
  test('agaraterkallelse är true bara när status är revoked', () => {
    expect(byggMandateFacit({ mandate: mandate({ status: 'revoked' }), cards: [], optOutEvents: [], contactedCustomerAt: new Map() }).agaraterkallelse).toBe(true)
    expect(byggMandateFacit({ mandate: mandate({ status: 'active' }), cards: [], optOutEvents: [], contactedCustomerAt: new Map() }).agaraterkallelse).toBe(false)
    expect(byggMandateFacit({ mandate: mandate({ status: 'paused' }), cards: [], optOutEvents: [], contactedCustomerAt: new Map() }).agaraterkallelse).toBe(false)
  })

  test('pausorsaker är tom när pause_reason saknas', () => {
    const result = byggMandateFacit({ mandate: mandate({ pause_reason: null }), cards: [], optOutEvents: [], contactedCustomerAt: new Map() })
    expect(result.pausorsaker).toEqual([])
  })

  test('pausorsaker bär det NUVARANDE skälet (ingen historik lagras)', () => {
    const result = byggMandateFacit({
      mandate: mandate({ status: 'paused', pause_reason: 'delivery_failures' }),
      cards: [], optOutEvents: [], contactedCustomerAt: new Map(),
    })
    expect(result.pausorsaker).toEqual(['delivery_failures'])
  })
})

test.describe('byggMandateFacit — struktur', () => {
  test('per_type innehåller bara mandatets tillåtna typer, i kanonisk ordning', () => {
    const result = byggMandateFacit({
      mandate: mandate({ allowed_action_types: ['review_request', 'invoice_reminder'] }),
      cards: [], optOutEvents: [], contactedCustomerAt: new Map(),
    })
    expect(result.per_type.map(r => r.action_type)).toEqual(
      MANDATE_ALLOWED_TYPES.filter(t => (['review_request', 'invoice_reminder'] as string[]).includes(t)),
    )
  })

  test('ingen hopslagen totalsiffra över typer', () => {
    const result = byggMandateFacit({ mandate: mandate(), cards: [], optOutEvents: [], contactedCustomerAt: new Map() })
    expect(typeof (result as any).total).toBe('undefined')
    expect(typeof (result as any).totalKr).toBe('undefined')
    expect(typeof (result as any).utforda).toBe('undefined') // finns bara per_type[i].utforda
  })

  test('mandate_id kopieras rätt', () => {
    const result = byggMandateFacit({ mandate: mandate({ id: 'mnd_xyz' }), cards: [], optOutEvents: [], contactedCustomerAt: new Map() })
    expect(result.mandate_id).toBe('mnd_xyz')
  })
})

// ─────────────────────────────────────────────────────────────────
// Källkodsskanning — ingen kausalitet (samma lista/princip som
// tests/checkpoint-outcomes.spec.ts)
// ─────────────────────────────────────────────────────────────────

test.describe('mandate-facit.ts — inget kausalitetspåstående i filen', () => {
  const kalla = read('lib/mandates/mandate-facit.ts').toLowerCase()
  const forbjudnaOrd = ['orsakade', 'gav bättre', 'berodde på', 'ledde till', 'fick kunden']

  for (const ord of forbjudnaOrd) {
    test(`förbjudet ord "${ord}" förekommer inte`, () => {
      expect(kalla).not.toContain(ord)
    })
  }

  test('filhuvudet dokumenterar kausalitetsregeln uttryckligen', () => {
    expect(kalla).toContain('kausalitet')
  })
})

test.describe('lib/mandates/mandate-facit.ts — övrig källskanning', () => {
  const kalla = read('lib/mandates/mandate-facit.ts')
  test('ren funktion — ingen Supabase-import, ingen I/O', () => {
    expect(kalla).not.toContain('SupabaseClient')
    // OBS: inte ett generellt förbud mot ".from(" — Array.from(...) används
    // legitimt i den rena kärnan. Det här kollar specifikt Supabase-anrop.
    expect(kalla).not.toContain('supabase.from(')
    expect(kalla).not.toMatch(/\.from\('[a-z_]+'\)/)
  })
  test('refererar aldrig den förbjudna exekveringsspegeln', () => {
    expect(kalla).not.toContain('executeApprovalPayloadInternal')
  })
})
