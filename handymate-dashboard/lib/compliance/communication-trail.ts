/**
 * Kommunikationsunderlaget V1 — deterministisk, LÄSANDE insamling av all
 * kund↔företag-kommunikation för tvister ("vad sades när?") och redovisning.
 *
 * Ingen AI någonstans i kedjan: underlaget är en trogen kronologisk avskrift
 * av det som faktiskt sparats, med kanal, riktning och tidsstämpel.
 *
 * Ärlighetskontraktet (kärnan i en compliance-produkt): en källa som inte kan
 * hämtas RAPPORTERAS i sources_with_errors i stället för att tyst utelämnas —
 * ett underlag som ser komplett ut men saknar e-posten är värre i en tvist än
 * ett underlag som säger "e-post kunde inte hämtas". Samma sak för käll-
 * avkortning: truncated_sources. Mönstret speglar
 * lib/value/load-revenue-recovery-cases.ts, men kastar inte — ETT trasigt
 * uppslag ska inte fälla de sju andra källorna.
 *
 * Källorna var åtta, verifierade live 2026-08-16 mot kundtidslinjen
 * (app/api/customers/[id]/timeline), men utan tidslinjens UI-radtak.
 * Kundminne-revisionen (2026-09-02) lade till källa nio och tio: leads
 * (kundens egna ord från webb/lead-formulär, gap 5) och customer_fact
 * (godkänd kundfakta ur möten, gap 8).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { phoneCandidates } from '@/lib/voice/find-customer-by-phone'

export type TrailChannel =
  | 'sms'
  | 'email'
  | 'portal'
  | 'call'
  | 'meeting'
  | 'widget'
  | 'quote_view'
  | 'note'
  | 'form'

export interface TrailEntry {
  channel: TrailChannel
  direction: 'in' | 'out' | null
  timestamp: string
  title: string
  body: string | null
  meta?: Record<string, unknown>
}

export interface CommunicationTrail {
  customer: { name: string; phone_number: string | null; email: string | null }
  entries: TrailEntry[]
  sources_with_errors: string[]
  truncated_sources: string[]
}

/** Svenska kanaletiketter — delas av PDF-exporten och Matte-verktyget. */
export const TRAIL_CHANNEL_LABELS: Record<TrailChannel, string> = {
  sms: 'SMS',
  email: 'E-post',
  portal: 'Portal',
  call: 'Samtal',
  meeting: 'Platsbesök',
  widget: 'Webbchatt',
  quote_view: 'Offertöppning',
  note: 'Anteckning',
  form: 'Formulär',
}

/** Läsbara källnamn för bortfalls-/avkortningsraderna i exporten. */
export const TRAIL_SOURCE_LABELS: Record<string, string> = {
  sms_conversation: 'SMS',
  sms_log: 'historiska SMS',
  email_conversations: 'e-post',
  customer_message: 'portalmeddelanden',
  call_recording: 'samtal och platsbesök',
  widget_conversation: 'webbchatt',
  quote_tracking_events: 'offertöppningar',
  customer_activity: 'anteckningar',
  leads: 'formulärsvar',
  customer_fact: 'kundfakta',
}

/**
 * Hårt säkerhetstak per källa — underlaget har inget UI-radtak (tvister kräver
 * allt), men en obegränsad query mot en flerårig SMS-tråd får inte kunna fälla
 * exporten. Överskrids taket rapporteras källan i truncated_sources.
 */
export const PER_SOURCE_LIMIT = 500

/**
 * Speglingens deploy-gräns (samma som timeline-routens sektion 3e): före
 * 2026-08-17 var sms_conversation ofullständig och sms_log komplett för
 * utgående — efter gränsen gäller det omvända. Utan gränsen visas varje
 * utgående SMS dubbelt.
 */
const SMS_LOG_CUTOFF_ISO = '2026-08-17T00:00:00Z'

// ─── Rena hjälpfunktioner (unit-testas direkt) ──────────────────────────────

/** Stigande kronologi — ett underlag läses uppifrån och ner som en journal. */
export function sortTrailEntries(entries: TrailEntry[]): TrailEntry[] {
  return [...entries].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  )
}

/**
 * Svensk kalenderdag — DB-stämplarna är UTC och en kväll efter 22 UTC hör
 * till NÄSTA svenska dygn på sommaren. Fel dygn i ett tvisteunderlag är
 * exakt sådant en motpart hänger upp sig på.
 */
export function stockholmDay(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })
}

export function stockholmTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('sv-SE', {
    timeZone: 'Europe/Stockholm',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Grupperar en REDAN sorterad lista per svensk kalenderdag, i ordning. */
export function groupEntriesByDay(
  entries: TrailEntry[],
): { day: string; entries: TrailEntry[] }[] {
  const groups: { day: string; entries: TrailEntry[] }[] = []
  for (const e of entries) {
    const day = stockholmDay(e.timestamp)
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.entries.push(e)
    else groups.push({ day, entries: [e] })
  }
  return groups
}

/**
 * Rena datum (YYYY-MM-DD) från UI/verktyg blir dygnsgränser; fulla ISO-
 * stämplar släpps igenom orörda. Gränserna sätts i UTC — deterministiskt och
 * utan DST-tabell; som mest ±2 h kantavvikelse mot svensk midnatt, vilket
 * periodrubriken i exporten redovisar som just datum, inte klockslag.
 */
export function normalizeTrailRange(
  from?: string,
  to?: string,
): { fromIso?: string; toIso?: string } {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/
  return {
    fromIso: from ? (dateOnly.test(from) ? `${from}T00:00:00Z` : from) : undefined,
    toIso: to ? (dateOnly.test(to) ? `${to}T23:59:59.999Z` : to) : undefined,
  }
}

// ─── Insamlingen ────────────────────────────────────────────────────────────

interface SourceState {
  sources_with_errors: string[]
  truncated_sources: string[]
}

/**
 * Gemensam insamlare: destrukturerar { data, error }, loggar och RAPPORTERAR
 * fel per källa (aldrig tyst svalt), flaggar avkortning över taket. Frågorna
 * hämtar nyaste-först med limit(taket + 1) så avkortning kan avgöras exakt —
 * det som faller bort vid taket är de äldsta raderna.
 */
async function collectSource<T>(
  source: string,
  state: SourceState,
  run: () => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  try {
    const { data, error } = await run()
    if (error) {
      console.error(`[communication-trail] ${source}:`, error.message)
      state.sources_with_errors.push(source)
      return []
    }
    const rows = Array.isArray(data) ? data : []
    if (rows.length > PER_SOURCE_LIMIT) {
      state.truncated_sources.push(source)
      return rows.slice(0, PER_SOURCE_LIMIT)
    }
    return rows
  } catch (err) {
    // Nätverksfel m.m. ska rapporteras precis som PostgREST-fel.
    console.error(`[communication-trail] ${source} kastade:`, err)
    state.sources_with_errors.push(source)
    return []
  }
}

export async function getCommunicationTrail(
  supabase: SupabaseClient,
  businessId: string,
  customerId: string,
  opts?: { fromIso?: string; toIso?: string },
): Promise<CommunicationTrail | null> {
  // Kundraden är fundamentet (namn + widget-matchnyckarna) — kan den inte
  // hämtas finns inget ärligt underlag att bygga, därför kastas felet.
  const { data: customer, error: customerError } = await supabase
    .from('customer')
    .select('name, phone_number, email')
    .eq('business_id', businessId)
    .eq('customer_id', customerId)
    .maybeSingle()
  if (customerError) {
    throw new Error(`customer-uppslag misslyckades: ${customerError.message}`)
  }
  if (!customer) return null

  const state: SourceState = { sources_with_errors: [], truncated_sources: [] }
  const entries: TrailEntry[] = []
  const fromIso = opts?.fromIso
  const toIso = opts?.toIso

  // Periodfilter appliceras per källa på källans egen tidskolumn.
  const applyRange = <Q extends { gte(c: string, v: string): Q; lte(c: string, v: string): Q }>(
    q: Q,
    column: string,
  ): Q => {
    let query = q
    if (fromIso) query = query.gte(column, fromIso)
    if (toIso) query = query.lte(column, toIso)
    return query
  }

  // ── SMS, båda riktningar (sedan speglingen 2026-08-16) ────────────────────
  // Kundminne-revisionen (2026-09-02, gap 1): skrivarna sparar alltid E.164
  // men kunden kan vara sparad i valfri form — ett rått .eq(phone_number,
  // customer.phone_number) gjorde SMS-delen av underlaget osynlig för en
  // kund utan E.164-nummer. phoneCandidates ger [rå, E.164] för .in().
  const smsPhoneCandidates = phoneCandidates(customer.phone_number)
  if (smsPhoneCandidates.length > 0) {
    const rows = await collectSource<{ id: string; role: string; content: string | null; created_at: string }>(
      'sms_conversation',
      state,
      () => applyRange(
        supabase
          .from('sms_conversation')
          .select('id, role, content, created_at')
          .eq('business_id', businessId)
          .in('phone_number', smsPhoneCandidates),
        'created_at',
      )
        .order('created_at', { ascending: false })
        .limit(PER_SOURCE_LIMIT + 1),
    )
    for (const s of rows) {
      const inkommande = s.role === 'user'
      entries.push({
        channel: 'sms',
        direction: inkommande ? 'in' : 'out',
        timestamp: s.created_at,
        title: inkommande ? 'SMS mottaget' : 'SMS skickat',
        body: s.content,
        meta: { phone: customer.phone_number },
      })
    }
  }

  // ── Historiska utgående SMS (före speglingen) ─────────────────────────────
  {
    const rows = await collectSource<{ sms_id: string; message: string | null; message_type: string | null; sent_at: string }>(
      'sms_log',
      state,
      () => applyRange(
        supabase
          .from('sms_log')
          .select('sms_id, message, message_type, sent_at')
          .eq('business_id', businessId)
          .eq('customer_id', customerId)
          .eq('direction', 'outbound')
          .in('status', ['sent', 'delivered'])
          .lt('sent_at', SMS_LOG_CUTOFF_ISO),
        'sent_at',
      )
        .order('sent_at', { ascending: false })
        .limit(PER_SOURCE_LIMIT + 1),
    )
    for (const s of rows) {
      entries.push({
        channel: 'sms',
        direction: 'out',
        timestamp: s.sent_at,
        title: 'SMS skickat',
        body: s.message,
        meta: { message_type: s.message_type, source: 'sms_log' },
      })
    }
  }

  // ── E-post, båda riktningar ───────────────────────────────────────────────
  {
    const rows = await collectSource<{ id: string; direction: string; subject: string | null; body_text: string | null; received_at: string }>(
      'email_conversations',
      state,
      () => applyRange(
        supabase
          .from('email_conversations')
          .select('id, direction, subject, body_text, received_at')
          .eq('business_id', businessId)
          .eq('customer_id', customerId),
        'received_at',
      )
        .order('received_at', { ascending: false })
        .limit(PER_SOURCE_LIMIT + 1),
    )
    for (const e of rows) {
      const utgaende = e.direction === 'outbound'
      const amne = e.subject || '(utan ämne)'
      entries.push({
        channel: 'email',
        direction: utgaende ? 'out' : 'in',
        timestamp: e.received_at,
        title: utgaende ? `E-post skickad: ${amne}` : `E-post mottagen: ${amne}`,
        body: e.body_text,
        meta: { subject: e.subject },
      })
    }
  }

  // ── Portal-tråden ─────────────────────────────────────────────────────────
  {
    const rows = await collectSource<{ id: string; direction: string; message: string | null; created_at: string }>(
      'customer_message',
      state,
      () => applyRange(
        supabase
          .from('customer_message')
          .select('id, direction, message, created_at')
          .eq('business_id', businessId)
          .eq('customer_id', customerId),
        'created_at',
      )
        .order('created_at', { ascending: false })
        .limit(PER_SOURCE_LIMIT + 1),
    )
    for (const p of rows) {
      const utgaende = p.direction === 'outbound'
      entries.push({
        channel: 'portal',
        direction: utgaende ? 'out' : 'in',
        timestamp: p.created_at,
        title: utgaende ? 'Portalmeddelande skickat' : 'Portalmeddelande mottaget',
        body: p.message,
      })
    }
  }

  // ── Samtal + platsbesök (fullt transkript följer med i meta) ──────────────
  {
    const rows = await collectSource<{ recording_id: string; source: string | null; phone_number: string | null; transcript_summary: string | null; transcript: string | null; duration_seconds: number | null; created_at: string }>(
      'call_recording',
      state,
      () => applyRange(
        supabase
          .from('call_recording')
          .select('recording_id, source, phone_number, transcript_summary, transcript, duration_seconds, created_at')
          .eq('business_id', businessId)
          .eq('customer_id', customerId),
        'created_at',
      )
        .order('created_at', { ascending: false })
        .limit(PER_SOURCE_LIMIT + 1),
    )
    for (const r of rows) {
      const arMote = r.source === 'site_visit'
      entries.push({
        channel: arMote ? 'meeting' : 'call',
        // Ett transkript rymmer båda parter — riktning är inte meningsfull.
        direction: null,
        timestamp: r.created_at,
        title: arMote ? 'Platsbesök (inspelat)' : 'Telefonsamtal (inspelat)',
        body: r.transcript_summary,
        meta: {
          transcript: r.transcript,
          duration_seconds: r.duration_seconds,
          phone: r.phone_number,
          recording_id: r.recording_id,
        },
      })
    }
  }

  // ── Webbchatten (pre-sale) — ingen customer_id finns, matcha på det
  //    besökaren själv angav. Hela meddelandelistan återges, inte en preview:
  //    AI:ns prisuttalanden före köpet är precis det en tvist handlar om. ─────
  if (customer.phone_number || customer.email) {
    const orVillkor = [
      customer.phone_number ? `visitor_phone.eq.${customer.phone_number}` : null,
      customer.email ? `visitor_email.eq.${customer.email}` : null,
    ].filter(Boolean).join(',')
    const rows = await collectSource<{ id: string; messages: unknown; message_count: number | null; created_at: string }>(
      'widget_conversation',
      state,
      () => applyRange(
        supabase
          .from('widget_conversation')
          .select('id, messages, message_count, created_at')
          .eq('business_id', businessId)
          .or(orVillkor),
        'created_at',
      )
        .order('created_at', { ascending: false })
        .limit(PER_SOURCE_LIMIT + 1),
    )
    for (const w of rows) {
      const msgs = Array.isArray(w.messages) ? (w.messages as { role?: string; content?: string }[]) : []
      const utskrift = msgs
        .map(m => `${m.role === 'user' ? 'Kund' : 'AI'}: ${String(m.content || '')}`)
        .join('\n')
      entries.push({
        channel: 'widget',
        direction: null,
        timestamp: w.created_at,
        title: `Webbchatt (${w.message_count || msgs.length} meddelanden)`,
        body: utskrift || null,
        meta: { conversation_id: w.id, message_count: w.message_count },
      })
    }
  }

  // ── Offertöppningar — kundens id finns bara via quotes-tabellen ───────────
  {
    const { data: quoteRows, error: quoteError } = await supabase
      .from('quotes')
      .select('quote_id, quote_number')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
    if (quoteError) {
      // Offertuppslaget är en förutsättning för öppningarna — samma källa.
      console.error('[communication-trail] quote_tracking_events (quotes):', quoteError.message)
      state.sources_with_errors.push('quote_tracking_events')
    } else {
      const quoteIds = (quoteRows || []).map(q => q.quote_id)
      if (quoteIds.length > 0) {
        const nummerAv = new Map((quoteRows || []).map(q => [q.quote_id, q.quote_number]))
        const rows = await collectSource<{ id: string; quote_id: string; created_at: string }>(
          'quote_tracking_events',
          state,
          () => applyRange(
            supabase
              .from('quote_tracking_events')
              .select('id, quote_id, created_at')
              .eq('business_id', businessId)
              .in('quote_id', quoteIds)
              .eq('event_type', 'opened'),
            'created_at',
          )
            .order('created_at', { ascending: false })
            .limit(PER_SOURCE_LIMIT + 1),
        )
        for (const v of rows) {
          entries.push({
            channel: 'quote_view',
            direction: 'in',
            timestamp: v.created_at,
            title: `Kunden öppnade offert ${nummerAv.get(v.quote_id) || ''}`.trim(),
            body: null,
            meta: { quote_id: v.quote_id },
          })
        }
      }
    }
  }

  // ── Manuella loggar och anteckningar ──────────────────────────────────────
  {
    const rows = await collectSource<{ activity_id: string; activity_type: string | null; title: string | null; description: string | null; transcript: string | null; duration_seconds: number | null; created_at: string; created_by: string | null }>(
      'customer_activity',
      state,
      () => applyRange(
        supabase
          .from('customer_activity')
          .select('activity_id, activity_type, title, description, transcript, duration_seconds, created_at, created_by')
          .eq('business_id', businessId)
          .eq('customer_id', customerId),
        'created_at',
      )
        .order('created_at', { ascending: false })
        .limit(PER_SOURCE_LIMIT + 1),
    )
    for (const a of rows) {
      entries.push({
        channel: 'note',
        direction: null,
        timestamp: a.created_at,
        title: a.title || 'Anteckning',
        body: a.description,
        meta: {
          activity_type: a.activity_type,
          transcript: a.transcript,
          duration_seconds: a.duration_seconds,
          created_by: a.created_by,
        },
      })
    }
  }

  // ── Kundens egna ord från webb/lead-formuläret (gap 5) ────────────────────
  {
    const rows = await collectSource<{ lead_id: string; notes: string | null; source: string | null; created_at: string }>(
      'leads',
      state,
      () => applyRange(
        supabase
          .from('leads')
          .select('lead_id, notes, source, created_at')
          .eq('business_id', businessId)
          .eq('customer_id', customerId),
        'created_at',
      )
        .order('created_at', { ascending: false })
        .limit(PER_SOURCE_LIMIT + 1),
    )
    for (const l of rows) {
      if (!l.notes) continue
      entries.push({
        channel: 'form',
        direction: 'in',
        timestamp: l.created_at,
        title: 'Formulärsvar (lead)',
        body: l.notes,
        meta: { lead_id: l.lead_id, source: l.source },
      })
    }
  }

  // ── Kundfakta — godkända fakta ur möten (gap 8) ────────────────────────────
  {
    const rows = await collectSource<{ id: string; content: string | null; fact_type: string | null; created_at: string }>(
      'customer_fact',
      state,
      () => applyRange(
        supabase
          .from('customer_fact')
          .select('id, content, fact_type, created_at')
          .eq('business_id', businessId)
          .eq('customer_id', customerId)
          .is('superseded_by', null),
        'created_at',
      )
        .order('created_at', { ascending: false })
        .limit(PER_SOURCE_LIMIT + 1),
    )
    for (const f of rows) {
      entries.push({
        channel: 'note',
        direction: null,
        timestamp: f.created_at,
        title: 'Kundfakta',
        body: f.content,
        meta: { fact_type: f.fact_type },
      })
    }
  }

  return {
    customer: {
      name: customer.name || 'Okänd kund',
      phone_number: customer.phone_number || null,
      email: customer.email || null,
    },
    entries: sortTrailEntries(entries),
    sources_with_errors: state.sources_with_errors,
    truncated_sources: state.truncated_sources,
  }
}
