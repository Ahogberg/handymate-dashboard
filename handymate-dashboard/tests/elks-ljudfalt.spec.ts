import { test, expect } from '@playwright/test'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

// Facit för 46elks ljudfält.
//
// 2026-09-09/10. Två gånger samma missförstånd: `app/api/voice/incoming`
// lämnade en webhook-adress i ett fält där 46elks förväntar sig ett LJUD.
//
//   { ivr:  '<APP_URL>/api/voice/consent' }   → badurl,   "Could not reach…"
//   { play: '<APP_URL>/api/voice/greeting' }  → badaudio, "Unsupported audio format"
//
// Den som ringde hörde åtta sekunders tystnad och blev bortkopplad. Felet
// syntes bara i 46elks egen logg — vår kod svarade 200 och trodde allt var
// bra. Det här facit förbjuder hela felklassen i stället för de två fallen.
//
// `play` och `ivr` tar en ljudfil eller en `tts:`-sträng. Vill man lämna över
// till en egen webhook är fältet `next`.

const ROT = join(__dirname, '..')
const LJUDFALT = ['play', 'ivr']

function tsFiler(dir: string, ut: string[] = []): string[] {
  for (const namn of readdirSync(dir)) {
    if (namn === 'node_modules' || namn === '.next') continue
    const p = join(dir, namn)
    if (statSync(p).isDirectory()) tsFiler(p, ut)
    else if (/\.tsx?$/.test(namn)) ut.push(p)
  }
  return ut
}

test('inget ljudfält pekar på en av våra egna rutter', () => {
  const brott: string[] = []
  let granskade = 0
  for (const fil of [...tsFiler(join(ROT, 'app')), ...tsFiler(join(ROT, 'lib'))]) {
    const rel = fil.slice(ROT.length + 1)
    for (const rad of readFileSync(fil, 'utf8').split('\n')) {
      // Kommentarer är inte kod. Just den här filens och halsning.ts
      // kommentarer BESKRIVER felet och ska inte räknas som det.
      const trimmad = rad.trim()
      if (trimmad.startsWith('//') || trimmad.startsWith('*') || trimmad.startsWith('/*')) continue
      const falt = LJUDFALT.find(f => new RegExp(`["']?\\b${f}\\b["']?\\s*:`).test(rad))
      if (!falt) continue
      granskade++
      // Ett ljudfält som nämner en av VÅRA sökvägar är per definition fel:
      // 46elks hämtar det som ljud och får JSON.
      if (/\/api\//.test(rad)) {
        brott.push(`${rel}: ${falt} pekar på en egen rutt — 46elks hämtar det som ljud\n    ${rad.trim()}`)
      }
    }
  }
  expect(granskade, 'inga ljudfält hittades — detektionen är trasig').toBeGreaterThan(0)
  expect(brott, `Ljudfält som pekar på egna rutter. Använd \`next\` för att lämna över till en webhook:\n  ${brott.join('\n  ')}`).toEqual([])
})

test('hälsningen byggs som tts på plats, inte hämtas från en rutt', () => {
  const inc = readFileSync(join(ROT, 'app/api/voice/incoming/route.ts'), 'utf8')
  expect(inc, 'hälsningen ska byggas i koden').toContain('halsningsljud(business.business_name)')
  const halsning = readFileSync(join(ROT, 'lib/voice/halsning.ts'), 'utf8')
  expect(halsning, 'måste vara en 46elks-ljudsträng').toContain('tts:sv-SE:')
})

test('överlämning till consent sker med next, och faller tillbaka på koppling', () => {
  const inc = readFileSync(join(ROT, 'app/api/voice/incoming/route.ts'), 'utf8')
  expect(inc).toMatch(/next: medElksHemlighet\(`\$\{APP_URL\}\/api\/voice\/consent\?step=connect`\)/)
  // Utan godkänt inspelningsmeddelande måste samtalet kopplas ändå. En kund
  // får inte tappas för att en policyflagga saknas.
  expect(inc).toContain('const noticeUrl = recordingNoticeUrl()')
  expect(inc).toMatch(/if \(noticeUrl\) \{/)
})
