/**
 * FACIT — lib/agents/hanna-outbound.ts (Etapp J, missions-medveten cron,
 * Goal-to-Plan V2, tasks/jaunty-pondering-hummingbird.md).
 *
 * runHannaOutbound är en cron-loop mot en riktig Supabase-klient — samma
 * begränsning som tests/kapacitet-fyllnad.spec.ts dokumenterar för
 * lib/agents/hanna/capacity-fill.ts: den testas INTE med en mockad DB-klient
 * här. Den rena besluts-/urvalslogiken (budget, segmentfilter, dedup) är
 * redan fullständigt facit-testad i tests/mission-outreach.spec.ts.
 *
 * Den här filen låser i stället, med källskanning (samma idiom som
 * tests/mission-tools.spec.ts), de invarianter som INTE kan läcka igenom en
 * refaktorering utan att synas i diffen:
 *   - de befintliga skyddsnivåerna (DRIP_PER_DAY/DEDUP_DAYS/CANDIDATE_POOL,
 *     frekvensvakten, godkännandegrinden) är TALVÄRDEN och ANROP som inte
 *     får ändras i styrka
 *   - mission-kandidater stämplas med payload.mission_id + payload.truth_class
 *   - missionslöst beteende är strukturellt no-op (mission-sektionen är
 *     villkorad, det vanliga flödets fallback-uttryck reducerar exakt till
 *     det gamla uttrycket när inget uppdrag hittas)
 *
 * Körs: npx playwright test tests/hanna-outbound.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { runHannaOutbound, type HannaRunResult } from '../lib/agents/hanna-outbound'

const SRC = fs.readFileSync(
  path.join(__dirname, '..', 'lib', 'agents', 'hanna-outbound.ts'),
  'utf8',
)

test.describe('hanna-outbound.ts — de befintliga skyddsnivåerna är oförändrade i styrka', () => {
  test('DRIP_PER_DAY är fortfarande 5', () => {
    expect(SRC).toMatch(/const DRIP_PER_DAY = 5\b/)
  })

  test('DEDUP_DAYS är fortfarande 90', () => {
    expect(SRC).toMatch(/const DEDUP_DAYS = 90\b/)
  })

  test('CANDIDATE_POOL är fortfarande 40', () => {
    expect(SRC).toMatch(/const CANDIDATE_POOL = 40\b/)
  })

  test('frekvensvakten (canContactCustomer) anropas från EN gemensam plats — inte duplicerad, inte borttagen', () => {
    const hits = SRC.match(/canContactCustomer\(supabase, businessId, customer\.customer_id\)/g) || []
    expect(hits.length).toBe(1)
  })

  test('godkännandegrinden är orörd: varje kort skapas som status "pending" (aldrig auto-godkänt)', () => {
    expect(SRC).toContain(`status: 'pending'`)
    expect(SRC).not.toContain(`status: 'approved'`)
    expect(SRC).not.toContain(`status: 'auto_approved'`)
  })

  test('kortets approval_type och risknivå är oförändrade', () => {
    expect(SRC).toContain(`approval_type: 'proactive_care'`)
    expect(SRC).toContain(`risk_level: 'low'`)
  })

  test('kortet skickar aldrig SMS direkt — bara ett suggested_sms-fält i payload (agenten skapar bara FÖRSLAG)', () => {
    expect(SRC).not.toMatch(/sendSmsViaElks|sendSms\(/)
    expect(SRC).toContain('suggested_sms')
  })
})

test.describe('hanna-outbound.ts — Etapp J: mission-stämpling', () => {
  test('mission-kandidaters kort får payload.mission_id + payload.truth_class', () => {
    expect(SRC).toContain('payload.mission_id = missionStamp.mission_id')
    expect(SRC).toContain(`payload.truth_class = missionStamp.truth_class`)
  })

  test('stämplingen är alltid ateraktivering — matchar mission-progress.ts:s attributionsregel för Hannas kort', () => {
    expect(SRC).toContain(`truth_class: 'ateraktivering'`)
  })

  test('HannaRunResult exponerar mission_proposed', () => {
    expect(SRC).toMatch(/mission_proposed:\s*number/)
  })

  test('mission-inläsningen är fail-soft: try/catch runt mission-tabellsuppslaget, faller tillbaka till null', () => {
    // loadActiveContactMission-funktionskroppen: try { ... } catch { ... return null }
    const fnMatch = SRC.match(/async function loadActiveContactMission[\s\S]*?\n}\n/)
    expect(fnMatch, 'loadActiveContactMission hittades inte').not.toBeNull()
    const fn = fnMatch![0]
    expect(fn).toContain('try {')
    expect(fn).toContain('catch (err: unknown)')
    // Både den tidiga "hittade inget/fel uppdrag"-grenen och catch-grenen
    // svarar null — aldrig ett kastat fel som skulle fälla cronen.
    expect((fn.match(/return null/g) || []).length).toBeGreaterThanOrEqual(3)
  })

  test('mission-sektionen är villkorad (if (activeContactMission)) — strukturellt no-op utan aktivt uppdrag', () => {
    expect(SRC).toContain('if (activeContactMission) {')
  })

  test('utan mission-kandidater reducerar batch-uttrycket till exakt det gamla DRIP_PER_DAY-uttrycket (missionProposed=0 ⇒ regularPool=fresh)', () => {
    expect(SRC).toContain('const regularPool = fresh.filter(c => !missionConsideredIds.has(String(c.customer_id)))')
    expect(SRC).toContain('const batch = regularPool.slice(0, Math.max(0, DRIP_PER_DAY - missionProposed))')
  })
})

test.describe('hanna-outbound.ts — exporterad typform', () => {
  test('runHannaOutbound är fortfarande en (supabase, businessId) → Promise<HannaRunResult>-funktion', () => {
    expect(typeof runHannaOutbound).toBe('function')
    expect(runHannaOutbound.length).toBe(2)
  })

  test('HannaRunResult-formen (kompilatorbevis): alla fyra ursprungsfälten + mission_proposed', () => {
    const shape: HannaRunResult = {
      business_id: 'biz_1',
      proposed: 0,
      historyless: 0,
      skipped_recent: 0,
      mission_proposed: 0,
    }
    expect(shape.mission_proposed).toBe(0)
  })
})
