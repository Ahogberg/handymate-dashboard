/**
 * FACIT — Mission Mandates V1, Etapp W (caller-integration +
 * exekveringsstämpling), tasks/jaunty-pondering-hummingbird.md.
 *
 * Två delar:
 *  1. lib/mandates/resolve.ts — den delade kandidat-resolvern (I/O, fail-
 *     soft) som alla fyra callers bygger på. Samma fakeSupabase-kö-idiom som
 *     tests/mission-mandate.spec.ts.
 *  2. Källskanning per caller (send-reminders, quote-follow-up,
 *     review-requests, automation-engine) — samma J-mönster som
 *     tests/hanna-outbound.spec.ts: mandatkontrollen är verkligen inkopplad,
 *     sändvägen återanvänds (INGEN ny sändhjälpare introducerad), varje kort
 *     stämplas med mandate_id/mission_id, och missionslösa/mandatlösa vägen
 *     reducerar algebraiskt till EXAKT dagens uttryck (kvoterat i assertion).
 *
 * Körs: npx playwright test tests/mandate-callers.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  loadMandateResolutionCache,
  resolveMandateForAction,
  MANDATE_TRUTH_CLASS,
  type MandateResolutionCache,
} from '../lib/mandates/resolve'
import { computePlanHash, NO_MANDATE_REASON, type MandateRow, type MandateActionType } from '../lib/mandates/mission-mandate'
import type { ValidatedMissionStep } from '../lib/mission/plan-validation'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const countOccurrences = (src: string, needle: string): number => src.split(needle).length - 1

// ─────────────────────────────────────────────────────────────────
// Fake Supabase — samma kö-per-.from()-mönster som tests/mission-
// mandate.spec.ts.
// ─────────────────────────────────────────────────────────────────
type FakeResponse = { data: unknown; error: { message: string; code?: string } | null }

function fakeChain(response: FakeResponse) {
  const promise = Promise.resolve(response) as any
  const methods = ['select', 'eq', 'neq', 'not', 'gte', 'order', 'limit', 'in', 'contains', 'is', 'insert', 'update', 'maybeSingle']
  for (const m of methods) promise[m] = () => promise
  return promise
}

function fakeSupabase(responses: FakeResponse[]) {
  let calls = 0
  const supabase = {
    from(_table: string) {
      const response = responses[calls] ?? { data: [], error: null }
      calls++
      return fakeChain(response)
    },
  }
  return { supabase, callCount: () => calls }
}

const ok = (data: unknown): FakeResponse => ({ data, error: null })
const fail = (message: string, code?: string): FakeResponse => ({ data: null, error: { message, code } })

function step(over: Partial<ValidatedMissionStep> = {}): ValidatedMissionStep {
  return {
    item_id: 'pf_1',
    truth_class: 'indrivningsbart',
    title: 'Faktura 123',
    measure: { kind: 'kr', amountKr: 5000 },
    evidence: { table: 'invoice', ref_id: 'inv_1' },
    agent_key: 'karin',
    approval_type: 'invoice_reminder',
    motivation: 'Förfallen sedan 10 dagar',
    ...over,
  }
}

const STEPS = [step()]
const PLAN_HASH = computePlanHash(STEPS)

function mandate(over: Partial<MandateRow> = {}): MandateRow {
  return {
    id: 'mnd_mis_1',
    business_id: 'biz_1',
    mission_id: 'mis_1',
    plan_hash: PLAN_HASH,
    allowed_action_types: ['invoice_reminder'],
    targets: { invoice_ids: ['inv_1'] },
    daily_cap: 5,
    total_cap: 20,
    amount_cap_kr: null,
    expires_at: '2026-12-31',
    status: 'active',
    pause_reason: null,
    created_by: 'bu_1',
    created_at: '2026-08-01T00:00:00.000Z',
    revoked_at: null,
    paused_at: null,
    ...over,
  }
}

interface ReqOverrides {
  actionKey?: MandateActionType
  targetRef?: string
  amountKr?: number | null
  nowIso?: string
}

function req(over: ReqOverrides = {}) {
  return {
    actionKey: 'invoice_reminder' as MandateActionType,
    targetRef: 'inv_1',
    amountKr: 5000 as number | null,
    nowIso: '2026-08-18T10:00:00.000Z',
    ...over,
  }
}

function cacheWith(mandates: MandateRow[]): MandateResolutionCache {
  return { mandates, missionStepsById: new Map(), usageByMandateId: new Map() }
}

// ─────────────────────────────────────────────────────────────────
// loadMandateResolutionCache
// ─────────────────────────────────────────────────────────────────

test.describe('loadMandateResolutionCache', () => {
  test('schema saknas → tom mandate-lista, tomma memo-cacher', async () => {
    const { supabase } = fakeSupabase([fail('relation does not exist', '42P01')])
    const cache = await loadMandateResolutionCache(supabase as any, 'biz_1')
    expect(cache.mandates).toEqual([])
    expect(cache.missionStepsById.size).toBe(0)
    expect(cache.usageByMandateId.size).toBe(0)
  })

  test('mandat hittade → cache.mandates fylld direkt från loadActiveMandates', async () => {
    const rows = [mandate()]
    const { supabase, callCount } = fakeSupabase([ok(rows)])
    const cache = await loadMandateResolutionCache(supabase as any, 'biz_1')
    expect(cache.mandates).toEqual(rows)
    expect(callCount()).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────
// resolveMandateForAction
// ─────────────────────────────────────────────────────────────────

test.describe('resolveMandateForAction', () => {
  test('inga kandidat-mandat alls → ingen_mandat, noll I/O', async () => {
    const { supabase, callCount } = fakeSupabase([])
    const result = await resolveMandateForAction(supabase as any, 'biz_1', cacheWith([]), req())
    expect(result).toEqual({ covered: false, reason: NO_MANDATE_REASON })
    expect(callCount()).toBe(0)
  })

  test('mandat finns men fel typ → filtreras bort FÖRE all I/O', async () => {
    const m = mandate({ allowed_action_types: ['review_request'], targets: { project_ids: ['proj_1'] } })
    const { supabase, callCount } = fakeSupabase([])
    const result = await resolveMandateForAction(supabase as any, 'biz_1', cacheWith([m]), req({ actionKey: 'invoice_reminder' }))
    expect(result).toEqual({ covered: false, reason: NO_MANDATE_REASON })
    expect(callCount()).toBe(0)
  })

  test('täckt: plan oförändrad, mål/tak inom gränser → covered:true, mandat-raden bifogas', async () => {
    const m = mandate()
    const { supabase, callCount } = fakeSupabase([
      ok({ id: m.mission_id, plan_snapshot: { steps: STEPS } }), // mission-uppslag
      ok([]), // pending_approvals-uppslag (användning) — tom, 0/0
    ])
    const result = await resolveMandateForAction(supabase as any, 'biz_1', cacheWith([m]), req())
    expect(result).toEqual({ covered: true, mandate: m })
    expect(callCount()).toBe(2)
  })

  test('memoisering: två anrop mot SAMMA cache för samma mandat läser mission/användning EN gång totalt', async () => {
    const m = mandate()
    const cache = cacheWith([m])
    const { supabase, callCount } = fakeSupabase([
      ok({ id: m.mission_id, plan_snapshot: { steps: STEPS } }),
      ok([]),
    ])
    const first = await resolveMandateForAction(supabase as any, 'biz_1', cache, req({ targetRef: 'inv_1' }))
    const second = await resolveMandateForAction(supabase as any, 'biz_1', cache, req({ targetRef: 'inv_1' }))
    expect(first).toEqual({ covered: true, mandate: m })
    expect(second).toEqual({ covered: true, mandate: m })
    expect(callCount()).toBe(2) // inte 4 — andra anropet återanvänder cachen
  })

  test('planen ändrad → pauseMandateForPlanChange körs, mandatet täcker inte', async () => {
    const m = mandate()
    const { supabase, callCount } = fakeSupabase([
      ok({ id: m.mission_id, plan_snapshot: { steps: [step({ measure: { kind: 'kr', amountKr: 9999 } })] } }), // annan hash
      ok(null), // pauseMandateForPlanChange: update mission_mandate
      ok(null), // pauseMandateForPlanChange: insert informationskort
    ])
    const result = await resolveMandateForAction(supabase as any, 'biz_1', cacheWith([m]), req())
    expect(result).toEqual({ covered: false, reason: NO_MANDATE_REASON })
    expect(callCount()).toBe(3)
  })

  test('mission-uppslaget failar (schema saknas) → mandatet hoppas över, ingen kastning', async () => {
    const { supabase, callCount } = fakeSupabase([fail('relation does not exist', '42P01')])
    const result = await resolveMandateForAction(supabase as any, 'biz_1', cacheWith([mandate()]), req())
    expect(result).toEqual({ covered: false, reason: NO_MANDATE_REASON })
    expect(callCount()).toBe(1)
  })

  test('användnings-uppslaget failar → fail-soft 0/0, täckning avgörs ändå (inga tak överskridna)', async () => {
    const m = mandate()
    const { supabase } = fakeSupabase([
      ok({ id: m.mission_id, plan_snapshot: { steps: STEPS } }),
      fail('connection reset'),
    ])
    const result = await resolveMandateForAction(supabase as any, 'biz_1', cacheWith([m]), req())
    expect(result).toEqual({ covered: true, mandate: m })
  })

  test('dagstak nått (härlett ur användning) → ingen_mandat', async () => {
    const m = mandate({ daily_cap: 1 })
    const { supabase } = fakeSupabase([
      ok({ id: m.mission_id, plan_snapshot: { steps: STEPS } }),
      ok([{ created_at: '2026-08-18T09:00:00.000Z', payload: { mandate_id: m.id }, status: 'auto_approved' }]),
    ])
    const result = await resolveMandateForAction(supabase as any, 'biz_1', cacheWith([m]), req({ nowIso: '2026-08-18T10:00:00.000Z' }))
    expect(result).toEqual({ covered: false, reason: NO_MANDATE_REASON })
  })

  test('internt kastat fel (t.ex. from() kastar) → fail-soft, aldrig en kastning ut', async () => {
    const throwing = { from() { throw new Error('boom') } }
    await expect(
      resolveMandateForAction(throwing as any, 'biz_1', cacheWith([mandate()]), req()),
    ).resolves.toEqual({ covered: false, reason: NO_MANDATE_REASON })
  })
})

// ─────────────────────────────────────────────────────────────────
// MANDATE_TRUTH_CLASS
// ─────────────────────────────────────────────────────────────────

test.describe('MANDATE_TRUTH_CLASS', () => {
  test('invoice_reminder → indrivningsbart, quote_followup_sms → pipeline', () => {
    expect(MANDATE_TRUTH_CLASS.invoice_reminder).toBe('indrivningsbart')
    expect(MANDATE_TRUTH_CLASS.quote_followup_sms).toBe('pipeline')
  })
  test('booking_reminder och review_request saknar MEDVETET en post (ingen ärlig klass finns)', () => {
    expect(MANDATE_TRUTH_CLASS.booking_reminder).toBeUndefined()
    expect(MANDATE_TRUTH_CLASS.review_request).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────
// Källskanning — lib/mandates/resolve.ts
// ─────────────────────────────────────────────────────────────────

test.describe('lib/mandates/resolve.ts — källskanning', () => {
  const src = read('lib/mandates/resolve.ts')

  test('byggd ovanpå Etapp V:s kontrakt: refererar loadActiveMandates och mandateCovers', () => {
    expect(src).toContain('loadActiveMandates')
    expect(src).toContain('mandateCovers')
  })

  test('refererar aldrig den förbjudna exekveringsspegeln', () => {
    expect(src).not.toContain('executeApprovalPayloadInternal')
  })
})

// ─────────────────────────────────────────────────────────────────
// Källskanning per caller
// ─────────────────────────────────────────────────────────────────

test.describe('app/api/cron/send-reminders/route.ts — mandat-integration', () => {
  const src = read('app/api/cron/send-reminders/route.ts')

  test('mandatkontrollen är inkopplad', () => {
    expect(src).toContain('resolveMandateForAction')
    expect(src).toContain('loadMandateResolutionCache')
    expect(src).toContain('registerMandateDeliveryFailure')
  })

  test('sändvägen återanvänds: deliverInvoiceReminder har EN enda anropsplats (ingen ny sändhjälpare)', () => {
    expect(countOccurrences(src, 'await deliverInvoiceReminder(supabase, deliveryInput)')).toBe(1)
  })

  test('kortet stämplas med mandate_id/mission_id/truth_class', () => {
    expect(src).toContain('mandate_id: mandate.id')
    expect(src).toContain('mission_id: mandate.mission_id')
    expect(src).toContain('truth_class: MANDATE_TRUTH_CLASS.invoice_reminder')
  })

  test('mandat-kortet skrivs som auto_approved', () => {
    expect(src).toMatch(/status: 'auto_approved'/)
  })

  test('missionslösa/mandatlösa vägen reducerar till dagens exakta isAutonomous-anrop', () => {
    // Reduktionen: `let autonomous = mandateResolution.covered` följt av
    // `if (!autonomous) { try { ...ORIGINALA UTTRYCKET... } catch {...} }`
    // — när covered är false körs exakt den gamla try/catch-satsen.
    expect(src).toContain('let autonomous = mandateResolution.covered')
    expect(src).toContain("autonomous = await isAutonomous(supabase, inv.business_id, 'invoice_reminder')")
  })

  test('beloppsgräns-checken (capExceeded) gäller INTE mandatvägen (dubbel-tak undviks)', () => {
    expect(src).toContain('if (autonomous && !mandateResolution.covered) {')
  })

  test('refererar aldrig den förbjudna exekveringsspegeln', () => {
    expect(src).not.toContain('executeApprovalPayloadInternal')
  })
})

test.describe('app/api/cron/quote-follow-up/route.ts — mandat-integration', () => {
  const src = read('app/api/cron/quote-follow-up/route.ts')

  test('mandatkontrollen är inkopplad', () => {
    expect(src).toContain('resolveMandateForAction')
    expect(src).toContain('loadMandateResolutionCache')
    expect(src).toContain('registerMandateDeliveryFailure')
  })

  test('sändvägen återanvänds: sendSmsViaElks har EN enda anropsplats i nudge-sektionen', () => {
    expect(countOccurrences(src, 'await sendSmsViaElks({')).toBe(1)
  })

  test('kortet stämplas med mandate_id/mission_id/truth_class', () => {
    expect(src).toContain('mandate_id: mandate.id')
    expect(src).toContain('mission_id: mandate.mission_id')
    expect(src).toContain('truth_class: MANDATE_TRUTH_CLASS.quote_followup_sms')
  })

  test('mandat-kortet skrivs som auto_approved', () => {
    expect(src).toMatch(/status: 'auto_approved'/)
  })

  test('missionslösa/mandatlösa vägen reducerar till dagens exakta treatAsAutonomous-uttryck', () => {
    // Nya uttrycket: `mandateResolution.covered || (bizAutonomous && !capExceeded)`.
    // covered===false ⇒ reducerar till exakt `bizAutonomous && !capExceeded`
    // (det gamla uttrycket, kvoterat här).
    expect(src).toContain('const treatAsAutonomous = mandateResolution.covered || (bizAutonomous && !capExceeded)')
  })

  test('refererar aldrig den förbjudna exekveringsspegeln', () => {
    expect(src).not.toContain('executeApprovalPayloadInternal')
  })
})

test.describe('app/api/cron/review-requests/route.ts — mandat-integration', () => {
  const src = read('app/api/cron/review-requests/route.ts')

  test('mandatkontrollen är inkopplad', () => {
    expect(src).toContain('resolveMandateForAction')
    expect(src).toContain('loadMandateResolutionCache')
    expect(src).toContain('registerMandateDeliveryFailure')
  })

  test('sändvägen återanvänds: sendSmsViaElks har EN enda anropsplats', () => {
    expect(countOccurrences(src, 'await sendSmsViaElks({')).toBe(1)
  })

  test('kortet stämplas med mandate_id/mission_id', () => {
    expect(src).toContain('mandate_id: mandate.id')
    expect(src).toContain('mission_id: mandate.mission_id')
  })

  test('review_request-kortet stämplar MEDVETET ingen truth_class-nyckel (ingen ärlig klass finns)', () => {
    // Kollar fältnamnet (med kolon, dvs. en faktisk payload-nyckel) — inte
    // hela filens text, som ärligt FÅR nämna ordet i en förklarande kommentar.
    expect(src).not.toContain('truth_class:')
  })

  test('mandat-kortet skrivs som auto_approved', () => {
    expect(src).toMatch(/status: 'auto_approved'/)
  })

  test('missionslösa/mandatlösa vägen reducerar till dagens exakta if (reviewAutonomous)-gren', () => {
    // Nya villkoret: `reviewAutonomous || mandateResolution.covered`.
    // covered===false ⇒ reducerar till exakt `reviewAutonomous` (det gamla
    // uttrycket `if (reviewAutonomous)`, kvoterat här).
    expect(src).toContain('if (reviewAutonomous || mandateResolution.covered) {')
  })

  test('förtjänad autonomi och mandat registrerar leveransfel mot separata trösklar', () => {
    expect(src).toContain("await recordAutonomyFailure(supabase, biz.business_id, 'review_request')")
    expect(src).toContain('await registerMandateDeliveryFailure(supabase, { mandateId: mandateResolution.mandate.id, businessId: biz.business_id })')
  })

  test('refererar aldrig den förbjudna exekveringsspegeln', () => {
    expect(src).not.toContain('executeApprovalPayloadInternal')
  })
})

test.describe('lib/automation-engine.ts — mandat-integration (booking_reminder)', () => {
  const src = read('lib/automation-engine.ts')

  test('mandatkontrollen är inkopplad', () => {
    expect(src).toContain('resolveMandateForAction')
    expect(src).toContain('loadMandateResolutionCache')
    expect(src).toContain('registerMandateDeliveryFailure')
  })

  test('sändvägen återanvänds: executeAction (steg 7) har EN enda anropsplats — mandatvägen duplicerar inte exekveringen', () => {
    expect(countOccurrences(src, 'const result = await executeAction(')).toBe(1)
  })

  test('mandat-kortet stämplas med mandate_id/mission_id, ingen truth_class (booking_reminder saknar ärlig klass)', () => {
    expect(src).toContain('mandate_id: mandateStamp.mandate_id')
    expect(src).toContain('mission_id: mandateStamp.mission_id')
  })

  test('mandat-kortet skrivs som auto_approved', () => {
    expect(src).toMatch(/status: 'auto_approved'/)
  })

  test('recordAutonomyFailure (earned-autonomy-streaken) körs ALDRIG för ett mandat-drivet fel', () => {
    expect(src).toContain('if (autonomyKey && !mandateStamp) {')
  })

  test('missionslösa/mandatlösa vägen reducerar till dagens exakta isAutonomyGranted-anrop', () => {
    // mandateStamp förblir null ⇒ autonomousBypass förblir false efter
    // mandat-blocket ⇒ `if (!autonomousBypass) { ...ORIGINALA UTTRYCKET... }`
    // körs — exakt den gamla try/catch-satsen (kvoterat här).
    expect(src).toContain('if (!autonomousBypass) {')
    expect(src).toContain('autonomousBypass = await isAutonomyGranted(supabase, typedRule.business_id, autonomyKey)')
  })

  test('mandatuppslaget är begränsat till booking_reminder — deriveAutonomyKey mappar ÄVEN invoice/quote-threshold-signaturer, men amountKr:null där skulle fail-closed:a till belopp_okant (dolt trasigt) eftersom de typerna HAR ett default-tak', () => {
    expect(src).toContain("if (autonomyKey === 'booking_reminder') {")
  })

  test('isAutonomyGranted-fallbacken körs OFÖRÄNDRAT för ALLA autonomyKey-typer (inte bara booking_reminder) — mandat-scopningen får inte tysta earned-autonomy för invoice/quote-threshold-regler', () => {
    // Reduktionsbeviset: `if (!autonomousBypass) { ... }`-blocket ligger på
    // SAMMA nivå som `if (autonomyKey === 'booking_reminder')`, inte inuti
    // det — annars skulle isAutonomyGranted aldrig nås för invoice_reminder/
    // quote_followup_sms threshold-regler.
    const fnStart = src.indexOf("const autonomyKey = deriveAutonomyKey(typedRule)")
    const fnSlice = src.slice(fnStart, fnStart + 3200)
    const scopeIdx = fnSlice.indexOf("if (autonomyKey === 'booking_reminder') {")
    const fallbackIdx = fnSlice.indexOf('if (!autonomousBypass) {')
    expect(scopeIdx).toBeGreaterThan(-1)
    expect(fallbackIdx).toBeGreaterThan(scopeIdx)
    // Räkna klammerdjupet mellan de två för att bevisa fallbacken INTE är
    // nästlad inuti booking_reminder-blocket: fram till fallbackIdx ska
    // öppna/stängda klamrar vara i balans igen (dvs. booking_reminder-blocket
    // redan stängt).
    const between = fnSlice.slice(scopeIdx, fallbackIdx)
    const opens = (between.match(/\{/g) || []).length
    const closes = (between.match(/\}/g) || []).length
    expect(opens).toBe(closes)
  })

  test('evaluateThresholds laddar mandat-cachen EN gång per företag och delar den till varje kandidat', () => {
    expect(src).toContain('const mandateCache = await loadMandateResolutionCache(supabase, businessId)')
    expect(src).toMatch(/executeRule\(supabase, rule\.id, \{[\s\S]{0,200}\}, mandateCache\)/)
  })

  test('executeCronRules (cron-triggade regler) skickar INTE en mandat-cache — booking_reminder är bara nåbart via threshold-regler', () => {
    // Den andra `executeRule(supabase, rule.id, {`-anropsplatsen (i
    // executeCronRules) ska förbli oförändrad: trigger/schedule-objektet,
    // inget 4:e argument.
    expect(src).toMatch(/executeRule\(supabase, rule\.id, \{\s*trigger: 'cron',\s*schedule,\s*\}\)/)
  })

  test('refererar aldrig den förbjudna exekveringsspegeln', () => {
    expect(src).not.toContain('executeApprovalPayloadInternal')
  })
})
