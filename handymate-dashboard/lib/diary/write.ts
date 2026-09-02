import type { SupabaseClient } from '@supabase/supabase-js'
import { hittaNyligDubblett } from '../agent/recent-duplicate'
import { isDiaryWeather, type DiaryWeather } from './weather'

/**
 * Byggdagbokens ENDA skrivväg (Etapp D3, 2026-09-02).
 *
 * Facit (tests/byggdagboken.spec.ts, Etapp E): "Enda `.from('project_log').
 * insert(` i kodbasen ska ligga i lib/diary/write.ts" — tool-router.ts,
 * app/api/jobbuddy/actions/route.ts och app/api/voice/execute/route.ts
 * (Etapp D1, en annan agents lott i den här sprinten) ska alla gå via
 * `createDiaryEntry` i stället för att skriva mot tabellen själva. Det är
 * roten till buggarna audit hittade: fem olika skrivvägar som var för sig
 * hittade på sina egna kolumnnamn (`jobbuddy/actions` skrev fem påhittade
 * kolumner som svaldes tyst; `voice/execute` saknade `order_id` — NOT NULL,
 * 23502 varje gång).
 *
 * ═══ VARFÖR PLAIN .insert() UTAN .select() ═══
 *
 * Mock-databasen i tests/work-report.spec.ts stödjer bara select/eq/is/
 * not/gte/limit/maybeSingle/order/insert — ett `.insert(...).select().
 * single()` kastar där. Vi känner ändå till id:t (vi genererar det själva
 * innan insert), så select-kedjan är aldrig nödvändig för att returnera
 * svaret till anroparen.
 */

export type DiaryWriteResult =
  | { ok: true; id: string; duplicate?: true }
  | { ok: false; error: string; status: 400 | 403 | 404 | 500 }

export type DiaryRevisionAction =
  | 'create' | 'update' | 'attest' | 'unlock' | 'addendum'
  | 'photo_add' | 'photo_remove' | 'delete'

export interface CreateDiaryEntryInput {
  business_id: string
  order_id: string
  business_user_id?: string | null
  date: string
  work_performed?: string | null
  description?: string | null
  issues?: string | null
  weather?: string | null
  temperature?: number | null
  workers_count?: number | null
  hours_worked?: number | null
  materials_used?: string | null
  photos?: string[] | null
  ata_change_id?: string | null
  /** Egen id — voice/execute och Matte-rapportläget vill kunna sätta ett
   * deterministiskt id (t.ex. `log_report_${confirmationId}`) så en
   * bekräftelse-token som återanvänds inom giltighetstiden inte skapar en
   * andra rad. Default genereras här om utelämnad. */
  id?: string
  /** Rapportläget kontrollerar redan dubbletter på ett annat sätt (se
   * lib/matte/work-report.ts) — dubbla dubblettkontroller hade bara
   * krånglat till felmeddelandet. */
  skipDuplicateCheck?: boolean
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function randomSuffix(): string {
  return Math.random().toString(36).substring(2, 9)
}

function validateDate(date: unknown): string | null {
  if (typeof date !== 'string' || !DATE_RE.test(date)) return null
  if (Number.isNaN(Date.parse(`${date}T12:00:00Z`))) return null
  return date
}

function normalizeTemperature(value: unknown): number | null | 'invalid' {
  if (value === undefined || value === null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return 'invalid'
  return Math.round(n)
}

function normalizeHours(value: unknown): number | null | 'invalid' {
  if (value === undefined || value === null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0 || n > 24) return 'invalid'
  return n
}

function normalizeWorkers(value: unknown): number | null | 'invalid' {
  if (value === undefined || value === null || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n) || n < 0) return 'invalid'
  return n
}

function normalizePhotos(value: unknown): string[] | 'invalid' {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || !value.every(v => typeof v === 'string')) return 'invalid'
  return value
}

interface NormalizedCore {
  date: string
  weather: DiaryWeather | null
  temperature: number | null
  hours_worked: number | null
  workers_count: number | null
  photos: string[]
}

/** Delad validering för fälten create OCH update rör. Returnerar antingen
 * de normaliserade värdena eller ett svenskt felmeddelande. */
function validateCoreFields(input: {
  date?: unknown
  weather?: unknown
  temperature?: unknown
  hours_worked?: unknown
  workers_count?: unknown
  photos?: unknown
}, dateRequired: boolean): { ok: true; value: Partial<NormalizedCore> } | { ok: false; error: string } {
  const value: Partial<NormalizedCore> = {}

  if (input.date !== undefined) {
    const date = validateDate(input.date)
    if (!date) return { ok: false, error: 'Ange ett giltigt datum (ÅÅÅÅ-MM-DD).' }
    value.date = date
  } else if (dateRequired) {
    return { ok: false, error: 'Ange ett giltigt datum (ÅÅÅÅ-MM-DD).' }
  }

  if (input.weather !== undefined && input.weather !== null) {
    if (!isDiaryWeather(input.weather)) return { ok: false, error: 'Ogiltigt väder.' }
    value.weather = input.weather
  } else if (input.weather === null) {
    value.weather = null
  }

  if (input.temperature !== undefined) {
    const t = normalizeTemperature(input.temperature)
    if (t === 'invalid') return { ok: false, error: 'Ogiltig temperatur.' }
    value.temperature = t
  }

  if (input.hours_worked !== undefined) {
    const h = normalizeHours(input.hours_worked)
    if (h === 'invalid') return { ok: false, error: 'Timmar måste vara mellan 0 och 24.' }
    value.hours_worked = h
  }

  if (input.workers_count !== undefined) {
    const w = normalizeWorkers(input.workers_count)
    if (w === 'invalid') return { ok: false, error: 'Antal personer måste vara ett heltal, 0 eller fler.' }
    value.workers_count = w
  }

  if (input.photos !== undefined) {
    const p = normalizePhotos(input.photos)
    if (p === 'invalid') return { ok: false, error: 'Foton måste vara en lista med sökvägar.' }
    value.photos = p
  }

  return { ok: true, value }
}

/**
 * Skriver revisionshistorik. Best effort med avsikt: en misslyckad
 * historikrad ska ALDRIG få den faktiska dagboksskrivningen att se ut som
 * att den misslyckades för anroparen — historiken är ett komplement, inte
 * en förutsättning för att raden ska räknas som sparad.
 */
export async function recordDiaryRevision(
  supabase: SupabaseClient,
  params: {
    business_id: string
    log_id: string
    order_id: string
    changed_by_user_id?: string | null
    action: DiaryRevisionAction
    before?: unknown
    after?: unknown
  },
): Promise<void> {
  try {
    const { error } = await supabase.from('project_log_revision').insert({
      log_id: params.log_id,
      business_id: params.business_id,
      order_id: params.order_id,
      changed_by_user_id: params.changed_by_user_id ?? null,
      action: params.action,
      before: params.before ?? null,
      after: params.after ?? null,
    })
    if (error) console.warn('recordDiaryRevision: kunde inte skriva revision', error.message)
  } catch (err) {
    console.warn('recordDiaryRevision: kastade', (err as Error).message)
  }
}

/**
 * Skapar en dagboksrad. Se filhuvudet för varför skrivningen sker utan
 * `.select()`.
 */
export async function createDiaryEntry(
  supabase: SupabaseClient,
  input: CreateDiaryEntryInput,
): Promise<DiaryWriteResult> {
  const businessId = input.business_id?.trim()
  const orderId = input.order_id?.trim()
  if (!businessId || !orderId) {
    return { ok: false, error: 'Projekt saknas för dagboksraden.', status: 400 }
  }

  const core = validateCoreFields(input, true)
  if (!core.ok) return { ok: false, error: core.error, status: 400 }

  // Projektvakt: raden får bara skapas på ett projekt som faktiskt tillhör
  // det inloggade företaget — samma kontroll som tool-router.ts addWorkNote
  // gjorde innan den flyttades hit.
  const { data: project, error: projectErr } = await supabase
    .from('project')
    .select('project_id')
    .eq('business_id', businessId)
    .eq('project_id', orderId)
    .maybeSingle()
  if (projectErr) return { ok: false, error: `Kunde inte verifiera projektet: ${projectErr.message}`, status: 500 }
  if (!project) return { ok: false, error: 'Projektet finns inte', status: 404 }

  const ataChangeId = input.ata_change_id?.trim() || null
  if (ataChangeId) {
    const { data: ata, error: ataErr } = await supabase
      .from('project_change')
      .select('change_id')
      .eq('business_id', businessId)
      .eq('project_id', orderId)
      .eq('change_id', ataChangeId)
      .maybeSingle()
    if (ataErr) return { ok: false, error: `Kunde inte verifiera ÄTA:n: ${ataErr.message}`, status: 500 }
    if (!ata) return { ok: false, error: 'ÄTA:n hör inte till det här projektet', status: 400 }
  }

  const workPerformed = typeof input.work_performed === 'string' && input.work_performed.trim()
    ? input.work_performed.trim()
    : null
  const description = typeof input.description === 'string' && input.description.trim()
    ? input.description.trim()
    : null
  const issues = typeof input.issues === 'string' && input.issues.trim()
    ? input.issues.trim()
    : null
  const materialsUsed = typeof input.materials_used === 'string' && input.materials_used.trim()
    ? input.materials_used.trim()
    : null

  if (!input.skipDuplicateCheck) {
    let existing: string | null = null
    try {
      existing = await hittaNyligDubblett({
        supabase,
        tabell: 'project_log',
        idKolumn: 'id',
        filter: {
          business_id: businessId,
          order_id: orderId,
          date: core.value.date!,
          work_performed: workPerformed,
        },
      })
    } catch (err) {
      return { ok: false, error: `Kunde inte kontrollera dubbelregistrering: ${(err as Error).message}`, status: 500 }
    }
    if (existing) return { ok: true, id: existing, duplicate: true }
  }

  const id = input.id?.trim() || `log_${Date.now()}_${randomSuffix()}`

  const payload = {
    id,
    business_id: businessId,
    order_id: orderId,
    business_user_id: input.business_user_id ?? null,
    date: core.value.date!,
    work_performed: workPerformed,
    description,
    issues,
    weather: core.value.weather ?? null,
    temperature: core.value.temperature ?? null,
    workers_count: core.value.workers_count ?? null,
    hours_worked: core.value.hours_worked ?? null,
    materials_used: materialsUsed,
    photos: core.value.photos ?? [],
    ata_change_id: ataChangeId,
  }

  const { error } = await supabase.from('project_log').insert(payload)
  if (error) {
    if (error.code === '23505') return { ok: true, id, duplicate: true }
    return { ok: false, error: error.message, status: 500 }
  }

  await recordDiaryRevision(supabase, {
    business_id: businessId,
    log_id: id,
    order_id: orderId,
    changed_by_user_id: input.business_user_id ?? null,
    action: 'create',
    after: payload,
  })

  return { ok: true, id }
}

/** Hämtar en rad okänslig för kolumnkontraktet (`select('*')` bär inga
 * kolumnreferenser att verifiera) — används av samtliga skrivfunktioner
 * nedan för att läsa `before` och avgöra att raden faktiskt tillhör
 * företaget innan den ändras. */
async function loadRow(
  supabase: SupabaseClient,
  businessId: string,
  id: string,
): Promise<{ row: Record<string, unknown> | null; error: string | null }> {
  const { data, error } = await supabase
    .from('project_log')
    .select('*')
    .eq('id', id)
    .eq('business_id', businessId)
    .maybeSingle()
  if (error) return { row: null, error: error.message }
  return { row: (data as Record<string, unknown>) ?? null, error: null }
}

export interface UpdateDiaryEntryInput {
  business_id: string
  id: string
  changed_by?: string | null
  /** Revisionsloggens etikett — default 'update'; fotorutten skickar
   * photo_add/photo_remove så historiken säger vad som faktiskt hände. */
  action?: Extract<DiaryRevisionAction, 'update' | 'photo_add' | 'photo_remove'>
  patch: {
    date?: string
    work_performed?: string | null
    description?: string | null
    issues?: string | null
    weather?: string | null
    temperature?: number | null
    workers_count?: number | null
    hours_worked?: number | null
    materials_used?: string | null
    photos?: string[]
    ata_change_id?: string | null
  }
}

export async function updateDiaryEntry(
  supabase: SupabaseClient,
  input: UpdateDiaryEntryInput,
): Promise<DiaryWriteResult> {
  const businessId = input.business_id?.trim()
  const id = input.id?.trim()
  if (!businessId || !id) return { ok: false, error: 'Dagboksraden kunde inte identifieras.', status: 400 }

  const core = validateCoreFields(input.patch, false)
  if (!core.ok) return { ok: false, error: core.error, status: 400 }

  const { row: before, error: readErr } = await loadRow(supabase, businessId, id)
  if (readErr) return { ok: false, error: `Dagboksraden kunde inte läsas: ${readErr}`, status: 500 }
  if (!before) return { ok: false, error: 'Dagboksraden finns inte', status: 404 }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (core.value.date !== undefined) patch.date = core.value.date
  if (input.patch.work_performed !== undefined) patch.work_performed = input.patch.work_performed?.trim() || null
  if (input.patch.description !== undefined) patch.description = input.patch.description?.trim() || null
  if (input.patch.issues !== undefined) patch.issues = input.patch.issues?.trim() || null
  if (core.value.weather !== undefined) patch.weather = core.value.weather
  if (core.value.temperature !== undefined) patch.temperature = core.value.temperature
  if (core.value.workers_count !== undefined) patch.workers_count = core.value.workers_count
  if (core.value.hours_worked !== undefined) patch.hours_worked = core.value.hours_worked
  if (input.patch.materials_used !== undefined) patch.materials_used = input.patch.materials_used?.trim() || null
  if (core.value.photos !== undefined) patch.photos = core.value.photos
  if (input.patch.ata_change_id !== undefined) patch.ata_change_id = input.patch.ata_change_id?.trim() || null

  const { error } = await supabase
    .from('project_log')
    .update(patch)
    .eq('id', id)
    .eq('business_id', businessId)
  if (error) return { ok: false, error: error.message, status: 500 }

  await recordDiaryRevision(supabase, {
    business_id: businessId,
    log_id: id,
    order_id: String(before.order_id ?? ''),
    changed_by_user_id: input.changed_by ?? null,
    action: input.action ?? 'update',
    before,
    after: { ...before, ...patch },
  })

  return { ok: true, id }
}

export async function attestDiaryEntry(
  supabase: SupabaseClient,
  input: { business_id: string; id: string; changed_by?: string | null },
): Promise<DiaryWriteResult> {
  const businessId = input.business_id?.trim()
  const id = input.id?.trim()
  if (!businessId || !id) return { ok: false, error: 'Dagboksraden kunde inte identifieras.', status: 400 }

  const { row: before, error: readErr } = await loadRow(supabase, businessId, id)
  if (readErr) return { ok: false, error: `Dagboksraden kunde inte läsas: ${readErr}`, status: 500 }
  if (!before) return { ok: false, error: 'Dagboksraden finns inte', status: 404 }

  const attestedAt = new Date().toISOString()
  const patch = {
    attested_by_user_id: input.changed_by ?? null,
    attested_at: attestedAt,
    updated_at: attestedAt,
  }

  const { error } = await supabase
    .from('project_log')
    .update(patch)
    .eq('id', id)
    .eq('business_id', businessId)
  if (error) return { ok: false, error: error.message, status: 500 }

  await recordDiaryRevision(supabase, {
    business_id: businessId,
    log_id: id,
    order_id: String(before.order_id ?? ''),
    changed_by_user_id: input.changed_by ?? null,
    action: 'attest',
    before,
    after: { ...before, ...patch },
  })

  return { ok: true, id }
}

export async function unlockDiaryEntry(
  supabase: SupabaseClient,
  input: { business_id: string; id: string; changed_by?: string | null },
): Promise<DiaryWriteResult> {
  const businessId = input.business_id?.trim()
  const id = input.id?.trim()
  if (!businessId || !id) return { ok: false, error: 'Dagboksraden kunde inte identifieras.', status: 400 }

  const { row: before, error: readErr } = await loadRow(supabase, businessId, id)
  if (readErr) return { ok: false, error: `Dagboksraden kunde inte läsas: ${readErr}`, status: 500 }
  if (!before) return { ok: false, error: 'Dagboksraden finns inte', status: 404 }

  // Lås upp nollar BÅDE locked_at och attested_at/attested_by_user_id —
  // annars vore raden fortfarande "attesterad" enligt lockReason() trots att
  // ägaren just tryckte "Lås upp".
  const patch = {
    locked_at: null,
    attested_at: null,
    attested_by_user_id: null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('project_log')
    .update(patch)
    .eq('id', id)
    .eq('business_id', businessId)
  if (error) return { ok: false, error: error.message, status: 500 }

  await recordDiaryRevision(supabase, {
    business_id: businessId,
    log_id: id,
    order_id: String(before.order_id ?? ''),
    changed_by_user_id: input.changed_by ?? null,
    action: 'unlock',
    before,
    after: { ...before, ...patch },
  })

  return { ok: true, id }
}

function formatAddendumTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export async function appendAddendum(
  supabase: SupabaseClient,
  input: { business_id: string; id: string; text: string; changed_by?: string | null },
): Promise<DiaryWriteResult> {
  const businessId = input.business_id?.trim()
  const id = input.id?.trim()
  const text = input.text?.trim()
  if (!businessId || !id) return { ok: false, error: 'Dagboksraden kunde inte identifieras.', status: 400 }
  if (!text) return { ok: false, error: 'Tilläggsanteckningen kan inte vara tom.', status: 400 }

  const { row: before, error: readErr } = await loadRow(supabase, businessId, id)
  if (readErr) return { ok: false, error: `Dagboksraden kunde inte läsas: ${readErr}`, status: 500 }
  if (!before) return { ok: false, error: 'Dagboksraden finns inte', status: 404 }

  const line = `[${formatAddendumTimestamp(new Date())}] ${text}`
  const existingAddendum = typeof before.addendum === 'string' && before.addendum ? before.addendum : ''
  const addendum = existingAddendum ? `${existingAddendum}\n${line}` : line

  const patch = { addendum, updated_at: new Date().toISOString() }

  const { error } = await supabase
    .from('project_log')
    .update(patch)
    .eq('id', id)
    .eq('business_id', businessId)
  if (error) return { ok: false, error: error.message, status: 500 }

  await recordDiaryRevision(supabase, {
    business_id: businessId,
    log_id: id,
    order_id: String(before.order_id ?? ''),
    changed_by_user_id: input.changed_by ?? null,
    action: 'addendum',
    before,
    after: { ...before, ...patch },
  })

  return { ok: true, id }
}

export async function deleteDiaryEntry(
  supabase: SupabaseClient,
  input: { business_id: string; id: string; changed_by?: string | null },
): Promise<DiaryWriteResult> {
  const businessId = input.business_id?.trim()
  const id = input.id?.trim()
  if (!businessId || !id) return { ok: false, error: 'Dagboksraden kunde inte identifieras.', status: 400 }

  const { row: before, error: readErr } = await loadRow(supabase, businessId, id)
  if (readErr) return { ok: false, error: `Dagboksraden kunde inte läsas: ${readErr}`, status: 500 }
  if (!before) return { ok: false, error: 'Dagboksraden finns inte', status: 404 }

  const { error } = await supabase
    .from('project_log')
    .delete()
    .eq('id', id)
    .eq('business_id', businessId)
  if (error) return { ok: false, error: error.message, status: 500 }

  // Ingen FK mot project_log på log_id (se v196) — historiken om att raden
  // fanns och att den togs bort ska bestå även efter att raden själv är
  // borta.
  await recordDiaryRevision(supabase, {
    business_id: businessId,
    log_id: id,
    order_id: String(before.order_id ?? ''),
    changed_by_user_id: input.changed_by ?? null,
    action: 'delete',
    before,
  })

  return { ok: true, id }
}
