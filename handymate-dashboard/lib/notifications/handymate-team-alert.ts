// lib/notifications/handymate-team-alert.ts
//
// Internt driftlarm till Handymates eget team (INTE en business-scopad
// push/SMS — se docs/superpowers/specs/2026-08-21-handymate-support-agent-design.md).
// Fast mottagarlista via env for v1 — tva personer, ingen katalogsokning.

export interface SupportTicketAlert {
  businessName: string
  category: string
  ticketId: string
  /** Ärendets sammanfattning (från escalate_to_handymate_team-verktyget).
   *  Valfri — trunkeras till SMS_SUMMARY_MAX_LEN tecken i meddelandet
   *  nedan så larmet inte drar iväg i segment (kostnad per SMS-del). */
  summary?: string
}

/** Max antal tecken av summary som tas med i SMS:et — se SupportTicketAlert.summary. */
const SMS_SUMMARY_MAX_LEN = 100

export type SupportAlertFailure =
  | 'missing_credentials'
  | 'missing_recipients'
  | 'delivery_failed'

export interface SupportAlertDelivery {
  delivered: boolean
  attempted: number
  deliveredCount: number
  failure?: SupportAlertFailure
}

interface SupportAlertDependencies {
  /** Testbar env-källa. Produktion använder process.env. */
  env?: Readonly<Record<string, string | undefined>>
  /** Testbar transport. Produktion använder global fetch. */
  fetchImpl?: typeof fetch
}

/**
 * Kundtexten skiljer uttryckligen mellan två oberoende sanningar:
 * ticketen är sparad i supportkön, medan internnotisen kan ha misslyckats.
 */
export function supportEscalationCustomerMessage(delivery: SupportAlertDelivery): string {
  if (delivery.delivered) {
    return 'Ärendet är skapat och Handymates team är notifierat — de återkommer till dig här i chatten.'
  }

  return 'Ärendet är skapat i supportkön. Internnotisen kunde inte levereras just nu, men ärendet finns sparat och väntar på vårt team.'
}

/**
 * SMS-larm till Handymates eget team vid en support-
 * eskalering. Skiljer sig medvetet fran sendApprovalPush/sendSmsViaElks:
 * ingen kvotkoll, ingen opt-out, inget business_id att logga mot — det
 * ar INTE ett kundutskick, det ar ett internt driftlarm till era egna
 * tva nummer. Transportfel kastas inte (ticketen finns redan), men returneras
 * explicit så anroparen aldrig behöver låtsas att larmet levererades.
 */
export async function notifyHandymateSupportTeam(
  alert: SupportTicketAlert,
  dependencies: SupportAlertDependencies = {},
): Promise<SupportAlertDelivery> {
  const env = dependencies.env ?? process.env
  const fetchImpl = dependencies.fetchImpl ?? fetch
  const apiUser = env.ELKS_API_USER
  const apiPassword = env.ELKS_API_PASSWORD
  // Kommaseparerad lista med E.164-nummer. Inga nummer hardkodas i källkoden.
  const alertPhones = (env.HANDYMATE_SUPPORT_ALERT_PHONES || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  if (!apiUser || !apiPassword) {
    console.error('[handymate-team-alert] 46elks credentials saknas — larm ej skickat')
    return { delivered: false, attempted: 0, deliveredCount: 0, failure: 'missing_credentials' }
  }
  if (alertPhones.length === 0) {
    console.error('[handymate-team-alert] HANDYMATE_SUPPORT_ALERT_PHONES ej konfigurerad — larm ej skickat')
    return { delivered: false, attempted: 0, deliveredCount: 0, failure: 'missing_recipients' }
  }

  const trimmedSummary = alert.summary?.trim()
  const summarySuffix = trimmedSummary
    ? `: ${trimmedSummary.length > SMS_SUMMARY_MAX_LEN ? `${trimmedSummary.slice(0, SMS_SUMMARY_MAX_LEN)}…` : trimmedSummary}`
    : ''
  const message = `Support-arende (${alert.category}) fran ${alert.businessName}${summarySuffix}. Se /admin. #${alert.ticketId}`

  const results = await Promise.all(
    alertPhones.map(async (phone) => {
      try {
        const response = await fetchImpl('https://api.46elks.com/a1/sms', {
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + Buffer.from(`${apiUser}:${apiPassword}`).toString('base64'),
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
          return false
        }
        return true
      } catch (err) {
        console.error('[handymate-team-alert] SMS-sandning misslyckades (non-blocking):', err)
        return false
      }
    })
  )

  const deliveredCount = results.filter(Boolean).length
  return {
    delivered: deliveredCount > 0,
    attempted: alertPhones.length,
    deliveredCount,
    ...(deliveredCount > 0 ? {} : { failure: 'delivery_failed' as const }),
  }
}
