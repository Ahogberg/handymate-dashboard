import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { getServerSupabase } from '@/lib/supabase'
import { getDefaultProducts } from '@/lib/product-defaults'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/backfill-products
 *
 * Fyller produktbanken för BEFINTLIGA konton som har noll artiklar.
 *
 * Bakgrund: onboarding seedade tidigare bara `price_list`, medan offert-editorn
 * och AI:n läser `products`. Alla konton skapade före den fixen har därför en
 * tom produktbank — AI-offerter får "PRIS SAKNAS" och snabbvalsknapparna i
 * offerten är tomma. Nya konton får sortimentet via seedProducts vid
 * registrering; den här rutten är för dem som redan finns.
 *
 * Backfillen körs som en admin-åtgärd i stället för en SQL-migration eftersom
 * branschsortimentet ägs av lib/product-defaults.ts — att duplicera ~250 rader
 * till SQL skulle garantera att de två källorna driftar isär.
 *
 * Säkerhet och försiktighet:
 *   - Kräver admin (isAdmin — @handymate.se eller ADMIN_EMAILS).
 *   - Rör ALDRIG ett konto som redan har minst en produkt.
 *   - `dryRun` (default) visar vad som skulle hända utan att skriva något.
 *
 * Body: { dryRun?: boolean, businessId?: string }
 *   businessId → kör bara det kontot. Utelämnat → alla konton utan produkter.
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await isAdmin(request)
    if (!admin.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const dryRun = body.dryRun !== false
    const onlyBusinessId: string | undefined = body.businessId

    const supabase = getServerSupabase()

    // Onboarding skriver branschen till `branch` (app/api/onboarding/route.ts:223);
    // `industry` finns också på tabellen och används av äldre kod — ta den som
    // fallback så konton som bara har den ena ändå får rätt sortiment.
    let bizQuery = supabase.from('business_config').select('business_id, branch, industry')
    if (onlyBusinessId) bizQuery = bizQuery.eq('business_id', onlyBusinessId)

    const { data: businesses, error: bizErr } = await bizQuery
    if (bizErr) throw bizErr

    const results: Array<{ business_id: string; branch: string; seeded: number; skipped?: string }> = []

    for (const biz of businesses || []) {
      const { data: existing, error: existErr } = await supabase
        .from('products')
        .select('id')
        .eq('business_id', biz.business_id)
        .limit(1)

      if (existErr) {
        results.push({ business_id: biz.business_id, branch: '', seeded: 0, skipped: `uppslag misslyckades: ${existErr.message}` })
        continue
      }
      if (existing && existing.length > 0) {
        results.push({ business_id: biz.business_id, branch: '', seeded: 0, skipped: 'har redan artiklar' })
        continue
      }

      const bizRow = biz as { branch?: string | null; industry?: string | null }
      const branch = bizRow.branch || bizRow.industry || 'other'
      const products = getDefaultProducts(branch)

      if (dryRun) {
        results.push({ business_id: biz.business_id, branch, seeded: products.length, skipped: 'torrkörning' })
        continue
      }

      const { error: insertErr } = await supabase.from('products').insert(
        products.map((p, i) => ({
          id: `prod_${biz.business_id}_${i}`,
          business_id: biz.business_id,
          name: p.name,
          description: p.description || null,
          sku: p.sku,
          unit: p.unit,
          category: p.category,
          sales_price: p.unit_price,
          purchase_price: null,
          default_labor_share: p.labor_share,
          rot_eligible: p.deduction === 'rot',
          rut_eligible: p.deduction === 'rut',
          is_active: true,
          is_favorite: p.category === 'arbete' && p.unit === 'tim',
        }))
      )

      if (insertErr) {
        results.push({ business_id: biz.business_id, branch, seeded: 0, skipped: `insert misslyckades: ${insertErr.message}` })
        continue
      }
      results.push({ business_id: biz.business_id, branch, seeded: products.length })
    }

    const seededTotal = results.reduce((sum, r) => sum + (r.skipped ? 0 : r.seeded), 0)
    return NextResponse.json({
      success: true,
      dry_run: dryRun,
      businesses_checked: results.length,
      businesses_seeded: results.filter(r => !r.skipped).length,
      products_created: seededTotal,
      results,
    })
  } catch (error: any) {
    console.error('[backfill-products] Error:', error)
    return NextResponse.json({ error: error.message || 'Backfill misslyckades' }, { status: 500 })
  }
}
