/**
 * Facit för röstvägarnas säkerhetsgränser (kartläggning 2026-08-08, förarbete
 * till Epic 6 i Codex orkestreringsaudit).
 *
 * Kartläggningen av telefoni-/röstkedjan hittade sex hål, alla verifierade i
 * koden innan de lagades. De hänger ihop: 46elks-webhookarna matar en kedja
 * recording → transcribe → LISA-AGENTKÖRNING, så varje overifierat steg är en
 * ingång till en främmande tenants agent.
 *
 *   1. voice/missed exporterade GET vid sidan av POST, men signaturkontrollen
 *      låg inuti `if (method === 'POST')`. business_id och from lästes ur
 *      query-strängen → en förfalskad GET kunde skicka catch-SMS till valfritt
 *      nummer på valfritt företags räkning.
 *   2. voice/transcribe hade INGEN auth alls — bara ett recording_id — och
 *      startar en Lisa-körning.
 *   3. voice/analyze hade auth men jämförde aldrig inspelningens business_id
 *      med den inloggades.
 *   4. voice/recording saknade signaturverifiering helt och härledde tenant
 *      ur den overifierade payloaden.
 *   5. voice/execute skickade SMS direkt mot api.46elks.com och förbigick
 *      opt-out-spärren, E.164-normaliseringen och sms_log.
 *   6. sms/incoming-fallbacken slog upp kund på telefonnummer UTAN
 *      business-filter och tog första träffen.
 *
 *   npx playwright test tests/voice-boundaries.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

/**
 * Ordningsfacit måste mäta på KODEN. Kommentarerna beskriver ofta just det
 * fynd som lagades ("kunde orsaka ai_suggestion i den tenanten"), och en
 * import högst upp i filen ligger alltid före varje vakt längre ner. Utan
 * den här tvätten larmar facit om helt korrekt kod.
 */
const kod = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*import[\s\S]*?from\s+'[^']+'\s*$/gm, '')

test.describe('1. voice/missed — bara signerad POST får utlösa något', () => {
  const s = kod('app/api/voice/missed/route.ts')

  test('GET muterar inte, oavsett parametrar', () => {
    const vakt = s.indexOf("if (request.method !== 'POST')")
    expect(vakt, 'ingen metodvakt').toBeGreaterThan(-1)
    // Vakten måste ligga FÖRE fireEvent — annars hinner den fyra först.
    const fire = s.indexOf("fireEvent(supabase, 'call_missed'")
    expect(fire).toBeGreaterThan(vakt)
  })

  test('signaturen kontrolleras fortfarande på POST', () => {
    expect(s).toContain('verifyElksSignature')
  })
})

test.describe('2. voice/transcribe — inte längre en öppen dörr till Lisa', () => {
  const s = kod('app/api/voice/transcribe/route.ts')

  test('kräver inloggning eller intern hemlighet', () => {
    expect(s).toContain('getAuthenticatedBusiness')
    expect(s).toContain("request.headers.get('x-internal-secret')")
    expect(s).toContain("{ error: 'Unauthorized' }")
  })

  test('inloggad väg matchar inspelningens företag — auth räcker inte', () => {
    const i = s.indexOf('recording.business_id !== authed')
    expect(i, 'ingen tenantmatchning').toBeGreaterThan(-1)
    // Matchningen måste ligga före den enda efteranalysen. Någon generell
    // agenttrigger får inte längre finnas för extern samtalstext.
    const analyze = s.indexOf('/api/voice/analyze')
    expect(analyze).toBeGreaterThan(i)
    expect(s).not.toContain('triggerAgentFireAndForget')
  })

  test('den interna kedjan legitimerar sig', () => {
    const r = kod('app/api/voice/recording/route.ts')
    const i = r.indexOf('/api/voice/transcribe')
    expect(r.slice(i, i + 500)).toContain('x-internal-secret')
  })
})

test.describe('3. voice/analyze — inloggad någonstans ≠ rätt till raden', () => {
  test('inspelningens företag jämförs med den inloggades före skrivningar', () => {
    const s = kod('app/api/voice/analyze/route.ts')
    const i = s.indexOf('recording.business_id !== authed')
    expect(i, 'ingen tenantmatchning').toBeGreaterThan(-1)
    expect(s.indexOf("from('pending_approvals')"), 'approval-skrivningen sker före matchningen').toBeGreaterThan(i)
    expect(s, 'legacy auto-approve får inte köras från externt transkript').not.toContain('tryAutoApprove')
  })
})

test.describe('4. voice/recording — webhooken verifieras', () => {
  const s = kod('app/api/voice/recording/route.ts')

  test('46elks-signaturen kontrolleras före allt annat', () => {
    const sig = s.indexOf('verifyElksSignature')
    expect(sig, 'ingen signaturkontroll').toBeGreaterThan(-1)
    expect(s.indexOf(".from('call_recording')")).toBeGreaterThan(sig)
  })

  test('body:n läses en gång — formData() efter text() hade gett tom ström', () => {
    expect(s).toContain('new URLSearchParams(rawBody)')
    expect(s, 'formData() läser en redan tömd ström').not.toContain('await request.formData()')
  })
})

test.describe('5. voice/execute — SMS går genom spärren', () => {
  const s = kod('app/api/voice/execute/route.ts')

  test('inget direktanrop mot 46elks kvar', () => {
    expect(s, 'kringgår opt-out, normalisering och sms_log')
      .not.toContain('api.46elks.com/a1/sms')
  })

  test('utskicket går genom sendSmsViaElks med customerId', () => {
    expect(s).toContain('sendSmsViaElks')
    expect(s).toContain('customerId: customer.customer_id')
  })
})

test.describe('6. sms/incoming — fallbacken gissar inte tenant', () => {
  const s = kod('app/api/sms/incoming/route.ts')

  test('tvetydig avsändare avstår i stället för att välja första träffen', () => {
    expect(s, 'första-träffen-uppslaget kvar').not.toMatch(
      /\.eq\('phone_number', from\)\s*\n\s*\.limit\(1\)/
    )
    expect(s).toContain('företag.length > 1')
    const i = s.indexOf('företag.length > 1')
    // Tvetydigheten måste avbryta innan någon agent triggas.
    expect(s.indexOf('triggerAgentFireAndForget')).toBeGreaterThan(i)
  })
})

test.describe('kartläggningens grundfynd: 46elks är enda leverantören', () => {
  test('ingen Retell/Vapi/n8n-väg i app-koden', () => {
    // Beslutsunderlaget för Epic 6: entrypointen är redan vald i praktiken.
    // Det här facit larmar om någon börjar bygga en andra röstväg utan beslut.
    const träffar: string[] = []
    const gå = (dir: string) => {
      for (const f of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${f.name}`
        if (f.isDirectory()) gå(rel)
        else if (/\.tsx?$/.test(f.name)) {
          const src = kod(rel)
          if (/\bretell\b/i.test(src) || /\bvapi\b/i.test(src)) träffar.push(rel)
        }
      }
    }
    gå('app/api')
    expect(träffar, `oväntad röstleverantör i: ${träffar.join(', ')}`).toEqual([])
  })
})
