/**
 * Facit för Dokument-sidans strukturlyft mot Command Center-språket
 * (Etapp L2b1, 2026-08-18, docs/HANDYMATE_DESIGN_SYSTEM.md).
 *
 * Ren visuell reskin — ZERO ändrad data/handlers. Testet är därför ett
 * käll-scan (samma idiom som tests/approvals-page-design.spec.ts), inte
 * ett DOM-test.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/documents-page-design.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const PAGE_PATH = path.join(ROOT, 'app/dashboard/documents/page.tsx')
const source = fs.readFileSync(PAGE_PATH, 'utf8')

test.describe('Dokument — strukturlyft', () => {
  test('dubbel sidebar-offset borttagen — layout.tsx äger redan md:ml-64', () => {
    expect(source).not.toContain('md:ml-64')
  })

  test('inga inverterade bg-primary-800/text-gray-900-par kvar (aktiv flik var oläsbar)', () => {
    // Facit bannar strängmönstret utan att självt stava det ihopklistrat —
    // bygg det av delar så self-reference-fällan inte slår till på testfilen.
    const bannedBg = 'bg-primary-' + '800'
    expect(source).not.toContain(bannedBg)
  })

  test('primär-CTA:erna har text-white — inte längre osynlig text på mörk botten', () => {
    // Räknar rader med bg-primary-700 (den nya CTA-bakgrunden efter
    // reskinnet) och kräver att var och en också bär text-white på samma
    // rad — annars ärver knappen den mörka text-gray-900 från root-diven
    // igen (den ursprungliga buggen, rad ~703).
    const lines = source.split('\n').filter(l => l.includes('bg-primary-700') && l.includes('rounded'))
    expect(lines.length).toBeGreaterThanOrEqual(5)
    for (const line of lines) {
      expect(line).toContain('text-white')
    }
  })

  test('flikraden (Mina dokument/Uppladdade filer/Mallar) är segmenterad kontroll', () => {
    expect(source).toContain('bg-slate-100 rounded-xl p-1')
    expect(source).toContain("view === 'documents' ? 'bg-white text-primary-700 shadow-sm'")
  })

  test('rounded-card används på dokumentkorten', () => {
    const matches = source.match(/rounded-card/g) || []
    expect(matches.length).toBeGreaterThanOrEqual(5)
  })

  test('font-heading används i sidhuvud och korttitlar — fanns inte innan', () => {
    const matches = source.match(/font-heading/g) || []
    expect(matches.length).toBeGreaterThanOrEqual(5)
  })

  test('min-h-[44px] finns på handlingsknapparna (mobil tumzon)', () => {
    const matches = source.match(/min-h-\[44px\]/g) || []
    expect(matches.length).toBeGreaterThanOrEqual(10)
  })

  test('handler-anropen är oförändrade — restylingen bytte aldrig VAD en knapp gör', () => {
    expect(source).toContain('onClick={startCreate}')
    expect(source).toContain("onClick={() => { setView('documents'); setSelectedCategory(null) }}")
    expect(source).toContain('onClick={() => viewDocument(doc)}')
    expect(source).toContain('onClick={() => openEdit(doc)}')
    expect(source).toContain('onClick={() => openSign(doc)}')
    expect(source).toContain('onClick={() => deleteDocument(contextMenu.docId)}')
    expect(source).toContain('onClick={() => openUploadedFile(file)}')
    expect(source).toContain('onClick={() => deleteUploadedFile(file)}')
    expect(source).toContain('onClick={() => selectTemplate(tpl)}')
    expect(source).toContain('onClick={createDocument}')
    expect(source).toContain('onClick={saveDocument}')
    expect(source).toContain('onClick={markComplete}')
    expect(source).toContain('onClick={submitSignature}')
    expect(source).toContain("onClick={(e) => { e.stopPropagation(); duplicateTemplate(tpl) }}")
  })

  test('data-hämtningen (fetchData/Promise.all mot /api/documents mfl) är oförändrad', () => {
    expect(source).toContain("fetch('/api/documents/categories'")
    expect(source).toContain("fetch('/api/documents/templates'")
    expect(source).toContain("fetch('/api/documents'")
    expect(source).toContain("fetch('/api/customers'")
    expect(source).toContain("fetch('/api/projects'")
  })

  test('ingen mörk hero läggs till — Dokument är en ljus sida', () => {
    const matches = source.match(/bg-grad-dark-hero/g) || []
    expect(matches.length).toBe(0)
  })
})
