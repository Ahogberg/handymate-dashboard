/**
 * Etapp K — SMS-kvoten in i strypunkten.
 *
 * Innan detta kollade/räknade bara fem av ~24 SMS-sändvägar kvoten
 * (checkSmsAllowance/trackSmsSent) — app/api/sms/send, app/api/approvals/
 * [id], lib/nurture.ts, cron/quote-follow-up, campaigns/send. Alla ANDRA
 * vägar (Karins rapporter, ÄTA-utskick, morgonrapporten, m.fl.) gick förbi
 * kvoten och hardCap:et helt, eftersom sendSmsViaElks (lib/sms-send.ts) —
 * den bevisade chokepoint alla ~24 vägar går genom (se
 * tests/outbound-safety.spec.ts) — själv INTE gjorde kontrollen.
 *
 * Facit är rent käll-scan (samma idiom som outbound-safety.spec.ts och
 * kapacitet-fyllnad.spec.ts) — ingen Supabase-mockning. Vi verifierar att:
 *   1. Chokepointen själv både kollar och räknar kvoten.
 *   2. Kvotkollen sker FÖRE den externa 46elks-sändningen (fail-closed på
 *      hardCap — ett blockerat SMS ska aldrig nå 46elks).
 *   3. Uppräkningen sker EFTER att sändningen faktiskt lyckats (aldrig i
 *      förväg, aldrig för en idempotent omsändning).
 *   4. Uppräkningen är icke-blockerande (try/catch).
 *   5. De fem gamla callsites är städade — trackSmsSent finns bara på ETT
 *      ställe i hela kodbasen nu, annars räknas ett SMS dubbelt.
 *
 * Körs: npx playwright test tests/sms-quota-chokepoint.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')

function source(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

/** Extraherar hela funktionskroppen (matchande klammerparenteser) från en signatur-markör. */
function functionBody(contents: string, signatureMarker: string): string {
  const start = contents.indexOf(signatureMarker)
  if (start < 0) throw new Error(`Kunde inte hitta "${signatureMarker}"`)
  const braceStart = contents.indexOf('{', start)
  if (braceStart < 0) throw new Error(`Kunde inte hitta funktionskroppens start efter "${signatureMarker}"`)
  let depth = 1
  let index = braceStart + 1
  while (index < contents.length && depth > 0) {
    if (contents[index] === '{') depth++
    if (contents[index] === '}') depth--
    index++
  }
  return contents.slice(start, index)
}

const SMS_SEND_SRC = source('lib/sms-send.ts')
const CHOKEPOINT_BODY = functionBody(SMS_SEND_SRC, 'export async function sendSmsViaElks(')

test.describe('SMS-kvoten lever i chokepointen (sendSmsViaElks)', () => {
  test('funktionskroppen kollar OCH räknar kvoten själv', () => {
    expect(CHOKEPOINT_BODY).toContain('checkSmsAllowance')
    expect(CHOKEPOINT_BODY).toContain('trackSmsSent')
  })

  test('kvotkollen sker före den externa 46elks-sändningen (hardCap fail-closed)', () => {
    const quotaCheckIndex = CHOKEPOINT_BODY.indexOf('checkSmsAllowance')
    const elksFetchIndex = CHOKEPOINT_BODY.indexOf("fetch('https://api.46elks.com")
    expect(quotaCheckIndex).toBeGreaterThan(-1)
    expect(elksFetchIndex).toBeGreaterThan(-1)
    expect(quotaCheckIndex).toBeLessThan(elksFetchIndex)
  })

  test('trackSmsSent sker efter att success avgjorts, aldrig innan sändningsförsöket', () => {
    const successAssignedIndex = CHOKEPOINT_BODY.indexOf('success = true')
    const trackIndex = CHOKEPOINT_BODY.indexOf('trackSmsSent(')
    expect(successAssignedIndex).toBeGreaterThan(-1)
    expect(trackIndex).toBeGreaterThan(successAssignedIndex)
  })

  test('en idempotent omsändning (redan levererad) räknas aldrig mot kvoten', () => {
    // Idempotent-early-return (gate.code === 'already_sent') måste textuellt
    // ligga FÖRE trackSmsSent-anropet — den vägen returnerar innan koden
    // någonsin når uppräkningen.
    const idempotentReturnIndex = CHOKEPOINT_BODY.indexOf('idempotent: true')
    const trackIndex = CHOKEPOINT_BODY.indexOf('trackSmsSent(')
    expect(idempotentReturnIndex).toBeGreaterThan(-1)
    expect(idempotentReturnIndex).toBeLessThan(trackIndex)
  })

  test('trackSmsSent-anropet är icke-blockerande — en trasig uppräkning fäller aldrig ett redan skickat SMS', () => {
    const trackIndex = CHOKEPOINT_BODY.indexOf('trackSmsSent(')
    const tryBefore = CHOKEPOINT_BODY.lastIndexOf('try {', trackIndex)
    const catchAfter = CHOKEPOINT_BODY.indexOf('catch', trackIndex)
    expect(tryBefore).toBeGreaterThan(-1)
    expect(catchAfter).toBeGreaterThan(trackIndex)
  })

  test('kvotkollens eget DB-uppslag är också fail-open (metering stör aldrig sändningen)', () => {
    // resolveSmsQuotaPlan (planuppslaget) ska fånga fel och returnera null
    // — inte kasta/fälla sändningen. Verifierar att try/catch finns runt
    // planuppslaget, inte bara runt checkSmsAllowance-anropet.
    const helperBody = functionBody(SMS_SEND_SRC, 'async function resolveSmsQuotaPlan(')
    expect(helperBody).toContain('try {')
    expect(helperBody).toContain('catch')
    expect(helperBody).toContain('return null')
  })
})

test.describe('de fem gamla callsites räknar inte längre upp kvoten själva', () => {
  const CALLSITES = [
    'app/api/sms/send/route.ts',
    'app/api/approvals/[id]/route.ts',
    'lib/nurture.ts',
    'app/api/cron/quote-follow-up/route.ts',
    'app/api/campaigns/send/route.ts',
  ]

  for (const file of CALLSITES) {
    test(`${file} innehåller inte trackSmsSent( — annars dubbelräknas SMS:et`, () => {
      const src = source(file)
      expect(src).not.toContain('trackSmsSent(')
    })
  }

  test('exakt EN plats i hela kodbasen anropar trackSmsSent (chokepointen)', () => {
    const roots = ['app', 'lib']
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
        const relative = `${dir}/${entry.name}`
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '.next') continue
          walk(relative)
        } else if (/\.tsx?$/.test(entry.name)) {
          const contents = source(relative)
          // Definitionen i lib/sms-usage.ts räknas inte — bara ANROP.
          if (relative === 'lib/sms-usage.ts') continue
          if (contents.includes('trackSmsSent(')) hits.push(relative)
        }
      }
    }
    roots.forEach(walk)
    expect(hits).toEqual(['lib/sms-send.ts'])
  })
})
