/**
 * Facit för Revenue Review V1 (X1b, 2026-08-09).
 *
 * ═══ SCOPE-REGLERNA UR ROADMAPEN ═══
 *
 *   - EXAKT EN källspecifik väg: ÄTA-fyndet → fakturaUTKAST. Material- och
 *     projektfynd förblir granskningssignaler.
 *   - Ingen autosändning. Ingen universell tid+material+ÄTA-byggare.
 *   - Omkörning skapar aldrig en andra faktura.
 *   - Avfärdande kräver angiven orsak; falsklarm mäts.
 *   - "Återvunnen SEK" är aldrig detektorns belopp.
 *
 *   npx playwright test tests/revenue-review.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const kod = (p: string) =>
  fs.readFileSync(path.join(ROOT, p), 'utf8')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')

const RUTT = 'app/api/revenue-review/[id]/route.ts'
const LISTA = 'app/api/revenue-review/route.ts'

test.describe('exakt en källspecifik väg', () => {
  test('bara ÄTA-fyndet med DRAFT_AFTER_REVIEW får en fakturaväg', () => {
    const s = kod(RUTT)
    expect(s).toContain("payload.kind !== 'ata_ej_fakturerad'")
    expect(s).toContain("payload.recommended_action !== 'DRAFT_AFTER_REVIEW'")
    // Övriga fynd får ett besked, inte en byggare.
    expect(s).toContain('granskningssignal utan fakturaväg')
  })

  test('utkastet skapas via den befintliga byggaren — aldrig direktinsert', () => {
    const s = kod(RUTT)
    expect(s).toContain('createInvoice(supabase')
    expect(s).toContain("status: 'draft'")
    expect(s, 'rutten skriver invoice-tabellen direkt').not.toMatch(/from\('invoice'\)[\s\S]{0,120}?\.insert\(/)
  })

  test('ingen autosändning — rutten rör aldrig sändvägen', () => {
    const s = kod(RUTT)
    expect(s).not.toContain('/api/invoices/send')
    expect(s).not.toContain("'sent'")
  })
})

test.describe('sanningsreglerna', () => {
  test('beloppen läses ur källraderna vid granskningen, inte ur kortets preview', () => {
    const s = kod(RUTT)
    const kallLasning = s.indexOf("select('change_id, description, amount")
    const bygge = s.indexOf('createInvoice(supabase')
    expect(kallLasning, 'källraderna läses inte').toBeGreaterThan(-1)
    expect(kallLasning).toBeLessThan(bygge)
    // Preview-fältet används aldrig som fakturaunderlag.
    const efterKontrakt = s.slice(s.indexOf('SKAPA UTKAST'))
    expect(efterKontrakt).not.toContain('payload.preview')
  })

  test('källfärskheten prövas FÖRE fakturaskapandet — inaktuellt kort stängs', () => {
    const s = kod(RUTT)
    const farskhet = s.indexOf('!a.invoice_id && !a.invoiced_at')
    const bygge = s.indexOf('createInvoice(supabase')
    expect(farskhet).toBeGreaterThan(-1)
    expect(farskhet).toBeLessThan(bygge)
    expect(s).toContain('auto_stale: true')
    expect(s).toContain('{ status: 409 }')
  })

  test('omkörning skapar aldrig en andra faktura', () => {
    // Idempotens: icke-pending kort svarar med sitt utfall före all logik.
    const s = kod(RUTT)
    const idempotens = s.indexOf("kort.status !== 'pending'")
    const bygge = s.indexOf('createInvoice(supabase')
    expect(idempotens).toBeGreaterThan(-1)
    expect(idempotens).toBeLessThan(bygge)
    expect(s).toContain('already_resolved: true')
  })

  test('källorna markeras via den delade atomiska vägen', () => {
    const s = kod(RUTT)
    const bygge = s.indexOf('createInvoice(supabase')
    const markering = s.indexOf('markInvoiceSources(')
    expect(markering, 'källmarkeringen saknas').toBeGreaterThan(bygge)
  })

  test('avfärdande kräver angiven orsak', () => {
    const s = kod(RUTT)
    expect(s).toContain("String(body?.reason || '').trim()")
    expect(s).toContain('falsklarm ska gå att lära sig av')
  })
})

test.describe('observabiliteten — separata tal', () => {
  test('identifierad, utkast, avfärdad och inaktuell räknas var för sig', () => {
    const s = kod(LISTA)
    for (const talet of ['identifierade', 'utkast', 'avfardade', 'inaktuella']) {
      expect(s, `${talet} saknas som eget tal`).toContain(`${talet}:`)
    }
  })

  test('kronor rapporteras som det hantverkaren gjorde utkast av — inte detektorns belopp', () => {
    const s = kod(LISTA)
    expect(s).toContain('drafted_amount_kr')
    // Summeringen får inte gå över amount_kr (svepets identifierade
    // potential) — bara drafted_amount_kr (det granskade utfallet).
    const summering = s.slice(s.indexOf('utkast_kr'), s.indexOf('utkast_kr') + 200)
    expect(summering).not.toMatch(/[^d_]amount_kr|\(k\)\.amount_kr/)
    expect(summering).toContain('drafted_amount_kr')
  })
})

test.describe('kontraktet mot godkännandekön hålls', () => {
  test('missad_intakt är fortfarande REVIEW_REQUIRED — klicket kan inte fakturera', () => {
    // Reviewvägen är ett eget medvetet steg; kortklicket i kön förblir
    // icke-exekverande. Glider klassningen är hela X1b-designen bruten.
    const { classify } = require('../lib/approvals/action-contract')
    expect(classify('missad_intakt')).toBe('REVIEW_REQUIRED')
  })
})

test.describe('den smala ytan', () => {
  const YTA = 'components/pengar/Intaktsfynden.tsx'

  test('bor på Pengar på bordet — ingen femte parallell sida', () => {
    expect(kod('app/dashboard/pengar/page.tsx')).toContain('<Intaktsfynden />')
    expect(fs.existsSync(path.join(ROOT, 'app/dashboard/revenue-review'))).toBe(false)
    expect(fs.existsSync(path.join(ROOT, 'app/dashboard/intaktsfynd'))).toBe(false)
  })

  test('utkastsknappen finns bara där servern skulle säga ja', () => {
    const s = kod(YTA)
    expect(s).toContain("fynd.kind === 'ata_ej_fakturerad' && fynd.recommended_action === 'DRAFT_AFTER_REVIEW'")
  })

  test('avfärdandet kräver text innan knappen fungerar', () => {
    const s = kod(YTA)
    expect(s).toContain('disabled={!orsak.trim()')
  })

  test('tyst när inget väntar — ett tomt avsnitt är brus', () => {
    const s = kod(YTA)
    expect(s).toContain('data.identifierade.length === 0) return null')
  })

  test('beskedet lovar aldrig sändning — utkastet skickas från Fakturor', () => {
    const s = kod(YTA)
    expect(s).toContain('granska och skicka från Fakturor')
    expect(s).not.toContain('skickad till kund')
  })
})
