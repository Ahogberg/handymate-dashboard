/**
 * Facit: Portalens beslutskort (Varumärkeslagret yta 4, 2026-09-07)
 * — Design: "Kundportal beslut.dc.html".
 *
 *   npx playwright test tests/portal-beslutskort.spec.ts --project=chromium --no-deps
 *
 * Källskanning — ingen webbläsare, ingen databas. Vaktar att
 *   1. hemskärmen har EN sanning för det som väntar (/decisions) och att
 *      raderna går rakt in i beslutet (ata / invoice / review),
 *   2. ÄTA-beslutet går mot samma /api/ata/sign/[token] som SMS-länken,
 *      med "namn + bindande kryss" som standard och "Tacka nej" som utväg,
 *   3. fakturan är ett betalkort — Swish först, bankgiro som reserv,
 *      "Jag har betalat" utanför Swish-blocket, dokumentet nedanför —
 *      utan att portal-invoice-recovery-facitet bryts (lucide-importen),
 *   4. omdömet sparas (portal_review) och vägdelas: 1–3 till hantverkaren,
 *      4–5 till Google; ett omdöme per kund,
 *   5. globala regler: ROT alltid "preliminärt", ingen BankID, inga
 *      kortbetalningar/delbetalning, inga uppfunna siffror (inga
 *      toLocaleString-kronor i beslutsytorna), primärknappen är #0F172A,
 *   6. migrationen v221 finns med tabell + RLS + signeringsläge,
 *   7. de nya publika rutterna är registrerade i launch- och
 *      error-swallow-kontrakten.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')
const finns = (rel: string) => fs.existsSync(path.join(ROOT, rel))

const P = 'app/portal/[token]'
const C = `${P}/components`

test.describe('Beslutskort — hemskärmen "Väntar på dig"', () => {
  test('decisions-routen är EN sanning: dynamisk, tokenbunden, bara skickade ÄTA och obetalda fakturor', () => {
    const src = kod('app/api/portal/[token]/decisions/route.ts')
    expect(src).toMatch(/export const dynamic\s*=\s*['"]force-dynamic['"]/)
    expect(src).toContain("getCustomerFromPortalToken(")
    expect(src).toMatch(/\.eq\('status',\s*'sent'\)/)
    expect(src).toContain("isCustomerSettled(")
    expect(src).toMatch(/\.eq\('approval_type',\s*'confirm_payment'\)/)
    expect(src).toContain("review_request_sent_at")
    expect(src).toContain(".from('portal_review')")
    // Varje delfråga binds till företaget — aldrig bara kund-id.
    expect(src.match(/\.eq\('business_id', businessId\)/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
  })

  test('page.tsx laddar /decisions, skickar det till Hem och renderar de tre beslutsvyerna', () => {
    const src = kod(`${P}/page.tsx`)
    expect(src).toContain('/api/portal/${token}/decisions')
    expect(src).toContain('decisions={decisions}')
    expect(src).toContain('<PortalAtaDecision')
    expect(src).toContain('<PortalInvoiceDetail')
    expect(src).toContain('<PortalReviewCTA')
    expect(src).toMatch(/if \(route === 'ata'\)/)
    expect(src).toMatch(/if \(route === 'invoice'\)/)
    expect(src).toMatch(/if \(route === 'review'\)/)
    expect(src).toContain("onOpenAta={(changeId) => navigate('ata', { changeId })}")
  })

  test('PortalHome: "Väntar på dig" med rader rakt in i beslutet, räknare, Hej-rad — och de gamla facitlitteralerna kvar', () => {
    const src = kod(`${C}/PortalHome.tsx`)
    expect(src).toContain('decisions?: PortalDecisions | null')
    expect(src).toContain('Väntar på dig')
    expect(src).toContain('className="bp-waiting-row"')
    expect(src).toContain("onNavigate('ata', { changeId: a.change_id })")
    expect(src).toContain("onNavigate('invoice', { invoiceId: inv.invoice_id })")
    expect(src).toContain("onNavigate('review')")
    expect(src).toContain('Tilläggsarbete att godkänna')
    expect(src).toContain('Faktura att betala')
    expect(src).toContain('Hur blev det?')
    expect(src).toContain('bp-counter red')
    expect(src).toContain('subtitle={`Hej ${firstName}`}')
    // Tomt → inget kort, aldrig en tom rubrik.
    expect(src).toMatch(/waiting\.length > 0 && \(/)
    // Offerter får ingen påhittad räknare.
    expect(src).not.toMatch(/label: 'Offerter'[^\n]*count: (?!0)/)
    // Befintliga facit (portal-hub, fastighetspass, attribution).
    expect(src).toContain('statusChip.puls && <span className="bp-live-dot" />')
    expect(src).toContain("'Planeras'")
    expect(src).toContain('Ärende {activeProject.project_number}')
    expect(src).toContain('<PortalHandymateAttribution attribution={portal.attribution} />')
    expect(src).toContain('DET HÄR SITTER HOS DIG')
  })
})

test.describe('Beslutskort — ÄTA "Tilläggsarbete att godkänna"', () => {
  test('beslutet går mot /api/ata/sign/[token] med namn + bindande kryss, och "Tacka nej" är en utväg', () => {
    const src = kod(`${C}/PortalAtaDecision.tsx`)
    expect(src).toContain('/api/ata/sign/${ata.sign_token}')
    expect(src).toMatch(/action: 'sign'[^\n]*accepted_terms: true/)
    expect(src).toContain("action: 'decline'")
    expect(src).toContain('Tacka nej')
    expect(src).toContain('className="bp-btn-primary"')
    expect(src).toContain("ata.status === 'sent' && !!ata.sign_token")
    expect(src).toContain('Ladda ner ÄTA-dokumentet (PDF)')
    expect(src).toContain('<PortalFooter')
    // Ritad signatur är ett val per firma — aldrig ett krav.
    expect(src).toContain("ataSignatureMode")
    expect(src).toContain('preliminärt')
  })

  test('projektvyn signerar inte längre inline — kortet öppnar beslutsvyn', () => {
    const src = kod(`${C}/PortalProjectDetail.tsx`)
    expect(src).toContain('onOpenAta: (changeId: string) => void')
    expect(src).toContain('onOpenAta(ata.change_id)')
    expect(src).not.toContain("from './SignatureCanvas'")
    expect(src).not.toContain('onAtaSigned')
    expect(src).not.toContain('/api/ata/sign/')
    // ata-dokumentet.spec:s litteraler kvar.
    expect(src).toContain('ataKundStatusLabel')
    expect(src).toContain('rotAvdrag')
    expect(src).toContain('pdf_url')
    expect(src).toContain('Jobbpasset — vad som gjordes hos dig')
    expect(src).toContain('>Fältrapporter</h3>')
    expect(src).toContain('Ärende {project.project_number}')
  })
})

test.describe('Beslutskort — Faktura "Att betala"', () => {
  test('PortalInvoiceDetail: Swish först, bankgiro som reserv, "Jag har betalat" utanför Swish-blocket, dokumentet kvar med återförsök', () => {
    const src = kod(`${C}/PortalInvoiceDetail.tsx`)
    // portal-invoice-recovery.ui.spec mockar exakt dessa fyra lucide-ikoner.
    expect(src).toContain("import { ArrowLeft, Clock, Download, Loader2 } from 'lucide-react'")
    expect(src).toContain("import PortalFooter from './PortalFooter'")
    expect(src).toContain('<PortalSwishBlock')
    expect(src).toContain('Jag har betalat')
    expect(src).toContain('/invoices/${inv.invoice_id}/claim-paid')
    expect(src).toContain('Fakturadokumentet kunde inte visas')
    expect(src).toContain('Försök igen')
    expect(src).toContain('Öppna PDF')
    expect(src).toContain('preliminärt')
    expect(src).toContain('onReview')
    // Godkända ÄTA på fakturan härleds — aldrig uppfunna.
    expect(src).toMatch(/ataSum > 0 && ataSum < /)
  })

  test('PortalSwishBlock: EN knapp med förifyllt belopp, QR bara på desktop, inget betalpåstående i blocket', () => {
    const src = kod(`${C}/PortalSwishBlock.tsx`)
    expect(src).toContain('swish://payment?data=')
    expect(src).toContain("matchMedia('(min-width: 768px)')")
    expect(src).toContain('Belopp och meddelande är förifyllda.')
    expect(src).not.toContain('claim-paid')
    expect(src).not.toMatch(/method:\s*'POST'/)
    // Knappen bor i PortalInvoiceDetail — bara kommentaren får nämna den.
    expect(src).not.toMatch(/>\s*Jag har betalat|'Jag har betalat'/)
  })

  test('recovery-facitet känner till PortalFooter-importen', () => {
    const src = kod('tests/portal-invoice-recovery.ui.spec.ts')
    expect(src).toContain("'./PortalFooter': { default:()=>null }")
  })
})

test.describe('Beslutskort — Omdöme "Hur blev det?"', () => {
  test('review-routen sparar, vägdelar på betyget och tillåter ett omdöme per kund', () => {
    const src = kod('app/api/portal/[token]/review/route.ts')
    expect(src).toMatch(/export const dynamic\s*=\s*['"]force-dynamic['"]/)
    expect(src).toContain("getCustomerFromPortalToken(")
    expect(src).toContain('isLowRating(')
    expect(src).toContain('receiveCustomerMessage(')
    expect(src).toContain(".from('portal_review')")
    expect(src).toMatch(/status: 409/)
    expect(src).toContain('REVIEW_COMMENT_MAX')
    expect(src).toContain('google_clicked_at')
  })

  test('PortalReviewCTA: stjärnor → låg väg till hantverkaren, hög väg till Google; redan lämnat visas', () => {
    const src = kod(`${C}/PortalReviewCTA.tsx`)
    expect(src).toContain('/api/portal/${token}/review')
    expect(src).toContain('isLowRating(')
    expect(src).toContain('Vad blev inte bra?')
    expect(src).toContain('Recensera på Google')
    expect(src).toContain("method: 'PATCH'")
    expect(src).toContain('Tack för ditt omdöme, lämnat')
    expect(src).toContain('res.status === 409')
    expect(src).toContain('REVIEW_TAGS')
  })
})

test.describe('Beslutskort — globala regler', () => {
  const YTOR = [
    `${C}/PortalHome.tsx`,
    `${C}/PortalAtaDecision.tsx`,
    `${C}/PortalInvoiceDetail.tsx`,
    `${C}/PortalSwishBlock.tsx`,
    `${C}/PortalReviewCTA.tsx`,
    `${C}/PortalProjectDetail.tsx`,
    `${C}/PortalFooter.tsx`,
  ]

  for (const rel of YTOR) {
    test(`${path.basename(rel)}: ingen BankID, ingen kort-/delbetalning, inga toLocaleString-kronor`, () => {
      const src = kod(rel)
      expect(src).not.toMatch(/BankID/i)
      expect(src).not.toMatch(/delbetal|kortbetal|Klarna/i)
      expect(src).not.toContain('.toLocaleString(')
    })
  }

  test('ROT sägs aldrig utan "preliminärt" i beslutsytorna', () => {
    for (const rel of [`${C}/PortalAtaDecision.tsx`, `${C}/PortalInvoiceDetail.tsx`]) {
      const src = kod(rel)
      if (/ROT/.test(src)) expect(src, rel).toContain('preliminärt')
    }
  })

  test('portal.css: primärknappen är #0F172A och beslutsklasserna finns', () => {
    const css = kod(`${P}/portal.css`)
    const primary = css.slice(css.indexOf('.bp-btn-primary {'), css.indexOf('.bp-btn-primary {') + 300)
    expect(primary).toContain('background: #0F172A')
    for (const cls of ['.bp-eyebrow', '.bp-status', '.bp-btn-secondary', '.bp-check', '.bp-dark-card', '.bp-pill-prel', '.bp-counter.red', '.bp-waiting-row', '.bp-dot.red', '.bp-copy-row', '.bp-star', '.bp-tag', '.bp-footer', '.bp-sig-pad']) {
      expect(css, cls).toContain(cls)
    }
  })

  test('PortalFooter bär firmans identitet + Handymate-stämpeln via den delade komponenten', () => {
    const src = kod(`${C}/PortalFooter.tsx`)
    expect(src).toContain('<PortalHandymateAttribution')
    expect(src).toContain('orgNumber')
  })
})

test.describe('Beslutskort — migration och kontrakt', () => {
  test('sql/v221_portal_beslut.sql: portal_review med RLS enligt v101, signeringsläge på business_config', () => {
    expect(finns('sql/v221_portal_beslut.sql')).toBe(true)
    const sql = kod('sql/v221_portal_beslut.sql')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS portal_review')
    expect(sql).toContain('ALTER TABLE portal_review ENABLE ROW LEVEL SECURITY')
    expect(sql).toContain('is_business_member(business_id)')
    expect(sql).toContain('portal_review_service_role')
    expect(sql).toContain('portal_ata_signature_mode')
    expect(sql).toMatch(/CHECK \(portal_ata_signature_mode IN \('name_checkbox', 'drawn'\)\)/)
    expect(sql).toContain('REVOKE ALL ON TABLE public.portal_review FROM PUBLIC, anon, authenticated')
  })

  test('de nya publika rutterna är registrerade i launch- och error-swallow-kontrakten', () => {
    const launch = kod('tests/launch-public-token-contract.spec.ts')
    const swallow = kod('tests/portal-error-swallow.spec.ts')
    for (const r of ["'app/api/portal/[token]/decisions/route.ts'", "'app/api/portal/[token]/review/route.ts'"]) {
      expect(launch, r).toContain(r)
      expect(swallow, r).toContain(r)
    }
  })
})
