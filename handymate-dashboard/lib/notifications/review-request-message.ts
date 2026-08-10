/**
 * Delad meddelandebyggare för recensionsförfrågningar och 1-årsuppföljningar.
 *
 * Extraherad ur den fungerande facit-producenten (app/api/cron/review-requests/
 * route.ts) i samband med 2026-08-10-buggfixen: tre andra producenter
 * (lib/project-stages/automation-engine.ts, app/api/invoices/[id]/status/
 * route.ts, app/api/projects/route.ts) skapade review_request/
 * scheduled_review_request/yearly_followup-godkännanden med `customer_phone`
 * i payloaden men UTAN `message` — exekveringscaset i
 * app/api/approvals/[id]/route.ts läser `payload.to` och `payload.message`,
 * så alla tre failade tyst med "payload saknar to eller message" så fort
 * hantverkaren godkände kortet.
 *
 * Cronens SMS-text (tecken-budget + fallback-kedja) är facit för hur en
 * recensionsförfrågan ska se ut — den funktionen extraheras hit så de andra
 * producenterna återanvänder samma text i stället för att varsin uppfinna
 * sin egen (och riskera att glömma message-fältet igen).
 */

export interface ReviewRequestMessageOpts {
  customerName?: string | null
  projectName?: string | null
  businessName?: string | null
  reviewUrl: string
}

/** Samma text + 160-teckens fallback-kedja som cron/review-requests/route.ts. */
export function buildReviewRequestMessage(opts: ReviewRequestMessageOpts): string {
  const businessName = (opts.businessName || '').trim() || 'oss'
  const firstName = opts.customerName ? opts.customerName.split(' ')[0] : ''
  const greeting = firstName ? `Hej ${firstName}!` : 'Hej!'
  const projectName = opts.projectName || 'projektet'

  // Tecken-budget: 160 tecken för 1 SMS. Kort variant först.
  let smsText = `${greeting} Tack för förtroendet med ${projectName}. Skulle du vilja dela din upplevelse? Det hjälper oss enormt: ${opts.reviewUrl} /${businessName}`

  // Fallback om för långt: korta ner project-referensen
  if (smsText.length > 160) {
    smsText = `${greeting} Tack för förtroendet! Skulle du vilja dela din upplevelse? ${opts.reviewUrl} /${businessName}`
  }
  // Sista utväg: minimal
  if (smsText.length > 160) {
    smsText = `${greeting} Skulle du vilja recensera oss? ${opts.reviewUrl}`
  }
  return smsText
}

export interface YearlyFollowupMessageOpts {
  customerName?: string | null
  projectName?: string | null
  businessName?: string | null
}

/** 1-årsuppföljning — ingen recensionslänk, bara en axel att höra av sig till. */
export function buildYearlyFollowupMessage(opts: YearlyFollowupMessageOpts): string {
  const businessName = (opts.businessName || '').trim() || 'oss'
  const firstName = opts.customerName ? opts.customerName.split(' ')[0] : ''
  const greeting = firstName ? `Hej ${firstName}!` : 'Hej!'
  const projectName = opts.projectName || 'projektet'
  return `${greeting} Det är nu ett år sedan vi hjälpte dig med ${projectName}. Behöver du hjälp med något igen, eller har allt fungerat bra? Hör gärna av dig! // ${businessName}`
}
