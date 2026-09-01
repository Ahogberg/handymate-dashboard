import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { getProductCatalog, resolveBranches, type ProductDefault } from '@/lib/product-defaults'
import { rankBySearchMatch, scoreProductMatch } from '@/lib/products/search-ranking'

// Auth läses i helpern. Utan force-dynamic kan första företagets katalogläge
// hamna i Nexts Full Route Cache och visas för andra företag.
export const dynamic = 'force-dynamic'

type CatalogProduct = Omit<ProductDefault, 'unit_price' | 'legacy_category'> & {
  imported: boolean
}

async function loadContext(businessId: string) {
  const supabase = getServerSupabase()
  const [{ data: config, error: configError }, { data: ownProducts, error: productsError }] = await Promise.all([
    supabase
      .from('business_config')
      .select('*')
      .eq('business_id', businessId)
      .single(),
    supabase
      .from('products')
      .select('sku,name,unit')
      .eq('business_id', businessId),
  ])
  if (configError) throw configError
  if (productsError) throw productsError

  const branches = resolveBranches(config || {})
  const catalog = getProductCatalog(branches)
  const importedSkus = new Set((ownProducts || []).map((p: any) => p.sku).filter(Boolean))
  const importedNames = new Set(
    (ownProducts || []).map((p: any) => `${String(p.name).trim().toLowerCase()}|${p.unit}`),
  )

  return { supabase, branches, catalog, importedSkus, importedNames }
}

function isImported(
  product: ProductDefault,
  importedSkus: Set<string>,
  importedNames: Set<string>,
) {
  return importedSkus.has(product.sku) ||
    importedNames.has(`${product.name.trim().toLowerCase()}|${product.unit}`)
}

function publicCatalogRow(
  product: ProductDefault,
  importedSkus: Set<string>,
  importedNames: Set<string>,
): CatalogProduct {
  // Handymates tidigare startpriser är inte företagets priser och lämnar
  // aldrig servern. Biblioteket beskriver VAD artikeln är; kunden äger priset.
  return {
    sku: product.sku,
    name: product.name,
    description: product.description,
    unit: product.unit,
    category: product.category,
    labor_share: product.labor_share,
    deduction: product.deduction,
    imported: isImported(product, importedSkus, importedNames),
  }
}

/**
 * GET /api/product-catalog?search=&category=&limit=
 *
 * Läser företagets egna branscher och returnerar Handymates frivilliga
 * bibliotek. Priser returneras aldrig. `imported` härleds tenant-säkert ur
 * företagets privata produktbank.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { branches, catalog, importedSkus, importedNames } = await loadContext(business.business_id)
    const search = (request.nextUrl.searchParams.get('search') || '').trim()
    const category = request.nextUrl.searchParams.get('category')
    const requestedLimit = Number(request.nextUrl.searchParams.get('limit'))
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(1, requestedLimit))
      : 60

    let rows = catalog
    if (category && ['arbete', 'material', 'hyra', 'övrigt'].includes(category)) {
      rows = rows.filter(product => product.category === category)
    }
    if (search) {
      rows = rankBySearchMatch(
        rows.filter(product => scoreProductMatch(product, search) > 0),
        search,
      )
    }

    return NextResponse.json({
      products: rows
        .slice(0, limit)
        .map(product => publicCatalogRow(product, importedSkus, importedNames)),
      total: rows.length,
      branches,
    })
  } catch (error: any) {
    console.error('[product-catalog] GET misslyckades:', error)
    return NextResponse.json({ error: error?.message || 'Kunde inte läsa artikelbiblioteket' }, { status: 500 })
  }
}

/**
 * POST /api/product-catalog { skus: string[] }
 *
 * Kopierar valda katalograder till företagets privata bank. Importen är
 * idempotent på både sku och namn+enhet och sätter ALLTID priset till 0.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (business._impersonation) {
      return NextResponse.json({ error: 'Artiklar kan inte ändras i visningsläge' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const skus: string[] = Array.isArray(body.skus)
      ? Array.from(new Set<string>(body.skus.filter((sku: unknown) => typeof sku === 'string') as string[])).slice(0, 50)
      : []
    if (skus.length === 0) {
      return NextResponse.json({ error: 'Välj minst en artikel' }, { status: 400 })
    }

    const { supabase, catalog, importedSkus, importedNames } = await loadContext(business.business_id)
    const allowedBySku = new Map(catalog.map(product => [product.sku, product]))
    const unknown = skus.filter(sku => !allowedBySku.has(sku))
    if (unknown.length > 0) {
      return NextResponse.json({ error: 'En eller flera artiklar ingår inte i företagets branschbibliotek' }, { status: 400 })
    }

    const selected = skus
      .map(sku => allowedBySku.get(sku)!)
      .filter(product => !isImported(product, importedSkus, importedNames))

    let imported = 0
    for (const product of selected) {
      const { error } = await supabase.from('products').insert({
        business_id: business.business_id,
        name: product.name,
        description: product.description || null,
        sku: product.sku,
        unit: product.unit,
        category: product.category,
        purchase_price: null,
        sales_price: 0,
        markup_percent: null,
        rot_eligible: product.deduction === 'rot',
        rut_eligible: product.deduction === 'rut',
        vat_rate: 0.25,
        is_active: true,
        is_favorite: false,
        category_id: null,
        default_labor_share: product.labor_share,
      })
      if (error) {
        // Samtidiga dubbelklick eller två flikar får inte göra en redan
        // importerad artikel till ett fel. Alla andra databasfel är synliga.
        if ((error as any).code === '23505') continue
        throw error
      }
      imported += 1
    }

    return NextResponse.json({ ok: true, imported, already_present: skus.length - imported })
  } catch (error: any) {
    console.error('[product-catalog] POST misslyckades:', error)
    return NextResponse.json({ error: error?.message || 'Kunde inte lägga till artiklarna' }, { status: 500 })
  }
}
