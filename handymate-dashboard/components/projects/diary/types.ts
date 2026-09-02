/**
 * Byggdagbokens klienttyper (Etapp E1, 2026-09-02).
 *
 * Radformen ÄR serverns DiaryApiRow (lib/diary/serialize.ts) — type-only
 * import så inget av serverns beroenden hamnar i klientbundlen.
 */
import type { DiaryApiRow } from '@/lib/diary/serialize'

export type DiaryRow = DiaryApiRow

export interface DiaryPermissions {
  can_create: boolean
  can_attest: boolean
  is_owner_or_admin: boolean
}

/** ÄTA i den form dagboken behöver för kopplingsvalet. */
export interface DiaryAtaOption {
  change_id: string
  ata_number?: number | null
  description: string
  status: string
}

/** Kroppen POST/PATCH tar emot — klientens fältnamn (mappas i rutten). */
export interface DiaryFormPayload {
  log_date: string
  weather: string | null
  temperature: number | null
  work_description: string
  materials_used: string | null
  hours_worked: number | null
  workers_present: number | null
  deviations: string | null
  notes: string | null
  ata_change_id: string | null
}

export interface DiaryFilterState {
  q: string
  from: string
  to: string
  user_id: string
  has_issues: boolean
  attested: '' | '1' | '0'
  ata_change_id: string
}

export const EMPTY_DIARY_FILTERS: DiaryFilterState = {
  q: '',
  from: '',
  to: '',
  user_id: '',
  has_issues: false,
  attested: '',
  ata_change_id: '',
}

export function diaryFiltersToQuery(f: DiaryFilterState): string {
  const sp = new URLSearchParams()
  if (f.q.trim()) sp.set('q', f.q.trim())
  if (f.from) sp.set('from', f.from)
  if (f.to) sp.set('to', f.to)
  if (f.user_id) sp.set('user_id', f.user_id)
  if (f.has_issues) sp.set('has_issues', '1')
  if (f.attested) sp.set('attested', f.attested)
  if (f.ata_change_id) sp.set('ata_change_id', f.ata_change_id)
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export function formatDiaryDate(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  if (Number.isNaN(d.getTime())) return date
  return d.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export function formatDiaryTimestamp(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
