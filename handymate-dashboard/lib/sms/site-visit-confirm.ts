/**
 * Klient-hjälpare: skicka bekräftelse-SMS för platsbesök och RAPPORTERA
 * utfallet. Ersätter det tidigare `fetch(...).catch(() => {})`-mönstret som
 * tyst svalde alla fel (billing, kvot, rate-limit, ogiltigt nummer) så att
 * en bokning kunde se lyckad ut medan SMS:et aldrig gick iväg.
 *
 * Bokningen är redan skapad och giltig när detta anropas — ett SMS-fel får
 * ALDRIG rulla tillbaka bokningen, bara synliggöras för hantverkaren.
 */

export interface SiteVisitSmsResult {
  ok: boolean
  /** Svensk klartext om det gick fel, annars undefined. */
  reason?: string
}

export async function sendSiteVisitSms(params: {
  to: string
  message: string
}): Promise<SiteVisitSmsResult> {
  try {
    const res = await fetch('/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: params.to, message: params.message }),
    })

    if (res.ok) return { ok: true }

    const body = await res.json().catch(() => null as any)

    // Översätt sms/send-routens kända fel till svensk klartext.
    if (body?.billing_inactive) {
      return { ok: false, reason: 'prenumerationen är inte aktiv' }
    }
    if (body?.quota_exceeded) {
      return { ok: false, reason: 'SMS-kvoten för månaden är slut' }
    }
    if (res.status === 429) {
      return { ok: false, reason: 'för många SMS just nu — försök igen om en stund' }
    }
    // 500 m.fl.: 46elks-orsak (t.ex. ogiltigt telefonnummer) ligger i body.error.
    const detail = typeof body?.error === 'string' ? body.error : null
    return { ok: false, reason: detail ? `SMS-tjänsten svarade: ${detail}` : 'okänt fel' }
  } catch {
    return { ok: false, reason: 'nätverksfel' }
  }
}
