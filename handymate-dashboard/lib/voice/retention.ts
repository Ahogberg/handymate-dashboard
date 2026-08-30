import type { SupabaseClient } from '@supabase/supabase-js'

export const CALL_TRANSCRIPT_DAYS = 30
export const CALL_RECORDING_NOTICE_DRAFT = 'Samtalet spelas in och behandlas med AI för att sammanfatta din förfrågan och hjälpa företaget med offert och uppföljning.'

export interface CallRetentionPolicy {
  enabled: true
  transcript_days: 30
  legal_review_ref: string
  provider_deletion_ref: string
}

/** No default opt-in; malformed/partial configuration never starts deletion. */
export function parseCallRetentionPolicy(value: unknown): CallRetentionPolicy | null {
  try {
    const p = typeof value === 'string' ? JSON.parse(value) : value
    if (!p || typeof p !== 'object' || p.enabled !== true || p.transcript_days !== CALL_TRANSCRIPT_DAYS
      || typeof p.legal_review_ref !== 'string' || !p.legal_review_ref.trim()
      || typeof p.provider_deletion_ref !== 'string' || !p.provider_deletion_ref.trim()) return null
    return p
  } catch { return null }
}

/** Local retention, NOT an undocumented 46elks DELETE request.
 * The supplier agreement must guarantee disposal of their copies.
 */
export async function sweepCallRetention(db: SupabaseClient, enabled = process.env.CALL_RETENTION_ENABLED === 'true', now = new Date()) {
  if (!enabled) return { enabled: false, purged: 0, audioPointersCleared: 0, failed: 0 }
  const prefs = await db.from('business_preferences').select('business_id, value').eq('key', 'call_retention_policy')
  if (prefs.error) throw prefs.error
  let purged = 0, failed = 0, audioPointersCleared = 0
  for (const pref of prefs.data || []) {
    if (!parseCallRetentionPolicy(pref.value)) continue
    const cutoff = new Date(now.getTime() - CALL_TRANSCRIPT_DAYS * 86400000).toISOString()
    const expiredRows = await db.from('call_recording').select('recording_id, created_at, transcribed_at, recording_url')
      .eq('business_id', pref.business_id).eq('source', 'phone').is('raw_deleted_at', null)
      .lte('created_at', cutoff)
      .order('created_at', { ascending: true }).limit(100)
    const audioRows = await db.from('call_recording').select('recording_id, created_at, transcribed_at, recording_url')
      .eq('business_id', pref.business_id).eq('source', 'phone').is('raw_deleted_at', null)
      .gt('created_at', cutoff).not('recording_url', 'is', null).not('transcribed_at', 'is', null)
      .order('created_at', { ascending: true }).limit(100)
    if (expiredRows.error || audioRows.error) { failed++; continue }
    for (const row of [...(expiredRows.data || []), ...(audioRows.data || [])]) {
      const expired = Date.parse(row.created_at) <= now.getTime() - CALL_TRANSCRIPT_DAYS * 86400000
      if (!expired && (!row.transcribed_at || !row.recording_url)) continue
      const result = await db.rpc(expired ? 'purge_call_raw_data' : 'clear_call_audio_pointer', {
        p_business_id: pref.business_id, p_recording_id: row.recording_id,
      })
      if (result.error) failed++
      else if (result.data === true) { if (expired) purged++; else audioPointersCleared++ }
    }
  }
  return { enabled: true, purged, audioPointersCleared, failed }
}

/** Provider play requires a tested audio URL, not guessed TTS syntax. */
export function recordingNoticeUrl(env: Record<string, string | undefined> = process.env): string | null {
  if (env.CALL_RECORDING_POLICY_APPROVED !== 'true' || env.CALL_RECORDING_PROVIDER_RETENTION_VERIFIED !== 'true') return null
  try {
    const url = new URL(env.CALL_RECORDING_NOTICE_URL || '')
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null
  } catch { return null }
}
