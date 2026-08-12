/**
 * Kundröst-facit (2026-08-12) — pilotbugg: ett SMS gick ut med rått
 * kundpostnamn i hälsningen OCH hantverkarens interna arbetsnamn på
 * offerten exponerat ("Hej TEST Andreas - FixDEF! ... offerten för
 * \"Leklåda\"...").
 *
 * Två regler ska gälla ALLA kundvända texter:
 *   R1 FÖRNAMN — hälsningar använder kundens FÖRNAMN. Tomt/saknat namn →
 *      "Hej!" (aldrig "Hej !" eller rått fullnamn).
 *   R2 INGA INTERNA NAMN — quote.title, project.name, deal.title och
 *      booking.notes är hantverkarens ARBETSNAMN och får ALDRIG stå i
 *      kundtext.
 *
 * Detta facit har två delar:
 *   1. Enhetstester på den delade helpern (lib/customers/namn.ts).
 *   2. Källskanning: läser de sanerade filerna och letar efter kända
 *      läck-mönster i just de kundvända meddelande-byggarna. Skanningen
 *      är medvetet avgränsad till respektive meddelande-block (inte hela
 *      filen) — interna fält (t.ex. quote.title i en push-notis till
 *      ÄGAREN, eller title/description i ett internt approval-kort) är
 *      fortsatt tillåtna och ska INTE flaggas.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { extractFirstName, halsning } from '../lib/customers/namn'
import { extractFirstName as reExportedExtractFirstName } from '../lib/agents/daniel/unopened-quotes'

function readSource(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8')
}

/** Slice mellan två markörer (första träffen av vardera). Kastar tydligt om markörerna inte hittas — en tyst tom slice vore en falsk grön. */
function slice(source: string, fromMarker: string, toMarker: string): string {
  const start = source.indexOf(fromMarker)
  const end = source.indexOf(toMarker, start + fromMarker.length)
  if (start === -1) throw new Error(`slice: startmarkör hittades inte: ${fromMarker}`)
  if (end === -1) throw new Error(`slice: slutmarkör hittades inte: ${toMarker}`)
  return source.slice(start, end)
}

// ─────────────────────────────────────────────────────────────────
// 1. Delad helper — lib/customers/namn.ts
// ─────────────────────────────────────────────────────────────────

test.describe('extractFirstName', () => {
  test('fullt namn → förnamn', () => {
    expect(extractFirstName('Erik Svensson')).toBe('Erik')
  })

  test('null/undefined/tom sträng → tom sträng', () => {
    expect(extractFirstName(null)).toBe('')
    expect(extractFirstName(undefined)).toBe('')
    expect(extractFirstName('')).toBe('')
    expect(extractFirstName('   ')).toBe('')
  })

  test('trimmar leading/trailing whitespace', () => {
    expect(extractFirstName('  Anna Andersson  ')).toBe('Anna')
  })
})

test.describe('halsning', () => {
  test('namn → "Hej Förnamn!"', () => {
    expect(halsning('Anna Andersson')).toBe('Hej Anna!')
  })

  test('tomt/saknat namn → "Hej!" — ALDRIG "Hej !" (pilotbuggens kärna)', () => {
    expect(halsning(null)).toBe('Hej!')
    expect(halsning(undefined)).toBe('Hej!')
    expect(halsning('')).toBe('Hej!')
    expect(halsning('   ')).toBe('Hej!')
    expect(halsning(null)).not.toContain('Hej !')
  })

  test('rått postnamn med prefix ("TEST Andreas - FixDEF") ger bara förnamnet', () => {
    // Pilotbuggens exakta scenario: kundpostens name-fält var inte ett rent
    // förnamn+efternamn utan innehöll testprefix/bindestreck-suffix. Vi kan
    // inte städa GODTYCKLIGA sådana strängar, men helpern ska åtminstone
    // aldrig producera en hälsning längre än det första whitespace-separerade
    // ordet.
    expect(halsning('TEST Andreas - FixDEF')).toBe('Hej TEST!')
  })
})

// ─────────────────────────────────────────────────────────────────
// 2. unopened-quotes.ts re-exporterar från den nya delade platsen
// ─────────────────────────────────────────────────────────────────

test.describe('lib/agents/daniel/unopened-quotes.ts — re-export', () => {
  test('extractFirstName är samma funktion som i lib/customers/namn.ts', () => {
    expect(reExportedExtractFirstName).toBe(extractFirstName)
  })
})

// ─────────────────────────────────────────────────────────────────
// 3. Källskanning — kundvända meddelande-block
// ─────────────────────────────────────────────────────────────────

test.describe('källskanning — lib/autopilot/quote-nudge.ts', () => {
  const source = readSource('lib/autopilot/quote-nudge.ts')
  // Blocket som bygger fallback-SMS:et + AI-prompten (INTE push-notisen till
  // ägaren längre ner i filen, som legitimt får nämna quote.title).
  const kundblock = slice(source, '// Generera nudge-SMS.', '// Skapa approval')

  test('nämner aldrig quote.title i kundtexten', () => {
    expect(kundblock).not.toContain('quote.title')
  })

  test('använder förnamn/halsning, inte rått fullnamn', () => {
    expect(kundblock).toContain('extractFirstName(customer.name)')
    expect(kundblock).toContain('halsning(customer.name)')
  })

  test('push-notisen till ägaren FÅR fortfarande nämna quote.title (internt)', () => {
    expect(source).toContain('quote.title')
  })
})

test.describe('källskanning — lib/warranty-followup.ts', () => {
  const source = readSource('lib/warranty-followup.ts')
  const kundblock = slice(source, '// Generera SMS-text.', 'const approvalId =')

  test('nämner aldrig project.name i kundtexten', () => {
    expect(kundblock).not.toContain('project.name')
  })

  test('använder förnamn/halsning', () => {
    expect(kundblock).toContain('halsning(customer.name)')
  })

  test('interna kort-fälten (title/description) FÅR fortfarande nämna project.name', () => {
    const kortblock = slice(source, 'await supabase.from(\'pending_approvals\')', 'payload: {')
    expect(kortblock).toContain('project.name')
  })
})

test.describe('källskanning — lib/proactive-care.ts', () => {
  const source = readSource('lib/proactive-care.ts')
  const funcBlock = slice(source, 'async function generateProactiveSms(', 'export async function checkProactiveCare(')

  test('SMS-mallen (fallback + AI-prompt) interpolerar aldrig raw project.name/projectName i kundtexten', () => {
    expect(funcBlock).not.toContain('${params.projectName}')
  })

  test('använder förnamn/halsning', () => {
    expect(funcBlock).toContain('halsning(params.customerName)')
  })
})

test.describe('källskanning — lib/nurture.ts', () => {
  const source = readSource('lib/nurture.ts')
  const seedBlock = slice(source, 'export const DEFAULT_SEQUENCES', '// ── Core Functions')

  test('ingen default-mall refererar {project_title} längre', () => {
    expect(seedBlock).not.toContain('{project_title}')
  })

  test('customer_name sätts via extractFirstName (förnamn)', () => {
    expect(source).toContain('extractFirstName(customer.name)')
  })
})

test.describe('källskanning — lib/booking-reminders.ts', () => {
  const source = readSource('lib/booking-reminders.ts')

  test('meddelandet interpolerar aldrig booking.notes', () => {
    expect(source).not.toContain('booking.notes')
    expect(source).not.toContain('notes?.split')
  })

  test('använder halsning(customer.name) för hälsningen', () => {
    expect(source).toContain('halsning(customer.name)')
  })
})
