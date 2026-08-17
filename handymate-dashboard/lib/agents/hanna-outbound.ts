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
 *
 * ═══ ETAPP J — MISSIONS-MEDVETEN CRON (Goal-to-Plan V2) ═══
 *
 * När företaget har ett AKTIVT kontaktuppdrag (mission.goal_type==='contact',
 * deadline inte passerad) fyller cronen på mot uppdragets mål: mission-
 * kandidater väljs FÖRST (lib/mission/mission-outreach.ts:s rena
 * filtreraMissionKandidater, över samma tysta-kund-pool + samma
 * canContactCustomer-frekvensvakt + samma DEDUP_DAYS/öppet-förslag-spärr som
 * det vanliga flödet), och deras kort stämplas med payload.mission_id +
 * payload.truth_class='ateraktivering' (mission-progress.ts:s
 * attributionsregel). INGET av det vanliga flödets skydd ändras i styrka —
 * bara VILKA kandidater som prioriteras och HUR korten stämplas. Utan ett
 * aktivt kontaktuppdrag är beteendet exakt som innan Etapp J (mission-inläsningen
 * är fail-soft: en trasig/saknad mission-tabell → missionslöst beteende,
 * aldrig ett kastat fel som fäller cronen).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { canContactCustomer } from '@/lib/outbound/frequency-guard'
import {
  HANNA_OUTBOUND_QUIET_DAYS,
  fetchQuietCustomers,
  monthsSinceLastJob,
  type QuietCustomerRow,
} from '@/lib/customers/quiet-customer'
import { resolveGoalType } from '@/lib/mission/goal-type'
import {
  beraknaOutreachBudget,
  filtreraMissionKandidater,
  loadMissionContactState,
  stepJobTypesForMission,
} from '@/lib/mission/mission-outreach'

// Tyst-kund-tröskeln (6 mån = 180 dgr) ligger i lib/customers/quiet-customer.ts
// (VP3 gap 6) — EN delad definition, medvetet olika trösklar per konsument.
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
  /** Etapp J — hur många av `proposed` som var mission-kandidater
      (stämplade payload.mission_id). 0 när företaget saknar ett aktivt
      kontaktuppdrag. */
  mission_proposed: number
}

/** Etapp J — det aktiva kontaktuppdragets fält cronen faktiskt behöver, inget
    mer. Egen, lokal, minimal typ (inte MissionRow) — cronen bryr sig aldrig
    om penga-/kapacitetsfälten. */
interface ActiveContactMission {
  id: string
  goal_count: number | null
  plan_snapshot: { steps?: Array<{ evidence?: { table?: string; ref_id?: string } | null }> } | null
}

/**
 * Läser företagets (högst ena) aktiva kontaktuppdrag — samma select('*')
 * + fail-soft-idiom som app/api/mission/active/route.ts (kolumner som
 * saknas i miljöer utan v145/v146 ska aldrig fälla frågan). Ett läsfel,
 * en saknad tabell, eller ett uppdrag som inte är ett aktivt kontaktmål
 * (fel goal_type, eller deadline redan passerad) → null, dvs missionslöst
 * beteende.
 */
async function loadActiveContactMission(
  supabase: SupabaseClient,
  businessId: string,
  nowMs: number,
): Promise<ActiveContactMission | null> {
  try {
    const { data, error } = await supabase
      .from('mission')
      .select('*')
      .eq('business_id', businessId)
      .eq('status', 'active')
      .maybeSingle()
    if (error || !data) return null
    const row = data as {
      id: string
      goal_type?: string | null
      goal_count?: number | null
      deadline: string
      plan_snapshot?: { steps?: Array<{ evidence?: { table?: string; ref_id?: string } | null }> } | null
    }
    if (resolveGoalType(row.goal_type) !== 'contact') return null
    const deadlineDate = typeof row.deadline === 'string' ? row.deadline.slice(0, 10) : ''
    const idag = new Date(nowMs).toISOString().slice(0, 10)
    if (!deadlineDate || deadlineDate < idag) return null // deadline passerad → hanteras av /api/mission/active, inte här
    return {
      id: row.id,
      goal_count: row.goal_count == null ? null : Number(row.goal_count),
      plan_snapshot: row.plan_snapshot ?? null,
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[hanna-outbound] mission-inläsning kunde inte köras (missionslöst beteende):', msg)
    return null
  }
}

/** Batchat senaste-jobbtyp-uppslag (samma project.job_type-källa som det
    vanliga flödets per-kund-uppslag nedan) — bara körd när uppdragets plan
    kräver segmentmatchning (stepJobTypes.length > 0), annars onödig I/O. */
async function latestJobTypesForCustomers(
  supabase: SupabaseClient,
  businessId: string,
  customerIds: string[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>()
  if (!customerIds.length) return map
  try {
    const { data } = await supabase
      .from('project')
      .select('customer_id, job_type, created_at')
      .eq('business_id', businessId)
      .in('customer_id', customerIds)
      .not('job_type', 'is', null)
      .order('created_at', { ascending: false })
    for (const row of (data || []) as Array<{ customer_id: string; job_type: string | null }>) {
      const cid = String(row.customer_id)
      if (!map.has(cid)) map.set(cid, row.job_type) // första träffen = senaste (redan sorterad)
    }
  } catch { /* okänd job_type för dessa kunder — segmentfiltret exkluderar dem defensivt */ }
  return map
}

interface ProposeCareCardResult {
  inserted: boolean
  freqBlocked: boolean
}

/**
 * Skapar (eller inte — frekvensvakten kan blockera) ETT 'proactive_care'-
 * kort för en enskild tyst kund. Exakt samma korts form (title, description,
 * payload-fälten) för mission- och vanliga kandidater — enda skillnaden är
 * ETT tillägg: missionStamp lägger payload.mission_id + payload.truth_class
 * ovanpå. Ren refaktorering av det som tidigare var batch-loopens kropp;
 * ingen ny gren i det vanliga (missionStamp===null) fallet.
 */
async function proposeCareCard(
  supabase: SupabaseClient,
  businessId: string,
  businessName: string,
  customer: QuietCustomerRow,
  nowMs: number,
  missionStamp: { mission_id: string; truth_class: 'ateraktivering' } | null,
): Promise<ProposeCareCardResult> {
  // VP1 (gap 9, tasks/vilande-pengar-masterplan.md): gemensamt frekvenstak
  // ovanpå denna funktions egna DEDUP_DAYS-spärr — hindrar att kunden
  // också fick ett kort från capacity-fill/avtal-forslag/kundbas-svep
  // samma vecka. Räknas mot samma skipped_recent-siffra i svaret, oavsett
  // om kandidaten kom från mission- eller det vanliga flödet.
  const freq = await canContactCustomer(supabase, businessId, customer.customer_id)
  if (!freq.allowed) return { inserted: false, freqBlocked: true }

  // Skräddarsy efter senaste tjänsten om vi har den.
  let service: string | null = null
  try {
    const { data: proj } = await supabase
      .from('project')
      .select('job_type')
      .eq('business_id', businessId)
      .eq('customer_id', customer.customer_id)
      .not('job_type', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    service = (proj?.job_type as string) || null
  } catch { /* generiskt om okänt */ }

  const firstName = String(customer.name || '').split(' ')[0] || 'där'
  const monthsInactive = monthsSinceLastJob(customer.last_job_date, nowMs) ?? 0
  const sms = `Hej ${firstName}! Det var ett tag sedan vi hjälpte dig${service ? ` med ${service}` : ''}. Hör gärna av dig om du behöver hjälp igen — vi finns här. /${businessName}`

  const payload: Record<string, unknown> = {
    agent: 'hanna',
    customer_id: customer.customer_id,
    customer_name: customer.name,
    customer_phone: customer.phone_number,
    job_type: service,
    suggested_service: service || 'tidigare jobb',
    suggested_sms: sms,
  }
  // Etapp J: mission-stämpling — matchar mission-progress.ts:s attributionsregel
  // (payload.truth_class i första hand, se approvalClass()).
  if (missionStamp) {
    payload.mission_id = missionStamp.mission_id
    payload.truth_class = missionStamp.truth_class
  }

  const { error } = await supabase.from('pending_approvals').insert({
    id: genId('appr'),
    business_id: businessId,
    approval_type: 'proactive_care',
    title: `Hanna vill väcka ${customer.name || 'kund'}`,
    description: `Tidigare kund, inaktiv i ~${monthsInactive} mån. Förslag på varm återkontakt.`,
    status: 'pending',
    risk_level: 'low',
    payload,
  })
  return { inserted: !error, freqBlocked: false }
}

export async function runHannaOutbound(
  supabase: SupabaseClient,
  businessId: string
): Promise<HannaRunResult> {
  const now = Date.now()
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

  // Kandidater: bekräftade tidigare kunder, tysta ≥ 180 dgr, med telefon.
  // Mest inaktiva först — via delade tyst-kund-primitiven (VP3 gap 6).
  const candidates = await fetchQuietCustomers(supabase, businessId, {
    thresholdDays: HANNA_OUTBOUND_QUIET_DAYS,
    limit: CANDIDATE_POOL,
  })

  if (!candidates?.length) {
    return { business_id: businessId, proposed: 0, historyless: historyless || 0, skipped_recent: 0, mission_proposed: 0 }
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
  let skipped_recent = candidates.length - fresh.length

  // ── Etapp J: mission-kandidater FÖRST, samma pool + samma vakter. ────────
  // Utan ett aktivt kontaktuppdrag (loadActiveContactMission → null) är den
  // här sektionen ett no-op: missionConsideredIds förblir tomt, missionProposed
  // förblir 0, och batch-urvalet nedan blir exakt fresh.slice(0, DRIP_PER_DAY)
  // — bitvis samma som innan Etapp J.
  let missionProposed = 0
  const missionConsideredIds = new Set<string>()
  const activeContactMission = await loadActiveContactMission(supabase, businessId, now)
  if (activeContactMission) {
    const stepJobTypes = stepJobTypesForMission(activeContactMission.plan_snapshot?.steps)
    const missionState = await loadMissionContactState(supabase, businessId, activeContactMission.id, now)
    const budget = beraknaOutreachBudget({
      goal_count: activeContactMission.goal_count ?? 0,
      contacted_distinct: missionState.contactedDistinct,
      open_mission_cards: missionState.openCardCustomerIds.size,
    })
    const maxMission = Math.min(DRIP_PER_DAY, budget.remaining)

    let latestJobTypeByCustomer = new Map<string, string | null>()
    if (stepJobTypes.length > 0 && maxMission > 0) {
      latestJobTypeByCustomer = await latestJobTypesForCustomers(
        supabase,
        businessId,
        fresh.map(c => String(c.customer_id)),
      )
    }

    const alreadyTargeted = new Set<string>([
      ...Array.from(missionState.contactedCustomerIds),
      ...Array.from(missionState.openCardCustomerIds),
    ])
    const missionCandidates = filtreraMissionKandidater({
      candidates: fresh,
      stepJobTypes,
      latestJobTypeByCustomer,
      alreadyTargetedCustomerIds: alreadyTargeted,
      max: maxMission,
    })

    for (const c of missionCandidates) {
      missionConsideredIds.add(String(c.customer_id))
      const result = await proposeCareCard(supabase, businessId, businessName, c, now, {
        mission_id: activeContactMission.id,
        truth_class: 'ateraktivering',
      })
      if (result.freqBlocked) {
        skipped_recent++
        continue
      }
      if (result.inserted) missionProposed++
    }
  }

  // ── Vanligt flöde: fyller på resterande drip-utrymme. Oförändrat mot innan
  // Etapp J när missionConsideredIds är tomt och missionProposed är 0. ──────
  const regularPool = fresh.filter(c => !missionConsideredIds.has(String(c.customer_id)))
  const batch = regularPool.slice(0, Math.max(0, DRIP_PER_DAY - missionProposed))

  let proposed = 0
  for (const c of batch) {
    const result = await proposeCareCard(supabase, businessId, businessName, c, now, null)
    if (result.freqBlocked) {
      skipped_recent++
      continue
    }
    if (result.inserted) proposed++
  }

  return { business_id: businessId, proposed, historyless: historyless || 0, skipped_recent, mission_proposed: missionProposed }
}
