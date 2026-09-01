/**
 * Brusgrinden — anropas av producenterna av brusgrindade korttyper
 * (lib/approvals/kortkvalitet.ts BRUSGRINDADE_TYPER) PRECIS före insert i
 * pending_approvals. Regeln bor i bedomBrusgrind; här finns bara I/O.
 *
 * KONTRAKT: fail-open. Ett DB-fel här får aldrig stoppa ett kort — då
 * beter sig systemet som före grinden. Kastar aldrig.
 *
 * När ett kort hålls tillbaka bokförs det EN gång per paus som en
 * automation_activity-rad (status 'skipped', automation_type
 * 'kortkvalitet') så det syns i företagets aktivitetslogg och i
 * driftlarmets sammanhang — ett tystat förslag ska aldrig vara osynligt.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  arBrusgrindadTyp,
  bedomBrusgrind,
  KORTKVALITET_MIN_SAMPLE,
  KORTKVALITET_PAUS_DAGAR,
  type BrusgrindBeslut,
} from '@/lib/approvals/kortkvalitet'

export const KORTKVALITET_ACTIVITY_TYPE = 'kortkvalitet'

function formateraDatum(iso?: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })
  } catch {
    return iso.slice(0, 10)
  }
}

export async function brusgrind(
  supabase: SupabaseClient,
  businessId: string,
  approvalType: string,
  nowIso: string = new Date().toISOString(),
): Promise<BrusgrindBeslut> {
  const oppen = (skal: string): BrusgrindBeslut => ({
    tysta: false,
    skal,
    underlag: { avgjorda: 0, utgangna: 0, godkanda: 0, utgangna_pct: null },
  })

  if (!arBrusgrindadTyp(approvalType)) return oppen('typen brusgrindas inte')

  try {
    const { data, error } = await supabase
      .from('pending_approvals')
      .select('status, created_at')
      .eq('business_id', businessId)
      .eq('approval_type', approvalType)
      .order('created_at', { ascending: false })
      .limit(KORTKVALITET_MIN_SAMPLE * 3)

    if (error) {
      console.warn('[brusgrind] kunde inte läsa korthistorik (fail-open):', error.message)
      return oppen('korthistoriken kunde inte läsas')
    }

    const beslut = bedomBrusgrind((data || []) as Array<{ status: string; created_at: string }>, nowIso)
    if (beslut.tysta) {
      await bokforPausEnGang(supabase, businessId, approvalType, beslut, nowIso)
    }
    return beslut
  } catch (err) {
    console.warn('[brusgrind] kastade (fail-open):', err)
    return oppen('brusgrinden kraschade')
  }
}

async function bokforPausEnGang(
  supabase: SupabaseClient,
  businessId: string,
  approvalType: string,
  beslut: BrusgrindBeslut,
  nowIso: string,
): Promise<void> {
  try {
    const action = `paus:${approvalType}`
    const sedan = new Date(new Date(nowIso).getTime() - KORTKVALITET_PAUS_DAGAR * 86_400_000).toISOString()
    const { data: redan } = await supabase
      .from('automation_activity')
      .select('id')
      .eq('business_id', businessId)
      .eq('automation_type', KORTKVALITET_ACTIVITY_TYPE)
      .eq('action', action)
      .gte('created_at', sedan)
      .limit(1)
    if (redan && redan.length > 0) return

    await supabase.from('automation_activity').insert({
      business_id: businessId,
      automation_type: KORTKVALITET_ACTIVITY_TYPE,
      action,
      description: `Förslaget hölls tillbaka: ${beslut.skal}.${beslut.oppnar_igen ? ` Ett nytt släpps ${formateraDatum(beslut.oppnar_igen)}.` : ''}`,
      metadata: { approval_type: approvalType, ...beslut.underlag, oppnar_igen: beslut.oppnar_igen ?? null },
      status: 'skipped',
    })
  } catch (err) {
    console.warn('[brusgrind] kunde inte bokföra pausen (icke-blockerande):', err)
  }
}
