/**
 * Facit för lib/notifications/push-policy.ts + push-dispatch-log.ts och
 * inkopplingen i sendApprovalPush / /api/push/send / expo-push (2026-09-01).
 *
 * Låser:
 *  - klassningen per typ och klassernas TTL/prioritet/dedupefönster
 *  - dedupe-nyckeln: stabil, objekt före datum, mottagare med
 *  - TTL/prioritet klampas till giltigt spann
 *  - sendApprovalPush: dedupe FÖRE sändning, ttl_seconds + priority i
 *    bodyn, bokföring EFTER; push/send skickar TTL/urgency till web-push
 *    och ttl/priority till Expo; dedupe är fail-open
 *
 * Körs: npx playwright test tests/push-policy.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  byggDedupeNyckel,
  klassificeraPush,
  normaliseraPrioritet,
  normaliseraTtl,
  PUSH_KLASS_PER_TYP,
  PUSH_POLICY,
  PUSH_TTL_MAX_SECONDS,
  PUSH_TTL_MIN_SECONDS,
} from '../lib/notifications/push-policy'
import { buildPushTemplate } from '../lib/notifications/approval-push'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

test.describe('klasser', () => {
  test('beslut lever längst och har hög prioritet; teamuppdatering kortast och normal', () => {
    expect(PUSH_POLICY.beslut).toMatchObject({ ttlSeconds: 24 * 3600, priority: 'high', dedupeWindowSeconds: 24 * 3600 })
    expect(PUSH_POLICY.hant).toMatchObject({ ttlSeconds: 12 * 3600, priority: 'high' })
    expect(PUSH_POLICY.teamuppdatering).toMatchObject({ ttlSeconds: 6 * 3600, priority: 'normal', dedupeWindowSeconds: 12 * 3600 })
  })

  test('beslutstyper är beslut, verifierade utfall är hant, brief/insikt är teamuppdatering', () => {
    expect(klassificeraPush('four_eyes_quote').klass).toBe('beslut')
    expect(klassificeraPush('review_request').klass).toBe('beslut')
    expect(klassificeraPush('ata_signed_notification').klass).toBe('hant')
    expect(klassificeraPush('quote_signed').klass).toBe('hant')
    expect(klassificeraPush('payment_failed_signal').klass).toBe('hant')
    expect(klassificeraPush('monday_brief').klass).toBe('teamuppdatering')
    expect(klassificeraPush('agent_insight').klass).toBe('teamuppdatering')
  })

  test('okänd typ faller till beslut (aldrig tappa ett beslut)', () => {
    expect(klassificeraPush('nagot_nytt').klass).toBe('beslut')
  })

  test('varje typ med push-mall har en klass', () => {
    // Typerna som buildPushTemplate känner igen — hämtas ur källan så listan
    // inte kan glida isär från mallarna.
    const src = read('lib/notifications/approval-push.ts')
    const mallTyper = Array.from(src.matchAll(/^\s+case '([a-z_]+)': \{/gm)).map(m => m[1])
    expect(mallTyper.length).toBeGreaterThanOrEqual(10)
    for (const typ of mallTyper) {
      expect(buildPushTemplate(typ, {}), `${typ} har ingen mall`).not.toBeNull()
      expect(PUSH_KLASS_PER_TYP[typ], `${typ} saknar push-klass`).toBeTruthy()
    }
  })
})

test.describe('dedupe-nyckel', () => {
  test('objekt-id vinner över datum, mottagaren ingår', () => {
    const k = byggDedupeNyckel('four_eyes_quote', { quote_id: 'q_1', customer_name: 'Anna' }, 'user-1', '2026-09-01T10:00:00Z')
    expect(k).toBe('four_eyes_quote|quote_id:q_1|user-1')
  })

  test('utan mottagare = alla; utan objekt = dagens datum', () => {
    expect(byggDedupeNyckel('monday_brief', {}, null, '2026-09-01T10:00:00Z')).toBe('monday_brief|dag:2026-09-01|alla')
    expect(byggDedupeNyckel('monday_brief', null, undefined, '2026-09-02T10:00:00Z')).toBe('monday_brief|dag:2026-09-02|alla')
  })

  test('approval_id prioriteras före quote_id; osäkra id:n ignoreras', () => {
    expect(byggDedupeNyckel('x', { approval_id: 'appr_1', quote_id: 'q_1' })).toContain('|approval_id:appr_1|')
    expect(byggDedupeNyckel('x', { quote_id: 'bad id with spaces' }, null, '2026-09-01T10:00:00Z')).toBe('x|dag:2026-09-01|alla')
  })

  test('utan id men med text: hash av titel+observation — olika insikter samma dag hålls isär', () => {
    const a = byggDedupeNyckel('agent_insight', { agent_id: 'karin', title: 'Faktura 12 förfaller', observation: 'x' }, null, '2026-09-01T10:00:00Z')
    const b = byggDedupeNyckel('agent_insight', { agent_id: 'karin', title: 'Offert 7 obesvarad', observation: 'y' }, null, '2026-09-01T10:00:00Z')
    const a2 = byggDedupeNyckel('agent_insight', { agent_id: 'hanna', title: 'Faktura 12 förfaller', observation: 'x' }, null, '2026-09-02T10:00:00Z')
    expect(a).not.toBe(b)
    expect(a).toBe(a2) // samma text → samma nyckel, oavsett dag och agent
    expect(a).toMatch(/^agent_insight\|text:[0-9a-f]{16}\|alla$/)
  })

  test('samma indata → samma nyckel (stabil)', () => {
    const a = byggDedupeNyckel('ata_signed_notification', { project_id: 'p1', change_id: 'c1' }, 'u')
    const b = byggDedupeNyckel('ata_signed_notification', { change_id: 'c1', project_id: 'p1' }, 'u')
    expect(a).toBe(b)
    expect(a).toBe('ata_signed_notification|change_id:c1|u')
  })
})

test.describe('normalisering av inkommande värden', () => {
  test('TTL klampas till [60 s, 7 dygn], ogiltigt → fallback', () => {
    expect(PUSH_TTL_MIN_SECONDS).toBe(60)
    expect(PUSH_TTL_MAX_SECONDS).toBe(7 * 24 * 3600)
    expect(normaliseraTtl(10, 999)).toBe(60)
    expect(normaliseraTtl(10 ** 9, 999)).toBe(PUSH_TTL_MAX_SECONDS)
    expect(normaliseraTtl('3600', 999)).toBe(3600)
    expect(normaliseraTtl('nej', 999)).toBe(999)
    expect(normaliseraTtl(undefined, 999)).toBe(999)
  })

  test('prioritet är high|normal, annars fallback', () => {
    expect(normaliseraPrioritet('high', 'normal')).toBe('high')
    expect(normaliseraPrioritet('urgent', 'normal')).toBe('normal')
    expect(normaliseraPrioritet(undefined, 'high')).toBe('high')
  })
})

test.describe('källskanning — inkopplingen', () => {
  test('sendApprovalPush: dedupe före fetch, ttl/prioritet i body, bokföring efter', () => {
    const src = read('lib/notifications/approval-push.ts')
    const dedupe = src.indexOf('await nyligenSkickad(')
    const send = src.indexOf('`${appUrl}/api/push/send`')
    const bokfor = src.indexOf('await bokforPush(')
    expect(dedupe).toBeGreaterThan(0)
    expect(send).toBeGreaterThan(dedupe)
    expect(bokfor).toBeGreaterThan(send)
    expect(src).toContain('ttl_seconds: policy.ttlSeconds')
    expect(src).toContain('priority: policy.priority')
    // Leveransutfallet läses ur svaret — inte antaget.
    expect(src).toContain("delivered = data.delivered === true")
    // "Ingen mottagare" bokförs inte — annars blockeras dagens första riktiga push
    // för den som registrerar sin telefon senare samma dag.
    expect(src).toContain("data.reason === 'no_recipients' || data.reason === 'no_matching_token'")
    expect(src).toMatch(/if \(ingenMottagare\) return\s*\n\s*await bokforPush\(/)
  })

  test('agent-observationens kort-id skickas med som dedupe-objekt', () => {
    // Sedan Pass A/B (2026-09-04) skapar save-and-push kortet via skapaKort,
    // som gör insert + push i ett. Invarianten är densamma: det INSATTA
    // kortets id är dedupe-objektet — aldrig null, aldrig ett gissat värde.
    const src = read('lib/agents/shared/save-and-push.ts')
    expect(src).toMatch(/await skapaKort\(supabase, \{[\s\S]*?approval_type: approvalType/)
    const kort = read('lib/approvals/skapa-kort.ts')
    expect(kort).toMatch(/const id = data\.id as string[\s\S]*?sendApprovalPush\(\{\s*\n\s*id,/)
  })

  test('/api/push/send skickar TTL + urgency till web-push och ttl/priority till Expo', () => {
    const route = read('app/api/push/send/route.ts')
    expect(route).toContain('{ TTL: ttlSeconds, urgency:')
    expect(route).toContain('normaliseraTtl(ttl_seconds')
    expect(route).toContain('normaliseraPrioritet(priority')
    expect(route).toMatch(/sendExpoPushNotification\([\s\S]*ttlSeconds,[\s\S]*priority: pushPriority/)
    const expo = read('lib/notifications/expo-push.ts')
    expect(expo).toContain('ttl: options.ttlSeconds')
    expect(expo).toContain('priority: options.priority')
  })

  test('push-dispatch-log är fail-open och tål saknad tabell', () => {
    const src = read('lib/notifications/push-dispatch-log.ts')
    expect(src).toContain('arSchemaSaknas(error)')
    expect(src).toMatch(/if \(error\) \{[\s\S]*return false/)
    expect(src).toMatch(/catch \(err\) \{[\s\S]*return false/)
  })

  test('sql/v191 har dedupe-index på (business_id, dedupe_key, sent_at)', () => {
    const sql = read('sql/v191_platform_health_and_push_dispatch.sql')
    expect(sql).toMatch(/ON public\.push_dispatch_log \(business_id, dedupe_key, sent_at DESC\)/)
  })
})
