/**
 * Facit för tyst tid på push (2026-09-02): lib/notifications/tyst-tid.ts,
 * push-held.ts, inkopplingen i sendApprovalPush och /api/cron/push-morgon.
 *
 * Låser:
 *  - fönstret 21:00–07:00 räknas i svensk tid (sommar OCH vinter), aldrig UTC
 *  - beslut hålls aldrig; hant/teamuppdatering hålls bara under tyst tid
 *  - en hållen notis skickas som den är, flera blir en sammanfattning;
 *    gemensam länk bara om alla pekar på samma sida; gamla rader utgår
 *  - sendApprovalPush: hållningen sker EFTER dedupe och FÖRE fetch,
 *    och är fail-open (misslyckad hållning → skicka direkt)
 *  - cronen: cron-hemlighet, hoppar över under tyst tid, bokför i
 *    push_dispatch_log; schemalagd två gånger (CEST/CET); migration v194
 *    finns med partiellt unikt index; SMS-grinden delar samma klocka
 *
 * Körs: npx playwright test tests/push-tyst-tid.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  arTystTid,
  byggMorgonsammanfattning,
  delaUppHallna,
  grupperaPerMottagare,
  HALLEN_MAX_ALDER_TIMMAR,
  HALLS_UNDER_TYST_TID,
  MORGON_TAG,
  skaHallasUnderTystTid,
  TYST_TID,
  type HallenPush,
} from '../lib/notifications/tyst-tid'
import { isWithinQuietHours, stockholmMinutesNow } from '../lib/tysta-timmar'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

test.describe('fönstret i svensk tid', () => {
  test('21:00–07:00 svensk tid, sommartid (UTC+2)', () => {
    expect(TYST_TID).toEqual({ start: '21:00', end: '07:00' })
    expect(arTystTid(new Date('2026-09-01T18:59:00Z'))).toBe(false) // 20:59 CEST
    expect(arTystTid(new Date('2026-09-01T19:00:00Z'))).toBe(true)  // 21:00 CEST
    expect(arTystTid(new Date('2026-09-02T04:59:00Z'))).toBe(true)  // 06:59 CEST
    expect(arTystTid(new Date('2026-09-02T05:00:00Z'))).toBe(false) // 07:00 CEST
  })

  test('vintertid (UTC+1) — samma svenska klockslag, andra UTC-timmar', () => {
    expect(arTystTid(new Date('2026-01-15T19:30:00Z'))).toBe(false) // 20:30 CET
    expect(arTystTid(new Date('2026-01-15T20:00:00Z'))).toBe(true)  // 21:00 CET
    expect(arTystTid(new Date('2026-01-16T05:59:00Z'))).toBe(true)  // 06:59 CET
    expect(arTystTid(new Date('2026-01-16T06:00:00Z'))).toBe(false) // 07:00 CET
  })

  test('cronens två körningar: en träffar 07:10 svensk tid oavsett årstid, den andra hoppar', () => {
    // Sommar: 05:10 UTC = 07:10 CEST (släpper), 06:10 UTC = 08:10 (inget kvar)
    expect(arTystTid(new Date('2026-09-02T05:10:00Z'))).toBe(false)
    // Vinter: 05:10 UTC = 06:10 CET (tyst → hoppar), 06:10 UTC = 07:10 CET (släpper)
    expect(arTystTid(new Date('2026-01-16T05:10:00Z'))).toBe(true)
    expect(arTystTid(new Date('2026-01-16T06:10:00Z'))).toBe(false)
  })

  test('den delade klockan: stockholmMinutesNow och isWithinQuietHours', () => {
    expect(stockholmMinutesNow(new Date('2026-09-01T19:05:00Z'))).toBe(21 * 60 + 5)
    expect(stockholmMinutesNow(new Date('2026-01-15T19:05:00Z'))).toBe(20 * 60 + 5)
    expect(isWithinQuietHours('21:00', '07:00', 3 * 60)).toBe(true)
    expect(isWithinQuietHours('21:00', '07:00', 12 * 60)).toBe(false)
  })
})

test.describe('vad som hålls', () => {
  test('beslut hålls aldrig; hant och teamuppdatering hålls bara under tyst tid', () => {
    expect(HALLS_UNDER_TYST_TID).toEqual({ beslut: false, hant: true, teamuppdatering: true })
    const natt = new Date('2026-09-01T21:00:00Z') // 23:00 CEST
    const dag = new Date('2026-09-01T10:00:00Z')  // 12:00 CEST
    expect(skaHallasUnderTystTid('beslut', natt)).toBe(false)
    expect(skaHallasUnderTystTid('hant', natt)).toBe(true)
    expect(skaHallasUnderTystTid('teamuppdatering', natt)).toBe(true)
    expect(skaHallasUnderTystTid('hant', dag)).toBe(false)
    expect(skaHallasUnderTystTid('teamuppdatering', dag)).toBe(false)
  })
})

function rad(over: Partial<HallenPush> & { id: string }): HallenPush {
  return {
    business_id: 'biz_a',
    target_user_id: null,
    approval_type: 'agent_insight',
    push_class: 'teamuppdatering',
    dedupe_key: `agent_insight|text:${over.id}|alla`,
    title: `Rubrik ${over.id}`,
    body: `Text ${over.id}`,
    url: '/dashboard/insights',
    created_at: '2026-09-01T22:00:00Z',
    ...over,
  }
}

test.describe('morgonsammanfattningen', () => {
  test('en hållen notis skickas som den är — bara försenad', () => {
    const s = byggMorgonsammanfattning([rad({ id: '1', title: '✓ Anna signerade offert', body: '12 000 kr — projektet är skapat', url: '/projects/p1' })])!
    expect(s).toEqual({ title: '✓ Anna signerade offert', body: '12 000 kr — projektet är skapat', url: '/projects/p1', tag: MORGON_TAG, antal: 1 })
  })

  test('flera blir en räknad sammanfattning i tidsordning, max tre rubriker, "+N till"', () => {
    const s = byggMorgonsammanfattning([
      rad({ id: 'c', title: 'Tredje', created_at: '2026-09-01T23:00:00Z', url: '/x' }),
      rad({ id: 'a', title: '✓ Första', created_at: '2026-09-01T21:30:00Z', url: '/y' }),
      rad({ id: 'b', title: 'Andra', created_at: '2026-09-01T22:00:00Z', url: '/x' }),
      rad({ id: 'd', title: 'Fjärde', created_at: '2026-09-02T01:00:00Z', url: '/x' }),
    ])!
    expect(s.title).toBe('4 saker hände medan du var borta')
    expect(s.body).toBe('Första · Andra · Tredje · +1 till')
    expect(s.url).toBe('/dashboard') // olika sidor → startsidan
    expect(s.antal).toBe(4)
  })

  test('gemensam länk när alla pekar på samma sida; tom lista ger null', () => {
    const s = byggMorgonsammanfattning([rad({ id: '1', url: '/approvals?filter=meeting_summary' }), rad({ id: '2', url: '/approvals?filter=meeting_summary' })])!
    expect(s.url).toBe('/approvals?filter=meeting_summary')
    expect(byggMorgonsammanfattning([])).toBeNull()
  })

  test('grupperas per företag och riktad mottagare — en riktad notis blandas aldrig in i företagsblasten', () => {
    const g = grupperaPerMottagare([
      rad({ id: '1' }),
      rad({ id: '2', target_user_id: 'u1' }),
      rad({ id: '3', business_id: 'biz_b' }),
      rad({ id: '4', target_user_id: 'u1' }),
    ])
    expect(Array.from(g.keys()).sort()).toEqual(['biz_a|', 'biz_a|u1', 'biz_b|'])
    expect(g.get('biz_a|u1')!.map(r => r.id)).toEqual(['2', '4'])
  })

  test('rader äldre än gränsen utgår i stället för att skickas i efterhand', () => {
    const now = new Date('2026-09-03T05:10:00Z')
    const gammal = new Date(now.getTime() - (HALLEN_MAX_ALDER_TIMMAR + 1) * 3600 * 1000).toISOString()
    const { skicka, utgangna } = delaUppHallna([rad({ id: 'ny', created_at: '2026-09-02T22:00:00Z' }), rad({ id: 'gammal', created_at: gammal })], now)
    expect(skicka.map(r => r.id)).toEqual(['ny'])
    expect(utgangna.map(r => r.id)).toEqual(['gammal'])
  })
})

test.describe('inkoppling', () => {
  test('sendApprovalPush håller efter dedupe, före fetch, och skickar direkt om hållningen misslyckas', () => {
    const src = read('lib/notifications/approval-push.ts')
    const dedupe = src.indexOf('await nyligenSkickad(')
    const hall = src.indexOf('skaHallasUnderTystTid(policy.klass)')
    const fetchIdx = src.indexOf('fetch(`${appUrl}/api/push/send`')
    expect(dedupe).toBeGreaterThan(0)
    expect(hall).toBeGreaterThan(dedupe)
    expect(fetchIdx).toBeGreaterThan(hall)
    expect(src).toContain("if (utfall !== 'misslyckades') {")
    expect(src).toMatch(/await hallPush\(supabase, \{[\s\S]*?dedupe_key: dedupeKey,[\s\S]*?title: template\.title/)
  })

  test('push-held är fail-open och idempotent (23505 = redan hållen)', () => {
    const src = read('lib/notifications/push-held.ts')
    expect(src).toContain("if (error.code === '23505') return 'dubblett'")
    expect(src).toContain("if (arSchemaSaknas(error)) varnaSchema()")
    expect(src).toContain("return 'misslyckades'")
    expect(src).toContain(".is('released_at', null)")
  })

  test('cronen: cron-hemlighet, hoppar under tyst tid, släpper per mottagare, bokför i dispatch-loggen', () => {
    const src = read('app/api/cron/push-morgon/route.ts')
    expect(src).toContain("from '@/lib/cron/verify-secret'")
    expect(src).toContain('verifyCronSecret(request)')
    expect(src).toContain("export const dynamic = 'force-dynamic'")
    expect(src).toContain("if (!force && arTystTid(now)) {")
    expect(src).toContain("skipped: 'tyst_tid'")
    expect(src).toContain('grupperaPerMottagare(skicka)')
    expect(src).toContain('byggMorgonsammanfattning(grupp)')
    expect(src).toContain('await bokforPush(supabase, {')
    expect(src).toContain("markeraSlappta(supabase, utgangna.map(r => r.id), 'utgangen'")
    // force bara för admin, aldrig från schemat
    expect(src).toContain("const force = admin && request.nextUrl.searchParams.get('force') === '1'")
  })

  test('schemalagd 05:10 och 06:10 UTC så 07:10 svensk tid träffas både sommar och vinter', () => {
    const crons = (JSON.parse(read('vercel.json')) as { crons: Array<{ path: string; schedule: string }> }).crons
    const morgon = crons.filter(c => c.path === '/api/cron/push-morgon').map(c => c.schedule).sort()
    expect(morgon).toEqual(['10 5 * * *', '10 6 * * *'])
  })

  test('migration v194: push_held med partiellt unikt index, RLS och revoke', () => {
    const sql = read('sql/v194_push_held.sql')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.push_held')
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS push_held_open_dedupe_idx[\s\S]*?WHERE released_at IS NULL/)
    expect(sql).toContain('ALTER TABLE public.push_held ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('REVOKE ALL ON public.push_held FROM anon, authenticated, PUBLIC')
    expect(sql).toContain("'skickad', 'utgangen', 'ingen_mottagare', 'misslyckad'")
  })

  test('SMS-grinden och push-pausen delar samma svenska klocka', () => {
    expect(read('lib/outbound/hub-gate.ts')).toContain("from '@/lib/tysta-timmar'")
    expect(read('lib/notifications/tyst-tid.ts')).toContain("from '@/lib/tysta-timmar'")
    expect(read('lib/tysta-timmar.ts')).toContain("timeZone: 'Europe/Stockholm'")
  })
})
