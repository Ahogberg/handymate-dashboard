import { NextRequest, NextResponse } from 'next/server'
import { loadDiaryContext } from '@/lib/diary/route-context'
import { createDiaryEntry } from '@/lib/diary/write'
import { DIARY_SELECT, serializeDiaryRows } from '@/lib/diary/serialize'
// Auth via request.headers i importerad helper — utan force-dynamic kan
// rutten frysas i Full Route Cache och servera fel företags data
// (2026-08-22-klassen, se CLAUDE.md; residualsvep 2026-08-31).
export const dynamic = 'force-dynamic'

/** PostgREST `or(...)`-filter tolkar komma och parenteser som syntax —
 * en fritextsökning får inte kunna forma om filtret. */
function saneraSokterm(q: string): string {
  return q.replace(/[,()\\%]/g, ' ').trim().slice(0, 80)
}

/**
 * GET /api/projects/[id]/logs — byggdagboken (Etapp D4, 2026-09-02)
 *
 * Query: from, to (YYYY-MM-DD), q (fritext), user_id, has_issues=1,
 * ata_change_id, attested=1|0. Svar: `logs[]` i DiaryApiRow-form
 * (lib/diary/serialize.ts) + `permissions` för vad DEN HÄR användaren får
 * göra på projektet.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await loadDiaryContext(request, params.id)
  if (!ctx.ok) return ctx.response
  const { supabase, businessId, projectId, user, assignment } = ctx

  try {
    const sp = request.nextUrl.searchParams
    let query = supabase
      .from('project_log')
      .select(DIARY_SELECT)
      .eq('order_id', projectId)
      .eq('business_id', businessId)

    const from = sp.get('from')
    const to = sp.get('to')
    if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) query = query.gte('date', from)
    if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) query = query.lte('date', to)

    const userId = sp.get('user_id')
    if (userId) query = query.eq('business_user_id', userId)

    if (sp.get('has_issues') === '1') query = query.not('issues', 'is', null)

    const ataChangeId = sp.get('ata_change_id')
    if (ataChangeId) query = query.eq('ata_change_id', ataChangeId)

    const attested = sp.get('attested')
    if (attested === '1') query = query.not('attested_at', 'is', null)
    if (attested === '0') query = query.is('attested_at', null)

    const q = sp.get('q')
    if (q && saneraSokterm(q)) {
      const term = `%${saneraSokterm(q)}%`
      query = query.or(
        `work_performed.ilike.${term},description.ilike.${term},issues.ilike.${term},materials_used.ilike.${term},addendum.ilike.${term}`,
      )
    }

    const { data: rows, error } = await query
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw error

    const logs = await serializeDiaryRows(supabase, {
      businessId,
      projectId,
      rows: (rows ?? []) as Record<string, unknown>[],
      user,
      assignment,
    })

    return NextResponse.json({
      logs,
      permissions: { can_create: ctx.canCreate, can_attest: ctx.canAttest, is_owner_or_admin: ctx.isOwnerOrAdmin },
    })
  } catch (error: any) {
    console.error('Get project logs error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/projects/[id]/logs — ny dagboksrad via dagbokens enda skrivväg
 * (lib/diary/write.ts). Kroppen använder klientens fältnamn
 * (log_date/work_description/notes/workers_present/deviations) som mappas
 * till databasens (date/work_performed/description/workers_count/issues).
 * Dubblett (samma text, samma dag, nyss) → befintlig rad + `duplicate: true`.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const ctx = await loadDiaryContext(request, params.id)
  if (!ctx.ok) return ctx.response
  const { supabase, businessId, projectId, user, assignment } = ctx

  if (!ctx.canCreate) {
    return NextResponse.json({ error: 'Du är inte tilldelad det här projektet' }, { status: 403 })
  }

  try {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Ogiltig begäran' }, { status: 400 })
    }

    const {
      log_date,
      weather,
      temperature,
      work_description,
      materials_used,
      hours_worked,
      notes,
      photos,
      workers_present,
      deviations,
      ata_change_id,
    } = body

    if (!log_date) {
      return NextResponse.json({ error: 'Datum krävs' }, { status: 400 })
    }

    const resultat = await createDiaryEntry(supabase, {
      business_id: businessId,
      order_id: projectId,
      business_user_id: user.id,
      date: log_date,
      weather: weather || null,
      temperature: temperature != null && temperature !== '' ? Number(temperature) : null,
      work_performed: work_description || null,
      materials_used: materials_used || null,
      hours_worked: hours_worked != null && hours_worked !== '' ? Number(hours_worked) : null,
      description: notes || null,
      photos: Array.isArray(photos) ? photos : [],
      workers_count: workers_present != null && workers_present !== '' ? Number(workers_present) : null,
      issues: deviations || null,
      ata_change_id: ata_change_id || null,
    })
    if (!resultat.ok) {
      return NextResponse.json({ error: resultat.error }, { status: resultat.status })
    }

    const { data: row, error } = await supabase
      .from('project_log')
      .select(DIARY_SELECT)
      .eq('id', resultat.id)
      .eq('business_id', businessId)
      .maybeSingle()
    if (error) throw error

    const [log] = row
      ? await serializeDiaryRows(supabase, { businessId, projectId, rows: [row as Record<string, unknown>], user, assignment })
      : []

    return NextResponse.json({ log: log ?? null, duplicate: resultat.duplicate === true })
  } catch (error: any) {
    console.error('Create project log error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
