/**
 * Ägare vs kund på inkommande SMS — kundminne-revisionen (2026-09-02, gap 4).
 *
 * Innan den här helpern behandlade sms/incoming ALLA avsändare som kund:
 * skickade en i teamet ett SMS till det tilldelade numret (t.ex. för att be
 * Matte om något), kördes hela kundflödet — resolveEntity, intent-agenten,
 * executeMatteActions och ett automatiskt "kundsvar" — på ägarens eget
 * meddelande. isTeamPhone slår upp avsändaren mot aktiva business_users
 * INNAN kundflödet startar, så en träff kan hoppa hela grenen.
 *
 * Fail-closed = kund: ett uppslagsfel eller en tom kandidatlista ska aldrig
 * få en riktig kund behandlad som ägare (osvarad kund är värre än att missa
 * ägarintaget, som ändå är ett senare steg — se app/api/sms/incoming).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { phoneCandidates } from '@/lib/voice/find-customer-by-phone'

export async function isTeamPhone(
  supabase: SupabaseClient,
  businessId: string,
  from: string,
): Promise<boolean> {
  const candidates = phoneCandidates(from)
  if (candidates.length === 0) return false

  try {
    const { data, error } = await supabase
      .from('business_users')
      .select('id')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .in('phone', candidates)
      .limit(1)

    if (error) {
      console.error('[owner-sender] isTeamPhone-uppslag misslyckades (fail-closed = kund):', error.message)
      return false
    }

    return (data || []).length > 0
  } catch (err) {
    console.error('[owner-sender] isTeamPhone kastade (fail-closed = kund):', err)
    return false
  }
}
