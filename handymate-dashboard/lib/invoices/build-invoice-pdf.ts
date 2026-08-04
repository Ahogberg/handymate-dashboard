import { generateOCR } from '@/lib/ocr'
import { generateSwishQR } from '@/lib/swish-qr'
import { buildInvoiceTemplateData, selectInvoiceTemplate } from '@/lib/invoice-templates'
import { renderHtmlToPdf } from '@/lib/pdf/render-html-to-pdf'

/**
 * ETAPP 6b (offert-masterplan.md, faktura-sprinten): EN källa för hur en
 * fakturas PDF byggs — samma mall-HTML→Chromium-väg som offerten (se
 * lib/pdf/render-html-to-pdf.ts). Delas av:
 *  - app/api/invoices/pdf/route.ts     (nedladdning, format=pdf)
 *  - app/api/invoices/send/route.ts    (mejlbilaga)
 *  - app/api/invoices/[id]/reminder-pdf/route.ts (påminnelse-PDF, format=pdf)
 *
 * Tidigare byggde `invoices/send` en EGEN, avkortad jsPDF-data (saknade
 * OCR/personnummer/fastighetsbeteckning/referenser) — mejlbilagan skilde
 * sig alltså från nedladdningen. Genom att gå via samma helper som
 * pdf-routen försvinner den asymmetrin: fältsetet är
 * `buildInvoiceTemplateData`s, samma som HTML-vyn redan visar.
 *
 * @param invoice  Rå invoice-rad (med .customer joinad) — samma form som
 *                 buildInvoiceTemplateData redan förväntar sig. Notera:
 *                 anroparen kan ha satt fält på objektet innan anrop
 *                 (t.ex. reminder-pdf sätter invoice.invoice_type =
 *                 'reminder' och invoice.reminder_count += 1) — helpern
 *                 muterar bara `invoice.ocr_number` om det saknas.
 * @param config   business_config-raden.
 * @param opts.styleOverride   Valfri stilöverstyrning (?style=...).
 * @param opts.logTag          Prefix i felloggen vid Chromium-miss
 *                              (default 'invoices/pdf').
 * @param opts.swishQrOverride Färdigberäknad Swish-QR (data-URI eller
 *                              null). Om utelämnad (undefined) beräknas
 *                              QR:en med standardformeln
 *                              (customer_pays om ROT/RUT, annars total).
 *                              reminder-pdf skickar in en egen — beloppet
 *                              för en påminnelse inkluderar dröjsmålsränta
 *                              + påminnelseavgift, vilket kräver att
 *                              amountToPay räknas ut FÖRE QR-genereringen
 *                              (se reminder-pdf-routen).
 * @returns PDF-buffer, eller null om Chromium-rendering misslyckades —
 *          anroparen äger beslutet om ev. jsPDF-fallback.
 */
export async function buildInvoicePdfBuffer(
  invoice: any,
  config: any,
  opts?: {
    styleOverride?: string | null
    logTag?: string
    swishQrOverride?: string | null
  },
): Promise<Buffer | null> {
  const ocrNumber = invoice.ocr_number || generateOCR(invoice.invoice_number || '')
  invoice.ocr_number = ocrNumber

  let swishQR: string | null
  if (opts && 'swishQrOverride' in opts) {
    swishQR = opts.swishQrOverride ?? null
  } else {
    const payAmount = invoice.rot_rut_type ? invoice.customer_pays : invoice.total
    swishQR = await generateSwishQR(config?.swish_number, payAmount || invoice.total, invoice.invoice_number)
  }

  const templateData = buildInvoiceTemplateData(invoice, config, swishQR)
  const renderFn = selectInvoiceTemplate(opts?.styleOverride || config?.quote_template_style)
  const html = renderFn(templateData)

  return renderHtmlToPdf(html, opts?.logTag || 'invoices/pdf')
}
