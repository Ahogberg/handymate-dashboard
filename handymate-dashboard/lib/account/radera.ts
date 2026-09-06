import { removePreparationImages } from '@/lib/customer-preparation/cleanup'
/**
 * Kontoradering — persondata-listan (2026-09-04, tasks/plan-kontoradering.md).
 *
 * ═══ VARFÖR DEN HÄR FILEN FINNS ═══
 *
 * Ägaren raderar firman: inloggningar och persondata ska bort, men
 * fakturaunderlaget måste ligga kvar i 7 år (bokföringslagen). Att köra
 * `DELETE FROM business_config` är uteslutet av två skäl, båda verifierade
 * mot information_schema 2026-09-04: `invoice` har ON DELETE CASCADE mot
 * business_config (skulle radera fakturorna — precis det som inte får
 * hända), och 26 andra tabeller har NO ACTION (skulle bara ge ett FK-fel).
 * Lösningen är mjuk radering av raden (sql/v211_kontoradering.sql) och HÅRD,
 * explicit radering av persondata i alla andra tabeller — den här filen är
 * facit över vilka.
 *
 * ~190 tabeller bär en `business_id`-kolumn. En handskriven lista över dem
 * blir fel av sig själv (en ny tabell glöms bort). Därför tre uttömmande
 * listor + ett test (tests/kontoradering.spec.ts) som skannar sql/*.sql
 * efter VARJE tabell med en `business_id`-kolumn och kräver att den finns i
 * exakt en av dem — samma "bygg facit ur sql/, jämför mot koden"-mönster som
 * tests/column-contract.spec.ts (kolumnkontraktet) redan använder för
 * kolumnnamn.
 *
 * ═══ HUR EN TABELL KLASSAS ═══
 *
 * BEHALLS — räkenskaps-/skatteunderlag. Bara sex tabeller, se listan nedan
 * med motivering per rad.
 *
 * RADERAS — allt annat som bär persondata. En tabell hamnar här om den har
 * ANTINGEN (a) en kolumn som direkt är ett personuppgiftsfält (namn,
 * telefon, e-post, adress, personnummer, ip, gps, signatur, enhets-/push-
 * token), ELLER (b) en kolumn som pekar ut en identifierbar person
 * (customer_id, lead_id, deal_id, partner_id, subcontractor_id,
 * business_user_id, target_user_id, contact_*, visitor_*, eller ett
 * "*_by"-fält som created_by/resolved_by/uploaded_by/signed_by osv), ELLER
 * (c) en fritextkolumn (content/message/note(s)/observation/lesson_text/
 * letter_content/caption/agent_suggestion/transkript o.likn.) vars ämne är
 * EN SPECIFIK kund/lead/anställd-interaktion — INTE en återanvändbar mall
 * (quote_templates, email_template, job_template m.fl. undantas explicit:
 * de är firmans egen mall-text, ingen kunds data).
 *
 * IRRELEVANT — renodlade inställningar/mallar/priskataloger/systemräknare/
 * integrationsstatus utan koppling till en identifierbar person. Får
 * försvinna eller ligga kvar (raderas INTE av rutten), men ska stå här
 * uttryckligen så fullständighetsvakten inte flaggar dem som oklassade.
 *
 * Detta är ingenjörsmässiga avvägningar, inte en databas-sanning — Andreas
 * bör läsa igenom RADERAS/IRRELEVANT-gränsen innan rutten körs på riktigt.
 *
 * ═══ TABELLER SOM INTE FINNS I sql/ MEN ÄR VERIFIERADE ═══
 *
 * business_config, invoice, supplier_invoices, customer, quotes och booking
 * skapades utanför sql/-versionshanteringen (samma lucka som
 * tests/schema-contract.spec.ts redan dokumenterar för schemat). De ingår
 * ändå här — kolumnerna är verifierade mot faktiska queries i repot
 * (customer.name/phone_number/personal_number m.fl., grep:ade i app/lib) och
 * mot en read-only information_schema-slagning 2026-09-04 (ändrar ingen
 * data). customer_activity, sms_campaign och material_order är likaså
 * "MANUAL_TABLES" (se tests/schema-contract.spec.ts) — verifierade via
 * befintliga `.eq('business_id', ...)`-anrop i koden.
 *
 * call, transcript, case_record, action_log, emergency_escalation,
 * human_followup_queue och reservation är ett äldre telefoni-/ärende-lager
 * som INGEN nu levande kod i app/ eller lib/ längre refererar (noll
 * `.from(...)`-träffar) — men raderna finns kvar i databasen, verifierat
 * read-only mot information_schema 2026-09-04, med `business_id NOT NULL`
 * och tydliga personuppgifter (t.ex. `call.phone_number`,
 * `case_record.problem_verbatim`, `emergency_escalation.caller_utterance`).
 * De ingår i RADERAS av samma skäl som allt annat: en gammal firma som
 * raderar sitt konto ska inte ha kvarlevande persondata bara för att
 * funktionen som skrev den byggdes om. Se tests/kontoradering.spec.ts för
 * BASTABELLER-listan som håller fullständighetsvakten ärlig även för dessa.
 *
 * ═══ TVÅ TABELLER SOM INTE HAR business_id ALLS ═══
 *
 * `transcript_turn` (verbatim samtalsutskrift, kolumnen `utterance`) och
 * `sms_campaign_recipient` (telefonnummer) saknar helt en business_id-
 * kolumn — verifierat read-only 2026-09-04. De är barn till `transcript`
 * respektive `sms_campaign`, båda NO ACTION, så att radera `transcript`/
 * `customer` (sms_campaign_recipient.customer_id → customer är NO ACTION)
 * utan att först tömma dem hade misslyckats med ett FK-fel. De raderas via
 * en egen, verifierad joinfråga i `raderaBarntabellerUtanBusinessId` nedan —
 * INTE via ett `.eq('business_id', ...)` mot en kolumn som inte finns. De
 * står därför utanför RADERAS/BEHALLS/IRRELEVANT (fullständighetsvakten
 * kräver inte att de klassas där — den skannar bara business_id-kolumner —
 * men testfilen har ett eget, uttryckligt kvitto på att båda ändå töms).
 *
 * `customer_tag_assignment` (customer_id → customer, ON DELETE CASCADE) och
 * `booking_materials` (booking_id → booking, ON DELETE CASCADE) kräver ingen
 * kod alls: Postgres tömmer dem automatiskt när customer/booking raderas.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { arSchemaSaknas } from '@/lib/observability/driftlarm'

// ─────────────────────────────────────────────────────────────────────────
// BEHALLS — räkenskaps-/skatteunderlag. Radas ALDRIG av kontoraderingen.
// ─────────────────────────────────────────────────────────────────────────
export const BEHALLS: string[] = [
  // Firmans egen rad. Mjukraderas (deleted_at) i steg 6 av
  // app/api/account/delete/route.ts — INTE via den här listans DELETE-loop.
  // Måste finnas här ändå: annars flaggar fullständighetsvakten den som
  // oklassad (den har trivialt en "business_id"-kolumn: sin egen primärnyckel).
  'business_config',

  // Fakturan är själva bokföringsverifikationen. Bokföringslagen kräver 7
  // års sparande, och den bär MEDVETET kundens namn/telefon/adress/
  // personnummer i klartext på raden (verifierat: invoice.personal_number,
  // .personnummer, .name, .phone_number, .address_line finns) — det är inte
  // en läcka, det är vad en svensk faktura juridiskt måste innehålla.
  'invoice',

  // Leverantörsfakturor — samma bokföringsplikt som invoice, fast för
  // firmans INKÖP i stället för dess FÖRSÄLJNING.
  'supplier_invoices',

  // Påminnelser/förseningsavgifter är en del av fakturans betalningshistorik
  // (fee_amount, penalty_interest_amount) — samma sjuårskrav som fakturan
  // de hör till.
  'invoice_reminders',

  // Leveransbevis för fakturan (readiness/completeness-flaggor, när/hur den
  // gick ut) — revisionsspåret FÖR invoice, ingen egen ny persondata utöver
  // invoice_id/project_id-referenser.
  'invoice_evidence_manifest',

  // ROT/RUT-avdragsbegäran till Skatteverket (xml_content, tax_year,
  // total_requested_kr) — skatteunderlag, inte bara bokföring. Samma
  // sjuårslogik som fakturan, men det är Skatteverket som kan begära in det.
  'rot_payment_request',
]

// ─────────────────────────────────────────────────────────────────────────
// RADERAS — persondata. Töms av `raderaPersondata` nedan, i business_id-
// scopad ordning (se header för varför en enda naiv ordning inte räcker).
// ─────────────────────────────────────────────────────────────────────────
export const RADERAS: string[] = [
  // ── Kundregister, offerter, bokningar, leads, affärer — kärnan ──
  'customer', 'quotes', 'booking', 'leads', 'deal', 'project',

  // ── Det gamla telefoni-/ärende-lagret (se header) ──
  'call', 'transcript', 'case_record', 'action_log', 'emergency_escalation',
  'human_followup_queue', 'reservation',

  // ── Samtal, sms, mejl, widget — konversationsinnehåll ──
  'call_recording', 'conversations', 'sms_conversation', 'sms_log',
  'sms_queue', 'email_conversations', 'communication_log',
  'customer_message', 'customer_preparation', 'widget_conversation', 'thread_message',
  'matte_conversations', 'matte_messages', 'agent_messages',

  // ── Agentens minne av en specifik kund/case ──
  'agent_memories', 'agent_threads', 'agent_runs', 'ai_suggestion',
  'business_knowledge', 'customer_fact', 'learning_events',
  'scheduled_actions', 'v3_automation_logs', 'automation_activity',
  'automation_queue', 'pending_approvals',

  // ── Kunddokument, foton, signaturer, skisser ──
  'customer_document', 'generated_document', 'form_submissions',
  'project_document', 'project_photos', 'field_report_photos',
  'project_canvas', // ritningar/skisser kan visa en specifik adress/planlösning

  // ── Jobb/projekt-historik med kundkoppling ──
  'project_change', 'project_checklist', 'project_log', 'project_log_revision',
  'project_events', 'project_ai_log', 'project_lesson', 'project_assignment',
  'project_stages', 'meeting_job', 'jobbpass', 'field_reports',
  'installation', 'inbox_item', 'warranty', 'service_agreement', 'task',
  'task_activity_log', 'work_orders', 'schedule_entry',

  // ── Sälj/lead-pipeline ──
  'lead_activities', 'deal_note', 'deal_automation_tasks', 'deal_flow',
  'deal_flow_log', 'pipeline_activity', 'nurture_enrollment',
  'gmail_imported_message', 'leads_neighbour_campaigns', 'leads_outbound',
  'review_request', 'portal_notification_log', 'quote_tracking_events',

  // ── Anställda (tid, körjournal, certifikat, push, notiser) ──
  'business_users', // se not nedan — hanteras av en EGEN, senare kodsteg
  'time_entry', 'time_checkins', 'time_off_request', 'travel_entry',
  'vehicle_reports', 'allowance_reports', 'employee_certificate',
  'calendar_connection', 'push_subscriptions', 'push_tokens', 'push_held',
  'push_dispatch_log', 'notification', 'benchmark_consent_audit',
  'inventory_movements', 'inventory_transaction',

  // ── Underentreprenörer, leverantörer, partner (tredjepartskontakter) ──
  'subcontractor', 'subcontractor_assignment', 'supplier',
  'manual_suppliers', 'partner_attribution_decision',
  'partner_commission_ledger', 'partner_events', 'partner_followups',

  // ── Diverse med fritext eller identifierbar avsändare ──
  'consent_log', 'billing_event', 'fortnox_api_log', 'pilot_feedback',
  'support_ticket', 'karin_custom_event',

  // ── Kampanjer/beställningar med kundkoppling ──
  'material_order', 'customer_activity',
]

// ─────────────────────────────────────────────────────────────────────────
// IRRELEVANT — inställningar/mallar/kataloger/systemstatus. Ingen
// identifierbar person. Uttryckligen klassade så fullständighetsvakten inte
// flaggar dem — rutten rör dem INTE (varken raderar eller behåller aktivt).
// ─────────────────────────────────────────────────────────────────────────
export const IRRELEVANT: string[] = [
  // Agent-/AI-inställningar och aggregerad, icke-personlig statistik.
  'agent_context', 'agent_settings', 'ai_learned_preferences',
  'business_insights', 'business_integration_credentials',
  'business_patterns', 'business_preferences', 'business_twin_forecast',
  'business_counters', 'mission', 'mission_mandate', 'monthly_reviews',
  'next_best_action', 'operating_experiment', 'pricing_intelligence',
  'seasonal_campaigns', 'seasonality_insights', 'cost_event', 'usage_record',
  'demo_reset_audit', 'call_retention_audit', 'raddningsarende',
  'lanseringsbevis', 'calendar_watches',
  // Firmans EGEN inkommande e-postadress för leads (t.ex.
  // leads@foretag.handymate.se) — inte en persons adress.
  'email_inbound_route',

  // Mallar/texter firman själv skrivit för återanvändning — INTE en kunds
  // data (jämför invoice/quote som HAR en specifik kunds text, ovan).
  'automation_rules', 'v3_automation_rules', 'communication_rule',
  'quote_templates', 'quote_standard_texts', 'email_template',
  'document_template', 'form_templates', 'job_template',
  'checklist_template', 'reservation_texts',

  // Toggles/konfiguration.
  'automation_settings', 'communication_settings', 'v3_automation_settings',
  'pipeline_automation', 'auto_approve_daily_count',

  // Prislistor, produkt-/artikelkataloger, arbetstyper — firmans SORTIMENT,
  // ingen kunds data (produktens "name" är ett artikelnamn, inte ett
  // personnamn).
  'price_list_items_v2', 'price_lists_v2', 'product_categories',
  'product_components', 'products', 'quote_items', 'job_types', 'work_type',
  'vehicles', 'inventory', 'inventory_items', 'inventory_locations',
  'grossist_product', 'manual_supplier_products', 'supplier_product',
  'supplier_connection', 'fortnox_sync', 'fuel_ledger',
  'custom_quote_categories', 'customer_segments', 'customer_tag',
  'contract_types', 'allowance_types', 'service_agreement_type',
  'lead_source', 'lead_sources', 'lead_scoring_rules', 'leads_monthly_usage',
  'reservation_triggers', 'sms_usage', 'sms_campaign', 'storefront',

  // Projekt-internt (kostnad/material/status), ingen kunds personuppgift.
  'project_material', 'project_cost', 'project_milestone', 'project_outcome',
  'project_stage_automations', 'project_tip_dismissal',
  'project_workflow_stages', 'pipeline_stage', 'pipeline_stages',
  'nurture_sequence',
]

const ALLA_KLASSADE = new Set([...RADERAS, ...BEHALLS, ...IRRELEVANT])

/** Sant om `tabell` är uttryckligen klassad i någon av de tre listorna. */
export function arKlassad(tabell: string): boolean {
  return ALLA_KLASSADE.has(tabell)
}

export interface RaderingsResultat {
  /** Tabell → antal raderade rader. `null` = tabellen finns inte i den här miljön (hoppades tyst över). */
  raderat: Record<string, number | null>
  /** Tabeller som INTE gick att tömma trots upprepade försök, med sista felet. */
  fel: Record<string, string>
}

/**
 * Två barntabeller saknar HELT en `business_id`-kolumn (verifierat read-only
 * mot information_schema 2026-09-04) men blockerar — via NO ACTION-FK — att
 * sina föräldrar (`transcript`, `customer`) raderas om de får ligga kvar.
 * Töms via en verifierad kolumn (transcript_id / campaign_id), ALDRIG via en
 * `business_id`-kolumn de inte har.
 *
 * Körs FÖRE huvudloopen i `raderaPersondata` — annars skulle `transcript`
 * och `customer` aldrig lyckas ens efter upprepade varv.
 *
 * Kastar aldrig av sig själv: en trasig lookup ger `null`-antal (synligt i
 * resultatet) i stället för att fälla hela raderingen — men om själva
 * DELETE:n misslyckas (inte bara lookupen) rapporteras det som ett fel per
 * tabell, precis som huvudloopen.
 */
/** Tak per .in()-lista. Ett konto med tusentals samtal eller mottagare
 *  spränger annars URL-längden, och raderingen fastnar för just de konton
 *  som har mest att radera. */
const ID_BATCH = 200

async function raderaBarntabellerUtanBusinessId(
  supabase: SupabaseClient,
  businessId: string,
): Promise<{ raderat: Record<string, number | null>; fel: Record<string, string> }> {
  const raderat: Record<string, number | null> = {}
  const fel: Record<string, string> = {}

  // transcript_turn → transcript (transcript_id, NO ACTION)
  try {
    const { data: transcriptRader, error: sokErr } = await supabase
      .from('transcript')
      .select('transcript_id')
      .eq('business_id', businessId)
    if (sokErr && arSchemaSaknas(sokErr)) {
      raderat['transcript_turn'] = null
    } else if (sokErr) {
      fel['transcript_turn'] = `kunde inte slå upp transcript_id: ${sokErr.message}`
    } else {
      const ids = (transcriptRader || []).map(r => r.transcript_id)
      if (ids.length === 0) {
        raderat['transcript_turn'] = 0
      } else {
        // Batchas: ett konto med tusentals samtal skulle annars bygga en
        // .in()-lista som spränger URL-längden, och raderingen fastnar för
        // just de konton som har mest att radera.
        let summa = 0
        let batchFel: string | null = null
        let saknas = false
        for (let i = 0; i < ids.length; i += ID_BATCH) {
          const { error: delErr, count } = await supabase
            .from('transcript_turn')
            .delete({ count: 'exact' })
            .in('transcript_id', ids.slice(i, i + ID_BATCH))
          if (delErr && arSchemaSaknas(delErr)) { saknas = true; break }
          if (delErr) { batchFel = delErr.message; break }
          summa += count ?? 0
        }
        if (saknas) raderat['transcript_turn'] = null
        else if (batchFel) fel['transcript_turn'] = batchFel
        else raderat['transcript_turn'] = summa
      }
    }
  } catch (err: any) {
    fel['transcript_turn'] = err?.message || String(err)
  }

  // sms_campaign_recipient → sms_campaign (campaign_id, NO ACTION mot customer)
  try {
    const { data: kampanjer, error: sokErr } = await supabase
      .from('sms_campaign')
      .select('campaign_id')
      .eq('business_id', businessId)
    if (sokErr && arSchemaSaknas(sokErr)) {
      raderat['sms_campaign_recipient'] = null
    } else if (sokErr) {
      fel['sms_campaign_recipient'] = `kunde inte slå upp campaign_id: ${sokErr.message}`
    } else {
      const ids = (kampanjer || []).map(r => r.campaign_id)
      if (ids.length === 0) {
        raderat['sms_campaign_recipient'] = 0
      } else {
        // Batchas av samma skäl som transcript_turn ovan.
        let summa = 0
        let batchFel: string | null = null
        let saknas = false
        for (let i = 0; i < ids.length; i += ID_BATCH) {
          const { error: delErr, count } = await supabase
            .from('sms_campaign_recipient')
            .delete({ count: 'exact' })
            .in('campaign_id', ids.slice(i, i + ID_BATCH))
          if (delErr && arSchemaSaknas(delErr)) { saknas = true; break }
          if (delErr) { batchFel = delErr.message; break }
          summa += count ?? 0
        }
        if (saknas) raderat['sms_campaign_recipient'] = null
        else if (batchFel) fel['sms_campaign_recipient'] = batchFel
        else raderat['sms_campaign_recipient'] = summa
      }
    }
  } catch (err: any) {
    fel['sms_campaign_recipient'] = err?.message || String(err)
  }

  return { raderat, fel }
}

/**
 * Tömmer varje tabell i RADERAS (utom `business_users`, se nedan) på rader
 * för `businessId`. Fail-loud: fel per tabell samlas och kastas i slutet —
 * ett lyckat svar betyder att ALLT som listas i `raderat` faktiskt gick bort.
 *
 * FLERA VARV, INTE ETT: det gamla telefoni-/ärendelagret (call/case_record/
 * transcript/action_log/emergency_escalation/human_followup_queue/
 * reservation) och kundregistret har verifierade NO ACTION-kedjor mellan sig
 * (t.ex. transcript → call, booking/call_recording → case_record, ett
 * dussintal tabeller → customer). En enda genomkörning i godtycklig ordning
 * skulle rapportera FALSKA fel för tabeller som bara stod i tur efter sin
 * blockerare. Körningen försöker därför tabellerna om och om igen tills ett
 * varv inte gör någon framgång alls — bara DÅ är en kvarstående "kunde inte
 * radera"-tabell ett riktigt fel, inte en ordningsfråga. Ett bundet antal
 * varv (= antal tabeller) garanterar att loopen alltid terminerar.
 *
 * `business_users` klassas i RADERAS (för fullständighetsvakten och för att
 * dokumentera att raderna verkligen försvinner) men töms INTE här — steg 4/5
 * i app/api/account/delete/route.ts måste först läsa business_users-raderna
 * för att veta VILKA auth-användare som ska tas bort
 * (`auth.admin.deleteUser`), innan raderna själva tas bort. Skulle den här
 * funktionen redan ha tömt tabellen skulle steg 4 inte hitta några
 * inloggningar att radera.
 */
export async function raderaPersondata(
  supabase: SupabaseClient,
  businessId: string,
): Promise<RaderingsResultat> {
  const raderat: Record<string, number | null> = {}
  const fel: Record<string, string> = {}

  // Behåll referenserna vid lagringsfel så raderingen kan återförsökas.
  await removePreparationImages(supabase, businessId)

  const barn = await raderaBarntabellerUtanBusinessId(supabase, businessId)
  Object.assign(raderat, barn.raderat)
  Object.assign(fel, barn.fel)

  let kvar = RADERAS.filter(t => t !== 'business_users')
  const senasteFel = new Map<string, string>()

  for (let varv = 0; varv < RADERAS.length && kvar.length > 0; varv++) {
    const misslyckadesDenhaVarvet: string[] = []

    for (const tabell of kvar) {
      try {
        const { error, count } = await supabase
          .from(tabell)
          .delete({ count: 'exact' })
          .eq('business_id', businessId)

        if (!error) {
          raderat[tabell] = count ?? 0
          continue
        }
        if (arSchemaSaknas(error)) {
          raderat[tabell] = null
          continue
        }
        senasteFel.set(tabell, error.message)
        misslyckadesDenhaVarvet.push(tabell)
      } catch (err: any) {
        senasteFel.set(tabell, err?.message || String(err))
        misslyckadesDenhaVarvet.push(tabell)
      }
    }

    if (misslyckadesDenhaVarvet.length === kvar.length) {
      // Inget gick igenom det här varvet — ingen mening att fortsätta.
      break
    }
    kvar = misslyckadesDenhaVarvet
  }

  for (const tabell of kvar) {
    // Kvarstår efter att loopen gav upp och inget varv gjorde framsteg:
    // antingen FK-blockerad i all evighet (en beroendekedja den här filen
    // inte känner till, se filhuvudet) eller ett riktigt fel. Båda är
    // fail-loud-värda — ingen gissning om vilket, texten talar för sig själv.
    fel[tabell] = senasteFel.get(tabell) || 'okänt fel'
  }

  if (Object.keys(fel).length > 0) {
    const detaljer = Object.entries(fel).map(([t, m]) => `${t}: ${m}`).join('; ')
    const error = new Error(`Persondata-raderingen misslyckades för: ${detaljer}`)
    ;(error as any).raderat = raderat
    ;(error as any).fel = fel
    throw error
  }

  return { raderat, fel }
}
