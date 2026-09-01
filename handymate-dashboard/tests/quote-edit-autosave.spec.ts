import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Fas 2 (offert-omtaget, 2026-08-31): edit-sidans egna hämtning/autospar/
 * payload-byggnad (tidigare ~1467 rader i denna fil) flyttade in i den
 * delade orkestratorn (QuoteBuilder.tsx mode="edit") + useQuoteBuilderSave.ts
 * + loadEditQuote.ts + QuoteEditView.tsx. Facit-filen läser nu ALLA dessa
 * ytor i stället för bara edit/page.tsx — SAMMA invarianter, ny plats.
 *
 * Historik: edit-sidan använde en gång `navigator.sendBeacon('/api/quotes',
 * payload)` på `beforeunload` — webbläsaren gör en POST för sendBeacon, och
 * POST /api/quotes SKAPAR en ny offert (PUT uppdaterar) — så att bara lämna
 * redigeringssidan kunde tyst skapa ett duplicerat utkast. Fixad innan denna
 * branch; denna fil bevisar att Fas 2-flytten inte återinför den, i NÅGON
 * av de filer edit-flödet nu spänner över.
 */

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const editPage = read('app/dashboard/quotes/[id]/edit/page.tsx')
const builder = read('app/dashboard/quotes/_shared/QuoteBuilder.tsx')
const save = read('app/dashboard/quotes/_shared/useQuoteBuilderSave.ts')
const payload = read('app/dashboard/quotes/_shared/buildQuotePayload.ts')
const loader = read('app/dashboard/quotes/_shared/loadEditQuote.ts')
const editView = read('app/dashboard/quotes/_shared/QuoteEditView.tsx')
const ALL_EDIT_SURFACES = [editPage, builder, save, payload, loader, editView]

test('offerteditorn skapar aldrig en ny offert vid navigation', () => {
  for (const source of ALL_EDIT_SURFACES) {
    expect(source).not.toContain('sendBeacon')
    expect(source).not.toContain('beforeunload')
  }

  // Edit-läget (mode==='edit') skriver ALLTID PUT, aldrig POST — både för
  // det explicita Spara/Skicka-anropet (save) och det tysta bakgrundsspar
  // (performAutoSave).
  expect(save).toContain("method: mode === 'edit' ? 'PUT' : 'POST'")
  expect(save).toMatch(
    /const performAutoSave = useCallback\(async \(\) => \{\s*if \(mode !== 'edit'\) return[\s\S]{0,400}method: 'PUT'/,
  )

  // Debounce-timern (5s, samma som förr) anropar den TYSTA performAutoSave()
  // — inte den explicita, navigerande save() — och lever i QuoteBuilder.tsx
  // (bevakar sidans state direkt), inte i hooken.
  expect(builder).toContain('void performAutoSave()')
  expect(builder).toMatch(/setTimeout\(\(\) => \{\s*void performAutoSave\(\)\s*\}, 5000\)/)
})

test('offerteditorn bevarar dolda rader genom laddning och autosave', () => {
  // Laddning (loadEditQuote.ts): is_hidden mappas med `?? false` (ALDRIG
  // `||`) — annars blir en redan-false-rad `undefined` och PUT-rutten
  // (app/api/quotes/route.ts) skriver `is_hidden ?? false` -> false ändå,
  // men en TIDIGARE dold rad (is_hidden: true) som tappas till `undefined`
  // här skulle bli osynlig-blir-synlig vid nästa autospar.
  expect(loader).toMatch(/quote\.quote_items\.map[\s\S]*is_hidden:\s*item\.is_hidden\s*\?\?\s*false/)

  // Både explicit save() och tysta performAutoSave() bygger PUT-payloaden
  // via buildQuotePayload — SAMMA funktion som create-läget, ingen egen
  // parallell payload-byggare som skulle kunna glömma ett fält (is_hidden
  // rör den aldrig — den passerar igenom via `...rest`, se
  // buildQuotePayload.ts).
  expect(save).toMatch(
    /buildQuotePayload\(\{\s*\.\.\.ctx,[\s\S]{0,200}items: workingItems,\s*mode,\s*quoteId,\s*\}\)[\s\S]{0,300}method: mode === 'edit' \? 'PUT' : 'POST'/,
  )
  expect(save).toMatch(/buildQuotePayload\(\{ \.\.\.ctx, items, mode, quoteId \}\)[\s\S]{0,300}method: 'PUT'/)
  expect(payload).toContain("({ ai_price_missing, save_to_products, ai_uncertain, ai_note, ...rest }) => rest")
})

test('Skicka i edit-läge sparar och öppnar riktiga skicka-dialogen', () => {
  // Bara /api/quotes/send får sätta leveranssanningen. Den gamla edit-vägen
  // skrev status sent och visade framgång utan att mejl/SMS hade skickats.
  expect(save).not.toMatch(/mode === 'edit' && send \? \{ status: 'sent' \}/)
  expect(save).toContain('`/dashboard/quotes/${quoteId}?send=true`')
  expect(save).not.toContain("toast.success(send ? 'Offert skickad!'")
})

test('giltighetsdatumet bucketeras aldrig om från "idag" — förankrat i created_at', () => {
  // Historik: en tidigare bugg konverterade det EXAKTA valid_until till en
  // bucketerad "N dagar"-knapp räknat från NUET i stället för offertens
  // created_at. PUT-rutten förankrar nu även det sparade datumet i samma
  // created_at, så autospar kan inte skjuta fram giltighetsdatumet. Loadern
  // räknar alltid från created_at — om någon av misstag byter till
  // `new Date()` här återinförs samma klass av bugg.
  expect(loader).toContain('function computeValidDays(')
  expect(loader).toMatch(/const createdDate = new Date\(createdAt\)/)
  expect(loader).not.toMatch(/computeValidDays[\s\S]{0,200}new Date\(\)/)
})
