/**
 * Offertmailet — ren byggare, utbruten ur app/api/quotes/send/route.ts
 * (2026-09-07) så att inställningssidan "Så ser dina kunder dig" kan
 * förhandsvisa exakt det mail kunden får, utan att gå genom sändvägen.
 *
 * Skalet, sidhuvudet, sidfoten och stämpeln kommer från emailLayout();
 * den här funktionen komponerar bara innehållet. "Du betalar"-logiken
 * speglar offertsidan: beloppet efter preliminärt ROT/RUT är huvudsiffran,
 * totalsumman står ärligt bredvid.
 *
 * Ingen Supabase, ingen env — bara data in, HTML ut.
 */
import type { Branding } from '@/lib/branding/get-branding'
import { escapeHtml } from '@/lib/document-html'
import { halsning } from '@/lib/customers/namn'
import {
  emailLayout, emailHeading, emailParagraph, amountBlock, rotRutNotice, actionBlock, signature, formatDag,
} from '@/lib/email-templates'

export interface QuoteEmailInput {
  /** Färdigt varumärke — anroparen avgör om kontaktuppgifterna är skaparens eller företagets. */
  branding: Branding
  /** Kundens fulla namn — hälsningen använder FÖRNAMNET (R1), aldrig rått fullnamn. */
  customerName?: string | null
  quoteNumber?: string | null
  title?: string | null
  description?: string | null
  total: number
  /** Belopp efter preliminärt ROT/RUT. null/undefined = inget avdrag. */
  customerPays?: number | null
  rotRutType?: string | null
  validUntil?: string | null
  /** Länk in i portalen/offertsidan. Utan den faller mailet tillbaka på telefon/PDF. */
  signUrl?: string
  pdfUrl?: string
  /** Namnet som står i underskriften — normalt offertens skapare. */
  contactName?: string | null
  trackingPixelUrl?: string
}

export function buildQuoteEmailHtml(input: QuoteEmailInput): string {
  const { branding } = input

  // Escapa all användarstyrd text som interpoleras i HTML — offert-titel,
  // beskrivning och namn kan innehålla tecken som annars tolkas som markup.
  // Layouten escapar varumärkesfälten själv — ingen förescapning där.
  const customerGreeting = escapeHtml(halsning(input.customerName))
  const quoteTitle = escapeHtml(input.title || 'Offert')
  const quoteDescription = escapeHtml(input.description ?? '')
  const contactName = input.contactName ? escapeHtml(input.contactName) : ''
  const accent = branding.accentColor

  // Designens offertmail: dokumentreferens i sidhuvudet, offertens titel som
  // rubrik, "Du betalar" som stor siffra med totalsumman och preliminärt
  // ROT/RUT bredvid, en knapp in i portalen, PDF som hjälprad.
  const harRot = Boolean(input.rotRutType && input.customerPays != null)
  const rotType = harRot ? String(input.rotRutType) : ''
  const rotDeduction = harRot ? Number(input.total) - Number(input.customerPays) : 0
  const giltig = input.validUntil ? `Giltig till ${formatDag(input.validUntil)}` : undefined
  const belopp = harRot
    ? amountBlock({ label: 'Du betalar', amount: Number(input.customerPays), total: Number(input.total), rot: { type: rotType, deduction: rotDeduction }, sub: giltig })
    : amountBlock({ label: 'Totalt inkl. moms', amount: Number(input.total), sub: giltig })

  const pdfRad = input.pdfUrl ? 'Offerten finns också som PDF i det här mailet.' : undefined
  const handling = input.signUrl
    ? actionBlock({ text: 'Öppna offerten', url: input.signUrl }, accent, undefined, { helper: pdfRad })
    : branding.contactPhone
      ? actionBlock({ text: `Ring ${escapeHtml(branding.contactPhone)}`, url: `tel:${escapeHtml(branding.contactPhone)}` }, accent, input.pdfUrl ? { text: 'Ladda ner offerten (PDF)', url: input.pdfUrl } : undefined, { helper: 'Har du frågor eller vill boka? Ring oss.' })
      : input.pdfUrl
        ? actionBlock({ text: 'Ladda ner offerten (PDF)', url: input.pdfUrl }, accent)
        : ''

  const content = `
    ${emailHeading(quoteTitle, `${customerGreeting} Tack för att vi fick komma förbi. Här är vår offert${input.description ? ':' : '.'}`)}
    ${input.description ? emailParagraph(`<span style="white-space:pre-line;">${quoteDescription}</span>`) : ''}
    ${belopp}
    ${handling}
    ${harRot ? rotRutNotice(rotType, rotDeduction) : ''}
    ${signature(escapeHtml(branding.businessName), contactName || undefined, { phone: branding.contactPhone ? escapeHtml(branding.contactPhone) : undefined })}
  `

  // Spårningspixeln ligger sist i dokumentet — efter </html> duger för
  // mailklienter, men vi lägger den inne i body för säkerhets skull.
  const html = emailLayout(branding, content, { meta: `Offert ${input.quoteNumber || ''}`.trim() })
  return input.trackingPixelUrl
    ? html.replace('</body>', `<img src="${input.trackingPixelUrl}" width="1" height="1" style="display:none" alt="" /></body>`)
    : html
}
