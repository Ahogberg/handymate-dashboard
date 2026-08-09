/**
 * Facit för mötesassistenten (2026-08-09, etapp 3).
 *
 * ═══ BESLUTAD OMFATTNING ═══
 *
 *   - Max 10 minuter, hårt tak i hooken — inte bara i UI-texten.
 *   - BARA transkriptet sparas. Ljudet kastas efter Whisper: ingen bucket,
 *     ingen recording_url, går aldrig att lyssna på i efterhand.
 *   - Samtyckespåminnelsen står ovanför knappen, varje gång.
 *   - Platsbesök föreslår offert/ÄTA och uppföljning — aldrig callback.
 *   - Lisa triggas INTE: ett platsbesök är hantverkarens eget rum.
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

const ROUTE = 'app/api/voice/site-visit/route.ts'
const HOOK = 'hooks/useAudioRecording.ts'
const KOMPONENT = 'components/moten/Motesassistenten.tsx'
const ANALYZE = 'app/api/voice/analyze/route.ts'

test.describe('taket är hookens ansvar, inte komponentens', () => {
  test('hooken stoppar själv vid maxDurationSeconds', () => {
    const s = kod(HOOK)
    expect(s).toContain('maxDurationSeconds')
    // Stoppet sker i timer-callbacken — där taket faktiskt kan verkställas
    // även om komponenten tappat fokus.
    const timer = s.indexOf('setInterval(')
    const stopp = s.indexOf('setStoppedByLimit(true)')
    expect(stopp, 'inget hårt stopp i hooken').toBeGreaterThan(timer)
  })

  test('komponenten använder taket och visar nedräkningen', () => {
    const s = kod(KOMPONENT)
    expect(s).toContain('maxDurationSeconds: MAX_SEKUNDER')
    expect(s).toContain('secondsLeft')
    expect(s).toContain('stoppedByLimit')
  })

  test('routen litar inte på klienten — egen gräns på längd och storlek', () => {
    const s = kod(ROUTE)
    expect(s).toContain('MAX_SECONDS')
    expect(s).toContain('MAX_BYTES')
    const grans = s.indexOf('file.size > MAX_BYTES')
    const whisper = s.indexOf('api.openai.com')
    expect(grans, 'storleksgränsen prövas efter Whisper — kostnaden är redan tagen').toBeLessThan(whisper)
  })
})

test.describe('bara transkriptet — aldrig ljudet', () => {
  test('recording_url sätts uttryckligen till null', () => {
    const s = kod(ROUTE)
    expect(s).toContain('recording_url: null')
    expect(s).toContain("source: 'site_visit'")
  })

  test('ingen bucket, ingen storage', () => {
    const s = kod(ROUTE)
    expect(s, 'ljudet laddas upp någonstans — beslutet var att kasta det').not.toContain('storage')
    expect(s).not.toContain('upload')
  })

  test('v102 dokumenterar att site_visit aldrig har ljud', () => {
    const s = read('sql/v102_motesassistenten.sql')
    expect(s).toContain("'site_visit'")
    expect(s).toContain('recording_url')
    expect(s).toContain('call_recording_source_check')
  })
})

test.describe('samtycket och rummet', () => {
  test('samtyckespåminnelsen står i komponenten, ovanför knappen', () => {
    const s = read(KOMPONENT)
    const samtycke = s.indexOf('spelas in')
    const knapp = s.indexOf('Starta mötesinspelning')
    expect(samtycke, 'ingen samtyckestext').toBeGreaterThan(-1)
    expect(samtycke, 'samtycket kommer efter knappen').toBeLessThan(knapp)
  })

  test('Lisa triggas inte för möten', () => {
    // Ett platsbesök är hantverkarens eget samtal. Agentmotorn (som agerar:
    // SMS, bokning) ska inte springa i det rummet — bara analysen (föreslår).
    const s = kod(ROUTE)
    expect(s, 'agentmotorn triggas för möten').not.toContain('triggerAgentFireAndForget')
    expect(s).toContain('/api/voice/analyze')
  })

  test('mötesanalysen föreslår aldrig callback', () => {
    const s = read(ANALYZE)
    expect(s).toContain("recording.source === 'site_visit'")
    const moteBlock = s.slice(s.indexOf('Detta är ett PLATSBESÖK'), s.indexOf(': `VIKTIGT'))
    expect(moteBlock, 'mötesgrenen saknar callback-förbudet').toContain('ALDRIG "callback"')
    expect(moteBlock).toContain('ÄTA')
  })
})

test.describe('kostnaden bokförs som telefonivägen', () => {
  test('Whisper-sekunder går till COGS-mätaren', () => {
    const s = kod(ROUTE)
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
