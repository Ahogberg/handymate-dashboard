import type { SupabaseClient } from '@supabase/supabase-js'
import type { BusinessUser } from '../permissions'
import { canEditDiaryRow } from './permissions'
import { isDiaryRowLocked, lockReason, type DiaryLockReason } from './locking'
import { signDiaryPhotos, type SignedDiaryPhoto } from './photos'
import { sumTimeEntryHoursByDate } from './time-summary'

/**
 * En dagboksrad som API:et svarar med (Etapp D4, 2026-09-02).
 *
 * GET, POST och PATCH i /api/projects/[id]/logs svarar alla med den här
 * formen så klienten (DiaryTab på desktop, DiaryList i mobilen) aldrig
 * behöver skilja på "rad jag just skapade" och "rad jag hämtade".
 *
 * Kolumnerna behåller DATABASENS namn (order_id/date/work_performed/…):
 * det är det kontrakt tests/portal-project-log-columns.spec.ts och
 * column-contract vaktar. Berikningen (photos signerade, låsning, ÄTA,
 * registrerad tid, behörighet) ligger ovanpå som egna fält.
 */
export interface DiaryApiRow {
  id: string
  order_id: string
  business_user_id: string | null
  date: string
  weather: string | null
  temperature: number | null
  description: string | null
  work_performed: string | null
  issues: string | null
  workers_count: number | null
  hours_worked: number | null
  materials_used: string | null
  photos: SignedDiaryPhoto[]
  created_at: string | null
  updated_at: string | null
  ata_change_id: string | null
  attested_by_user_id: string | null
  attested_at: string | null
  locked_at: string | null
  addendum: string | null
  business_user: { id: string; name: string | null; color: string | null } | null
  attested_by: { id: string; name: string | null } | null
  ata: { change_id: string; ata_number: number | null; description: string | null } | null
  locked: boolean
  lock_reason: DiaryLockReason
  time_entry_hours: number | null
  can_edit: boolean
}

type RawRow = Record<string, unknown> & { photos?: unknown; business_user?: unknown }

function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

export async function serializeDiaryRows(
  supabase: SupabaseClient,
  params: {
    businessId: string
    projectId: string
    rows: RawRow[]
    user: BusinessUser
    assignment: boolean
  },
): Promise<DiaryApiRow[]> {
  const { businessId, projectId, rows, user, assignment } = params
  if (rows.length === 0) return []

  const ataIds = Array.from(new Set(rows.map(r => str(r.ata_change_id)).filter((v): v is string => !!v)))
  const attesterIds = Array.from(new Set(rows.map(r => str(r.attested_by_user_id)).filter((v): v is string => !!v)))
  const dates = rows.map(r => str(r.date)).filter((v): v is string => !!v)

  const [ataRes, attesterRes, timeHours] = await Promise.all([
    ataIds.length
      ? supabase
          .from('project_change')
          .select('change_id, ata_number, description')
          .eq('business_id', businessId)
          .eq('project_id', projectId)
          .in('change_id', ataIds)
      : Promise.resolve({ data: [] as Array<{ change_id: string; ata_number: number | null; description: string | null }> }),
    attesterIds.length
      ? supabase.from('business_users').select('id, name').in('id', attesterIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string | null }> }),
    sumTimeEntryHoursByDate(supabase, businessId, projectId, dates),
  ])

  const ataById = new Map<string, { change_id: string; ata_number: number | null; description: string | null }>()
  for (const a of (ataRes.data ?? []) as Array<{ change_id: string; ata_number: number | null; description: string | null }>) {
    ataById.set(a.change_id, a)
  }
  const attesterById = new Map<string, { id: string; name: string | null }>()
  for (const u of (attesterRes.data ?? []) as Array<{ id: string; name: string | null }>) {
    attesterById.set(u.id, u)
  }

  const today = new Date()
  return Promise.all(rows.map(async (row): Promise<DiaryApiRow> => {
    const rawPhotos = Array.isArray(row.photos) ? (row.photos as unknown[]).filter((p): p is string => typeof p === 'string') : []
    const date = str(row.date) ?? ''
    const lockable = { date, locked_at: str(row.locked_at), attested_at: str(row.attested_at) }
    const bu = row.business_user && typeof row.business_user === 'object'
      ? (row.business_user as { id: string; name: string | null; color: string | null })
      : null
    const ataId = str(row.ata_change_id)
    const attesterId = str(row.attested_by_user_id)

    return {
      id: String(row.id),
      order_id: String(row.order_id ?? projectId),
      business_user_id: str(row.business_user_id),
      date,
      weather: str(row.weather),
      temperature: num(row.temperature),
      description: str(row.description),
      work_performed: str(row.work_performed),
      issues: str(row.issues),
      workers_count: num(row.workers_count),
      hours_worked: num(row.hours_worked),
      materials_used: str(row.materials_used),
      photos: await signDiaryPhotos(supabase, rawPhotos),
      created_at: str(row.created_at),
      updated_at: str(row.updated_at),
      ata_change_id: ataId,
      attested_by_user_id: attesterId,
      attested_at: str(row.attested_at),
      locked_at: str(row.locked_at),
      addendum: str(row.addendum),
      business_user: bu,
      attested_by: attesterId ? attesterById.get(attesterId) ?? { id: attesterId, name: null } : null,
      ata: ataId ? ataById.get(ataId) ?? { change_id: ataId, ata_number: null, description: null } : null,
      locked: isDiaryRowLocked(lockable, today),
      lock_reason: lockReason(lockable, today),
      time_entry_hours: date in timeHours ? timeHours[date] : null,
      can_edit: canEditDiaryRow(user, { business_user_id: str(row.business_user_id) }, assignment),
    }
  }))
}

/** Select-strängen alla dagboksrutter läser med — joinen mot business_users
 * ger författaren utan en extra fråga. */
export const DIARY_SELECT = '*, business_user:business_user_id (id, name, color)'
