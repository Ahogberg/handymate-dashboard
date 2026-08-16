import type { SupabaseClient } from '@supabase/supabase-js'

export type CloseoutConfidence = 'strong' | 'review'

export interface CloseoutProjectFact {
  project_id: string
  name: string | null
  status: string | null
  end_date: string | null
  progress_percent: number | null
  quote_id: string | null
  job_type: string | null
}

export interface CloseoutBookingFact {
  project_id: string
  scheduled_start: string | null
  job_status: string | null
}

export interface CloseoutMilestoneFact {
  project_id: string
  status: string | null
}

export interface CloseoutSourceCounts {
  time_entries: number
  project_materials: number
  supplier_invoices: number
  project_costs: number
}

export interface CloseoutCandidate {
  project_id: string
  project_name: string
  confidence: CloseoutConfidence
  evidence: string
  evidence_points: string[]
  learning_gaps: string[]
  target_route: string
}

export interface CloseoutCopilotSnapshot {
  available: boolean
  reason: string | null
  candidates: CloseoutCandidate[]
}

export interface CloseoutCandidateInput {
  project: CloseoutProjectFact
  bookings: CloseoutBookingFact[]
  milestones: CloseoutMilestoneFact[]
  sources: CloseoutSourceCounts
  has_pending_close_approval: boolean
}

function validDateMs(value: string | null): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function isCompleted(status: string | null): boolean {
  return status === 'completed'
}

function isCancelled(status: string | null): boolean {
  return status === 'cancelled'
}

/**
 * Lars rena sanningsgräns. Funktionen föreslår bara GRANSKNING för avslut;
 * den stänger aldrig projektet och gör ingen AI-tolkning av fritext.
 */
export function deriveCloseoutCandidate(
  input: CloseoutCandidateInput,
  now = new Date(),
): CloseoutCandidate | null {
  const { project, bookings, milestones, sources } = input

  if (!['active', 'planning'].includes(project.status || '')) return null
  // Ett redan väntande fyra-ögon-kort är samma beslut på sin riktiga yta.
  if (input.has_pending_close_approval) return null

  const nowMs = now.getTime()
  const futureBookings = bookings.filter(booking => {
    const scheduledMs = validDateMs(booking.scheduled_start)
    return scheduledMs !== null
      && scheduledMs > nowMs
      && !isCompleted(booking.job_status)
      && !isCancelled(booking.job_status)
  })
  if (futureBookings.length > 0) return null

  const nonCancelledBookings = bookings.filter(booking => !isCancelled(booking.job_status))
  const allBookingsCompleted = nonCancelledBookings.length > 0
    && nonCancelledBookings.every(booking => isCompleted(booking.job_status))
  const completedBookings = nonCancelledBookings.filter(booking => isCompleted(booking.job_status)).length

  const milestonesCompleted = milestones.filter(milestone => isCompleted(milestone.status)).length
  const allMilestonesCompleted = milestones.length > 0 && milestonesCompleted === milestones.length
  const progressComplete = Number(project.progress_percent || 0) >= 100
  const endDateMs = validDateMs(project.end_date)
  const endDatePassed = endDateMs !== null && endDateMs <= nowMs

  // Minst en explicit, strukturerad färdigsignal krävs. Ett passerat datum
  // ensamt bevisar inte att hantverkaren verkligen är klar.
  const hasCompletionSignal = allBookingsCompleted
    || progressComplete
    || (allMilestonesCompleted && endDatePassed)
  if (!hasCompletionSignal) return null

  const milestonesBlockStrong = milestones.length > 0 && !allMilestonesCompleted
  const confidence: CloseoutConfidence = allBookingsCompleted && !milestonesBlockStrong
    ? 'strong'
    : 'review'

  const evidencePoints: string[] = []
  if (allBookingsCompleted) {
    evidencePoints.push(`${completedBookings} av ${nonCancelledBookings.length} bokningar är klara`)
  }
  if (allMilestonesCompleted) {
    evidencePoints.push(`${milestonesCompleted} av ${milestones.length} delmoment är klara`)
  } else if (milestones.length > 0) {
    evidencePoints.push(`${milestonesCompleted} av ${milestones.length} delmoment är klara`)
  }
  if (progressComplete) evidencePoints.push('Projektets framsteg är markerat 100 %')
  if (endDatePassed) evidencePoints.push('Projektets slutdatum har passerat')
  evidencePoints.push('Inget framtida arbete är bokat')

  const learningGaps: string[] = []
  if (!project.quote_id) learningGaps.push('kopplad offert')
  if (!project.job_type?.trim()) learningGaps.push('jobbtyp')
  if (sources.time_entries === 0) learningGaps.push('rapporterad tid')
  if (sources.project_materials + sources.supplier_invoices + sources.project_costs === 0) {
    learningGaps.push('kostnadsunderlag')
  }

  const evidence = confidence === 'strong'
    ? 'Alla kända arbetstillfällen är klara och inget mer är planerat.'
    : 'Projektet har tydliga färdigsignaler, men behöver din kontroll före avslut.'

  return {
    project_id: project.project_id,
    project_name: project.name?.trim() || 'Namnlöst projekt',
    confidence,
    evidence,
    evidence_points: evidencePoints,
    learning_gaps: learningGaps,
    target_route: `/dashboard/projects/${project.project_id}`,
  }
}

function countByProject(rows: Array<{ project_id: string | null }>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    if (!row.project_id) continue
    counts.set(row.project_id, (counts.get(row.project_id) || 0) + 1)
  }
  return counts
}

function rowsByProject<T extends { project_id: string | null }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>()
  for (const row of rows) {
    if (!row.project_id) continue
    const bucket = grouped.get(row.project_id) || []
    bucket.push(row)
    grouped.set(row.project_id, bucket)
  }
  return grouped
}

/** Tenantbunden Lars-loader. Alla service-role-läsningar bär business_id. */
export async function loadCloseoutCopilot(
  supabase: SupabaseClient,
  businessId: string,
  options: { now?: Date; limit?: number } = {},
): Promise<CloseoutCopilotSnapshot> {
  const now = options.now ?? new Date()
  const limit = Math.max(1, Math.min(5, options.limit ?? 3))

  const projectResult = await supabase
    .from('project')
    .select('project_id, name, status, end_date, progress_percent, quote_id, job_type')
    .eq('business_id', businessId)
    .in('status', ['active', 'planning'])
    .limit(100)

  if (projectResult.error) {
    return { available: false, reason: 'Projektunderlaget kunde inte läsas säkert.', candidates: [] }
  }

  const projects = (projectResult.data || []) as CloseoutProjectFact[]
  const projectIds = projects.map(project => project.project_id)
  if (projectIds.length === 0) return { available: true, reason: null, candidates: [] }

  const [bookingResult, milestoneResult, timeResult, materialResult, supplierResult, costResult, approvalResult] = await Promise.all([
    supabase.from('booking')
      .select('project_id, scheduled_start, job_status')
      .eq('business_id', businessId)
      .in('project_id', projectIds),
    supabase.from('project_milestone')
      .select('project_id, status')
      .eq('business_id', businessId)
      .in('project_id', projectIds),
    supabase.from('time_entry')
      .select('project_id')
      .eq('business_id', businessId)
      .in('project_id', projectIds),
    supabase.from('project_material')
      .select('project_id')
      .eq('business_id', businessId)
      .in('project_id', projectIds),
    supabase.from('supplier_invoices')
      .select('project_id')
      .eq('business_id', businessId)
      .in('project_id', projectIds),
    supabase.from('project_cost')
      .select('project_id')
      .eq('business_id', businessId)
      .in('project_id', projectIds),
    supabase.from('pending_approvals')
      .select('payload')
      .eq('business_id', businessId)
      .eq('approval_type', 'four_eyes_project_close')
      .eq('status', 'pending'),
  ])

  const failedSource = [
    bookingResult,
    milestoneResult,
    timeResult,
    materialResult,
    supplierResult,
    costResult,
    approvalResult,
  ].find(result => result.error)
  if (failedSource?.error) {
    console.error('[lars/closeout-copilot] källäsning misslyckades:', failedSource.error)
    return { available: false, reason: 'Avslutsunderlaget kunde inte verifieras.', candidates: [] }
  }

  const bookingsByProject = rowsByProject(
    (bookingResult.data || []) as CloseoutBookingFact[],
  )
  const milestonesByProject = rowsByProject(
    (milestoneResult.data || []) as CloseoutMilestoneFact[],
  )
  const timeCounts = countByProject((timeResult.data || []) as Array<{ project_id: string | null }>)
  const materialCounts = countByProject((materialResult.data || []) as Array<{ project_id: string | null }>)
  const supplierCounts = countByProject((supplierResult.data || []) as Array<{ project_id: string | null }>)
  const costCounts = countByProject((costResult.data || []) as Array<{ project_id: string | null }>)
  const pendingCloseProjectIds = new Set(
    (approvalResult.data || [])
      .map(row => (row.payload as Record<string, unknown> | null)?.project_id)
      .filter((projectId): projectId is string => typeof projectId === 'string'),
  )

  const candidates = projects
    .map(project => deriveCloseoutCandidate({
      project,
      bookings: bookingsByProject.get(project.project_id) || [],
      milestones: milestonesByProject.get(project.project_id) || [],
      sources: {
        time_entries: timeCounts.get(project.project_id) || 0,
        project_materials: materialCounts.get(project.project_id) || 0,
        supplier_invoices: supplierCounts.get(project.project_id) || 0,
        project_costs: costCounts.get(project.project_id) || 0,
      },
      has_pending_close_approval: pendingCloseProjectIds.has(project.project_id),
    }, now))
    .filter((candidate): candidate is CloseoutCandidate => candidate !== null)
    .sort((a, b) => {
      if (a.confidence !== b.confidence) return a.confidence === 'strong' ? -1 : 1
      return a.project_name.localeCompare(b.project_name, 'sv')
    })
    .slice(0, limit)

  return { available: true, reason: null, candidates }
}
