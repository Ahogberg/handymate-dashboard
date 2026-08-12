/**
 * Startkorten (docs/design/FORSTA-30-MINUTERNA.md, "Min 15 · Första
 * godkännandet").
 *
 * Ett splitternytt konto ska ALDRIG möta en tom godkännande-kö. Vid
 * onboarding-slut seedas 2-3 'team_intro'-kort där teamet presenterar sig
 * GENOM själva kortmekaniken — att godkänna Lisas kort ÄR utbildningen i
 * produktens enda kärnhandling (kort kommer → du godkänner).
 *
 * Anropas fire-and-forget från app/api/onboarding/route.ts POST (finalize),
 * EFTER att uppdateringen och seedAllDefaults lyckats.
 *
 * Fail-safe: kastar ALDRIG. Ett förlorat startkort får aldrig fälla
 * onboarding-finalize (samma kontrakt som lib/debrief/create-debrief-card.ts).
 *
 * LIVSTIDS-DEDUPE: skapar inget om det NÅGONSIN funnits ett 'team_intro'-kort
 * för kontot — oavsett status (pending, approved, rejected, expired). INGET
 * statusfilter i dedupe-läsningen. Den buggklassen (dedupe som av misstag
 * filtrerar på status och därför skapar dubbletter av redan hanterade kort)
 * har bitit projektet fyra gånger tidigare.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { computeInstantValue, type InstantHeadline } from '@/lib/onboarding/instant-value'
import { rapporteraTystFel } from '@/lib/observability/driftlarm'

const CARD_LIFETIME_DAYS = 14

function expiresAt(): string {
  return new Date(Date.now() + CARD_LIFETIME_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

function nyttId(suffix: string): string {
  return `appr_${Date.now()}_${suffix}_${Math.random().toString(36).substring(2, 7)}`
}

/**
 * Karins fynd — samma motor som onboardingens payoff (Step6LiveTour) och
 * samma queries som app/api/onboarding/instant-value/route.ts, så siffran
 * aldrig driver isär från vad dashboarden senare visar. Bara de tre
 * penningfynden (förfallet → obetalt → öppna affärer) bär amount_kr och
 * räknas som "fynd" här — kundantal och tomt fall gör det inte, se
 * lib/onboarding/instant-value.ts pickHeadline.
 */
async function hamtaKarinFynd(
  supabase: SupabaseClient,
  businessId: string,
): Promise<InstantHeadline | null> {
  try {
    const [invoicesRes, customerRes, dealRows, stagesRes] = await Promise.all([
      supabase
        .from('invoice')
        .select('total, status')
        .eq('business_id', businessId)
        .in('status', ['sent', 'overdue'])
        .limit(5000),
      supabase
        .from('customer')
        .select('customer_id', { count: 'exact', head: true })
        .eq('business_id', businessId),
      supabase
        .from('deal')
        .select('value, stage_id')
        .eq('business_id', businessId)
        .limit(2000),
      supabase
        .from('pipeline_stage')
        .select('id, is_won, is_lost')
        .eq('business_id', businessId),
    ])

    const { headline } = computeInstantValue({
      invoices: invoicesRes.data ?? [],
      customerCount: customerRes.count ?? 0,
      deals: dealRows.data ?? [],
      stages: stagesRes.data ?? [],
    })

    // Bara penningfynd räknas som "fynd" för startkortet — kundantal/tomt
    // (Hanna/Lisa-grenarna i pickHeadline) saknar amount_kr och ger default-
    // texten i skapaStartkort nedan.
    return typeof headline.amount_kr === 'number' && headline.amount_kr > 0 ? headline : null
  } catch (err) {
    // Fail-safe: ett misslyckat fynd ska aldrig stoppa Lisa/Daniel-korten —
    // Karin-kortet faller bara tillbaka till default-texten.
    console.error('[skapaStartkort] Karin-fyndet kunde inte hämtas (fail-safe, default-text används):', err)
    await rapporteraTystFel(supabase, businessId, 'startkort:karin-fynd', err instanceof Error ? err.message : String(err))
    return null
  }
}

export async function skapaStartkort(supabase: SupabaseClient, businessId: string): Promise<void> {
  try {
    if (!businessId) return

    // Livstids-dedupe — se filkommentaren. UTAN statusfilter, avsiktligt.
    const { data: existing, error: dedupeErr } = await supabase
      .from('pending_approvals')
      .select('id')
      .eq('business_id', businessId)
      .eq('approval_type', 'team_intro')
      .limit(1)

    if (dedupeErr) {
      console.error('[skapaStartkort] dedupe-läsning misslyckades (fail-safe, skapar inte korten):', dedupeErr.message)
      await rapporteraTystFel(supabase, businessId, 'startkort:dedupe-read', dedupeErr.message)
      return
    }
    if (existing && existing.length > 0) return

    const karinFynd = await hamtaKarinFynd(supabase, businessId)

    const karinTitle = karinFynd ? karinFynd.text : 'Jag bevakar dina fakturor från och med nu'
    const karinDescription = karinFynd
      ? 'Jag bevakar dem från och med nu — påminnelseförslag dyker upp här när det är läge.'
      : 'Dyker det upp en förfallen faktura hittar du den här — du behöver inte leta.'

    const cards = [
      {
        id: nyttId('lisa'),
        business_id: businessId,
        status: 'pending',
        expires_at: expiresAt(),
        approval_type: 'team_intro',
        title: 'Jag vaktar din telefon nu',
        description:
          'Missade samtal blir ett SMS till kunden inom en minut — och du ser allt här. Ingenting går ut utan att du ser det.',
        risk_level: 'low',
        payload: { agent_id: 'lisa' },
      },
      {
        id: nyttId('karin'),
        business_id: businessId,
        status: 'pending',
        expires_at: expiresAt(),
        approval_type: 'team_intro',
        title: karinTitle,
        description: karinDescription,
        risk_level: 'low',
        payload: { agent_id: 'karin', instant_value: karinFynd ?? null },
      },
      {
        id: nyttId('daniel'),
        business_id: businessId,
        status: 'pending',
        expires_at: expiresAt(),
        approval_type: 'team_intro',
        title: 'Skicka din första offert så följer jag upp den åt dig',
        description: 'Jag påminner kunden när offerten legat obesvarad — du godkänner innan något skickas.',
        risk_level: 'low',
        payload: { agent_id: 'daniel' },
      },
    ]

    const { error: insertErr } = await supabase.from('pending_approvals').insert(cards)

    if (insertErr) {
      console.error('[skapaStartkort] kunde inte skapa korten:', insertErr.message)
      await rapporteraTystFel(supabase, businessId, 'startkort:insert', insertErr.message)
    }
  } catch (err) {
    // Fail-safe: får aldrig fälla onboarding-finalize.
    console.error('[skapaStartkort] oväntat fel (fail-safe):', err)
    await rapporteraTystFel(
      supabase,
      businessId,
      'startkort:unexpected',
      err instanceof Error ? err.message : String(err),
    )
  }
}
