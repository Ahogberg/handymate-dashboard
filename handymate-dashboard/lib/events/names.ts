/**
 * Automationsmotorns eventkontrakt — som kod (Spår 4, 2026-09-18).
 *
 * ═══ VARFÖR FILEN FINNS ═══
 *
 * `fireEvent(supabase, eventName: string, ...)` tog tidigare en fri sträng.
 * Ett stavfel eller ett lokalt påhittat namn gick igenom kompilatorn, matchade
 * ingen regel i `v3_automation_rules.trigger_config.event_name`, och dog tyst —
 * inget fel, ingen logg, ingen regel körd. Samtidigt drev ARCHITECTURE.md §4
 * ifrån verkligheten åt BÅDA håll: fem dokumenterade event avfyrades aldrig
 * (`deal_flow_advanced`, `proactive_care_triggered`, `customer_reactivation`,
 * `lead_updated`, `booking_reminder`) och tio faktiskt avfyrade event saknades
 * i dokumentet.
 *
 * Unionen nedan är nu enda sanningen. `tests/event-kontrakt.spec.ts` håller
 * tre saker sanna samtidigt: koden, den här listan och §4-tabellen.
 *
 * REGELN: nytt event läggs till i ARCHITECTURE.md §4 FÖRST, sedan här, sedan
 * i koden. Ett namn som inte avfyras någonstans får inte stå kvar här.
 *
 * Financial Kernels durabla ekonomiska event är ett EGET kontrakt
 * (`lib/financial-kernel/events/catalog.ts`, ARCHITECTURE.md §FK.1). De två
 * listorna får aldrig dela namn, och kernel-event går aldrig genom fireEvent().
 */

/**
 * Varje event automationsmotorn kan avfyra. Kommentaren säger NÄR eventet
 * avfyras och vad payloaden bär — det är den beskrivningen §4-tabellen speglar.
 */
export const EVENT_NAMES = [
  /** ÄTA skickad till kund (länk eller e-post). `{ change_id, project_id, ata_number, total, customer_name }` */
  'ata_sent',
  /** Kunden signerar ÄTA i den publika länken. `{ change_id, project_id, ata_number, total, signed_by }` */
  'ata_signed',
  /** Ny bokning skapad (dashboard, publik bokningssida eller godkänt kort). `{ booking_id, customer_id, date }` */
  'booking_created',
  /** Inkommande samtal är analyserat och kvalificerat. `{ from, duration, call_recording_id, customer_id }` */
  'call_completed',
  /** Inkommande samtal besvarades inte — agenten tog meddelande. `{ phone, call_id }` */
  'call_missed',
  /** Samtalet kopplades vidare till hantverkarens egen telefon. `{ to, from, call_id, mode }` */
  'call_transferred',
  /** Utgående SMS skickat från kunddialogen (manuell kontakt). `{ phone, method: 'sms' }` */
  'contacted',
  /** Inkommande e-post läst av Gmail-läsaren. `{ customer_id, lead_id, from_email, subject, gmail_thread_id, matched_by }` */
  'email_received',
  /** Ny faktura skapad. `{ invoice_id, customer_id, total, due_date }` */
  'invoice_created',
  /** Faktura passerat förfallodatum (upptäcks av betalningssynken). `{ invoice_id }` */
  'invoice_overdue',
  /** Faktura FAKTISKT levererad till kund (e-post, SMS eller e-faktura). `{ invoice_id, customer_id, amount }` */
  'invoice_sent',
  /** Jobb/projekt markerat som avslutat. `{ project_id, customer_id, project_name }` */
  'job_completed',
  /** Lead skapad av agentens verktyg (tool-router). `{ lead_id, customer_name, phone, job_type, urgency, estimated_value, source }` */
  'lead_created',
  /** Lead skapad via Golden Path (formulär, samtal, SMS, e-post). `{ source, lead_id, customer_id, customer_name }` */
  'lead_received',
  /** Morgonrapporten skickad till hantverkaren. `{ personal_phone, health }` */
  'morning_report_sent',
  /** Betalning registrerad på en faktura. `{ invoice_id, entity_id, customer_id }` */
  'payment_received',
  /** Affären byter steg i pipelinen. `{ lead_id, from_stage, to_stage, triggered_by }` */
  'pipeline_stage_changed',
  /** Projekt skapat ur lead, offert eller bokning. `{ project_id, lead_id?, quote_id?, source }` */
  'project_created',
  /** Kunden accepterar offerten via acceptlänken. `{ quote_id, customer_id, customer_name, total, title, lead_id }` */
  'quote_accepted',
  /** Offert passerat `valid_until` utan svar (markeras av cron). `{ quote_id, lead_id, customer_id, days_sent }` */
  'quote_expired',
  /** Kunden öppnar offertlänken första gången. `{ quote_id, customer_id, quote_title }` */
  'quote_opened',
  /** Offert skickad till kund. `{ quote_id, customer_id, customer_name, total, title }` */
  'quote_sent',
  /** Kunden signerar offerten digitalt (publik länk eller kundportal). `{ quote_id, customer_id, quote_title?, total? }` */
  'quote_signed',
  /** Värvad kund blev betalande — rabatt utlöst. `{ referred_business_id, amount_sek, referrer_credit_sek }` */
  'referral_converted',
  /** Inkommande SMS från kund. `{ phone, message, customer_name }` */
  'sms_received',
  /** Utgående SMS mottaget av 46elks. `{ to, customer_id, message_type, elks_id, sms_id, recipient }` */
  'sms_sent',
  /** Arbetsorder skickad till anställd/underentreprenör. `{ work_order_id, project_id, assigned_to, assigned_phone }` */
  'work_order_sent',
] as const

export type EventName = (typeof EVENT_NAMES)[number]

const EVENT_NAME_SET: ReadonlySet<string> = new Set<string>(EVENT_NAMES)

/**
 * Typvakt för de få ställen där eventnamnet kommer som `string` (t.ex. ur en
 * databaskolumn eller ett API-fält). Använd den i stället för en cast — en
 * cast ljuger, vakten säger nej.
 */
export function isEventName(namn: string): namn is EventName {
  return EVENT_NAME_SET.has(namn)
}

/**
 * ═══ LOOPSPÄRREN ═══
 *
 * `sms_sent` avfyras i SMS-strypunkten (`lib/sms-send.ts`) efter varje lyckat
 * utskick. En regel som lyssnar på `sms_sent` och själv gör `send_sms` skulle
 * därför avfyra `sms_sent` igen — en oändlig SMS-loop mot en riktig kund, på
 * riktiga pengar. Spärren sitter i motorn (`fireEvent`), inte bara i seeden:
 * regler skapas också av användare och agenter, och en spärr som bara finns i
 * seeden skyddar inte dem.
 *
 * Returnerar true när kombinationen event + åtgärd skulle mata sig själv.
 */
export function skaparEventLoop(eventName: EventName, actionType: string): boolean {
  return eventName === 'sms_sent' && actionType === 'send_sms'
}
