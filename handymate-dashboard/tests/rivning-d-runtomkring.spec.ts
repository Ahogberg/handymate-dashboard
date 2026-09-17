/**
 * Facit: rivning paket D — runtomkring (2026-09-17), BARA de säkra raderna
 * 3.1, 3.2, 3.3, 3.4, 3.6 (hoppad), 3.8, 3.9, 3.11, 3.12.
 *
 * Källskanning, ingen browser/session — se tasks/plan-rivning-bcd-2026-09-17.md
 * och tasks/rapport-rivning-bcd-2026-09-17.md för motivering per rad.
 *
 *   ./node_modules/.bin/playwright test tests/rivning-d-runtomkring.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { sortQuotesByRecency } from '../lib/quotes/list-filter'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const LIST_PAGE = read('app/dashboard/quotes/page.tsx')
const DETAIL_PAGE = read('app/dashboard/quotes/[id]/page.tsx')
const HEADER = read('app/dashboard/quotes/[id]/components/QuoteHeader.tsx')
const SUMMARY_CARD = read('app/dashboard/quotes/[id]/components/QuoteSummaryCard.tsx')
const SEND_MODAL = read('app/dashboard/quotes/[id]/components/QuoteSendModal.tsx')
const QUOTE_TEXTS_PAGE = read('app/dashboard/settings/quote-texts/page.tsx')
const LIST_FILTER = read('lib/quotes/list-filter.ts')

test.describe('3.1 — listans KPI-kort + acceptrate + QuotePerformanceCard blir en rad', () => {
  test('de fyra separata KPI-korten (Utkast/Skickade/Accepterade/Acceptrate) är borta', () => {
    expect(LIST_PAGE).not.toMatch(/label: 'Utkast', value: stats\.draft/)
    expect(LIST_PAGE).not.toContain("label: 'Acceptrate', value: `${stats.acceptRate}%`")
  })

  test('undertexten med antal+acceptrate under H1 är borta (bara tomt-läge kvar)', () => {
    expect(LIST_PAGE).not.toContain('acceptrate`')
  })

  test('en sammanfattningsrad visar antal, summa och acceptgrad', () => {
    expect(LIST_PAGE).toContain('sumTotal')
    expect(LIST_PAGE).toMatch(/Offerter<\/p>[\s\S]{0,160}stats\.total/)
    expect(LIST_PAGE).toMatch(/Summa<\/p>[\s\S]{0,160}formatCurrency\(stats\.sumTotal\)/)
    expect(LIST_PAGE).toMatch(/Acceptgrad<\/p>[\s\S]{0,160}stats\.acceptRate/)
  })

  test('QuotePerformanceCard är kvar (bär funnel/loss-reasons/tidsavvikelse som ingen annan yta här har)', () => {
    expect(LIST_PAGE).toContain('<QuotePerformanceCard />')
  })
})

test.describe('3.2 — "Föreslå nudge"-badgen bort, unopened-quote-nudge orörd', () => {
  test('badgen och dess villkor är borta ur listan (bara omnämnd i rivningskommentaren)', () => {
    expect(LIST_PAGE).not.toMatch(/>\s*Föreslå nudge\s*</)
    expect(LIST_PAGE).not.toContain('showNudge')
  })

  test('Daniels obeöppnad-offert-nudge (lib/agents/daniel/unopened-quotes.ts) finns kvar, orört och eget facit', () => {
    expect(fs.existsSync(path.join(ROOT, 'lib/agents/daniel/unopened-quotes.ts'))).toBe(true)
    expect(fs.existsSync(path.join(ROOT, 'tests/unopened-quote-nudge.spec.ts'))).toBe(true)
  })
})

test.describe('3.3 — "Acceptera" flyttad från listan till detaljsidan', () => {
  test('listans radknapp (confirm-baserad) och dess state är borta', () => {
    expect(LIST_PAGE).not.toContain('handleAcceptQuote')
    expect(LIST_PAGE).not.toContain('acceptingId')
    expect(LIST_PAGE).not.toMatch(/>\s*Acceptera\s*</)
  })

  test('detaljsidan har en "Markera som accepterad"-knapp som anropar /api/quotes/accept, ingen statusskrivning från klienten', () => {
    expect(HEADER).toContain('Markera som accepterad')
    expect(HEADER).toContain('onMarkAccepted')
    expect(DETAIL_PAGE).toContain('const markAccepted')
    expect(DETAIL_PAGE).toMatch(/fetch\('\/api\/quotes\/accept', \{[\s\S]{0,120}method: 'POST'/)
    expect(DETAIL_PAGE).not.toMatch(/\.from\('quotes'\)[\s\S]{0,200}status:\s*'accepted'/)
  })

  test('samma endpoint som förut — ingen ny statusskrivande väg uppfanns', () => {
    // /api/quotes/accept är en egen, kontraktstestad väg (concurrency, RBAC,
    // tenant-isolering) — inte en övergiven dubblett av finalizeAcceptedQuote.
    // Se rapporten: att slå ihop den kräver ett beslut, inte en UI-flytt.
    const acceptRoute = read('app/api/quotes/accept/route.ts')
    expect(acceptRoute).toContain("status: 'accepted'")
  })
})

test.describe('3.4 — sortering: senast ändrad först', () => {
  test('sortQuotesByRecency finns och sorterar på updated_at, fallback created_at', () => {
    expect(LIST_FILTER).toContain('export function sortQuotesByRecency')
    expect(LIST_FILTER).toContain('a.updated_at || a.created_at')
  })

  test('listan sorterar de filtrerade offerterna med den', () => {
    expect(LIST_PAGE).toContain('sortQuotesByRecency(quotes.filter(')
  })

  test('beteende: senast uppdaterad rad hamnar överst, äldre rad utan updated_at faller tillbaka på created_at', () => {
    const rows = [
      { id: 'gammal-utan-uppdatering', created_at: '2026-01-01T00:00:00Z' },
      { id: 'nyss-andrad', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-09-17T08:00:00Z' },
      { id: 'skapad-senare-aldrig-andrad', created_at: '2026-06-01T00:00:00Z' },
    ]
    expect(sortQuotesByRecency(rows).map((r: any) => r.id)).toEqual([
      'nyss-andrad', 'skapad-senare-aldrig-andrad', 'gammal-utan-uppdatering',
    ])
  })
})

test.describe('3.6 — HOPPAD: legacy ROT/RUT-fälten skrivs fortfarande, dialekterna slås INTE ihop', () => {
  test('rot_rut_deduction skrivs fortfarande av minst en aktiv väg', () => {
    const routeSource = read('app/api/quotes/route.ts')
    expect(routeSource).toContain('updates.rot_rut_deduction')
  })

  test('QuoteSummaryCard behåller läsningen av legacy-fälten (inte bara den nya dialekten)', () => {
    expect(SUMMARY_CARD).toContain('quote.rot_rut_type')
    expect(SUMMARY_CARD).toContain('quote.rot_rut_deduction')
    expect(SUMMARY_CARD).toContain('hasNewRotRut')
  })
})

test.describe('3.8 — Kopia/BCC/Ämne bakom "Fler mottagare"', () => {
  test('fälten finns bakom en hopfällbar sektion', () => {
    expect(SEND_MODAL).toContain('Fler mottagare')
    expect(SEND_MODAL).toContain('moreOpen')
  })

  test('sektionen startar öppen om Kopia/BCC redan har ett värde', () => {
    expect(SEND_MODAL).toMatch(/useState\(\(\) => !!\(extraEmails\.trim\(\) \|\| bccEmails\.trim\(\)\)\)/)
  })

  test('Kopia/BCC/Ämne ligger inuti moreOpen-blocket, inte direkt i huvudvägen', () => {
    const idx = SEND_MODAL.indexOf('Fler mottagare')
    const after = SEND_MODAL.slice(idx, idx + 2800)
    expect(after).toContain('Kopia')
    expect(after).toContain('BCC')
    expect(after).toContain('Ämne')
  })
})

test.describe('3.9 — Verklighetskontrollen visas bara när "ready"', () => {
  test('laddningsspinnern och "inte tillgänglig"-blocket är borttagna helt', () => {
    expect(SEND_MODAL).not.toContain('Business Twin jämför med verifierade efterkalkyler')
    expect(SEND_MODAL).not.toContain('Verklighetskontrollen är inte tillgänglig')
    expect(SEND_MODAL).not.toContain('quoteIntelligenceLoading &&')
  })

  test('analysen renderas fortfarande när status är ready', () => {
    expect(SEND_MODAL).toContain("quoteIntelligence?.status === 'ready' && quoteIntelligence.analysis")
    expect(SEND_MODAL).toContain('Business Twin · verklighetskontroll')
  })
})

test.describe('3.11 — Inledning/Avslutning bort ur Standardtexter-inställningen', () => {
  test('typerna finns inte längre i TEXT_TYPES', () => {
    const typesBlock = QUOTE_TEXTS_PAGE.slice(QUOTE_TEXTS_PAGE.indexOf('TEXT_TYPES = ['), QUOTE_TEXTS_PAGE.indexOf(']', QUOTE_TEXTS_PAGE.indexOf('TEXT_TYPES = [')))
    expect(typesBlock).not.toContain("value: 'introduction'")
    expect(typesBlock).not.toContain("value: 'conclusion'")
    expect(typesBlock).toContain("value: 'not_included'")
    expect(typesBlock).toContain("value: 'ata_terms'")
    expect(typesBlock).toContain("value: 'payment_terms'")
  })

  test('default-fliken pekar på en typ som fortfarande finns (kraschar inte på en borttagen typ)', () => {
    expect(QUOTE_TEXTS_PAGE).not.toContain("useState('introduction')")
    expect(QUOTE_TEXTS_PAGE).toContain("useState('not_included')")
  })

  test('ingen radering av sparade rader — bara API-anrop kvar är läsning/redigering/borttagning av ENSKILDA rader via knappar, ingen bulk-SQL', () => {
    expect(QUOTE_TEXTS_PAGE).not.toMatch(/text_type\s*=\s*'introduction'/)
    expect(QUOTE_TEXTS_PAGE).not.toContain('DELETE FROM')
  })
})

test.describe('3.12 — följer av 2.4: per-offert-stilväljaren är borta ur offertflödet', () => {
  test('QuoteStylePicker monteras inte i create/edit-offertflödet', () => {
    const builder = read('app/dashboard/quotes/_shared/QuoteBuilder.tsx')
    const editView = read('app/dashboard/quotes/_shared/QuoteEditView.tsx')
    expect(builder).not.toMatch(/<QuoteStylePicker[\s/>]/)
    expect(editView).not.toMatch(/<QuoteStylePicker[\s/>]/)
  })

  test('komponenten lever kvar åt fakturans egen per-faktura-stil (utanför scope)', () => {
    expect(fs.existsSync(path.join(ROOT, 'components/quotes/QuoteStylePicker.tsx'))).toBe(true)
    const invoiceEditor = read('app/dashboard/invoices/_shared/InvoiceEditor.tsx')
    expect(invoiceEditor).toContain('QuoteStylePicker')
  })
})
