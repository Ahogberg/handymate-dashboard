/**
 * Facit för Inkorg-sidans strukturlyft mot Command Center-språket
 * (Etapp L2b1, 2026-08-18, docs/HANDYMATE_DESIGN_SYSTEM.md).
 *
 * Ren visuell reskin — ZERO ändrad data/handlers. Testet är därför ett
 * käll-scan (samma idiom som tests/approvals-page-design.spec.ts), inte
 * ett DOM-test.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/inbox-page-design.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const PAGE_PATH = path.join(ROOT, 'app/dashboard/inbox/page.tsx')
const source = fs.readFileSync(PAGE_PATH, 'utf8')

test.describe('Inkorg — strukturlyft', () => {
  test('H1 säger "Inkorg" — inte det gamla engelska "Inbox"', () => {
    expect(source).toContain('>Inkorg<')
    expect(source).not.toMatch(/>Inbox</)
  })

  test('Sidebar.tsx pekar redan mot /dashboard/inkorg med etiketten "Inkorg"', () => {
    const sidebar = fs.readFileSync(path.join(ROOT, 'components/Sidebar.tsx'), 'utf8')
    expect(sidebar).toContain("label: 'Inkorg'")
    expect(sidebar).toContain("'/dashboard/inbox'")
  })

  test('ingen hover:text-white kvar (osynlig text på vit botten)', () => {
    expect(source).not.toContain('hover:text-white')
  })

  test('ingen bg-white/20-badge kvar', () => {
    expect(source).not.toContain('bg-white/20')
  })

  test('play/pause-knapparnas ikon är läsbar på primary-700-botten (var text-gray-900)', () => {
    const badPauseIcon = source.match(/<Pause className="w-5 h-5 text-gray-900"/g) || []
    expect(badPauseIcon.length).toBe(0)
    const goodPauseIcon = source.match(/<Pause className="w-5 h-5 text-white"/g) || []
    expect(goodPauseIcon.length).toBe(2)
  })

  test('flikraden (AI-förslag/Inspelningar) är segmenterad kontroll', () => {
    expect(source).toContain('bg-slate-100 rounded-xl mb-6')
    expect(source).toContain("activeTab === 'suggestions'")
  })

  test('stat-tiles är härledda ur redan hämtad `stats`-state — ingen ny fetch tillagd', () => {
    // Baslinjen (innan reskinnet) hade exakt dessa fetch-anrop i
    // fetchSuggestions/fetchRecordings/handleApprove/handleTranscribe/
    // voice-analyze — restylingen får inte lägga till eller ta bort någon.
    const fetchCalls = source.match(/fetch\('\//g) || []
    expect(fetchCalls.length).toBe(3)
    expect(source).toContain('{stats.pending}')
    expect(source).toContain('{stats.approved}')
    expect(source).toContain('{stats.pending + stats.approved + stats.rejected}')
  })

  test('rounded-card och font-heading används — fanns inte innan', () => {
    const roundedCard = source.match(/rounded-card/g) || []
    expect(roundedCard.length).toBeGreaterThanOrEqual(5)
    const fontHeading = source.match(/font-heading/g) || []
    expect(fontHeading.length).toBeGreaterThanOrEqual(3)
  })

  test('handler-anropen är oförändrade — restylingen bytte aldrig VAD en knapp gör', () => {
    expect(source).toContain("onClick={() => setActiveTab('suggestions')}")
    expect(source).toContain("onClick={() => setActiveTab('recordings')}")
    expect(source).toContain("onClick={() => setStatusFilter('pending')}")
    expect(source).toContain("onClick={() => setStatusFilter('completed')}")
    expect(source).toContain("onClick={() => setStatusFilter('all')}")
    expect(source).toContain('onClick={() => handleApprove(suggestion)}')
    expect(source).toContain('onClick={() => handleReject(suggestion.suggestion_id)}')
    expect(source).toContain('onClick={() => startEdit(suggestion)}')
    expect(source).toContain('onClick={() => handleTranscribe(recording.recording_id)}')
    expect(source).toContain('togglePlay(group.recording!)')
    expect(source).toContain('onClick={() => togglePlay(recording)}')
  })

  test('ingen mörk hero läggs till — Inkorg är en ljus sida', () => {
    const matches = source.match(/bg-grad-dark-hero/g) || []
    expect(matches.length).toBe(0)
  })
})
