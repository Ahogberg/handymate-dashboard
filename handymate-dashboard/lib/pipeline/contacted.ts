/**
 * "Kontaktad" gäller alla kontaktvägar (Andreas 2026-08-28).
 *
 * Tidigare flyttade bara ett SMS via /api/sms/send affären från
 * Ny förfrågan → Kontaktad. Mejl, portalmeddelande, bokat besök och
 * automationernas utskick lämnade affären kvar i Ny förfrågan. Nu finns EN
 * regel: varje lyckad kontakt med kunden (från företaget till kunden) flyttar
 * kundens öppna affärer framåt till Kontaktad — genom moveDeal, vars
 * riktningsskydd garanterar att en senare fas (Offert skickad, Vunnen)
 * aldrig dras tillbaka.
 *
 * Best-effort: kastar aldrig, loggar vid fel. Idempotent per affär.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type ContactChannel = 'sms' | 'mejl' | 'portalmeddelande' | 'besök bokat' | 'samtal'

export async function markCustomerContacted(
  supabase: SupabaseClient,
  businessId: string,
  customerId: string | null | undefined,
  via: ContactChannel,
): Promise<{ moved: number }> {
  if (!customerId) return { moved: 0 }
  try {
    const { data: deals, error } = await supabase
      .from('deal')
      .select('id, stage_id')
      .eq('business_id', businessId)
      .eq('customer_id', customerId)
      .is('closed_at', null)
      .limit(20)
    if (error) {
      console.warn('[kontaktad] deal-läsning misslyckades:', error.message)
      return { moved: 0 }
    }
    if (!deals || deals.length === 0) return { moved: 0 }

    const { moveDeal } = await import('@/lib/pipeline')
    let moved = 0
    for (const deal of deals) {
      try {
        const before = deal.stage_id
        await moveDeal({
          dealId: deal.id as string,
          businessId,
          toStageSlug: 'contacted',
          triggeredBy: 'system',
          aiReason: `Kontakt via ${via}`,
        })
        const { data: after } = await supabase.from('deal').select('stage_id').eq('id', deal.id).maybeSingle()
        if (after && after.stage_id !== before) moved += 1
      } catch (e) {
        console.warn('[kontaktad] moveDeal misslyckades:', e instanceof Error ? e.message : e)
      }
    }
    return { moved }
  } catch (e) {
    console.warn('[kontaktad] oväntat fel:', e instanceof Error ? e.message : e)
    return { moved: 0 }
  }
}
