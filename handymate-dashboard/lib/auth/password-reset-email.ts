/**
 * Lösenordsåterställnings-mail.
 *
 * Genererar en recovery-länk via Supabase admin API och skickar mailet
 * via Resend med Handymate-branding (designsystemet — teal, vita kort).
 * Tidigare användes Supabases default-mall som var mörkt tema utan branding.
 */

import { createClient } from '@supabase/supabase-js'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
const RESEND_DOMAIN = process.env.RESEND_DOMAIN || 'handymate.se'

interface SendResult {
  success: boolean
  error?: string
  /** True om e-posten saknas men vi vill fortfarande returnera success utåt. */
  silent_skip?: boolean
}

/**
 * Skicka återställningsmail. Returnerar `success: true` även när användaren
 * inte finns — vi avslöjar aldrig om en e-postadress är registrerad.
 */
export async function sendPasswordResetEmail(email: string): Promise<SendResult> {
  if (!RESEND_API_KEY) {
    return { success: false, error: 'RESEND_API_KEY saknas' }
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Generera recovery-länk via admin API. Returnerar en URL med token.
  // Mailet skickas av oss, inte Supabase.
  const redirectTo = `${APP_URL}/auth/callback?next=/reset-password`
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo },
  })

  if (error) {
    // Om användaren inte finns, eller liknande, sväljer vi felet och
    // låtsas att mail skickades — för säkerhet (avslöjar ej registrerade konton).
    console.error('[password-reset] generateLink failed:', error.message)
    return { success: true, silent_skip: true }
  }

  const actionLink = data?.properties?.action_link
  if (!actionLink) {
    console.error('[password-reset] generateLink returned no action_link')
    return { success: true, silent_skip: true }
  }

  // Försök slå upp användarens namn för en personligare hälsning
  let firstName = ''
  try {
    const { data: bizUser } = await supabaseAdmin
      .from('business_users')
      .select('name')
      .eq('email', email)
      .maybeSingle()
    if (bizUser?.name) firstName = String(bizUser.name).split(' ')[0]
  } catch { /* non-blocking */ }

  const html = buildResetHtml({ firstName, actionLink })

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `Handymate <noreply@${RESEND_DOMAIN}>`,
        to: [email],
        subject: 'Återställ ditt Handymate-lösenord',
        html,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      console.error('[password-reset] Resend error:', text)
      return { success: false, error: `Resend: ${text.slice(0, 200)}` }
    }

    return { success: true }
  } catch (err: any) {
    console.error('[password-reset] send error:', err)
    return { success: false, error: err?.message || 'Send failed' }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

interface BuildOpts {
  firstName: string
  actionLink: string
}

/**
 * Ljust tema, teal accent. Matchar designsystemet (vita ytor, slate-text,
 * teal CTA). Inga drop-shadows, inga gradients utan syfte.
 */
function buildResetHtml({ firstName, actionLink }: BuildOpts): string {
  const greeting = firstName ? `Hej ${escapeHtml(firstName)},` : 'Hej,'

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Återställ ditt Handymate-lösenord</title>
</head>
<body style="margin: 0; padding: 0; background: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1F2937;">
  <div style="max-width: 560px; margin: 0 auto; padding: 32px 16px;">

    <!-- Brand header -->
    <div style="background: #0F766E; padding: 28px 24px; border-radius: 16px 16px 0 0; text-align: center;">
      <div style="font-size: 22px; font-weight: 700; color: #ffffff; letter-spacing: 0.5px;">Handymate</div>
    </div>

    <!-- Card -->
    <div style="background: #ffffff; padding: 32px 28px; border-radius: 0 0 16px 16px; border: 1px solid #E2E8F0; border-top: none;">

      <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #0F172A; line-height: 1.3;">
        Återställ ditt lösenord
      </h1>

      <p style="margin: 0 0 20px; font-size: 14px; color: #64748B;">
        ${greeting}
      </p>

      <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.65; color: #334155;">
        Vi fick en begäran om att återställa lösenordet till ditt Handymate-konto.
        Klicka på knappen nedan för att välja ett nytt lösenord. Länken är giltig
        i 60 minuter.
      </p>

      <!-- CTA -->
      <div style="text-align: center; margin: 32px 0 24px;">
        <a href="${actionLink}" style="display: inline-block; background: #0F766E; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 10px; font-weight: 600; font-size: 15px;">
          Välj nytt lösenord
        </a>
      </div>

      <p style="margin: 24px 0 0; font-size: 13px; color: #94A3B8; text-align: center; line-height: 1.5;">
        Eller kopiera länken: <br/>
        <span style="color: #64748B; word-break: break-all; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: 12px;">${actionLink}</span>
      </p>

      <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 32px 0 20px;" />

      <p style="margin: 0; font-size: 13px; color: #64748B; line-height: 1.5;">
        Bad du inte om återställning? Då kan du ignorera mailet — ingen ändring
        sker utan att du klickar på länken ovan.
      </p>
    </div>

    <p style="text-align: center; margin: 20px 0 0; font-size: 11px; color: #94A3B8;">
      Handymate · AI-back office för svenska hantverkare
    </p>
  </div>
</body>
</html>`
}
