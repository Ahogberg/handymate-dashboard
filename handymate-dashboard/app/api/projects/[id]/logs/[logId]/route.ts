import { NextRequest, NextResponse } from 'next/server'
import { loadDiaryContext } from '@/lib/diary/route-context'
import { canEditDiaryRow } from '@/lib/diary/permissions'
import { isDiaryRowLocked } from '@/lib/diary/locking'
import {
  appendAddendum,
  attestDiaryEntry,
  deleteDiaryEntry,
  unlockDiaryEntry,
  updateDiaryEntry,
} from '@/lib/diary/write'
import { DIARY_SELECT, serializeDiaryRows } from '@/lib/diary/serialize'
// Auth via request.headers i importerad helper — utan force-dynamic kan
// rutten frysas i Full Route Cache (2026-08-22-klassen, se CLAUDE.md).
export const dynamic = 'force-dynamic'

// Inte exporterad — Next tillåter bara route-fälten som exporter i route.ts.
const DIARY_LOCKED_MESSAGE = 'Raden är låst. Lägg till en tilläggsanteckning i stället.'

type Ctx = Extract<Awaited<ReturnType<typeof loadDiaryContext>>, { ok: true }>

/** Laddar raden inom projekt + företag. Returnerar rå rad (select('*') bär
 * inga kolumnreferenser att kontraktsverifiera) eller ett svar. */
async function laddaRad(ctx: Ctx, logId: string): Promise<
  { ok: true; row: Record<string, unknown> } | { ok: false; response: NextResponse }
> {
  const { data, error } = await ctx.supabase
    .from('project_log')
    .select(DIARY_SELECT)
    .eq('id', logId)
    .eq('order_id', ctx.projectId)
    .eq('business_id', ctx.businessId)
    .maybeSingle()
  if (error) {
    return { ok: false, response: NextResponse.json({ error: `Dagboksraden kunde inte läsas: ${error.message}` }, { status: 500 }) }
  }
  if (!data) {
    return { ok: false, response: NextResponse.json({ error: 'Dagboksraden finns inte' }, { status: 404 }) }
  }
  return { ok: true, row: data as Record<string, unknown> }
}

async function svaraMedRad(ctx: Ctx, logId: string) {
  const laddad = await laddaRad(ctx, logId)
  if (!laddad.ok) return laddad.response
  const [log] = await serializeDiaryRows(ctx.supabase, {
    businessId: ctx.businessId,
    projectId: ctx.projectId,
    rows: [laddad.row],
    user: ctx.user,
    assignment: ctx.assignment,
  })
  return NextResponse.json({ log })
}

/**
 * PATCH /api/projects/[id]/logs/[logId] — Etapp D4 (2026-09-02)
 *
 * Två lägen på samma rutt:
 *   - `{ action: 'attest' | 'unlock' | 'addendum', text? }` — livscykeln.
 *     addendum är den ENDA ändring som tillåts på en låst rad.
 *   - fältuppdatering (log_date/work_description/…): vägras med 409 när
 *     raden är låst (attesterad, manuellt låst eller äldre än 7 dagar —
 *     lib/diary/locking.ts). Det är så en byggdagbok bevisar sitt värde
 *     vid en tvist: raderna går inte att skriva om i efterhand.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; logId: string } }
) {
  const ctx = await loadDiaryContext(request, params.id)
  if (!ctx.ok) return ctx.response

  const laddad = await laddaRad(ctx, params.logId)
  if (!laddad.ok) return laddad.response
  const row = laddad.row

  if (!canEditDiaryRow(ctx.user, { business_user_id: (row.business_user_id as string | null) ?? null }, ctx.assignment)) {
    return NextResponse.json({ error: 'Du får inte ändra den här dagboksraden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Ogiltig begäran' }, { status: 400 })
  }

  const locked = isDiaryRowLocked({
    date: String(row.date ?? ''),
    locked_at: (row.locked_at as string | null) ?? null,
    attested_at: (row.attested_at as string | null) ?? null,
  })

  const action = typeof body.action === 'string' ? body.action : null
  if (action) {
    if (action === 'attest') {
      if (!ctx.canAttest) {
        return NextResponse.json({ error: 'Du får inte attestera dagboksrader' }, { status: 403 })
      }
      if (row.attested_at) {
        return NextResponse.json({ error: 'Raden är redan attesterad' }, { status: 409 })
      }
      const r = await attestDiaryEntry(ctx.supabase, { business_id: ctx.businessId, id: params.logId, changed_by: ctx.user.id })
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
      return svaraMedRad(ctx, params.logId)
    }
    if (action === 'unlock') {
      if (!ctx.isOwnerOrAdmin) {
        return NextResponse.json({ error: 'Bara ägare eller admin kan låsa upp en dagboksrad' }, { status: 403 })
      }
      const r = await unlockDiaryEntry(ctx.supabase, { business_id: ctx.businessId, id: params.logId, changed_by: ctx.user.id })
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
      return svaraMedRad(ctx, params.logId)
    }
    if (action === 'addendum') {
      const r = await appendAddendum(ctx.supabase, {
        business_id: ctx.businessId,
        id: params.logId,
        text: typeof body.text === 'string' ? body.text : '',
        changed_by: ctx.user.id,
      })
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
      return svaraMedRad(ctx, params.logId)
    }
    return NextResponse.json({ error: 'Okänd åtgärd' }, { status: 400 })
  }

  if (locked) {
    return NextResponse.json({ error: DIARY_LOCKED_MESSAGE, locked: true }, { status: 409 })
  }

  // Klientens fältnamn → databasens kolumner.
  const fieldMap: Record<string, string> = {
    log_date: 'date',
    weather: 'weather',
    temperature: 'temperature',
    work_description: 'work_performed',
    materials_used: 'materials_used',
    hours_worked: 'hours_worked',
    notes: 'description',
    photos: 'photos',
    workers_present: 'workers_count',
    deviations: 'issues',
    ata_change_id: 'ata_change_id',
  }
  const patch: Record<string, unknown> = {}
  for (const [frontendKey, dbKey] of Object.entries(fieldMap)) {
    if (body[frontendKey] !== undefined) {
      const v = body[frontendKey]
      patch[dbKey] = (dbKey === 'temperature' || dbKey === 'hours_worked' || dbKey === 'workers_count')
        ? (v === null || v === '' ? null : Number(v))
        : v
    }
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Inga fält att uppdatera' }, { status: 400 })
  }

  // ÄTA-kopplingen måste peka på en ÄTA på SAMMA projekt.
  if (typeof patch.ata_change_id === 'string' && patch.ata_change_id) {
    const { data: ata } = await ctx.supabase
      .from('project_change')
      .select('change_id')
      .eq('business_id', ctx.businessId)
      .eq('project_id', ctx.projectId)
      .eq('change_id', patch.ata_change_id)
      .maybeSingle()
    if (!ata) return NextResponse.json({ error: 'ÄTA:n hör inte till det här projektet' }, { status: 400 })
  }

  const r = await updateDiaryEntry(ctx.supabase, {
    business_id: ctx.businessId,
    id: params.logId,
    changed_by: ctx.user.id,
    patch: patch as never,
  })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return svaraMedRad(ctx, params.logId)
}

/**
 * DELETE /api/projects/[id]/logs/[logId] — bara olåsta rader. En låst rad
 * tas inte bort; den lever kvar med sin historik.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; logId: string } }
) {
  const ctx = await loadDiaryContext(request, params.id)
  if (!ctx.ok) return ctx.response

  const laddad = await laddaRad(ctx, params.logId)
  if (!laddad.ok) return laddad.response
  const row = laddad.row

  if (!canEditDiaryRow(ctx.user, { business_user_id: (row.business_user_id as string | null) ?? null }, ctx.assignment)) {
    return NextResponse.json({ error: 'Du får inte ta bort den här dagboksraden' }, { status: 403 })
  }
  if (isDiaryRowLocked({
    date: String(row.date ?? ''),
    locked_at: (row.locked_at as string | null) ?? null,
    attested_at: (row.attested_at as string | null) ?? null,
  })) {
    return NextResponse.json({ error: 'Raden är låst och kan inte tas bort.', locked: true }, { status: 409 })
  }

  const r = await deleteDiaryEntry(ctx.supabase, { business_id: ctx.businessId, id: params.logId, changed_by: ctx.user.id })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ success: true })
}
