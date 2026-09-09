import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'

// Facit för löftet "missade samtal fångas 24/7".
//
// 2026-09-09. Bakgrund: regeln "Svar på missat samtal" seedades utan
// respects_work_hours/respects_night_mode och ärvde därmed kolumndefaulten
// true. lib/automation-engine.ts hoppar då över sändningen utanför 07-17.
// Samtliga 14 konton som fanns hade grinden på — löftet hade aldrig hållit
// för någon kund. Dessutom hårdkodade insert-mappningen true/true, så en
// per-regel-flagga hade ignorerats även om någon satt den.

const kalla = readFileSync(join(__dirname, '../lib/seed-defaults.ts'), 'utf8')

function missatSamtalRegeln(): string {
  const start = kalla.indexOf("event_name: 'call_missed'")
  expect(start, 'den seedade call_missed-regeln måste gå att hitta').toBeGreaterThan(-1)
  const blockStart = kalla.lastIndexOf('{', start)
  const blockEnd = kalla.indexOf('\n    },', start)
  expect(blockEnd).toBeGreaterThan(blockStart)
  return kalla.slice(blockStart, blockEnd)
}

test('svaret på ett missat samtal grindas aldrig av arbetstid eller nattläge', () => {
  const regel = missatSamtalRegeln()
  expect(regel, 'respects_work_hours: false krävs — annars tystas svaret utanför 07-17')
    .toMatch(/respects_work_hours:\s*false/)
  expect(regel, 'respects_night_mode: false krävs — ett missat samtal på kvällen är just det löftet gäller')
    .toMatch(/respects_night_mode:\s*false/)
})

test('insert-mappningen läser regelns egna flaggor, inte hårdkodat true', () => {
  expect(kalla, 'hårdkodat true i mappningen gör per-regel-flaggor verkningslösa')
    .not.toMatch(/respects_work_hours:\s*true,\s*\n\s*respects_night_mode:\s*true,\s*\n\s*\}\)\)/)
  expect(kalla).toMatch(/respects_work_hours:\s*r\.respects_work_hours/)
  expect(kalla).toMatch(/respects_night_mode:\s*r\.respects_night_mode/)
})

test('övriga seedade regler behåller sina grindar', () => {
  // Undantaget gäller ETT löfte, inte alla utskick. Skulle någon slentrian-
  // mässigt stänga av grinden överallt vore det en annan sorts fel.
  const antalFalse = (kalla.match(/respects_work_hours:\s*false/g) || []).length
  expect(antalFalse, 'bara call_missed-regeln ska ha undantaget').toBe(1)
})
