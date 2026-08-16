/**
 * Godkännande-kontraktet: vad ett kort faktiskt gör när man trycker Godkänn.
 *
 * ═══ FELET SOM RÄTTAS (N5, 2026-08-07) ═══
 *
 * Exekveringen slutade i en `default:`-gren som gjorde två saker, båda fel.
 *
 * Först gissade den fram ett SMS ur payloaden:
 *
 *     const smsMessage = pl.message || pl.suggested_sms || pl.sms_text
 *     const smsTo = pl.to || pl.customer_phone || pl.entity?.phone
 *
 * Fanns båda **skickades ett riktigt SMS till kunden** — för en korttyp ingen
 * skrivit en hanterare för. Tre producenttyper bar de fälten, däribland
 * `manual_project_create`, som är ett reparationskort för ett misslyckat
 * projektskapande och aldrig var tänkt att prata med kunden.
 *
 * Fanns de inte returnerade den `acknowledged: true` med texten
 * *"Godkänt utan specifik åtgärd"* — en tyst nollhandling som såg ut som att
 * något hänt.
 *
 * Producenterna skapar 43 korttyper. Rutten hade hanterare för 32 av dem.
 * Elva föll alltså till gissningen, bland dem `missad_intakt` som
 * intäktsåtervinningen bygger på och `karin_deadline` som bär en lagstadgad
 * påminnelse.
 *
 * ═══ KONTRAKTET ═══
 *
 * Varje producent vet vad dess kort är. Kön vägrar det den inte känner igen.
 *
 * Det här är **ingen Policy Engine**. Det är en lista och en uppslagsfunktion.
 * Behörigheter, risknivåer och autonomi ligger kvar där de ligger.
 *
 * Facit: tests/approval-action-contract.spec.ts.
 */

export type ActionClass =
  /** Berättar något. Godkänn = jag har läst den. Ingenting utförs. */
  | 'INFORMATIONAL'
  /** Kräver att en människa intygar något. Ingenting utförs automatiskt. */
  | 'ACKNOWLEDGEMENT'
  /** Öppnar något för mänsklig granskning. Får ALDRIG utföras av ett klick. */
  | 'REVIEW_REQUIRED'
  /** Utför en riktig handling. Kräver en explicit hanterare i rutten. */
  | 'EXECUTABLE_ACTION'

/**
 * Alla korttyper produkten skapar, och vad de är.
 *
 * En typ som saknas här går inte att godkänna. Det är avsiktligt: hellre ett
 * kort som säger "jag vet inte vad det här gör" än ett som gissar sig till ett
 * SMS till kund.
 */
export const ACTION_CONTRACT: Record<string, ActionClass> = {
  // ── Utför något på riktigt ──────────────────────────────────────────
  send_sms: 'EXECUTABLE_ACTION',
  send_email: 'EXECUTABLE_ACTION',
  send_quote: 'EXECUTABLE_ACTION',
  send_invoice: 'EXECUTABLE_ACTION',
  send_matte_customer_reply: 'EXECUTABLE_ACTION',
  quote_nudge: 'EXECUTABLE_ACTION',
  confirm_payment: 'EXECUTABLE_ACTION',
  create_booking: 'EXECUTABLE_ACTION',
  create_quote_draft: 'EXECUTABLE_ACTION',
  create_ata_draft: 'EXECUTABLE_ACTION',
  create_invoice_from_report: 'EXECUTABLE_ACTION',
  autopilot_package: 'EXECUTABLE_ACTION',
  autonomy_offer: 'EXECUTABLE_ACTION',
  review_request: 'EXECUTABLE_ACTION',
  scheduled_review_request: 'EXECUTABLE_ACTION',
  yearly_followup: 'EXECUTABLE_ACTION',
  proactive_care: 'EXECUTABLE_ACTION',
  warranty_followup: 'EXECUTABLE_ACTION',
  seasonal_campaign: 'EXECUTABLE_ACTION',
  customer_reactivation: 'EXECUTABLE_ACTION',
  customer_message: 'EXECUTABLE_ACTION',
  customer_quote_question: 'EXECUTABLE_ACTION',
  quote_request: 'EXECUTABLE_ACTION',
  quote_addition: 'EXECUTABLE_ACTION',
  propose_booking_times: 'EXECUTABLE_ACTION',
  propose_site_visit: 'EXECUTABLE_ACTION',
  reschedule_request: 'EXECUTABLE_ACTION',
  new_booking_request: 'EXECUTABLE_ACTION',
  dispatch_suggestion: 'EXECUTABLE_ACTION',
  publish_microsite: 'EXECUTABLE_ACTION',
  invoice_reminder: 'EXECUTABLE_ACTION',
  automation: 'EXECUTABLE_ACTION',
  price_adjustment: 'EXECUTABLE_ACTION',
  // `fakturera_projekt` är den ENDA intäktsfynd-varianten som får utföras —
  // och bara för att den skapas uteslutande när byggProjektFakturaUnderlag
  // gett komplett underlag (kund, rader, ingen befintlig faktura), previewn
  // persisterats på kortet, och exekveraren kör drift-vakt (bygger om
  // underlaget och failar stängt vid avvikelse). `missad_intakt` nedan
  // förblir REVIEW_REQUIRED — ett tvetydigt fynd får aldrig en skicka-knapp.
  fakturera_projekt: 'EXECUTABLE_ACTION',

  // Projektdebriefen (Project Debrief Capture, 2026-08-12): 2-3 frivilliga
  // frågor vid projektstängning, ur efterkalkyl-deltat. Godkännande MED
  // svar (edited_payload.answers) skriver bekräftade lärdomar till
  // project_lesson — se lib/debrief/create-debrief-card.ts. Ett tomt
  // debrief (allt hoppat över) är ett helt giltigt godkännande, och att
  // avvisa kortet kostar ingenting — ägarens ord är sanningen, aldrig ett
  // krav.
  project_debrief: 'EXECUTABLE_ACTION',

  // ── Kräver mänsklig granskning, aldrig ett klick ────────────────────
  //
  // `missad_intakt` är hela grinden för intäktsåtervinningen: ett fynd är ett
  // förslag att titta på, aldrig en faktura som skickas. `manual_project_create`
  // är ett reparationskort — det ska öppna projektet, inte utföra något.
  missad_intakt: 'REVIEW_REQUIRED',
  manual_project_create: 'REVIEW_REQUIRED',
  review_auto_invoice: 'REVIEW_REQUIRED',
  four_eyes_quote: 'REVIEW_REQUIRED',
  four_eyes_project_close: 'REVIEW_REQUIRED',
  deal_flow_site_visit: 'REVIEW_REQUIRED',
  lead_review: 'REVIEW_REQUIRED',
  time_attestation: 'REVIEW_REQUIRED',
  tidrapport_forslag: 'REVIEW_REQUIRED',
  checklist_forslag: 'REVIEW_REQUIRED',
  egenkontroll_foto: 'REVIEW_REQUIRED',
  egenkontroll_avvikelse: 'REVIEW_REQUIRED',
  job_report: 'REVIEW_REQUIRED',

  // ── Intygande ───────────────────────────────────────────────────────
  //
  // `karin_deadline` bär en lagstadgad skyldighet. Kvittensen betyder "jag har
  // sett den", aldrig "den är inlämnad" — samma semantik som lib/karin/
  // handled-store.ts, och den får inte glida isär härifrån.
  karin_deadline: 'ACKNOWLEDGEMENT',
  cert_expiry_reminder: 'ACKNOWLEDGEMENT',
  low_stock_alert: 'ACKNOWLEDGEMENT',

  // ── Berättar bara ───────────────────────────────────────────────────
  agent_insight: 'INFORMATIONAL',
  monthly_review: 'INFORMATIONAL',
  // Måndagskortet (Måndagsmötet etapp 1, 2026-08-13): veckovis lägesbild ur
  // fyra redan befintliga källor (ledger/lärdomar/Guardian/förtjänad
  // autonomi). Rent read/summary — godkänn = jag har läst det, ingenting
  // utförs. Se lib/jarvis/monday-brief.ts.
  monday_brief: 'INFORMATIONAL',
  quote_signed: 'INFORMATIONAL',
  ata_signed_notification: 'INFORMATIONAL',
  ata_declined_notification: 'INFORMATIONAL',
  profitability_warning: 'INFORMATIONAL',

  // ═══ Meeting Intelligence Epic 2 (2026-08-11) ═══
  // Mötesanalysens utfall landar HÄR (inte i legacy-ai_suggestion).
  // meeting_summary: "Mötet med X är sammanfattat" — läses, utför inget.
  // meeting_followup: godkännande skapar en task-rad med evidenscitat ur
  // mötet. Detta är den explicita, granskningsbara formen som trär rådets
  // Promise Ledger-gate (ACTIVE_ROADMAP.md:37,554) — aldrig ambient
  // extraktion, alltid ett kort en människa godkänner.
  meeting_summary: 'INFORMATIONAL',
  meeting_followup: 'EXECUTABLE_ACTION',

  // Customer Facts V1 (2026-08-12): säg-det-en-gång-minnet. Godkännande
  // skriver EN rad i customer_fact — fältlokal skrivning, samma klass som
  // meeting_followup ovan. Se sql/v122_customer_fact.sql.
  customer_fact: 'EXECUTABLE_ACTION',

  // Förtjänad autonomi — nedgradering (lib/autonomy/earned-autonomy.ts
  // recordAutonomyFailure): "nyckeln togs bort" är ett konstaterande, inte
  // ett förslag. Godkänn = jag har läst den, ingenting att utföra.
  autonomy_revoked: 'INFORMATIONAL',

  // Startkorten (lib/onboarding/starter-cards.ts, docs/design/
  // FORSTA-30-MINUTERNA.md): teamet presenterar sig genom kortmekaniken
  // själv vid onboarding-slut. Godkänn = jag har läst det — precis som
  // agent_insight ovan, ingenting utförs (Karin-kortets fynd är redan
  // riktigt/agerbart som TEXT, men själva godkännandet skickar inget).
  team_intro: 'INFORMATIONAL',

  // Expectation Drift — Signal 1 (docs/audits/NEXT_MOAT_WAVE.md, Koncept 3,
  // 2026-08-16): ren kö-ålder på befintliga kundvända åtagande-kort
  // (create_quote_draft/meeting_followup/create_ata_draft), se
  // lib/expectation-drift/stale-signals.ts. Kortet är en nudge — "det här
  // ligger obehandlat" — inte ett förslag att skicka något till kunden.
  // Godkänn = jag har sett det, precis som monday_brief/agent_insight.
  // Aldrig auto-exekverat, aldrig auto-godkänt.
  expectation_drift_signal: 'INFORMATIONAL',
}

/** Vad är det här kortet? `null` = okänt, och okänt godkänns inte. */
export function classify(approvalType: string | null | undefined): ActionClass | null {
  if (!approvalType) return null
  return ACTION_CONTRACT[approvalType] ?? null
}

/** Får ett klick utföra något för den här typen? */
export function mayExecute(approvalType: string | null | undefined): boolean {
  return classify(approvalType) === 'EXECUTABLE_ACTION'
}

/**
 * Svaret för ett kort som inte får utföras av ett klick.
 *
 * Texterna är på svenska och undviker tekniska termer — det här landar i
 * hantverkarens gränssnitt, inte i en logg.
 */
export function nonExecutableResult(approvalType: string): {
  action: string
  executed: false
  action_class: ActionClass | null
  note: string
} {
  const klass = classify(approvalType)
  const note =
    klass === 'INFORMATIONAL'
      ? 'Läst och borttagen från listan. Ingenting skickades.'
      : klass === 'ACKNOWLEDGEMENT'
        ? 'Noterad. Ingenting skickades — påminnelsen kan komma tillbaka.'
        : klass === 'REVIEW_REQUIRED'
          ? 'Öppna ärendet och granska det innan något skickas.'
          : 'Den här typen av kort går inte att godkänna härifrån.'

  return { action: approvalType, executed: false, action_class: klass, note }
}
