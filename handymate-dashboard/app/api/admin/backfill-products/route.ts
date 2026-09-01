import { NextRequest, NextResponse } from 'next/server'
import { isAdmin } from '@/lib/admin-auth'
import { getServerSupabase } from '@/lib/supabase'
import { getStarterProducts, resolveBranches } from '@/lib/product-defaults'

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
 *   - Rör ALDRIG ett konto som redan har minst en produkt — utom i
 *     komplement-läget, som ENBART lägger till SKU:er kontot saknar.
 *   - `dryRun` (default) visar vad som skulle hända utan att skriva något.
 *
 * ═══ KOMPLEMENT-LÄGET (v93-efterspelet, 2026-08-09) ═══
 *
 * När ett konto får en andrabransch (business_config.secondary_branches)
 * finns artiklarna redan för huvudbranschen — och de kan bära intjänade
 * priser som ALDRIG får skrivas över eller tömmas. `complement: true`
 * jämför sortimentet per SKU och lägger bara till det som saknas.
 * Befintliga rader rörs inte: inga prisändringar, inga dubbletter.
 *
 * Body: { dryRun?: boolean, businessId?: string, complement?: boolean }
 *   businessId → kör bara det kontot. Utelämnat → alla konton utan produkter.
 *   complement → kräver businessId; lägger till saknade SKU:er på ett konto
 *                som redan har artiklar.
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
    const complement = body.complement === true

    // Komplement utan målkonto vore "lägg till saknade SKU:er ÖVERALLT" —
    // en åtgärd ingen menat. Kräv explicit konto.
    if (complement && !onlyBusinessId) {
      return NextResponse.json(
        { error: 'complement kräver businessId — komplettering görs ett konto i taget' },
        { status: 400 }
      )
    }

    const supabase = getServerSupabase()

    // Onboarding skriver branschen till `branch` (app/api/onboarding/route.ts:223);
    // `industry` finns också på tabellen och används av äldre kod — ta den som
    // fallback så konton som bara har den ena ändå får rätt sortiment.
    // `*` i stället för en kolumnlista: `secondary_branches` kommer med v93,
    // som körs manuellt i Supabase, och PostgREST avvisar HELA frågan om en
    // uppräknad kolumn inte finns. Med `*` fungerar rutten både före och efter
    // migrationen — resolveBranches läser fältet defensivt.
    let bizQuery = supabase.from('business_config').select('*')
    if (onlyBusinessId) bizQuery = bizQuery.eq('business_id', onlyBusinessId)

    const { data: businesses, error: bizErr } = await bizQuery
    if (bizErr) throw bizErr

    const results: Array<{ business_id: string; branch: string; seeded: number; skipped?: string }> = []

    for (const biz of businesses || []) {
      // I komplement-läget behövs ALLA befintliga SKU:er för jämförelsen;
      // annars räcker det att veta om det finns någon rad alls.
      const { data: existing, error: existErr } = complement
        ? await supabase.from('products').select('sku').eq('business_id', biz.business_id)
        : await supabase.from('products').select('id').eq('business_id', biz.business_id).limit(1)

      if (existErr) {
        results.push({ business_id: biz.business_id, branch: '', seeded: 0, skipped: `uppslag misslyckades: ${existErr.message}` })
        continue
      }
      if (!complement && existing && existing.length > 0) {
        results.push({ business_id: biz.business_id, branch: '', seeded: 0, skipped: 'har redan artiklar' })
        continue
      }

      // Flera branscher slås ihop och dedupliceras på sku (v93) — Bee är
      // både elektriker och bygg och ska ha båda sortimenten.
      const branches = resolveBranches(biz as Parameters<typeof resolveBranches>[0])
      const branch = branches.join(' + ')
      let products = getStarterProducts(branches)

      if (complement) {
        // Enbart det som SAKNAS. Befintliga rader — och deras eventuellt
        // intjänade priser — rörs aldrig.
        const harRedan = new Set((existing || []).map((r: any) => r.sku).filter(Boolean))
        products = products.filter(p => !harRedan.has(p.sku))
        if (products.length === 0) {
          results.push({ business_id: biz.business_id, branch, seeded: 0, skipped: 'inget saknas — sortimentet är komplett' })
          continue
        }
      }

      if (dryRun) {
        results.push({ business_id: biz.business_id, branch, seeded: products.length, skipped: 'torrkörning' })
        continue
      }

      const { error: insertErr } = await supabase.from('products').insert(
        products.map((p, i) => ({
          // Komplementets id-serie får inte kollidera med grundseedens
          // prod_<biz>_<i> — de räknar båda från 0.
          id: complement ? `prod_${biz.business_id}_c_${Date.now()}_${i}` : `prod_${biz.business_id}_${i}`,
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
