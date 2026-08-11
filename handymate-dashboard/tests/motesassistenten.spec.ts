/**
 * Facit för mötesassistenten V2 (2026-08-11, Meeting Intelligence Task 6).
 *
 * ═══ VAD SOM ÄNDRADES FRÅN V1 ═══
 *
 *   - V1 (etapp 3) spelade in ETT klipp i max 10 minuter och laddade upp det
 *     synkront (app/api/voice/site-visit/route.ts). Den routen är BORTA —
 *     ersatt av segmentrotation (hooks/useSegmentedRecording.ts) som spelar
 *     in i 5-minuterssegment upp till 90 minuter och laddar upp varje
 *     segment för sig (app/api/voice/meeting/segment, .../start,
 *     .../complete), med en cron-worker (lib/meetings/process-job.ts) som
 *     transkriberar och sätter ihop transkriptet.
 *   - "Bara transkriptet — aldrig ljudet" gäller fortfarande, men mekaniken
 *     är nu RETENTION i stället för "sparas aldrig": ljudet laddas faktiskt
 *     upp till en privat bucket (nödvändigt för att kunna transkribera
 *     segment för segment i bakgrunden) och raderas explicit av workern
 *     direkt efter en lyckad transkribering.
 *   - Samtyckestexten, kundkopplingen (customer_id/booking_id), Lisa-
 *     exkluderingen, callback-förbudet och approval-rälsen (Epic 1–2) är
 *     ARV — samma regler, nya filer.
 *
 *   npx playwright test tests/motesassistenten.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const kod = (p: string) =>
  read(p)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')

const OLD_ROUTE = 'app/api/voice/site-visit/route.ts'
const HOOK = 'hooks/useSegmentedRecording.ts'
const KOMPONENT = 'components/moten/Motesassistenten.tsx'
const ANALYZE = 'app/api/voice/analyze/route.ts'
const START_ROUTE = 'app/api/voice/meeting/start/route.ts'
const PROCESS_JOB = 'lib/meetings/process-job.ts'
const V119 = 'sql/v119_meeting_v2.sql'
const CRON_WORKER = 'app/api/cron/meeting-worker/route.ts'

test.describe('10-minuterstaket är borta', () => {
  test('den gamla, ersatta routen finns inte längre', () => {
    expect(fs.existsSync(path.join(ROOT, OLD_ROUTE)), 'site-visit-routen ska vara raderad — V2 ersatte den helt').toBe(false)
  })

  test('segmenthooken finns och komponenten kör 90-minuterstaket', () => {
    expect(fs.existsSync(path.join(ROOT, HOOK)), 'useSegmentedRecording saknas').toBe(true)
    const s = kod(KOMPONENT)
    expect(s, 'taket är inte längre 90 minuter — 10-minutersregressionen är tillbaka').toContain('MAX_MOTE_SEKUNDER = 90 * 60')
  })
})

test.describe('segmentrotation — varje segment är en egen, avkodbar fil', () => {
  test('start() begär ingen timeslice-chunkning', () => {
    // Andra argumentet till MediaRecorder.start(ms) ger osjälvständiga
    // container-chunkar (bara den första bär containerhuvudet). Hela poängen
    // med segmentrotation är att starta om INSTANSEN i stället — .start()
    // ska alltså aldrig kallas med ett numeriskt argument i den här filen.
    const s = kod(HOOK)
    expect(s, 'timeslice-argument till .start() hittat — bryter mot segment-per-instans-designen').not.toMatch(/\.start\(\s*\d/)
  })

  test('varje segment får en egen MediaRecorder-instans', () => {
    const s = kod(HOOK)
    expect(s).toContain('new MediaRecorder')
  })

  test('paus är segment-stopp, inte MediaRecorder.pause()', () => {
    // Läget avgörs av recordern själv (rec.state), och paus stänger av
    // innevarande segment precis som ett vanligt segmentbyte — det finns
    // ingen halvfärdig, pausad MediaRecorder-instans att återuppta.
    const s = kod(HOOK)
    const pauseStart = s.indexOf('const pause = useCallback')
    const pauseEnd = s.indexOf('const resume = useCallback')
    expect(pauseStart, 'pause-funktionen saknas').toBeGreaterThan(-1)
    expect(pauseEnd).toBeGreaterThan(pauseStart)
    const block = s.slice(pauseStart, pauseEnd)
    expect(block, 'pause() anropar MediaRecorder.pause() — ska stoppa segmentet i stället').not.toContain('.pause()')
    expect(block, 'pause() stoppar inte innevarande segment').toContain('.stop()')
  })
})

test.describe('retention — ljudet är en transient buffert, aldrig en arkiverad fil', () => {
  test('bucketen meeting-audio skapas privat', () => {
    const s = read(V119)
    const insertStart = s.indexOf('INSERT INTO storage.buckets')
    expect(insertStart, 'ingen bucket-INSERT i v119').toBeGreaterThan(-1)
    const block = s.slice(insertStart, insertStart + 250)
    expect(block).toContain("'meeting-audio'")
    expect(block, 'bucketen skapas inte privat — ljud vore publikt läsbart').toContain('false')
  })

  test('workern raderar ljudfilen efter lyckad transkribering', () => {
    const s = kod(PROCESS_JOB)
    const transkriberat = s.indexOf("status: 'transcribed'")
    const radering = s.indexOf('.storage.from(BUCKET).remove(')
    expect(transkriberat, 'segmentet markeras aldrig transcribed').toBeGreaterThan(-1)
    expect(radering, 'ljudfilen raderas aldrig — retentionsregeln är bruten').toBeGreaterThan(-1)
    expect(radering, 'raderingen sker inte efter transkriberingen').toBeGreaterThan(transkriberat)
  })

  test('call_recording-inserten sätter recording_url till null', () => {
    const s = kod(PROCESS_JOB)
    expect(s).toContain('recording_url: null')
    expect(s).toContain("source: 'site_visit'")
  })
})

test.describe('samtycket och rummet', () => {
  test('samtyckespåminnelsen står i komponenten, ovanför knappen, och nämner raderingen', () => {
    const s = read(KOMPONENT)
    const samtycke = s.indexOf('spelas in')
    const raderas = s.indexOf('raderas')
    const knapp = s.indexOf('Starta mötesinspelning')
    expect(samtycke, 'ingen samtyckestext').toBeGreaterThan(-1)
    expect(raderas, 'texten säger inte längre att ljudet raderas efter transkribering').toBeGreaterThan(-1)
    expect(samtycke, 'samtycket kommer efter knappen').toBeLessThan(knapp)
    expect(raderas, 'raderings-texten kommer efter knappen').toBeLessThan(knapp)
  })

  test('Lisa triggas inte för möten', () => {
    // Ett platsbesök är hantverkarens eget samtal. Agentmotorn (som agerar:
    // SMS, bokning) ska inte springa i det rummet — bara analysen (föreslår).
    // I V2 är det workern, inte en synkron route, som fire-and-forget:ar
    // analysen efter att transkriptet satts ihop.
    const s = kod(PROCESS_JOB)
    expect(s, 'agentmotorn triggas för möten').not.toContain('triggerAgentFireAndForget')
    expect(s).toContain('/api/voice/analyze')
  })

  test('mötesanalysen föreslår aldrig callback (engångsanropet)', () => {
    const s = read(ANALYZE)
    expect(s).toContain("recording.source === 'site_visit'")
    const moteBlock = s.slice(s.indexOf('Detta är ett PLATSBESÖK'), s.indexOf(': `VIKTIGT'))
    expect(moteBlock, 'mötesgrenen saknar callback-förbudet').toContain('ALDRIG "callback"')
    expect(moteBlock).toContain('ÄTA')
  })

  test('mötesanalysen föreslår aldrig callback (map-reduce-chunken, långa möten)', () => {
    // 90-minutersmöten kan bli för långa för ett enda anrop — då körs
    // map-reduce (splitTranscript) i stället. Callback-förbudet måste gälla
    // i BÅDA vägarna, annars läcker det tillbaka i just den gren som
    // hanterar de längsta (och därmed vanligaste bland riktiga) mötena.
    const s = kod(ANALYZE)
    const chunkStart = s.indexOf('async function extraheraFyndFranChunk')
    const chunkEnd = s.indexOf('async function slaIhopFynd')
    expect(chunkStart, 'map-chunk-funktionen saknas').toBeGreaterThan(-1)
    expect(chunkEnd).toBeGreaterThan(chunkStart)
    const chunkFn = s.slice(chunkStart, chunkEnd)
    expect(chunkFn, 'map-chunk-prompten saknar callback-förbudet').toContain('ALDRIG "callback"')
  })
})

test.describe('kostnaden bokförs som telefonivägen', () => {
  test('Whisper-sekunder går till COGS-mätaren, per segment', () => {
    const s = kod(PROCESS_JOB)
    expect(s).toContain('recordCost')
    expect(s).toContain('whisperCostOre')
  })
})

test.describe('fliken finns i Inkorgen', () => {
  test('Möte är en lazy-laddad flik', () => {
    const s = read('app/dashboard/inkorg/page.tsx')
    expect(s).toContain("label: 'Möte'")
    expect(s).toContain("import('@/components/moten/Motesassistenten')")
  })
})

/**
 * ═══ MEETING INTELLIGENCE EPIC 1–2 (arv från 2026-08-11) ═══
 * docs/audits/MEETING_INTELLIGENCE_ARCHITECTURE.md är beslutet.
 */

test.describe('möteskontext (Epic 1)', () => {
  test('komponenten skickar customer_id och booking_id till start-routen', () => {
    // V2 postar JSON (inte FormData som V1) till /api/voice/meeting/start —
    // jobbet skapas INNAN inspelningen börjar, så kundkopplingen måste följa
    // med i just det anropet, inte i segment-uppladdningarna.
    const s = kod(KOMPONENT)
    // Två anrop matchar routen: GET (hamtaOppna, återhämtningslistan) och
    // POST (startaMote). Bara POST-anropet bär body:t — det ligger sist i
    // filen, så lastIndexOf hittar det i stället för GET-anropet.
    const startAnrop = s.lastIndexOf("fetch('/api/voice/meeting/start'")
    expect(startAnrop, 'anropet till start-routen saknas').toBeGreaterThan(-1)
    const block = s.slice(startAnrop, startAnrop + 400)
    expect(block, 'kundvalet skickas inte — transkripten blir föräldralösa igen').toContain('customer_id')
    expect(block).toContain('booking_id')
  })

  test('start-routen ägarskapskontrollerar klientens kopplingar', () => {
    // customer_id/booking_id kommer från klienten och inserten sker med
    // service role — utan verifiering vore det en cross-tenant-skrivväg.
    const s = kod(START_ROUTE)
    expect(s).toContain('verifyOwnership')
    expect(s).toContain("idValue: bookingId")
  })

  test('kalendermappningen kastar inte längre attendees/location', () => {
    const s = kod('lib/google-calendar.ts')
    expect(s, 'attendees kastas vid API-gränsen igen').toContain('attendees')
    expect(s).toContain('meetUrl')
    expect(s).toContain('organizerEmail')
  })

  test('attendee-upplösningen avstår hellre än gissar vid flera träffar', () => {
    const s = kod('lib/calendar/resolve-attendees.ts')
    expect(s).toContain('data.length === 1')
  })
})

test.describe('mötesutfall på approval-rälsen (Epic 2)', () => {
  test('mötesgrenen skapar pending_approvals-kort, inte ai_suggestion', () => {
    const s = kod(ANALYZE)
    // Mötesgrenen (if (arMote)) ska returnera FÖRE legacy-loopens
    // ai_suggestion-INSERT (lastIndexOf — en tidigare läsning finns i
    // tenant-guarden högst upp i filen).
    const moteGren = s.indexOf('if (arMote) {')
    const aiSuggestionInsert = s.lastIndexOf(".from('ai_suggestion')")
    expect(moteGren, 'mötesgrenen saknas').toBeGreaterThan(-1)
    expect(moteGren, 'mötesgrenen ligger efter legacy-kön').toBeLessThan(aiSuggestionInsert)
    const gren = s.slice(moteGren, aiSuggestionInsert)
    expect(gren).toContain("from('pending_approvals')")
    expect(gren, 'mötesgrenen faller igenom till legacy-kön').toContain('return NextResponse.json')
  })

  test('kommunikationstriggern körs INTE för möten', () => {
    // Med customer_id satt (P0-fixen) hade triggerEventCommunication annars
    // börjat skicka kundkommunikation utifrån hantverkarens eget möte —
    // exakt det Lisa-exkluderingen förbjuder.
    const s = kod(ANALYZE)
    const moteGren = s.slice(s.indexOf('if (arMote) {'), s.lastIndexOf(".from('ai_suggestion')"))
    expect(moteGren).not.toContain('triggerEventCommunication')
    expect(moteGren).not.toContain('tryAutoApprove')
  })

  test('nya korttyperna är klassade i action-kontraktet', () => {
    const s = kod('lib/approvals/action-contract.ts')
    expect(s).toContain("meeting_summary: 'INFORMATIONAL'")
    expect(s).toContain("meeting_followup: 'EXECUTABLE_ACTION'")
  })

  test('meeting_followup-exekveraren skapar en task-rad med evidens', () => {
    const s = kod('app/api/approvals/[id]/route.ts')
    const caseStart = s.indexOf("case 'meeting_followup'")
    expect(caseStart, 'exekverar-caset saknas').toBeGreaterThan(-1)
    const block = s.slice(caseStart, caseStart + 2000)
    expect(block).toContain("from('task')")
    expect(block).toContain('source_text')
  })

  test('ÄTA-kortet skapar en riktig project_change när projekt finns', () => {
    const s = kod('app/api/approvals/[id]/route.ts')
    const caseStart = s.indexOf("case 'create_ata_draft'")
    const block = s.slice(caseStart, caseStart + 4000)
    expect(block, 'sista milen öppen igen — ÄTA blir föräldralös offert').toContain('/api/ata')
    expect(block).toContain("changeType: 'addition'")
  })
})

test.describe('worker-cronen', () => {
  test('meeting-worker och meeting-reminders är schemalagda', () => {
    const s = read('vercel.json')
    expect(s).toContain('/api/cron/meeting-worker')
    expect(s).toContain('/api/cron/meeting-reminders')
  })

  test('meeting-worker-routen är skyddad och får gott om tid för Whisper', () => {
    const s = kod(CRON_WORKER)
    expect(s).toContain('verifyCronSecret')
    expect(s).toContain('maxDuration = 300')
  })
})
