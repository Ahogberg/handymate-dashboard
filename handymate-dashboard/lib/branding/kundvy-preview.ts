/**
 * Serverbyggaren för "Så ser dina kunder dig" — renderar de sju kontakt-
 * punkterna med exempeldata och FÖRETAGETS varumärke, via exakt samma
 * byggare som sändvägarna (buildQuoteEmailHtml, buildInvoiceEmailHtml,
 * bokningens SMS-text, buildReviewRequestMessage).
 *
 * Server-only: send-invoice drar in getServerSupabase. Klienten får
 * KundvyPreview[] via POST /api/settings/kundvy/preview.
 */
import { brandingFromConfig, type Branding, type BrandingSource } from '@/lib/branding/get-branding'
import { buildQuoteEmailHtml } from '@/lib/quotes/quote-email'
import { buildInvoiceEmailHtml } from '@/lib/invoices/send-invoice'
import { sanitizeSenderId } from '@/lib/sms/sender-id'
import { EXEMPEL, bokningSms, omdomeSms, type KundvyOverrides, type KundvyPreview, type TouchpointId } from '@/lib/branding/kundvy'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

/** business_config-raden (select('*')) + det sidan behöver utöver varumärket. */
export type KundvyConfigRow = BrandingSource & {
  google_review_url?: string | null
}

/**
 * Varumärket med sidans osparade reglage lagda ovanpå. `logo_url: null`
 * betyder uttryckligen "utan logotyp" (så ägaren ser texten-i-sidhuvudet-
 * läget innan hen tar bort loggan); undefined = raden bestämmer.
 */
export function brandingMedOverstyrning(row: KundvyConfigRow, overrides?: KundvyOverrides): Branding {
  const merged: BrandingSource = {
    ...row,
    accent_color: overrides?.accent_color !== undefined ? overrides.accent_color : row.accent_color,
    logo_url: overrides?.logo_url !== undefined ? overrides.logo_url : row.logo_url,
  }
  return brandingFromConfig(merged)
}

export function buildKundvyPreviews(row: KundvyConfigRow, overrides?: KundvyOverrides, only?: TouchpointId[]): KundvyPreview[] {
  const branding = brandingMedOverstyrning(row, overrides)
  const namn = branding.businessName
  const sender = sanitizeSenderId(namn)
  const o = EXEMPEL.offert
  const f = EXEMPEL.faktura

  const alla: KundvyPreview[] = [
    {
      id: 'offertmail',
      kind: 'email',
      subject: `Offert ${o.nummer} från ${namn}`,
      html: buildQuoteEmailHtml({
        branding,
        customerName: EXEMPEL.kund.namn,
        quoteNumber: o.nummer,
        title: o.titel,
        description: o.beskrivning,
        total: o.total,
        customerPays: o.kundBetalar,
        rotRutType: 'rot',
        validUntil: o.giltigTill,
        signUrl: `${APP_URL}/quote/exempel`,
        pdfUrl: `${APP_URL}/quote/exempel`,
        contactName: branding.contactName,
      }),
    },
    { id: 'offertsida', kind: 'page' },
    { id: 'bokning', kind: 'sms', sms: bokningSms(namn), sender },
    { id: 'portal', kind: 'page' },
    { id: 'jobbpass', kind: 'page' },
    {
      id: 'faktura',
      kind: 'email',
      subject: `Faktura ${f.nummer} från ${namn}`,
      html: buildInvoiceEmailHtml({
        customerName: EXEMPEL.kund.namn,
        branding,
        invoiceNumber: f.nummer,
        title: o.titel,
        dueDate: f.forfaller,
        subtotal: f.delsumma,
        vatRate: f.momssats,
        vatAmount: f.moms,
        total: f.total,
        amountToPay: f.attBetala,
        rotRutType: 'rot',
        rotRutDeduction: o.rotAvdrag,
        ocrNumber: f.ocr,
        portalUrl: `${APP_URL}/portal/exempel`,
        pdfUrl: `${APP_URL}/portal/exempel`,
      }),
    },
    { id: 'omdome', kind: 'sms', sms: omdomeSms(namn, row.google_review_url), sender },
  ]

  return only && only.length ? alla.filter((p) => only.includes(p.id)) : alla
}
