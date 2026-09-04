/**
 * Smart Dispatch — matchar rätt tekniker till rätt jobb.
 * Kompetens + tillgänglighet + plats → approval-förslag.
 */

import { getServerSupabase } from '@/lib/supabase'
import { resolveMemberSkills } from '@/lib/skills'
import { fetchPersonDays } from '@/lib/schedule/person-day'
import { computePersonWeekUtilization } from '@/lib/schedule/utilization'
import { classifyCertStatus } from '@/lib/certifikat/status'
import { svDateStr, svDateStrPlusDays } from '@/lib/dates'
import { mondayOfWeek } from '@/lib/capacity/week-capacity'
import { brusgrind } from '@/lib/approvals/noise-gate'
import { skapaKort } from '@/lib/approvals/skapa-kort'

interface TeamMember {
  id: string
  name: string
  skills: string[]
  is_active: boolean
}

/**
 * R3 (tasks/resurs-masterplan.md): resolveMemberSkills flyttad till
 * lib/skills.ts (ingen server-only imports där) så klientkomponenter kan
 * importera den direkt — re-exporterad här oförändrat, alla befintliga
 * imports av `resolveMemberSkills` från '@/lib/dispatch' fortsätter
 * fungera identiskt. Se lib/skills.ts för skills↔specialties-bakgrunden.
 */
export { resolveMemberSkills }

interface DispatchResult {
  suggested: boolean
  member?: TeamMember
  reasons?: string[]
  approval_id?: string
  /** true = en kandidat fanns men brusgrinden höll tillbaka kortet. */
  suppressed?: boolean
  reason?: string
}

/**
 * Normalisera jobbtyp till skill-nyckel. Ren funktion, exporterad för
 * facit-test (tests/dispatch-matching.spec.ts).
 */
export function normalizeJobType(input: string): string[] {
  const lower = (input || '').toLowerCase()
  const matches: string[] = []
  if (lower.includes('el') || lower.includes('elektr')) matches.push('el')
  if (lower.includes('vvs') || lower.includes('rör') || lower.includes('vatten')) matches.push('vvs')
  if (lower.includes('bygg') || lower.includes('snickar') || lower.includes('renovera')) matches.push('bygg')
  if (lower.includes('mål') || lower.includes('tapet')) matches.push('måleri')
  if (lower.includes('tak') || lower.includes('plåt')) matches.push('tak')
  if (lower.includes('mark') || lower.includes('trädgård') || lower.includes('gräv')) matches.push('mark')
  if (lower.includes('golv') || lower.includes('kakel') || lower.includes('klinker')) matches.push('golv')
  if (matches.length === 0) matches.push('allman')
  return matches
}

/**
 * Enkel adress-matchning — kollar om samma stadsdel/postnummer.
 * Returnerar 0-1 poäng.
 */
function addressProximity(addr1: string | null, addr2: string | null): number {
  if (!addr1 || !addr2) return 0

  // Extrahera postnummer (5 siffror)
  const zip1 = addr1.match(/\d{3}\s?\d{2}/)?.[0]?.replace(/\s/g, '')
  const zip2 = addr2.match(/\d{3}\s?\d{2}/)?.[0]?.replace(/\s/g, '')
  if (zip1 && zip2) {
    if (zip1 === zip2) return 1.0
    if (zip1.slice(0, 3) === zip2.slice(0, 3)) return 0.7
    if (zip1.slice(0, 2) === zip2.slice(0, 2)) return 0.4
  }

  // Fallback: simpel ordmatchning
  const words1 = addr1.toLowerCase().split(/[\s,]+/).filter(w => w.length > 3)
  const words2 = addr2.toLowerCase().split(/[\s,]+/).filter(w => w.length > 3)
  const shared = words1.filter(w => words2.includes(w)).length
  return Math.min(shared * 0.3, 0.8)
}

// ─────────────────────────────────────────────────────────────────
// R5 (tasks/resurs-masterplan.md) — resursplaneringskortets berikning:
// cert-data + veckobeläggning för den föreslagna personen. Byggs INNAN
// pending_approvals-inserten (inte fire-and-forget — kortet ska ha datat
// redan vid skapande, planens explicita krav) men får ALDRIG stoppa
// kortskapandet: varje delfråga fångar sina egna fel och degraderar tyst
// till null/tom lista, precis som app/api/team/certificates hanterar en
// ännu ej körd v84-migration.
// ─────────────────────────────────────────────────────────────────

interface DispatchCandidateEnrichment {
  /** Innevarande veckas beläggning (%) för kandidaten, samma beräkning som
   *  resurstavlan (lib/schedule/utilization.ts). Null om beräkningen
   *  misslyckades — INTE 0, för att aldrig visa en falsk "helt ledig". */
  week_utilization_pct: number | null
  /** Null = certifikat kunde inte hämtas (t.ex. v84 ej körd) — skiljs
   *  medvetet från "hämtat men tomt" (valid:[] betyder faktiskt inga cert). */
  certificates: {
    valid: string[]
    expiring_soon: Array<{ cert_type: string; valid_until: string }>
  } | null
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    /relation .* does not exist/i.test(error.message || '')
  )
}

async function buildDispatchCandidateEnrichment(
  supabase: ReturnType<typeof getServerSupabase>,
  businessId: string,
  memberId: string,
): Promise<DispatchCandidateEnrichment> {
  let weekUtilizationPct: number | null = null
  try {
    const monday = mondayOfWeek(svDateStr())
    const weekDates = Array.from({ length: 7 }, (_, i) => svDateStrPlusDays(i, new Date(`${monday}T12:00:00Z`)))
    const personDays = await fetchPersonDays(supabase, businessId, [memberId], monday, weekDates[6])
    const util = computePersonWeekUtilization(personDays, memberId, weekDates)
    weekUtilizationPct = Math.round(util.utilizationPct)
  } catch (err) {
    console.error('[dispatch] kunde inte beräkna veckobeläggning för förslagskortet, degraderar:', err)
  }

  let certificates: DispatchCandidateEnrichment['certificates'] = null
  try {
    const { data, error } = await supabase
      .from('employee_certificate')
      .select('cert_type, valid_until')
      .eq('business_id', businessId)
      .eq('business_user_id', memberId)

    if (error) {
      if (!isMissingTableError(error)) {
        console.error('[dispatch] kunde inte hämta certifikat för förslagskortet:', error)
      }
      // Tabell saknas (v84 ej körd) — certificates förblir null, degraderar.
    } else {
      const valid: string[] = []
      const expiringSoon: Array<{ cert_type: string; valid_until: string }> = []
      for (const c of (data || []) as { cert_type: string; valid_until: string | null }[]) {
        const status = classifyCertStatus(c.valid_until)
        if (status === 'valid' || status === 'no_expiry') valid.push(c.cert_type)
        else if (status === 'expiring_soon' && c.valid_until) expiringSoon.push({ cert_type: c.cert_type, valid_until: c.valid_until })
      }
      certificates = { valid, expiring_soon: expiringSoon }
    }
  } catch (err) {
    console.error('[dispatch] certifikat-hämtning för förslagskortet kastade, degraderar:', err)
  }

  return { week_utilization_pct: weekUtilizationPct, certificates }
}

/**
 * Försök matcha en tekniker till ett jobb.
 * Skapar approval om bra match finns.
 */
export async function suggestDispatch(params: {
  businessId: string
  jobTitle: string
  jobAddress?: string | null
  scheduledStart: string
  scheduledEnd?: string | null
  jobType?: string // "el", "vvs", "bygg", etc. — eller fritext
  contextType: 'booking' | 'work_order'
  contextId: string
  customerName?: string | null
}): Promise<DispatchResult> {
  const supabase = getServerSupabase()

  // 1. Hämta aktiva teammedlemmar med specialties (+ skills för fallback,
  // se resolveMemberSkills ovan)
  const { data: members } = await supabase
    .from('business_users')
    .select('id, name, skills, specialties, is_active')
    .eq('business_id', params.businessId)
    .eq('is_active', true)

  if (!members || members.length === 0) {
    return { suggested: false }
  }

  const jobSkills = normalizeJobType(params.jobType || params.jobTitle)
  const jobStart = new Date(params.scheduledStart)
  const jobEnd = params.scheduledEnd ? new Date(params.scheduledEnd) : new Date(jobStart.getTime() + 2 * 3600000)

  // 2. Poängsätt varje teammedlem
  const scored: Array<{
    member: TeamMember
    score: number
    reasons: string[]
  }> = []

  for (const m of members) {
    const memberSkills: string[] = resolveMemberSkills(m)
    let score = 0
    const reasons: string[] = []

    // Kompetens-match
    const skillMatch = jobSkills.some(js => memberSkills.includes(js))
    if (skillMatch) {
      score += 3
      reasons.push('Rätt kompetens')
    } else if (memberSkills.length === 0) {
      // Ingen skill satt = generalist, lägre poäng
      score += 1
      reasons.push('Generalist')
    }

    // Tillgänglighet — kolla att ingen bokning krockar
    const dayStr = jobStart.toISOString().split('T')[0]
    const { data: existingBookings } = await supabase
      .from('booking')
      .select('scheduled_start, scheduled_end, notes')
      .eq('business_id', params.businessId)
      .eq('assigned_user_id', m.id)
      .gte('scheduled_start', `${dayStr}T00:00:00`)
      .lte('scheduled_start', `${dayStr}T23:59:59`)

    const hasConflict = (existingBookings || []).some((b: any) => {
      const bStart = new Date(b.scheduled_start)
      const bEnd = b.scheduled_end ? new Date(b.scheduled_end) : new Date(bStart.getTime() + 3600000)
      return bStart < jobEnd && bEnd > jobStart
    })

    if (hasConflict) {
      continue // Skippa — inte ledig
    }

    score += 2
    reasons.push('Ledig')

    // Plats-optimering — kolla dagens övriga bokningar
    if (params.jobAddress && existingBookings && existingBookings.length > 0) {
      let bestProximity = 0
      for (const b of existingBookings) {
        const bookingAddr = (b.notes || '').match(/adress[:\s]+(.+)/i)?.[1] || b.notes
        const prox = addressProximity(params.jobAddress, bookingAddr)
        if (prox > bestProximity) bestProximity = prox
      }
      if (bestProximity > 0.5) {
        score += 2
        reasons.push('Närmast platsen')
      } else if (bestProximity > 0) {
        score += 1
        reasons.push('Samma område')
      }
    } else if (!existingBookings || existingBookings.length === 0) {
      // Inga andra bokningar = helt ledig dag
      score += 1
      reasons.push('Tom dag')
    }

    scored.push({ member: { ...m, skills: memberSkills }, score, reasons })
  }

  if (scored.length === 0) {
    return { suggested: false }
  }

  // 3. Välj bästa match
  scored.sort((a, b) => b.score - a.score)
  const best = scored[0]

  // Kräv minst poäng 3 (kompetens + ledig eller liknande)
  if (best.score < 3) {
    return { suggested: false }
  }

  // 3b. Brusgrinden (lib/approvals/noise-gate.ts, 2026-09-01): på demokontot
  // gick 28 dispatch_suggestion i rad ut orörda. Har de senaste förslagen
  // hos det här företaget bara expirerat hålls nästa tillbaka i 14 dagar,
  // sedan släpps ETT igenom. Fail-open — ett DB-fel i grinden stoppar
  // aldrig ett förslag.
  const grind = await brusgrind(supabase, params.businessId, 'dispatch_suggestion')
  if (grind.tysta) {
    return { suggested: false, suppressed: true, reason: grind.skal }
  }

  // 4. Skapa approval — berika payloaden med cert/beläggning för kortet
  // (R5, tasks/resurs-masterplan.md) INNAN insert, se
  // buildDispatchCandidateEnrichment ovan för degraderingsprincipen.
  const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
  const enrichment = await buildDispatchCandidateEnrichment(supabase, params.businessId, best.member.id)

  // Pass B, del 3: dispatch_suggestion är kortkanal-typad 'digest'
  // (lib/approvals/kortkanal.ts) — skapaKort skriver då en
  // automation_activity-rad i stället för ett kort, tyst. skapaKort gör
  // insert + ev. push i EN sak (Pass A).
  await skapaKort(supabase, {
    id: approvalId,
    business_id: params.businessId,
    approval_type: 'dispatch_suggestion',
    // Etapp 3b (multi-employee-parity-plan.md): kö-routing.
    routing_role: 'owner_admin',
    title: `Tilldela ${best.member.name} → ${params.jobTitle}`,
    description: `${best.reasons.join(' · ')}${params.customerName ? ` · ${params.customerName}` : ''}`,
    risk_level: 'low',
    status: 'pending',
    payload: {
      agent_id: 'lars',
      member_id: best.member.id,
      member_name: best.member.name,
      context_type: params.contextType,
      context_id: params.contextId,
      job_title: params.jobTitle,
      job_address: params.jobAddress,
      scheduled_start: params.scheduledStart,
      scheduled_end: params.scheduledEnd,
      reasons: best.reasons,
      score: best.score,
      alternatives: scored.slice(1, 3).map(s => ({
        name: s.member.name,
        score: s.score,
        reasons: s.reasons,
      })),
      // R5 (tasks/resurs-masterplan.md) — se buildDispatchCandidateEnrichment.
      week_utilization_pct: enrichment.week_utilization_pct,
      certificates: enrichment.certificates,
    },
    expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  })

  return {
    suggested: true,
    member: best.member,
    reasons: best.reasons,
    approval_id: approvalId,
  }
}
