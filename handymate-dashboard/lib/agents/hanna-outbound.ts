/**
 * Hanna — proaktiv säljmotor (v1: reaktivering).
 *
 * Hanna (Marknadschef) jobbar proaktivt med att väcka GAMLA kunder. v1 är
 * GATAD: hon skapar förslag (pending_approvals av typ 'proactive_care' som
 * redan skickar SMS vid godkännande), aldrig auto-utskick. Hantverkaren trycker
 * Godkänn.
 *
 * Datadisciplin (kritiskt — se design):
 *   - Riktar sig ENBART mot kunder vi VET är tidigare kunder: de har ett
 *     last_job_date (sätts av lib/customer-ltv.ts från faktiska jobb). En naken
 *     importerad kontakt utan historik kontaktas ALDRIG (kan ej bekräftas som
 *     kund → varumärkes-/lagrisk). De räknas separat (enrichment-flagga).
 *   - Erbjudandet skräddarsys efter senaste tjänsten (project.job_type) när den
 *     finns; annars ett varmt generiskt "hör av dig".
 *
 * Säkerhetsspärrar:
 *   - DRIP: max DRIP_PER_DAY förslag/körning → ingen flod, ens på en färsk
 *     200-kunders-import.
 *   - DEDUP: hoppa kunder med (a) öppet proactive_care-förslag, eller (b) en
 *     skickad proaktiv kontakt de senaste DEDUP_DAYS dagarna. Rider på befintlig
 *     data (pending_approvals + v3_automation_logs) → ingen ny tabell.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

const INACTIVE_MONTHS = 6
const DRIP_PER_DAY = 5
const DEDUP_DAYS = 90
const CANDIDATE_POOL = 40

function genId(prefix: string): string {
  const c = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = prefix + '_'
  for (let i = 0; i < 14; i++) s += c[Math.floor(Math.random() * c.length)]
  return s
}

export interface HannaRunResult {
  business_id: string
  proposed: number
  historyless: number
  skipped_recent: number
}

export async function runHannaOutbound(
  supabase: SupabaseClient,
  businessId: string
): Promise<HannaRunResult> {
  const now = Date.now()
  const cutoffIso = new Date(now - INACTIVE_MONTHS * 30 * 24 * 3600_000).toISOString()
  const dedupIso = new Date(now - DEDUP_DAYS * 24 * 3600_000).toISOString()

  // Företagsnamn för SMS-signatur.
  const { data: biz } = await supabase
    .from('business_config')
    .select('business_name')
    .eq('business_id', businessId)
    .maybeSingle()
  const businessName: string = biz?.business_name || 'Handymate'

  // History-less: kunder UTAN last_job_date (kan ej bekräftas som tidigare kund).
  const { count: historyless } = await supabase
    .from('customer')
    .select('customer_id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .is('last_job_date', null)

  // Kandidater: bekräftade tidigare kunder, inaktiva ≥ INACTIVE_MONTHS, med telefon.
  // Mest inaktiva först.
  const { data: candidates } = await supabase
    .from('customer')
    .select('customer_id, name, phone_number, last_job_date')
    .eq('business_id', businessId)
    .not('last_job_date', 'is', null)
    .lte('last_job_date', cutoffIso)
    .not('phone_number', 'is', null)
    .order('last_job_date', { ascending: true })
    .limit(CANDIDATE_POOL)

  if (!candidates?.length) {
    return { business_id: businessId, proposed: 0, historyless: historyless || 0, skipped_recent: 0 }
  }

  // DEDUP: bygg set av redan-kontaktade customer_id (öppet förslag ELLER skickad
  // proaktiv kontakt senaste DEDUP_DAYS). Hämtas i JS för att slippa JSON-path-in.
  const contacted = new Set<string>()

  const { data: openProposals } = await supabase
    .from('pending_approvals')
    .select('payload')
    .eq('business_id', businessId)
    .eq('approval_type', 'proactive_care')
    .eq('status', 'pending')
    .limit(500)
  for (const p of openProposals || []) {
    const cid = (p.payload as any)?.customer_id
    if (cid) contacted.add(String(cid))
  }

  const { data: recentLogs } = await supabase
    .from('v3_automation_logs')
    .select('context')
    .eq('business_id', businessId)
    .eq('rule_name', 'proactive_customer_care')
    .gte('created_at', dedupIso)
    .limit(1000)
  for (const l of recentLogs || []) {
    const cid = (l.context as any)?.customer_id
    if (cid) contacted.add(String(cid))
  }

  const fresh = candidates.filter(c => !contacted.has(String(c.customer_id)))
  const skipped_recent = candidates.length - fresh.length
  const batch = fresh.slice(0, DRIP_PER_DAY)

  let proposed = 0
  for (const c of batch) {
    // Skräddarsy efter senaste tjänsten om vi har den.
    let service: string | null = null
    try {
      const { data: proj } = await supabase
        .from('project')
        .select('job_type')
        .eq('business_id', businessId)
        .eq('customer_id', c.customer_id)
        .not('job_type', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      service = (proj?.job_type as string) || null
    } catch { /* generiskt om okänt */ }

    const firstName = String(c.name || '').split(' ')[0] || 'där'
    const monthsInactive = Math.floor((now - new Date(c.last_job_date as string).getTime()) / (30 * 24 * 3600_000))
    const sms = `Hej ${firstName}! Det var ett tag sedan vi hjälpte dig${service ? ` med ${service}` : ''}. Hör gärna av dig om du behöver hjälp igen — vi finns här. /${businessName}`

    const { error } = await supabase.from('pending_approvals').insert({
      id: genId('appr'),
      business_id: businessId,
      approval_type: 'proactive_care',
      title: `Hanna vill väcka ${c.name || 'kund'}`,
      description: `Tidigare kund, inaktiv i ~${monthsInactive} mån. Förslag på varm återkontakt.`,
      status: 'pending',
      risk_level: 'low',
      payload: {
        agent: 'hanna',
        customer_id: c.customer_id,
        customer_name: c.name,
        customer_phone: c.phone_number,
        job_type: service,
        suggested_service: service || 'tidigare jobb',
        suggested_sms: sms,
      },
    })
    if (!error) proposed++
  }

  return { business_id: businessId, proposed, historyless: historyless || 0, skipped_recent }
}
