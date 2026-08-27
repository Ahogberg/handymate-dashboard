import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeSwedishPhone } from './phone-normalize'
import { sanitizeSenderId } from './sms/sender-id'
import { smsPartCount, smsCostOre, normalizeIfCheaper } from './costs/meter'
import { recordCost } from './costs/record'
import { PRICE_VERSION } from './costs/price-list'
import {
  gateCustomerSms,
  type SmsGateCode,
  type SmsPurpose,
  type SmsRecipient,
} from './outbound/sms-gate'
import { getBusinessPlanFromConfig } from './auth'
import { checkSmsAllowance, trackSmsSent } from './sms-usage'
import type { PlanType } from './feature-gates'
import { checkFuelGate, type FuelGateReason } from './costs/fuel'
import { elksFelKlarsprak, klassaElksFel, ELKS_FEL_VAR_SAK } from './sms/klarsprak'
import { rapporteraTystFel } from './observability/driftlarm'

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
  /**
   * Vem meddelandet går till. Default 'customer'.
   *
   * ═══ 'internal' FÅR ALDRIG ANVÄNDAS FÖR KUNDMEDDELANDEN ═══
   *
   * Opt-out är ett KUNDSKYDD: `customer.sms_opt_out` sätts när en kund svarar
   * STOPP. Men flera utskick går inte till en kund alls — morgonrapporten och
   * månadsrapporten till hantverkaren själv, arbetsordern till hans anställde,
   * lead-notisen till hans telefon. Råkar något av de numren finnas som en
   * kundrad i hans EGET företag (vanligt i test- och demokonton) med opt-out
   * satt, skulle han tyst sluta få sina egna meddelanden.
   *
   * Flaggan hette först 'owner'. Den döptes om när arbetsordern visade att
   * mottagaren lika gärna kan vara en anställd — ett namn som ljuger om vem
   * det gäller är farligt i ett säkerhetsräcke.
   *
   * 'internal' hoppar därför över opt-out-uppslaget. Allt annat — E.164,
   * sms_log, kostnadsmätning, typografitvätt — gäller precis som vanligt.
   * Facit i tests/cogs-matare.spec.ts håller listan över tillåtna
   * 'internal'-callsites kort.
   */
  recipient: SmsRecipient
  /**
   * Obligatorisk avsiktsklass. Proaktiva utskick samordnas mot de senaste
   * sju dagarnas faktiska kundkontakt; transaktionella/konversationella gör
   * inte det. Alla kundklasser respekterar STOPP.
   */
  purpose: SmsPurpose
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
  /** Maskinläsbar orsak från den centrala säkerhetsgrinden. */
  blockedReason?: SmsGateCode | FuelGateReason
  /** true = samma approval hade redan ett levererat SMS; inget nytt skickades. */
  idempotent?: boolean
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
 * Slår upp företagets plan för SMS-kvotkontrollen (Etapp K, se nedan).
 * Fail-SAFE: om uppslaget failar (DB nere, oväntat fel) returneras null —
 * kvoten kollas/räknas inte den gången, sändningen fortsätter ändå. En
 * mätningsutfall får aldrig fälla ett SMS.
 */
async function resolveSmsQuotaPlan(
  supabase: SupabaseClient,
  businessId: string,
): Promise<PlanType | null> {
  try {
    const { data, error } = await supabase
      .from('business_config')
      .select('subscription_plan')
      .eq('business_id', businessId)
      .maybeSingle()
    if (error) {
      console.warn('[sendSmsViaElks] SMS-kvot: kunde inte läsa plan (fail-open):', error.message)
      return null
    }
    return getBusinessPlanFromConfig(data || {})
  } catch (err: any) {
    console.warn('[sendSmsViaElks] SMS-kvot: planuppslag kastade (fail-open):', err?.message || err)
    return null
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
 * ═══ SMS-KVOTEN (Etapp K, strypunkten, 2026-08-17) ═══
 *
 * Kvoten kollas och räknas nu HÄR, inte hos callsites. Tidigare gjorde
 * bara fem av ~24 sändvägar (app/api/sms/send, app/api/approvals/[id],
 * lib/nurture.ts, cron/quote-follow-up, campaigns/send) ett eget
 * checkSmsAllowance/trackSmsSent-par — alla ANDRA vägar (Karins rapporter,
 * ÄTA-utskick, morgonrapporten m.fl.) skickade helt förbi kvoten och
 * hardCap:et. Samma princip som SMS-strypunkten/sms-gaten redan bevisat:
 * en enda chokepoint-regel slår alla callsite-regler.
 *
 * Asymmetrin är avsiktlig: hardCap är ett DEFINITIVT svar — nås det
 * blockeras sändningen (fail-closed på taket, precis som STOPP-grinden).
 * Men om planuppslaget/kvotkollen själv failar (DB nere) skickas SMS:et
 * ändå — en mätningsutfall får aldrig blockera ett kundutskick
 * (fail-open på METERINGEN). Samma mönster som resten av kodbasen:
 * säkerhet stänger, mätning stör aldrig.
 *
 * De fem gamla callsites är städade (tests/sms-quota-chokepoint.spec.ts
 * håller listan) så varje SMS räknas EXAKT en gång — dubbelräkning vore
 * lika fel som ingen räkning alls.
 */
export async function sendSmsViaElks(args: SendSmsArgs): Promise<SendSmsResult> {
  const {
    supabase,
    businessId,
    businessName,
    to,
    message: råMeddelande,
    customerId,
    relatedId,
    messageType,
    approvalId,
    recipient,
    purpose,
  } = args

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
  // Klarspråk (2026-08-27): leverantörens råtext (errorMsg) går till sms_log
  // och console — men det anroparen får, och därmed kort/kvitton/banners,
  // är alltid en svensk mening (lib/sms/klarsprak.ts). Gate-/kvot-/Bränsle-
  // felen ovan är redan svenska och lämnas orörda.
  let felTillHantverkaren: string | undefined
  let success = false
  let blockedReason: SmsGateCode | FuelGateReason | undefined
  let resolvedCustomerId: string | null = customerId || null
  // Cachar planuppslaget mellan kvotkollen (nedan) och uppräkningen (efter
  // en lyckad sändning) — slipper slå upp business_config två gånger.
  let quotaPlan: PlanType | null = null

  // En enda fail-closed grind precis före den externa effekten. Den verifierar
  // tenant + telefon + STOPP och, för proaktiva utskick, senaste kundkontakt.
  const gate = await gateCustomerSms({
    supabase,
    businessId,
    phoneE164: phone,
    customerId,
    recipient,
    purpose,
    messageType: messageType || '',
    approvalId,
  })
  if (!gate.allowed && gate.code === 'already_sent' && gate.previous) {
    return {
      success: true,
      smsId: gate.previous.smsId,
      elksId: gate.previous.elksId,
      idempotent: true,
    }
  }

  if (!gate.allowed) {
    errorMsg = gate.error
    blockedReason = gate.code
  } else {
    resolvedCustomerId = gate.customerId
  }

  if (!errorMsg && (!ELKS_API_USER || !ELKS_API_PASSWORD)) {
    errorMsg = '46elks credentials not configured'
    felTillHantverkaren = elksFelKlarsprak('credentials', 401)
  }

  // Bränsletaket ligger i samma sändningsstrypunkt som STOPP och SMS-kvoten,
  // precis före den externa effekten. Ett redan levererat/idempotent SMS har
  // returnerat ovan och behöver inget Bränsle. Alla 40+ riktiga sändvägar
  // ärver därmed samma regel utan callsite-kopior.
  if (!errorMsg) {
    const fuel = await checkFuelGate(supabase, businessId)
    if (!fuel.allowed) {
      blockedReason = fuel.reason
      errorMsg = fuel.reason === 'fuel_exhausted'
        ? 'Bränslet är slut — meddelandet skickades inte. Tanka under Abonnemang.'
        : 'Bränslenivån kunde inte verifieras — meddelandet skickades inte.'
    }
  }

  // Kvotkollen — se doc-kommentaren ovan vid funktionsdeklarationen. Körs
  // sist av förhandskontrollerna, precis före den externa sändningen, så
  // ett redan blockerat/felkonfigurerat SMS inte i onödan triggar ett
  // extra business_config-uppslag.
  if (!errorMsg) {
    quotaPlan = await resolveSmsQuotaPlan(supabase, businessId)
    if (quotaPlan) {
      try {
        const quota = await checkSmsAllowance(businessId, quotaPlan)
        if (!quota.allowed) {
          errorMsg = quota.error || 'SMS-kvoten för månaden är nådd'
        }
      } catch (quotaErr: any) {
        console.warn(
          '[sendSmsViaElks] SMS-kvot: checkSmsAllowance kastade (fail-open, skickar ändå):',
          quotaErr?.message || quotaErr,
        )
      }
    }
  }

  if (!errorMsg) {
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
        felTillHantverkaren = elksFelKlarsprak(errorMsg, status)
        // Vår sak (tomt 46elks-saldo, felkonfiguration): hantverkaren kan
        // inte göra något — larma Handymate via driftlarmet i stället för
        // att visa leverantörens engelska text.
        const klass = klassaElksFel(errorMsg, status)
        if (ELKS_FEL_VAR_SAK.includes(klass)) {
          await rapporteraTystFel(supabase, businessId, `sms:leverantorsfel-${klass}`, errorMsg || `HTTP ${status}`, { status, to: phone })
        }
      }
    } catch (err: any) {
      errorMsg = err?.message || 'fetch exception'
      felTillHantverkaren = elksFelKlarsprak(errorMsg, null)
      console.error('[sendSmsViaElks] fetch exception:', err)
    }
  }

  // ═══ SMS-KVOTEN RÄKNAS UPP (Etapp K, 2026-08-17) ═══
  //
  // Enda platsen i kodbasen som räknar upp kvoten nu — de fem gamla
  // callsites är städade (tests/sms-quota-chokepoint.spec.ts). Körs bara
  // vid en FAKTISKT lyckad extern sändning — aldrig för idempotenta
  // omsändningar (de early-returnar innan denna punkt nås). Icke-
  // blockerande: en trasig uppräkning får aldrig fälla ett redan skickat
  // SMS.
  if (success) {
    try {
      const trackPlan = quotaPlan ?? (await resolveSmsQuotaPlan(supabase, businessId))
      if (trackPlan) {
        await trackSmsSent(businessId, trackPlan)
      }
    } catch (trackErr: any) {
      console.warn(
        '[sendSmsViaElks] trackSmsSent misslyckades (icke-blockerande):',
        trackErr?.message || trackErr,
      )
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
      customer_id: resolvedCustomerId,
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

  // ═══ SPEGLA TILL KONVERSATIONSHISTORIKEN (kontextrevisionen 2026-08-16) ═══
  //
  // sms_log är revisionsspåret; sms_conversation är vad ALLA historik-
  // konsumenter läser (Mattes resolver, inkommande-SMS-triggern, dashboard-
  // tråden, kundtidslinjen). Tidigare speglade bara tre av ~20 utgående
  // vägar hit — godkännandekorts-svar, påminnelser, offert-nudgar, ÄTA-
  // utskick m.m. var osynliga i varje konversationsvy, så agenten såg en
  // dialog där företagets halva saknades. Ett enda speglingsställe här i
  // strypunkten fixar alla vägar på en gång (samma princip som gjorde
  // SMS-strypunkten och sms-gaten rätt). Bara lyckade kundutskick — interna
  // notiser hör inte hemma i en kundkonversation. Best-effort, kastar aldrig.
  if (success && recipient === 'customer') {
    try {
      const { error: convErr } = await supabase.from('sms_conversation').insert({
        business_id: businessId,
        phone_number: phone,
        role: 'assistant',
        content: message,
      })
      if (convErr) console.error('[sendSmsViaElks] sms_conversation spegling misslyckades:', convErr.message)
    } catch (convEx) {
      console.error('[sendSmsViaElks] sms_conversation spegling exception:', convEx)
    }
  }

  return {
    success,
    smsId,
    elksId,
    status,
    error: success ? undefined : (felTillHantverkaren ?? errorMsg),
    blockedReason,
  }
}
