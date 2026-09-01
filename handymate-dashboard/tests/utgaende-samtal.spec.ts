import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Facit för "Ring via Handymate" — utgående inspelade samtal (2026-09-01).
 *
 * ═══ VARFÖR KUNDEN RINGS FÖRST ═══
 *
 * 46elks kan bara spela upp ljud (`play`/`ivr`) på A-benet, dvs numret i
 * `to` på POST /a1/calls. Inspelningsmeddelandet måste nå KUNDEN, alltså är
 * kunden A-benet: kunden rings, hör meddelandet, kopplas därefter via
 * `connect` till hantverkarens mobil. Den ordningen är en juridisk
 * förutsättning (samtycke före inspelning) — inte en smakfråga — och därför
 * låses den i källkoden här.
 *
 * Källfacit, samma mönster som tests/partner-attribution-lock.spec.ts och
 * tests/voice-boundaries.spec.ts: körs utan browser/session.
 *
 *   npx playwright test tests/utgaende-samtal.spec.ts --no-deps --project=chromium
 */

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

// Kommentarer och importer bort — facit ska läsa KODEN, inte förklaringarna.
const kod = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*import[\s\S]*?from\s+'[^']+'\s*$/gm, '')

const START = 'app/api/voice/outbound/start/route.ts'
const VOICE_START = 'app/api/voice/outbound/route.ts'
const HANGUP = 'app/api/voice/outbound/hangup/route.ts'
const RECORDING = 'app/api/voice/recording/route.ts'
const INCOMING = 'app/api/voice/incoming/route.ts'
const BUTTON = 'components/voice/RingViaHandymateButton.tsx'

test.describe('1. start — kunden är A-benet och raden finns före samtalet', () => {
  const s = kod(START)

  test('46elks-anropet ringer KUNDEN (to) från Handymate-numret (from)', () => {
    const call = s.indexOf('api.46elks.com/a1/calls')
    expect(call, 'inget 46elks-anrop').toBeGreaterThan(-1)
    const body = s.slice(call, call + 800)
    expect(body).toContain('to: customerPhone')
    expect(body).toContain('from: fromNumber')
    // Hantverkarens nummer får INTE vara A-benet — då hade meddelandet
    // spelats för fel person.
    expect(body).not.toContain('to: craftsmanPhone')
  })

  test('call_recording-raden skapas FÖRE 46elks-anropet', () => {
    const insert = s.indexOf(".from('call_recording')")
    const call = s.indexOf('api.46elks.com/a1/calls')
    expect(insert, 'ingen call_recording-insert').toBeGreaterThan(-1)
    expect(insert).toBeLessThan(call)
    const insertBlock = s.slice(insert, insert + 900)
    expect(insertBlock).toContain('.insert(')
    expect(insertBlock).toContain("direction: 'outbound'")
    expect(insertBlock).toContain("call_status: 'initiated'")
    expect(insertBlock).toContain("source: 'phone'")
  })

  test('webhookarna bär bara recording_id — inga telefonnummer i URL:er', () => {
    expect(s).toContain('voice_start:')
    expect(s).toContain('whenhangup:')
    expect(s).not.toMatch(/voice_start:[^\n]*(craftsman|phone_number|customerPhone)/)
    expect(s).not.toMatch(/whenhangup:[^\n]*(craftsman|phone_number|customerPhone)/)
  })

  test('hantverkare ≠ kund — ett samtal kan inte kopplas till sig självt', () => {
    const guard = s.indexOf('craftsmanPhone === customerPhone')
    expect(guard, 'ingen vakt mot samma nummer').toBeGreaterThan(-1)
    // Vakten ligger FÖRE raden skapas och FÖRE 46elks-anropet.
    expect(guard).toBeLessThan(s.indexOf(".from('call_recording')"))
  })

  test('grindarna: inloggning, visningsläge, rate limit, bränsle', () => {
    expect(s).toContain('getAuthenticatedBusiness')
    expect(s).toContain('business._impersonation')
    expect(s).toContain('checkPhoneApiRateLimit')
    expect(s).toContain('checkFuelGate')
    expect(s).toContain("export const dynamic = 'force-dynamic'")
  })

  test('misslyckat 46elks-anrop lämnar inte raden i initiated', () => {
    const call = s.indexOf('api.46elks.com/a1/calls')
    const after = s.slice(call)
    expect(after).toContain("call_status: 'failed'")
    expect(after).toContain('status: 502')
  })
})

test.describe('2. voice_start — meddelandet före kopplingen, inspelning bara vid bekräftad uppspelning', () => {
  const s = kod(VOICE_START)

  test('play kommer före connect — både i flödet och i källordningen', () => {
    const play = s.indexOf('play:')
    const connect = s.indexOf('connect:')
    expect(play, 'ingen uppspelning').toBeGreaterThan(-1)
    expect(connect, 'ingen koppling').toBeGreaterThan(-1)
    expect(play).toBeLessThan(connect)
    // Uppspelningens next pekar på kopplingssteget, och den kan inte hoppas över.
    const playBlock = s.slice(play, play + 200)
    expect(playBlock).toContain('skippable: false')
    expect(playBlock).toContain("stepUrl('connect')")
  })

  test('recordcall finns BARA inuti result === "ok"', () => {
    const occurrences = s.split('recordcall:').length - 1
    expect(occurrences, 'recordcall ska sättas på exakt ett ställe').toBe(1)
    const ok = s.indexOf("if (result === 'ok')")
    expect(ok, 'ingen result-kontroll').toBeGreaterThan(-1)
    const rec = s.indexOf('recordcall:')
    expect(rec).toBeGreaterThan(ok)
    // Inom samma block: ingen ny villkorsgren och inget blockslut mellan
    // kontrollen och recordcall — svaret med recordcall ÄR ok-grenens return.
    const between = s.slice(ok + "if (result === 'ok')".length, rec)
    expect(between).not.toMatch(/\bif\s*\(/)
    expect(between).not.toContain('}\n')
    expect(between.split('\n').length).toBeLessThanOrEqual(3)
  })

  test('fallback utan meddelande kopplar UTAN inspelning', () => {
    // Om grindarna släppte mellan knapptryck och svar: koppla, men spela inte in.
    const noStep = s.indexOf('if (!step)')
    const connectStep = s.indexOf("step === 'connect'")
    expect(noStep).toBeGreaterThan(-1)
    expect(connectStep).toBeGreaterThan(noStep)
    const firstBranch = s.slice(noStep, connectStep)
    expect(firstBranch).not.toContain('recordcall')
  })

  test('webhooken måste matcha raden: från vårt nummer till kundens', () => {
    expect(s).toContain('from !== config.assigned_phone_number')
    expect(s).toContain('to !== row.phone_number')
    expect(s).toContain("hangup: 'call_mismatch'")
    // Bara utgående rader får hittas av den här routen.
    expect(s).toContain(".eq('direction', 'outbound')")
    expect(s).toContain(".is('raw_deleted_at', null)")
  })
})

test.describe('3. hangup — kostnaden bokförs bara när samtalet pågick', () => {
  const s = kod(HANGUP)

  test("call_out ligger inuti if (duration > 0)", () => {
    const gate = s.indexOf('if (duration > 0)')
    expect(gate, 'ingen duration-vakt').toBeGreaterThan(-1)
    const cost = s.indexOf("resource: 'call_out'")
    expect(cost).toBeGreaterThan(gate)
    // Inget recordCost före vakten.
    expect(s.slice(0, gate)).not.toContain('recordCost(')
    // Två ben, refererar inspelningsraden.
    expect(s).toContain('legs: 2')
    expect(s).toContain("refType: 'call_recording'")
  })

  test('obesvarat → no_answer/busy, men bara om ingen senare status redan satts', () => {
    expect(s).toContain("row.call_status === 'initiated' || row.call_status === 'answered'")
    expect(s).toContain("state === 'busy' ? 'busy' : 'no_answer'")
  })
})

test.describe('4. inspelningsraden — våra literaler, inte leverantörens ord', () => {
  test('incoming skriver literal inbound', () => {
    expect(kod(INCOMING)).toContain("direction: 'inbound'")
  })

  test('recording översätter outgoing/outbound → outbound, allt annat → inbound', () => {
    const s = kod(RECORDING)
    expect(s).toContain("const isOutbound = direction === 'outgoing' || direction === 'outbound'")
    expect(s).toContain("direction: isOutbound ? 'outbound' : 'inbound'")
    // 46elks-strängen får aldrig hamna rakt i kolumnen.
    expect(s).not.toContain("direction: direction || 'inbound'")
    expect(s).not.toMatch(/direction:\s*direction\b/)
  })

  test('för korta inspelningar sparas men transkriberas inte — vakten ligger före fetchen', () => {
    const s = kod(RECORDING)
    expect(s).toContain('const MIN_TRANSCRIBE_SECONDS = 3')
    const guard = s.indexOf('duration < MIN_TRANSCRIBE_SECONDS')
    expect(guard, 'ingen längdvakt').toBeGreaterThan(-1)
    const fetchIdx = s.indexOf('/api/voice/transcribe')
    expect(fetchIdx).toBeGreaterThan(guard)
    // Men EFTER att ljudpekaren sparats — raden är fortfarande ett samtal.
    expect(s.indexOf('.upsert(')).toBeLessThan(guard)
    const guardBlock = s.slice(guard, guard + 300)
    expect(guardBlock).toContain("skipped: 'too_short'")
  })
})

test.describe('5. knappen — tel:-länk när funktionen inte finns', () => {
  const s = kod(BUTTON)

  test('available=false ger en vanlig tel:-länk, inte en död knapp', () => {
    const fallback = s.indexOf('!cap || !cap.available')
    expect(fallback, 'ingen kapabilitetsvakt').toBeGreaterThan(-1)
    const block = s.slice(fallback, fallback + 300)
    expect(block).toContain('<a href={telHref}')
    // Ingen modal/POST i fallback-grenen.
    expect(block).not.toContain('setOpen(true)')
    expect(block).not.toContain("method: 'POST'")
  })

  test('utan telefonnummer renderas inget alls', () => {
    expect(s).toContain('if (!telHref) return null')
    expect(s).toContain('normalizeSwedishPhone(phone)')
  })

  test('bekräftelsen säger vad som händer, på svenska, med mobilalternativ', () => {
    expect(s).toContain('Vi ringer upp kunden från ditt Handymate-nummer och spelar upp inspelningsmeddelandet')
    expect(s).toContain('Ring nu')
    expect(s).toContain('Ring direkt från mobilen istället')
    expect(s).toContain('Avbryt')
    expect(s).toContain('/dashboard/recordings/${started.recordingId}')
    expect(s).toContain('#0F766E')
  })

  test('kapabiliteten hämtas en gång per sidladdning', () => {
    expect(s).toContain('let capabilityCache')
    expect(s).toContain("fetch('/api/voice/outbound/start'")
  })
})

test.describe('6. inspelningslistan visar utgående och obesvarade', () => {
  test('call_status exponeras och Obesvarat renderas', () => {
    const s = read('app/dashboard/recordings/page.tsx')
    expect(s).toContain('call_status: string | null')
    expect(s).toContain("'Utgående'")
    expect(s).toContain('Obesvarat')
    expect(s).toContain("recording.call_status === 'craftsman_no_answer'")
  })
})
