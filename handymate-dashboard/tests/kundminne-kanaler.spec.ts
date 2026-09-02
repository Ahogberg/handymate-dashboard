/**
 * Facit för kundminnet över kanaler, pass 1 (2026-09-02).
 *
 * Bakgrund: docs/audits/KUNDMINNE_REVISION_2026-09-02.md +
 * tasks/plan-kundminne-pass1.md. Låser gap 1, 2, 3, 4, 5, 8 och 9 —
 * rena matchnings-/läsfixar utan ny modell, ingen migration.
 * Browserlös källskanning, samma mönster som tests/customer-context-trail.spec.ts.
 *
 *   npx playwright test tests/kundminne-kanaler.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

const TIMELINE = 'app/api/customers/[id]/timeline/route.ts'
const TRAIL = 'lib/compliance/communication-trail.ts'
const RESOLVER = 'lib/matte/resolver.ts'
const SMS_INCOMING = 'app/api/sms/incoming/route.ts'
const OWNER_SENDER = 'lib/matte/owner-sender.ts'

test.describe('gap 1 — SMS-historik matchas per kund, inte per telefonsträng', () => {
  for (const file of [TIMELINE, TRAIL]) {
    test(`${file} slår upp SMS via phoneCandidates + .in('phone_number'`, () => {
      const s = read(file)
      expect(s, `${file} importerar inte phoneCandidates`).toContain('phoneCandidates(')
      expect(s, `${file} saknar .in('phone_number', …) på SMS-uppslaget`).toContain(".in('phone_number'")
      expect(s, `${file} har kvar den råa .eq('phone_number', customerPhone)-matchningen`)
        .not.toContain(".eq('phone_number', customerPhone)")
      expect(s, `${file} har kvar den råa .eq('phone_number', customer.phone_number)-matchningen`)
        .not.toContain(".eq('phone_number', customer.phone_number)")
    })
  }
})

test.describe('gap 2 — Mattes resolver normaliserar telefonnumret vid kundmatchning', () => {
  test('resolvern importerar och använder findCustomerByPhone', () => {
    const s = read(RESOLVER)
    expect(s).toContain("from '@/lib/voice/find-customer-by-phone'")
    expect(s).toContain('findCustomerByPhone(')
  })

  test('lead-uppslaget vid okänd kund använder samma kandidatlogik via .in()', () => {
    const s = read(RESOLVER)
    const i = s.indexOf("from('leads')")
    expect(i, 'lead-uppslaget i telefongrenen hittades inte').toBeGreaterThan(-1)
    const gren = s.slice(i, i + 300)
    expect(gren).toContain(".in('phone', leadCandidates)")
  })
})

test.describe('gap 3 — resolvern läser samtalstranskript', () => {
  test("kanal-unionen innehåller 'call'", () => {
    const s = read(RESOLVER)
    expect(s).toContain("'sms' | 'email' | 'portal' | 'call'")
  })

  test('call_recording frågas i Promise.all-uppslaget, max fem, bara sammanfattade samtal', () => {
    const s = read(RESOLVER)
    const i = s.indexOf(".from('call_recording')")
    expect(i, 'call_recording-frågan saknas i resolvern').toBeGreaterThan(-1)
    const gren = s.slice(i, i + 500)
    expect(gren).toContain("eq('business_id', businessId)")
    expect(gren).toContain("eq('customer_id', customerId)")
    expect(gren).toContain(".not('transcript_summary', 'is', null)")
    expect(gren).toContain('.limit(5)')
  })

  test('samtalshistoriken mappas in i conversationHistory med channel call', () => {
    const s = read(RESOLVER)
    expect(s).toContain("channel: 'call' as const")
  })

  test('fail-soft: fel på samtalsfrågan loggas, kraschar aldrig resolvern', () => {
    const s = read(RESOLVER)
    const i = s.indexOf('samtalshistorik kunde inte hämtas')
    expect(i, 'ingen fail-soft-logg för samtalsuppslaget').toBeGreaterThan(-1)
    expect(s.slice(Math.max(0, i - 200), i + 50)).toContain('console.warn')
  })

  test('intent-agentens historikrendering är generisk — visar valfri kanal, inte bara sms/email', () => {
    const s = read('lib/matte/intent-agent.ts')
    const i = s.indexOf('KONVERSATIONSHISTORIK')
    expect(i).toBeGreaterThan(-1)
    const gren = s.slice(i, i + 800)
    expect(gren, 'historikraden switchar på kanal i stället för att rendera m.channel generiskt').toContain('${m.channel}')
  })
})

test.describe('gap 4 — ägaren skiljs från kunden på inkommande SMS', () => {
  test('owner-sender.ts: phoneCandidates, aktiva teammedlemmar, fail-closed = kund', () => {
    const s = read(OWNER_SENDER)
    expect(s).toContain('phoneCandidates(')
    expect(s).toContain("eq('is_active', true)")
    expect(s).toContain("from('business_users')")
    // Fail-closed: både felgrenen och kastgrenen returnerar false.
    const felGren = s.slice(s.indexOf('if (error)'), s.indexOf('if (error)') + 150)
    expect(felGren).toContain('return false')
    const kastGren = s.slice(s.indexOf('} catch (err)'))
    expect(kastGren).toContain('return false')
  })

  test('sms/incoming importerar isTeamPhone och anropar den FÖRE resolveEntity', () => {
    const s = read(SMS_INCOMING)
    expect(s).toContain("from '@/lib/matte/owner-sender'")
    const gateCall = s.indexOf('isTeamPhone(')
    const resolveCall = s.indexOf('resolveEntity(')
    expect(gateCall, 'isTeamPhone anropas inte').toBeGreaterThan(-1)
    expect(resolveCall, 'resolveEntity anropas inte').toBeGreaterThan(-1)
    expect(gateCall).toBeLessThan(resolveCall)
  })

  test('ägargrinden hoppar hela kundflödet och skriver inte till sms_conversation som kund', () => {
    const s = read(SMS_INCOMING)
    const gateStart = s.indexOf('if (await isTeamPhone(')
    expect(gateStart).toBeGreaterThan(-1)
    const smsConversationInsert = s.indexOf(".from('sms_conversation')\n      .insert(")
    // Ägargrinden måste ligga FÖRE den kundriktade sms_conversation-inserten.
    expect(smsConversationInsert, 'sms_conversation-inserten hittades inte').toBeGreaterThan(-1)
    expect(gateStart).toBeLessThan(smsConversationInsert)
    // STOPP/START ska fortfarande köras FÖRE ägargrinden.
    const stoppGren = s.indexOf('isStopCommand || isStartCommand')
    expect(stoppGren).toBeGreaterThan(-1)
    expect(stoppGren).toBeLessThan(gateStart)
  })
})

test.describe('gap 5 — kundens egna ord från webb/lead syns', () => {
  test('tidslinjens lead-sektion selectar notes', () => {
    const s = read(TIMELINE)
    const i = s.indexOf("from('leads')")
    expect(i).toBeGreaterThan(-1)
    const gren = s.slice(i, i + 300)
    expect(gren).toContain('notes')
  })

  test('trailen har leads som källa med channel form', () => {
    const s = read(TRAIL)
    expect(s).toContain("from('leads')")
    expect(s).toContain("channel: 'form'")
  })
})

test.describe('gap 8 — kundfakta i compliance-trailen', () => {
  test('customer_fact är en källa i trailen, superseded_by filtrerat, channel note', () => {
    const s = read(TRAIL)
    const i = s.indexOf("from('customer_fact')")
    expect(i, 'customer_fact-källan saknas i trailen').toBeGreaterThan(-1)
    const gren = s.slice(i, i + 400)
    expect(gren).toContain("eq('business_id', businessId)")
    expect(gren).toContain("eq('customer_id', customerId)")
    expect(gren).toContain(".is('superseded_by', null)")
    expect(s).toContain("channel: 'note'")
  })

  test('get_communication_trail-verktyget läser trailen generiskt (inga kanalspecifika typfel)', () => {
    const s = read('app/api/agent/trigger/tool-router.ts')
    const i = s.indexOf("case 'get_communication_trail':")
    expect(i).toBeGreaterThan(-1)
    const gren = s.slice(i, i + 1200)
    expect(gren).toContain('e.channel')
  })
})

test.describe('gap 9 — död röstparser borttagen', () => {
  test('app/api/voice/process/route.ts finns inte längre', () => {
    expect(fs.existsSync(path.join(ROOT, 'app/api/voice/process/route.ts'))).toBe(false)
  })

  test('ingen callsite mot voice/process kvar i app/lib/components', () => {
    const träffar: string[] = []
    const gå = (dir: string) => {
      let poster: fs.Dirent[]
      try {
        poster = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })
      } catch {
        return
      }
      for (const f of poster) {
        const rel = `${dir}/${f.name}`
        if (f.isDirectory()) {
          if (f.name === 'node_modules' || f.name === '.next') continue
          gå(rel)
        } else if (/\.tsx?$/.test(f.name)) {
          if (read(rel).includes('voice/process')) träffar.push(rel)
        }
      }
    }
    for (const rot of ['app', 'lib', 'components']) gå(rot)
    expect(träffar).toEqual([])
  })
})
