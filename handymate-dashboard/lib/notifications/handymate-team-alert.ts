// lib/notifications/handymate-team-alert.ts
//
// Internt driftlarm till Handymates eget team (INTE en business-scopad
// push/SMS — se docs/superpowers/specs/2026-08-21-handymate-support-agent-design.md).
// Fast, hardkodad mottagarlista for v1 — tva personer, ingen katalogsokning.

const ELKS_API_USER = process.env.ELKS_API_USER
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD

// Kommaseparerad lista med E.164-nummer, t.ex. "+46701234567,+46707654321".
// Satt via Vercel env vars — INGA telefonnummer hardkodas i kallkoden.
const ALERT_PHONES = (process.env.HANDYMATE_SUPPORT_ALERT_PHONES || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

export interface SupportTicketAlert {
  businessName: string
  category: string
  ticketId: string
}

/**
 * Fire-and-forget SMS-larm till Handymates eget team vid en support-
 * eskalering. Skiljer sig medvetet fran sendApprovalPush/sendSmsViaElks:
 * ingen kvotkoll, ingen opt-out, inget business_id att logga mot — det
 * ar INTE ett kundutskick, det ar ett internt driftlarm till era egna
 * tva nummer.
 */
export async function notifyHandymateSupportTeam(alert: SupportTicketAlert): Promise<void> {
  if (!ELKS_API_USER || !ELKS_API_PASSWORD) {
    console.error('[handymate-team-alert] 46elks credentials saknas — larm ej skickat')
    return
  }
  if (ALERT_PHONES.length === 0) {
    console.error('[handymate-team-alert] HANDYMATE_SUPPORT_ALERT_PHONES ej konfigurerad — larm ej skickat')
    return
  }

  const message = `Support-arende (${alert.category}) fran ${alert.businessName}. Se /admin. #${alert.ticketId}`

  await Promise.all(
    ALERT_PHONES.map(async (phone) => {
      try {
        const response = await fetch('https://api.46elks.com/a1/sms', {
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            from: 'Handymate',
            to: phone,
            message,
          }),
        })
        if (!response.ok) {
          console.error('[handymate-team-alert] 46elks svarade', response.status, 'for', phone)
        }
      } catch (err) {
        console.error('[handymate-team-alert] SMS-sandning misslyckades (non-blocking):', err)
      }
    })
  )
}
