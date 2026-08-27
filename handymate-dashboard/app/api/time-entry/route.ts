import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission, isOwnerOrAdmin } from '@/lib/permissions'
import { resolveTimeEntryHourlyRate } from '@/lib/time-entry/rate'

const WORK_CATEGORIES = new Set(['work', 'travel', 'material_pickup', 'meeting', 'admin'])

class TimeEntryRequestError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}

function optionalId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return fallback
}

async function resolveTimeEntryReferences(params: {
  supabase: ReturnType<typeof getServerSupabase>
  businessId: string
  currentUser: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>
  input: Record<string, unknown>
}) {
  const { supabase, businessId, currentUser, input } = params
  const projectId = optionalId(input.project_id)
  const bookingId = optionalId(input.booking_id)
  const requestedCustomerId = optionalId(input.customer_id)
  const workTypeId = optionalId(input.work_type_id)
  const milestoneId = optionalId(input.milestone_id)
  const requestedBusinessUserId = optionalId(input.business_user_id) || currentUser.id

  if (requestedBusinessUserId !== currentUser.id && !isOwnerOrAdmin(currentUser)) {
    throw new TimeEntryRequestError('Du får bara registrera tid för dig själv', 403)
  }

  const userRes = await supabase
    .from('business_users')
    .select('id, hourly_rate')
    .eq('id', requestedBusinessUserId)
    .eq('business_id', businessId)
    .eq('is_active', true)
    .maybeSingle()
  if (userRes.error) throw userRes.error
  if (!userRes.data) throw new TimeEntryRequestError('Vald teammedlem tillhör inte företaget')

  let projectCustomerId: string | null = null
  if (projectId) {
    const projectRes = await supabase
      .from('project')
      .select('project_id, customer_id')
      .eq('project_id', projectId)
      .eq('business_id', businessId)
      .maybeSingle()
    if (projectRes.error) throw projectRes.error
    if (!projectRes.data) throw new TimeEntryRequestError('Valt projekt tillhör inte företaget')
    projectCustomerId = optionalId(projectRes.data.customer_id)
  }

  let bookingCustomerId: string | null = null
  if (bookingId) {
    const bookingRes = await supabase
      .from('booking')
      .select('booking_id, customer_id')
      .eq('booking_id', bookingId)
      .eq('business_id', businessId)
      .maybeSingle()
    if (bookingRes.error) throw bookingRes.error
    if (!bookingRes.data) throw new TimeEntryRequestError('Vald bokning tillhör inte företaget')
    bookingCustomerId = optionalId(bookingRes.data.customer_id)
  }

  const effectiveCustomerId = requestedCustomerId || projectCustomerId || bookingCustomerId
  for (const linkedCustomerId of [projectCustomerId, bookingCustomerId]) {
    if (effectiveCustomerId && linkedCustomerId && effectiveCustomerId !== linkedCustomerId) {
      throw new TimeEntryRequestError('Kunden matchar inte valt projekt eller bokning')
    }
  }
  if (effectiveCustomerId) {
    const customerRes = await supabase
      .from('customer')
      .select('customer_id')
      .eq('customer_id', effectiveCustomerId)
      .eq('business_id', businessId)
      .maybeSingle()
    if (customerRes.error) throw customerRes.error
    if (!customerRes.data) throw new TimeEntryRequestError('Vald kund tillhör inte företaget')
  }

  let workType: { multiplier: number | null; billable_default: boolean | null } | null = null
  if (workTypeId) {
    const workTypeRes = await supabase
      .from('work_type')
      .select('multiplier, billable_default')
      .eq('work_type_id', workTypeId)
      .eq('business_id', businessId)
      .maybeSingle()
    if (workTypeRes.error) throw workTypeRes.error
    if (!workTypeRes.data) throw new TimeEntryRequestError('Vald arbetstyp tillhör inte företaget')
    workType = workTypeRes.data
  }

  if (milestoneId) {
    if (!projectId) throw new TimeEntryRequestError('Delmoment kräver ett projekt')
    const milestoneRes = await supabase
      .from('project_milestone')
      .select('milestone_id')
      .eq('milestone_id', milestoneId)
      .eq('project_id', projectId)
      .eq('business_id', businessId)
      .maybeSingle()
    if (milestoneRes.error) throw milestoneRes.error
    if (!milestoneRes.data) throw new TimeEntryRequestError('Valt delmoment tillhör inte projektet')
  }

  return {
    projectId,
    bookingId,
    customerId: effectiveCustomerId,
    workTypeId,
    milestoneId,
    businessUserId: requestedBusinessUserId,
    userHourlyRate: userRes.data.hourly_rate,
    workType,
  }
}

/**
 * GET /api/time-entry — lista tidsrapporter, primärt för "Att fakturera"-vyn
 * i mobilen (Fas 5). Returnerar entries med joinad customer + project, plus
 * summary med total_minutes, total_value, entry_count och project_count.
 *
 * Query-params (alla optional):
 * - invoiced: 'true' | 'false' (default: alla)
 * - approval_status: 'pending' | 'approved' | 'rejected' (default: alla)
 * - person_id: business_users.id — filtrera på en anställd
 * - project_id: project.project_id
 * - customer_id: customer.customer_id
 * - work_type_id: work_type.work_type_id
 * - date_from / date_to: YYYY-MM-DD — filtrera work_date
 *
 * Permission: kräver create_invoices (samma mönster som /api/time-entry/approve).
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'create_invoices')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const sp = request.nextUrl.searchParams

    // Alla fyra FK-kolumner på time_entry är oconstrained TEXT — ingen FK
    // declared (project_id, customer_id, work_type_id, business_user_id).
    // Supabase nested select föll med PGRST200 på minst project_id och
    // work_type_id. Att customer/business_user fungerat tidigare beror på
    // tillfällig PostgREST relationship-discovery och är opålitligt.
    // Lösning: hämta time_entry plain och resolva alla fyra relations
    // i separata bulk-queries.
    let query = supabase
      .from('time_entry')
      .select('*')
      .eq('business_id', business.business_id)
      .order('work_date', { ascending: false })
      .order('project_id', { ascending: true, nullsFirst: false })

    const invoiced = sp.get('invoiced')
    if (invoiced === 'true') query = query.eq('invoiced', true)
    else if (invoiced === 'false') query = query.eq('invoiced', false)

    const approvalStatus = sp.get('approval_status')
    if (approvalStatus) query = query.eq('approval_status', approvalStatus)

    const personId = sp.get('person_id')
    if (personId) query = query.eq('business_user_id', personId)

    const projectId = sp.get('project_id')
    if (projectId) query = query.eq('project_id', projectId)

    const customerId = sp.get('customer_id')
    if (customerId) query = query.eq('customer_id', customerId)

    const workTypeId = sp.get('work_type_id')
    if (workTypeId) query = query.eq('work_type_id', workTypeId)

    const dateFrom = sp.get('date_from')
    if (dateFrom) query = query.gte('work_date', dateFrom)

    const dateTo = sp.get('date_to')
    if (dateTo) query = query.lte('work_date', dateTo)

    const { data: entries, error } = await query
    if (error) throw error

    const list = entries || []

    // Bulk-resolva alla fyra relations i parallella queries.
    const projectIdSet = new Set<string>(
      list
        .map((e: any) => e.project_id as string | null)
        .filter((id: string | null): id is string => !!id),
    )
    const customerIdSet = new Set<string>(
      list
        .map((e: any) => e.customer_id as string | null)
        .filter((id: string | null): id is string => !!id),
    )
    const workTypeIdSet = new Set<string>(
      list
        .map((e: any) => e.work_type_id as string | null)
        .filter((id: string | null): id is string => !!id),
    )
    const businessUserIdSet = new Set<string>(
      list
        .map((e: any) => e.business_user_id as string | null)
        .filter((id: string | null): id is string => !!id),
    )

    const [projectsRes, customersRes, workTypesRes, businessUsersRes] = await Promise.all([
      projectIdSet.size > 0
        ? supabase
            .from('project')
            .select('project_id, name')
            .eq('business_id', business.business_id)
            .in('project_id', Array.from(projectIdSet))
        : Promise.resolve({ data: [] as any[] }),
      customerIdSet.size > 0
        ? supabase
            .from('customer')
            .select('customer_id, name')
            .eq('business_id', business.business_id)
            .in('customer_id', Array.from(customerIdSet))
        : Promise.resolve({ data: [] as any[] }),
      workTypeIdSet.size > 0
        ? supabase
            .from('work_type')
            .select('work_type_id, name, multiplier')
            .eq('business_id', business.business_id)
            .in('work_type_id', Array.from(workTypeIdSet))
        : Promise.resolve({ data: [] as any[] }),
      businessUserIdSet.size > 0
        ? supabase
            .from('business_users')
            .select('id, name, color')
            .eq('business_id', business.business_id)
            .in('id', Array.from(businessUserIdSet))
        : Promise.resolve({ data: [] as any[] }),
    ])

    const projectMap = new Map<string, { project_id: string; name: string | null }>()
    for (const p of (projectsRes as any).data || []) {
      projectMap.set(p.project_id, { project_id: p.project_id, name: p.name || null })
    }

    const customerMap = new Map<string, { customer_id: string; name: string | null }>()
    for (const c of (customersRes as any).data || []) {
      customerMap.set(c.customer_id, { customer_id: c.customer_id, name: c.name || null })
    }

    const workTypeMap = new Map<
      string,
      { work_type_id: string; name: string | null; multiplier: number | null }
    >()
    for (const w of (workTypesRes as any).data || []) {
      workTypeMap.set(w.work_type_id, {
        work_type_id: w.work_type_id,
        name: w.name || null,
        multiplier: w.multiplier ?? null,
      })
    }

    const businessUserMap = new Map<
      string,
      { id: string; name: string | null; color: string | null }
    >()
    for (const u of (businessUsersRes as any).data || []) {
      businessUserMap.set(u.id, {
        id: u.id,
        name: u.name || null,
        color: u.color || null,
      })
    }

    const enriched = list.map((e: any) => ({
      ...e,
      project: e.project_id ? projectMap.get(e.project_id) || null : null,
      customer: e.customer_id ? customerMap.get(e.customer_id) || null : null,
      work_type: e.work_type_id ? workTypeMap.get(e.work_type_id) || null : null,
      business_user: e.business_user_id ? businessUserMap.get(e.business_user_id) || null : null,
    }))

    const totalMinutes = enriched.reduce(
      (sum: number, e: any) => sum + (e.duration_minutes || 0),
      0,
    )
    const totalValue = Math.round(
      enriched.reduce((sum: number, e: any) => {
        const hours = (e.duration_minutes || 0) / 60
        return sum + hours * (e.hourly_rate || 0)
      }, 0),
    )

    return NextResponse.json({
      entries: enriched,
      summary: {
        total_minutes: totalMinutes,
        total_value: totalValue,
        entry_count: enriched.length,
        project_count: projectIdSet.size,
      },
    })
  } catch (error: unknown) {
    console.error('Get time entries error:', error)
    const message =
      error instanceof Error
        ? error.message
        : error && typeof error === 'object' && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'Failed to fetch'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST - Skapa ny tidsrapport
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json() as Record<string, unknown>
    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser) {
      return NextResponse.json({ error: 'Ingen aktiv användare hittades i företaget' }, { status: 403 })
    }

    const workDate = typeof body.work_date === 'string' ? body.work_date : ''
    const durationMinutes = Number(body.duration_minutes)
    if (!workDate || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return NextResponse.json({ error: 'work_date och duration_minutes krävs' }, { status: 400 })
    }

    const workCategory = typeof body.work_category === 'string' ? body.work_category : 'work'
    if (!WORK_CATEGORIES.has(workCategory)) {
      return NextResponse.json({ error: 'Ogiltig arbetskategori' }, { status: 400 })
    }

    // Hämta business_config för validering + default rate
    const { data: bizConfig, error: configError } = await supabase
      .from('business_config')
      .select('default_hourly_rate, pricing_settings, time_require_description, require_gps_checkin, require_project')
      .eq('business_id', business.business_id)
      .single()
    if (configError) throw configError

    // Validera: kräv beskrivning
    const description = typeof body.description === 'string' ? body.description.trim() : ''
    if (bizConfig?.time_require_description && !description) {
      return NextResponse.json({ error: 'Beskrivning krävs för tidrapporter' }, { status: 400 })
    }

    // Validera: kräv projekt
    if (bizConfig?.require_project && !optionalId(body.project_id)) {
      return NextResponse.json({ error: 'Projekt krävs för tidrapporter' }, { status: 400 })
    }

    // Validera: kräv GPS vid instämpling
    if (bizConfig?.require_gps_checkin && body.check_in && !body.gps_lat && !body.gps_lng) {
      return NextResponse.json({ error: 'GPS-position krävs vid instämpling' }, { status: 400 })
    }

    // Alla relationer valideras mot samma business innan service-role får
    // skriva. Projekt/bokning får dessutom aldrig peka ut en annan kund än
    // den som skickats explicit.
    const refs = await resolveTimeEntryReferences({
      supabase,
      businessId: business.business_id,
      currentUser,
      input: body,
    })

    const effectiveRate = resolveTimeEntryHourlyRate({
      explicitRate: body.hourly_rate,
      userRate: refs.userHourlyRate,
      pricingSettings: bizConfig?.pricing_settings,
      legacyDefaultRate: bizConfig?.default_hourly_rate,
      workTypeMultiplier: refs.workType?.multiplier,
    })

    const { data: inserted, error } = await supabase
      .from('time_entry')
      .insert({
        business_id: business.business_id,
        booking_id: refs.bookingId,
        customer_id: refs.customerId,
        work_type_id: refs.workTypeId,
        project_id: refs.projectId,
        milestone_id: refs.milestoneId,
        business_user_id: refs.businessUserId,
        work_date: workDate,
        start_time: optionalId(body.start_time),
        end_time: optionalId(body.end_time),
        duration_minutes: Math.round(durationMinutes),
        break_minutes: Math.max(0, Math.round(Number(body.break_minutes) || 0)),
        work_category: workCategory,
        description: description || null,
        internal_notes: typeof body.internal_notes === 'string' && body.internal_notes.trim()
          ? body.internal_notes.trim()
          : null,
        hourly_rate: effectiveRate,
        is_billable: typeof body.is_billable === 'boolean'
          ? body.is_billable
          : (refs.workType?.billable_default ?? true),
      })
      .select()
      .single()

    if (error) {
      console.error('[time-entry POST] insert error:', error)
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        },
        { status: 500 },
      )
    }

    // Two-query för relations — alla fyra FK-kolumner är oconstrained TEXT
    // (TD-7) så Supabase nested select faller med PGRST200. Samma pattern
    // som GET-routen löste i 4d61c388. Parallel fetch via Promise.all.
    const [projectRes, customerRes, workTypeRes, businessUserRes] = await Promise.all([
      inserted?.project_id
        ? supabase
            .from('project')
            .select('project_id, name')
            .eq('project_id', inserted.project_id)
            .eq('business_id', business.business_id)
            .maybeSingle()
        : Promise.resolve({ data: null as any }),
      inserted?.customer_id
        ? supabase
            .from('customer')
            .select('customer_id, name, phone_number')
            .eq('customer_id', inserted.customer_id)
            .eq('business_id', business.business_id)
            .maybeSingle()
        : Promise.resolve({ data: null as any }),
      inserted?.work_type_id
        ? supabase
            .from('work_type')
            .select('work_type_id, name, multiplier')
            .eq('work_type_id', inserted.work_type_id)
            .eq('business_id', business.business_id)
            .maybeSingle()
        : Promise.resolve({ data: null as any }),
      inserted?.business_user_id
        ? supabase
            .from('business_users')
            .select('id, name, color')
            .eq('id', inserted.business_user_id)
            .eq('business_id', business.business_id)
            .maybeSingle()
        : Promise.resolve({ data: null as any }),
    ])

    const enriched = {
      ...inserted,
      project: projectRes.data || null,
      customer: customerRes.data || null,
      work_type: workTypeRes.data || null,
      business_user: businessUserRes.data || null,
    }

    // AI Projektledare: uppdatera framsteg och budget
    if (inserted?.project_id) {
      try {
        const { handleProjectEvent } = await import('@/lib/project-ai-engine')
        await handleProjectEvent({
          type: 'time_logged',
          businessId: business.business_id,
          projectId: inserted.project_id,
          entryId: inserted.time_entry_id,
        })
      } catch { /* non-blocking */ }

      // Realtids-lönsamhetslarm — Karin kollar om projektet spårar ur.
      // checkProfitabilityWarnings har sedan i natt sin egen kanoniska
      // 75%/95%-gate (lib/projects/margin-guardian.ts) — det gamla
      // förfiltret via legacy calculateProfitability (stale kolumner,
      // arbetskostnad räknad på kundpris) är därför bara att ta bort.
      try {
        const { checkProfitabilityWarnings } = await import('@/lib/profitability')
        await checkProfitabilityWarnings(business.business_id)
      } catch { /* non-blocking */ }
    }

    return NextResponse.json({ entry: enriched })

  } catch (error: unknown) {
    console.error('[time-entry POST] exception:', error)
    // PostgrestError är inte instanceof Error — kolla 'message'-prop på objekt också
    const message =
      error instanceof Error
        ? error.message
        : error && typeof error === 'object' && 'message' in error
          ? String((error as { message: unknown }).message)
          : 'Failed to create'
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code: unknown }).code)
        : undefined
    const details =
      error && typeof error === 'object' && 'details' in error
        ? String((error as { details: unknown }).details)
        : undefined
    return NextResponse.json(
      { error: message, code, details },
      { status: error instanceof TimeEntryRequestError ? error.status : 500 },
    )
  }
}

/**
 * PUT - Uppdatera tidsrapport
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json() as Record<string, unknown>
    const entryId = optionalId(body.entry_id)

    if (!entryId) {
      return NextResponse.json({ error: 'entry_id krävs' }, { status: 400 })
    }

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser) {
      return NextResponse.json({ error: 'Ingen aktiv användare hittades i företaget' }, { status: 403 })
    }

    // Block update if invoiced eller approved (admin/owner får ändra approved)
    const { data: existing, error: existingError } = await supabase
      .from('time_entry')
      .select('*')
      .eq('time_entry_id', entryId)
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (existingError) throw existingError
    if (!existing) {
      return NextResponse.json({ error: 'Tidposten hittades inte' }, { status: 404 })
    }

    if (existing?.invoiced) {
      return NextResponse.json({ error: 'Kan inte ändra fakturerade tidposter' }, { status: 400 })
    }

    if (existing?.approval_status === 'approved') {
      if (!isOwnerOrAdmin(currentUser)) {
        return NextResponse.json(
          { error: 'Tiden är godkänd och kan inte ändras. Kontakta din chef om något är fel.' },
          { status: 403 }
        )
      }
    }

    if (existing.business_user_id !== currentUser.id && !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Du får bara ändra dina egna tidposter' }, { status: 403 })
    }

    const allowedFields = [
      'booking_id', 'customer_id', 'work_type_id', 'project_id', 'milestone_id',
      'business_user_id', 'work_date', 'start_time', 'end_time', 'duration_minutes',
      'break_minutes', 'work_category', 'description', 'internal_notes', 'hourly_rate',
      'is_billable',
    ] as const
    const requestedUpdates: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(body, field)) requestedUpdates[field] = body[field]
    }
    const merged = { ...existing, ...requestedUpdates } as Record<string, unknown>

    const durationMinutes = Number(merged.duration_minutes)
    if (!merged.work_date || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return NextResponse.json({ error: 'work_date och duration_minutes krävs' }, { status: 400 })
    }
    const workCategory = typeof merged.work_category === 'string' ? merged.work_category : 'work'
    if (!WORK_CATEGORIES.has(workCategory)) {
      return NextResponse.json({ error: 'Ogiltig arbetskategori' }, { status: 400 })
    }

    const { data: bizConfig, error: configError } = await supabase
      .from('business_config')
      .select('default_hourly_rate, pricing_settings, time_require_description, require_project')
      .eq('business_id', business.business_id)
      .single()
    if (configError) throw configError

    const description = typeof merged.description === 'string' ? merged.description.trim() : ''
    if (bizConfig?.time_require_description && !description) {
      return NextResponse.json({ error: 'Beskrivning krävs för tidrapporter' }, { status: 400 })
    }
    if (bizConfig?.require_project && !optionalId(merged.project_id)) {
      return NextResponse.json({ error: 'Projekt krävs för tidrapporter' }, { status: 400 })
    }

    const refs = await resolveTimeEntryReferences({
      supabase,
      businessId: business.business_id,
      currentUser,
      input: merged,
    })
    const effectiveRate = resolveTimeEntryHourlyRate({
      explicitRate: merged.hourly_rate,
      userRate: refs.userHourlyRate,
      pricingSettings: bizConfig?.pricing_settings,
      legacyDefaultRate: bizConfig?.default_hourly_rate,
      // Befintligt pris är redan multiplicerat. Multiplikatorn används bara
      // när klienten uttryckligen lämnar timpriset tomt för att välja standard.
      workTypeMultiplier: Object.prototype.hasOwnProperty.call(body, 'hourly_rate') && !body.hourly_rate
        ? refs.workType?.multiplier
        : 1,
    })

    const updates = {
      booking_id: refs.bookingId,
      customer_id: refs.customerId,
      work_type_id: refs.workTypeId,
      project_id: refs.projectId,
      milestone_id: refs.milestoneId,
      business_user_id: refs.businessUserId,
      work_date: merged.work_date,
      start_time: optionalId(merged.start_time),
      end_time: optionalId(merged.end_time),
      duration_minutes: Math.round(durationMinutes),
      break_minutes: Math.max(0, Math.round(Number(merged.break_minutes) || 0)),
      work_category: workCategory,
      description: description || null,
      internal_notes: typeof merged.internal_notes === 'string' && merged.internal_notes.trim()
        ? merged.internal_notes.trim()
        : null,
      hourly_rate: effectiveRate,
      is_billable: typeof merged.is_billable === 'boolean' ? merged.is_billable : true,
    }

    const { data, error } = await supabase
      .from('time_entry')
      .update(updates)
      .eq('time_entry_id', entryId)
      .eq('business_id', business.business_id)
      .select('*')
      .single()

    if (error) throw error

    if (data?.project_id) {
      try {
        const { handleProjectEvent } = await import('@/lib/project-ai-engine')
        await handleProjectEvent({
          type: 'time_logged',
          businessId: business.business_id,
          projectId: data.project_id,
          entryId: data.time_entry_id,
        })
      } catch { /* non-blocking */ }
      try {
        const { checkProfitabilityWarnings } = await import('@/lib/profitability')
        await checkProfitabilityWarnings(business.business_id)
      } catch { /* non-blocking */ }
    }

    return NextResponse.json({ entry: data })

  } catch (error: unknown) {
    console.error('Update time entry error:', error)
    return NextResponse.json(
      { error: errorMessage(error, 'Failed to update') },
      { status: error instanceof TimeEntryRequestError ? error.status : 500 },
    )
  }
}

/**
 * DELETE - Ta bort tidsrapport
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const entryId = request.nextUrl.searchParams.get('entryId')

    if (!entryId) {
      return NextResponse.json({ error: 'entryId krävs' }, { status: 400 })
    }

    // Block delete if invoiced eller approved (admin/owner får ta bort approved)
    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser) {
      return NextResponse.json({ error: 'Ingen aktiv användare hittades i företaget' }, { status: 403 })
    }

    const { data: existing, error: existingError } = await supabase
      .from('time_entry')
      .select('invoiced, approval_status, business_user_id')
      .eq('time_entry_id', entryId)
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (existingError) throw existingError
    if (!existing) {
      return NextResponse.json({ error: 'Tidposten hittades inte' }, { status: 404 })
    }

    if (existing?.invoiced) {
      return NextResponse.json({ error: 'Kan inte ta bort fakturerade tidposter' }, { status: 400 })
    }

    if (existing?.approval_status === 'approved') {
      if (!isOwnerOrAdmin(currentUser)) {
        return NextResponse.json(
          { error: 'Tiden är godkänd och kan inte tas bort. Kontakta din chef om något är fel.' },
          { status: 403 }
        )
      }
    }

    if (existing.business_user_id !== currentUser.id && !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Du får bara ta bort dina egna tidposter' }, { status: 403 })
    }

    const { error } = await supabase
      .from('time_entry')
      .delete()
      .eq('time_entry_id', entryId)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: unknown) {
    console.error('Delete time entry error:', error)
    return NextResponse.json({ error: errorMessage(error, 'Failed to delete') }, { status: 500 })
  }
}
