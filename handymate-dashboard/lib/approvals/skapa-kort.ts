/**
 * skapaKort — gemensam skapare för pending_approvals-rader.
 *
 * Bakgrund (docs/audits/AUTOPILOT_REVISION_2026-09-04.md, avsnitt 1d): push
 * kopplas manuellt på insert-ställen i huset, och de flesta cronar glömmer
 * det — korten landar tyst i inkorgen tills kunden råkar öppna appen. Den
 * här funktionen gör insert + push till EN sak, så ett nytt call-site inte
 * kan glömma pushen.
 *
 * Bytt in där det gör skillnad (Pass A, del 4) — inte i alla 73 befintliga
 * insert-ställen på en gång. Övriga call-sites rörs inte av det här passet.
 *
 * Kontrakt:
 * - Insert FÖRE push — kortet finns alltid, oavsett vad pushen gör.
 * - Fail-soft på båda hållen: ett insertfel loggas och returnerar null
 *   (kastar aldrig — cronarna som ringer in har egna svep-loopar som inte
 *   får fällas av ett enda företags fel). Ett pushfel loggas men kortet är
 *   ändå skapat — call-sitens retur (`{ id }`) står fast.
 * - `opts.push === false` hoppar över pushen helt (t.ex. bulk-import eller
 *   typer som redan har egen pushlogik).
 *
 * Pass B, del 3 (kortdiet, docs/audits/AUTOPILOT_REVISION_2026-09-04.md
 * avsnitt 4): innan insert grenar funktionen på kanalFor(approval_type).
 * Typer märkta 'digest' i lib/approvals/kortkanal.ts blir ALDRIG ett kort —
 * de skriver en rad i automation_activity (tyst, ingen push) och
 * returnerar `{ id, kanal: 'digest' }` i stället. Reversibelt: att flytta
 * en typ tillbaka till 'kort' är en ändring i kortkanal.ts, inte här.
 */

import { getServerSupabase } from '@/lib/supabase'
import { sendApprovalPush } from '@/lib/notifications/approval-push'
import { kanalFor } from '@/lib/approvals/kortkanal'

type SupabaseServerClient = ReturnType<typeof getServerSupabase>

export interface NyttKort {
  id?: string
  business_id: string
  approval_type: string
  title: string
  description?: string
  payload?: Record<string, unknown>
  risk_level?: string
  status?: string
  expires_at?: string
  agent_run_id?: string
  routed_agent?: string
  routing_role?: string
  routed_business_user_id?: string
  // pending_approvals har fler kolumner än de ovan (se sql/v2_pending_approvals.sql
  // och senare migrationer) — index-signaturen låter call-sites skicka med
  // t.ex. resolved_at utan att NyttKort behöver känna till varje kolumn.
  [extra: string]: unknown
}

/**
 * Skapar en pending_approvals-rad och skickar (som standard) push för den.
 *
 * Returnerar `{ id }` vid lyckad insert, `null` vid insertfel. Ett fel i
 * pushsteget kastas ALDRIG härifrån — det är redan fail-soft inne i
 * sendApprovalPush, och skapaKort lägger ett eget skyddsnät runt anropet
 * för säkerhets skull.
 */
export async function skapaKort(
  supabase: SupabaseServerClient,
  kort: NyttKort,
  opts?: { push?: boolean },
): Promise<{ id: string; kanal?: 'kort' | 'digest' } | null> {
  if (kanalFor(kort.approval_type) === 'digest') {
    return skrivDigestrad(supabase, kort)
  }

  const { data, error } = await supabase
    .from('pending_approvals')
    .insert({ status: 'pending', ...kort })
    .select('id')
    .single()

  if (error || !data) {
    console.warn('[skapa-kort] insert misslyckades:', error?.message, {
      business_id: kort.business_id,
      approval_type: kort.approval_type,
    })
    return null
  }

  const id = data.id as string

  if (opts?.push !== false) {
    try {
      await sendApprovalPush({
        id,
        business_id: kort.business_id,
        approval_type: kort.approval_type,
        payload: kort.payload ?? null,
        risk_level: kort.risk_level ?? null,
        routed_business_user_id: kort.routed_business_user_id ?? null,
      })
    } catch (err) {
      // sendApprovalPush är redan fail-soft internt — kommer hit bara om
      // den själv oväntat kastar. Kortet är skapat oavsett.
      console.warn('[skapa-kort] push kastade (kortet är ändå skapat):', err, {
        business_id: kort.business_id,
        approval_type: kort.approval_type,
        id,
      })
    }
  }

  return { id }
}

/**
 * Digestgrenen (Pass B, del 3) — typen kräver inget beslut, så den blir
 * aldrig ett kort. Skriver EN automation_activity-rad ("Skött utan dig" —
 * se app/api/automations/activity/route.ts) och pushar ALDRIG (digestrader
 * är tysta per definition).
 *
 * OBS status: automation_activity.status har en CHECK-kolumn
 * (sql/automation_center.sql) som bara tillåter 'success' | 'failed' |
 * 'skipped' — inte 'auto'. 'success' används här: att observationen
 * registrerades är i sig lyckat, ingenting misslyckades eller hölls
 * tillbaka.
 */
async function skrivDigestrad(
  supabase: SupabaseServerClient,
  kort: NyttKort,
): Promise<{ id: string; kanal: 'digest' } | null> {
  const forstaMeningen = (kort.description || '').split(/(?<=[.!?])\s/)[0]?.trim()
  const beskrivning =
    forstaMeningen && forstaMeningen !== kort.title
      ? `${kort.title} — ${forstaMeningen}`
      : kort.title

  const { data, error } = await supabase
    .from('automation_activity')
    .insert({
      business_id: kort.business_id,
      automation_type: kort.approval_type,
      action: 'observed',
      description: beskrivning,
      metadata: kort.payload ?? {},
      status: 'success',
    })
    .select('id')
    .single()

  if (error || !data) {
    console.warn('[skapa-kort] digest-insert misslyckades:', error?.message, {
      business_id: kort.business_id,
      approval_type: kort.approval_type,
    })
    return null
  }

  return { id: data.id as string, kanal: 'digest' }
}
