import type { SupabaseClient } from '@supabase/supabase-js'
export interface ReviewedPriceChange { id: string; before: number; after: number }
export async function executePriceAdjustment(db: SupabaseClient, businessId: string, plan?: ReviewedPriceChange) {
  if (!plan?.id || !Number.isFinite(plan.before) || !Number.isFinite(plan.after) || plan.after <= 0) return { action: 'price_adjustment', ok: false, error: 'Granskat prisunderlag saknas.' }
  const find = () => db.from('price_lists_v2').select('id, hourly_rate_normal').eq('business_id', businessId).eq('id', plan.id).maybeSingle()
  const before = await find()
  if (before.error || !before.data) return { action: 'price_adjustment', ok: false, error: 'Prislistan kunde inte verifieras.' }
  if (Number(before.data.hourly_rate_normal) !== plan.after) {
    if (Number(before.data.hourly_rate_normal) !== plan.before) return { action: 'price_adjustment', ok: false, error: 'Timpriset har ändrats sedan granskningen. Öppna ett nytt underlag.' }
    try {
      await db.from('price_lists_v2').update({ hourly_rate_normal: plan.after, updated_at: new Date().toISOString() })
        .eq('business_id', businessId).eq('id', plan.id).eq('hourly_rate_normal', plan.before).select('id')
    } catch { /* A lost response is checked against the saved value below. */ }
    const after = await find()
    if (after.error || !after.data || Number(after.data.hourly_rate_normal) !== plan.after) return { action: 'price_adjustment', ok: false, error: 'Det granskade timpriset kunde inte bekräftas som sparat.' }
  }
  return { action: 'price_adjustment', ok: true, price_list_id: plan.id, new_rate: plan.after }
}
