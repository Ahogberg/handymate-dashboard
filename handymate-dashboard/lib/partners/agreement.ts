import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import { getServerSupabase } from '@/lib/supabase'
import { signAgreementToken } from '@/lib/partners/approve-token'

/**
 * Partneravtalet — en enda sanning för version, hash och acceptansbevis.
 *
 * Används av registreringen (nya partners), portalgrinden och engångslänken
 * (befintliga partners som registrerades före v189/v1) samt adminens
 * godkännande (som vägrar aktivera en partner utan acceptans).
 *
 * Bevismönstret är samma som offert-/ÄTA-signering: innehållet hashas
 * server-side i acceptansögonblicket, så agreement_hash bevisar exakt VILKEN
 * text som godkändes även om filen ändras senare.
 */
export const AGREEMENT_VERSION = '1.0'
export const AGREEMENT_PATH = path.join(process.cwd(), 'content', 'partner', 'partneravtal-v1.md')

export function readAgreementText(): string {
  return fs.readFileSync(AGREEMENT_PATH, 'utf-8')
}

export function readAgreementHash(): string {
  return createHash('sha256').update(readAgreementText()).digest('hex')
}

/** x-forwarded-for → x-real-ip → 'unknown' — samma fångst som ÄTA-signeringen. */
export function captureRequestIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    'unknown'
  )
}

/** Sant bara om partnern accepterat exakt den version som gäller nu. */
export function hasAcceptedCurrentAgreement(partner: { agreement_version?: string | null }): boolean {
  return partner.agreement_version === AGREEMENT_VERSION
}

export const AGREEMENT_MISSING_MESSAGE =
  `Partnern har inte accepterat Partneravtal v${AGREEMENT_VERSION}. Skicka avtalslänken och godkänn först när acceptansen är loggad.`

/** Engångslänken som mejlas till partners som ännu inte accepterat. */
export function agreementAcceptUrl(partnerId: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
  return `${appUrl}/partners/avtal/acceptera?partner=${partnerId}&token=${signAgreementToken(partnerId)}`
}

/**
 * Mejlar avtalslänken + ändringsinformationen till en befintlig partner.
 * Texten täcker auditens tre punkter (2026-09-01): den nya standardmodellen,
 * att inga hänvisningar/belopp påverkats, och att acceptans krävs innan nästa
 * hänvisning. Slutlig juridisk formulering granskas av affärsjurist — detta
 * är produktens standardavisering.
 */
export async function sendAgreementRequestEmail(partner: {
  id: string
  email: string
  name: string
  status: string
}): Promise<{ sent: boolean; error: string | null }> {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return { sent: false, error: 'RESEND_API_KEY saknas' }

  const pending = partner.status === 'pending_approval'
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(resendKey)
    await resend.emails.send({
      from: 'Handymate <noreply@handymate.se>',
      to: [partner.email],
      subject: `Handymates partneravtal v${AGREEMENT_VERSION} — godkänn för att ${pending ? 'aktivera ditt konto' : 'fortsätta hänvisa'}`,
      html: `
        <h2>Hej ${partner.name}!</h2>
        <p>Vi har fastställt partnerprogrammets villkor i ett skriftligt partneravtal (version ${AGREEMENT_VERSION}).</p>
        <p><strong>Standardprovisionen är 20 % av nettoabonnemangsintäkten i 36 kalendermånader</strong> per hänvisad kund, 0 % därefter. Modellen ersätter den tidigare standardtrappan.</p>
        <p>Inga av dina befintliga hänvisningar eller provisionsbelopp har påverkats.</p>
        <p>${pending
          ? 'Innan vi kan aktivera ditt partnerkonto behöver du läsa och godkänna avtalet:'
          : 'Innan du lämnar din nästa hänvisning behöver du läsa och godkänna avtalet:'}</p>
        <p><a href="${agreementAcceptUrl(partner.id)}">Läs och godkänn partneravtalet →</a></p>
        <p style="color:#666;font-size:13px">Länken är personlig. Vi loggar version, tidpunkt och IP-adress som bevis på din acceptans.</p>
      `,
    })
    return { sent: true, error: null }
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : 'Mejlet kunde inte skickas' }
  }
}

/**
 * Loggar acceptans på partners-raden. Idempotent: en partner som redan
 * accepterat gällande version rörs inte — det ursprungliga beviset
 * (tidpunkt/IP/hash) skrivs aldrig över.
 */
export async function recordAgreementAcceptance(
  partnerId: string,
  ip: string
): Promise<{ accepted: boolean; alreadyAccepted: boolean; error: string | null }> {
  const supabase = getServerSupabase()

  const { data: existing, error: readError } = await supabase
    .from('partners')
    .select('id, agreement_version')
    .eq('id', partnerId)
    .maybeSingle()

  if (readError) return { accepted: false, alreadyAccepted: false, error: readError.message }
  if (!existing) return { accepted: false, alreadyAccepted: false, error: 'Partner hittades inte' }
  if (hasAcceptedCurrentAgreement(existing)) return { accepted: true, alreadyAccepted: true, error: null }

  const { error } = await supabase
    .from('partners')
    .update({
      agreement_version: AGREEMENT_VERSION,
      agreement_hash: readAgreementHash(),
      agreement_accepted_at: new Date().toISOString(),
      agreement_accepted_ip: ip,
    })
    .eq('id', partnerId)

  if (error) return { accepted: false, alreadyAccepted: false, error: error.message }
  return { accepted: true, alreadyAccepted: false, error: null }
}
