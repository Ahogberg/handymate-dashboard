import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeSwedishPhone } from './phone-normalize'
import { sanitizeSenderId } from './sms/sender-id'
import { smsPartCount, smsCostOre, normalizeIfCheaper } from './costs/meter'
import { recordCost } from './costs/record'
import { PRICE_VERSION } from './costs/price-list'

const ELKS_API_USER = process.env.ELKS_API_USER
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD

export interface SendSmsArgs {
  supabase: SupabaseClient
  businessId: string
  /** Används som 46elks `from`-fält (max 11 tecken). Default 'Handymate'. */
  businessName?: string | null
  /** Mottagarens nummer — accepteras i valfri svensk form (0708..., +46708..., 46708...). Normaliseras till E.164 internt. */
  to: string
  message: string
  customerId?: string | null
  /** Domain-id för att kunna spåra vilket objekt som triggade SMS:et — t.ex. change_id för ATA-send. */
  relatedId?: string | null
  /** Lös enum för audit/filter — t.ex. 'ata_send', 'on_my_way', 'reminder'. */
  messageType?: string | null
  /**
   * VP2 (gap 1, tasks/vilande-pengar-masterplan.md): pending_approvals.id för
   * kortet som utlöste utskicket. Lagras som trigger_type='approval' +
   * trigger_id i sms_log (kolumnerna finns sedan sql/sms_tables.sql men var
   * oanvända) — ingen migration behövs. Ger attributionskedjan kort→SMS.
   */
  approvalId?: string | null
}

export interface SendSmsResult {
  success: boolean
  /** Vårt eget sms_log.sms_id om INSERT lyckades */
  smsId?: string
  /** 46elks egna id (när success=true) */
  elksId?: string
  /** HTTP-status från 46elks (eller null vid fetch-exception) */
  status?: number | null
  /** Felmeddelande när success=false. PostgrestError-detalj om sms_log INSERT failade. */
  error?: string
}

export type OptOutCommand = 'stop' | 'start' | null

/**
 * Ren tolkning av inkommande SMS-kommandon för opt-out/opt-in (VP1, gap 7 —
 * tasks/vilande-pengar-masterplan.md). Trimmad, case-insensitiv, exakt
 * matchning — "stoppa lite" eller "stopp tack" ska INTE tolkas som
 * kommandot (kunden kanske faktiskt skriver en mening). Facit-testad i
 * tests/frequency-guard.spec.ts.
 */
export function parseOptOutCommand(message: string): OptOutCommand {
  const normalized = (message || '').trim().toUpperCase()
  if (normalized === 'STOPP' || normalized === 'STOP' || normalized === 'SLUTA') return 'stop'
  if (normalized === 'START' || normalized === 'STARTA') return 'start'
  return null
}

/**
 * Slår upp en kund via telefonnummer när customer_id inte är känt av
 * callern. Kunddata lagras i blandade format (E.164 eller lokalt
 * 0-prefix) — provar båda vanligaste formerna istället för en full
 * tabellscan. Delad mellan opt-out-kollen nedan och STOPP/START-
 * hanteringen i app/api/sms/incoming/route.ts.
 *
 * Fail-soft: ett DB-fel på en kandidat (t.ex. kolumn saknas om sql/v86
 * inte körts) hoppar tyst vidare till nästa kandidat/null — kraschar
 * aldrig anroparen.
 */
export async function findCustomerByPhone(
  supabase: SupabaseClient,
  businessId: string,
  phoneE164: string,
): Promise<{ customer_id: string; sms_opt_out?: boolean } | null> {
  const local = phoneE164.startsWith('+46') ? '0' + phoneE164.slice(3) : null
  const candidates = [phoneE164, ...(local ? [local] : [])]

  for (const candidate of candidates) {
    try {
      const { data, error } = await supabase
        .from('customer')
        .select('customer_id, sms_opt_out')
        .eq('business_id', businessId)
        .eq('phone_number', candidate)
        .maybeSingle()
      if (error) {
        console.warn('[findCustomerByPhone] uppslag misslyckades (icke-blockerande):', error.message)
        continue
      }
      if (data) return data
    } catch (err: any) {
      console.warn('[findCustomerByPhone] uppslag kastade (icke-blockerande):', err?.message || err)
    }
  }
  return null
}

/**
 * Opt-out-spärr (VP1, gap 7 — tasks/vilande-pengar-masterplan.md): en kund
 * som svarat STOPP/STOP/SLUTA eller manuellt markerats som avböjd på
 * kundkortet ska ALDRIG få ett agent-SMS, oavsett vilken väg som utlöste
 * sändningen — sendSmsViaElks är den gemensamma nämnaren för alla
 * system-/agent-triggade utskick, så kollen sitter här en gång.
 *
 * Fail-open (tillåter sändning) på ALLA fel, inklusive "kolumn saknas" om
 * sql/v86_customer_optout.sql inte körts än — en opt-out-koll får aldrig
 * krascha eller tyst blockera ett SMS-utskick pga migrations-status.
 */
async function isCustomerOptedOut(
  supabase: SupabaseClient,
  businessId: string,
  customerId: string | null | undefined,
  phoneE164: string,
): Promise<boolean> {
  try {
    if (customerId) {
      const { data, error } = await supabase
        .from('customer')
        .select('sms_opt_out')
        .eq('customer_id', customerId)
        .eq('business_id', businessId)
        .maybeSingle()
      if (error) {
        console.warn('[sendSmsViaElks] opt-out-uppslag (customer_id) misslyckades, tillåter sändning:', error.message)
        return false
      }
      return data?.sms_opt_out === true
    }

    const match = await findCustomerByPhone(supabase, businessId, phoneE164)
    return match?.sms_opt_out === true
  } catch (err: any) {
    console.warn('[sendSmsViaElks] opt-out-uppslag kastade, tillåter sändning:', err?.message || err)
    return false
  }
}

/**
 * Skickar SMS direkt mot 46elks och loggar till sms_log.
 *
 * Återanvänd från andra routes (t.ex. /api/ata/[id]/send) istället för
 * intern fetch mot /api/sms/send — relativ URL fungerar inte server-side
 * och route-routen har dessutom rate-limit/billing/auth-check som inte
 * är relevanta för system-triggade SMS.
 *
 * Loggar både success och fail i sms_log så audit-spår alltid finns.
 * Fail-loggning sker även om INSERT failar (logging är non-blocking).
 *
 * Tracking av SMS-quota (trackSmsSent) görs INTE här — det är ett
 * separat feature-gate som user-facing /api/sms/send hanterar. Om
 * system-flow ska räknas mot kvoten, gör det manuellt på callsite.
 */
export async function sendSmsViaElks(args: SendSmsArgs): Promise<SendSmsResult> {
  const { supabase, businessId, businessName, to, message: råMeddelande, customerId, relatedId, messageType, approvalId } = args

  // ═══ TYPOGRAFITVÄTT (fynd ur mätaren, 2026-08-08) ═══
  //
  // Mätaren flaggade historiska SMS som UCS-2 — och det var inte emoji, utan
  // `—` och typografiska citattecken som AI:n skriver naturligt. Ett enda
  // tankstreck sänker utrymmet från 160 till 70 tecken per del och dubblar
  // kostnaden. Ett av fallen var av typen quote_nudge, alltså en mall som går
  // ut om och om igen.
  //
  // Tvätten byter bara tecken mot GSM-7-motsvarigheter som ser likadana ut i
  // en SMS-app, och bara när det FAKTISKT sparar en del. Riktiga emoji lämnas
  // orörda — då är UCS-2 avsiktligt, och att stryka tecknet vore att ändra
  // vad hantverkaren skickar.
  const { text: message, sparadeDelar } = normalizeIfCheaper(råMeddelande)
  if (sparadeDelar > 0) {
    console.log(
      `[sendSmsViaElks] typografitvätt sparade ${sparadeDelar} SMS-del(ar)` +
      `${messageType ? ` (${messageType})` : ''}`
    )
  }

  if (!ELKS_API_USER || !ELKS_API_PASSWORD) {
    return { success: false, error: '46elks credentials not configured' }
  }

  // E.164-normalisering. Idempotent — redan E.164-input passerar oförändrat.
  const phone = normalizeSwedishPhone(to)
  if (!phone || !phone.startsWith('+')) {
    return { success: false, error: `Ogiltigt telefonnummer: "${to}"` }
  }

  const fromName = sanitizeSenderId(businessName)
  const smsId = 'sms_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)

  let elksId: string | undefined
  let status: number | null = null
  let errorMsg: string | undefined
  let success = false

  const optedOut = await isCustomerOptedOut(supabase, businessId, customerId, phone)
  if (optedOut) {
    errorMsg = 'Kunden har avböjt SMS'
  } else {
    try {
      const response = await fetch('https://api.46elks.com/a1/sms', {
        method: 'POST',
        headers: {
          Authorization:
            'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          from: fromName,
          to: phone,
          message,
        }),
      })

      status = response.status
      const responseText = await response.text()
      let result: any = null
      try {
        result = JSON.parse(responseText)
      } catch {
        // 46elks returnerar ibland plaintext på fel — det är OK
      }

      if (response.ok) {
        success = true
        elksId = result?.id || undefined
      } else {
        errorMsg = result?.message || responseText.substring(0, 300) || `HTTP ${status}`
        console.error('[sendSmsViaElks] 46elks error:', {
          status,
          body: (errorMsg || '').substring(0, 200),
          to: phone,
        })
      }
    } catch (err: any) {
      errorMsg = err?.message || 'fetch exception'
      console.error('[sendSmsViaElks] fetch exception:', err)
    }
  }

  // ═══ STRYPUNKTEN MÄTER (COGS-mätaren, 2026-08-08) ═══
  //
  // Delräkningen fanns inte i kodbasen alls: ett 300-teckens SMS kostade oss
  // 2 × 52 öre men bokfördes som ett, och en emoji tvingar hela meddelandet
  // till UCS-2 (70 tecken per del i stället för 160) — så en agent som lägger
  // en emoji i ett 100-teckens SMS fördubblade kostnaden tyst.
  //
  // Bara LYCKADE utskick kostar. Ett avvisat SMS (opt-out) eller ett 46elks-
  // fel debiteras inte, och att bokföra dem hade gjort marginalsiffran fel i
  // den optimistiska riktningen. Delantalet skrivs dock i sms_log även för
  // misslyckade rader — det är audit, inte kostnad.
  const smsParts = smsPartCount(message)
  const smsCost = success ? smsCostOre(message) : 0
  if (success) {
    // Fail-soft: recordCost kastar aldrig. Ett SMS får inte gå förlorat för
    // att en kostnadsrad inte kunde skrivas.
    await recordCost({
      supabase,
      businessId,
      resource: 'sms',
      units: smsParts,
      costOre: smsCost,
      refType: 'sms_log',
      refId: smsId,
      meta: { message_type: messageType || null, parts: smsParts },
    })
  }

  // Logga i sms_log (även misslyckanden för audit-spår). Non-blocking.
  try {
    const { error: insertErr } = await supabase.from('sms_log').insert({
      sms_parts: smsParts,
      cost_ore: smsCost,
      price_version: PRICE_VERSION,
      sms_id: smsId,
      business_id: businessId,
      customer_id: customerId || null,
      direction: 'outbound',
      phone_from: fromName,
      phone_to: phone,
      message,
      status: success ? 'sent' : 'failed',
      elks_id: elksId || null,
      error_message: errorMsg || null,
      message_type: messageType || null,
      related_id: relatedId || null,
      trigger_type: approvalId ? 'approval' : null,
      trigger_id: approvalId || null,
      sent_at: success ? new Date().toISOString() : null,
    })
    if (insertErr) {
      console.error('[sendSmsViaElks] sms_log insert error:', insertErr)
    }
  } catch (logErr) {
    console.error('[sendSmsViaElks] sms_log insert exception:', logErr)
  }

  return {
    success,
    smsId,
    elksId,
    status,
    error: success ? undefined : errorMsg,
  }
}
