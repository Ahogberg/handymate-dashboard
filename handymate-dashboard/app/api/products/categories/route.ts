import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * Produktkategorier — exakt 2 nivåer (huvudrubrik → underrubrik).
 * Tabell: product_categories (sql/v67_produktbank.sql). 2-nivåersregeln
 * enforc:as här i API:t; DB-triggern är backstopp.
 */

interface CategoryNode {
  id: string
  business_id: string
  parent_id: string | null
  name: string
  sort_order: number
  created_at: string
  children: CategoryNode[]
}

/**
 * GET /api/products/categories — trädet: huvudrubriker med children-array
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('product_categories')
      .select('*')
      .eq('business_id', business.business_id)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (error) throw error

    const rows = data || []
    const mains: CategoryNode[] = rows
      .filter((r: any) => !r.parent_id)
      .map((r: any) => ({ ...r, children: [] }))
    const byId: Record<string, CategoryNode> = {}
    for (const m of mains) byId[m.id] = m
    for (const r of rows) {
      if (r.parent_id && byId[r.parent_id]) {
        byId[r.parent_id].children.push({ ...r, children: [] })
      }
    }

    return NextResponse.json({ categories: mains })
  } catch (error: any) {
    console.error('GET product categories error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/products/categories — skapa kategori
 * body: { name, parent_id?, sort_order? }
 * parent_id satt → föräldern måste finnas, tillhöra businessen och själv
 * vara huvudrubrik (parent.parent_id IS NULL), annars 400 'Max två nivåer'.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: 'Namn krävs' }, { status: 400 })
    }

    const parentId = body.parent_id || null
    if (parentId) {
      const { data: parent } = await supabase
        .from('product_categories')
        .select('id, parent_id')
        .eq('id', parentId)
        .eq('business_id', business.business_id)
        .maybeSingle()

      if (!parent) {
        return NextResponse.json({ error: 'Överkategorin hittades inte' }, { status: 400 })
      }
      if (parent.parent_id !== null) {
        return NextResponse.json({ error: 'Max två nivåer' }, { status: 400 })
      }
    }

    const { data, error } = await supabase
      .from('product_categories')
      .insert({
        business_id: business.business_id,
        parent_id: parentId,
        name,
        sort_order: body.sort_order ?? 0,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ category: data })
  } catch (error: any) {
    console.error('POST product categories error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH /api/products/categories — byt namn / sortering
 * body: { id, name?, sort_order? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    if (!body.id) {
      return NextResponse.json({ error: 'id krävs' }, { status: 400 })
    }

    const updates: Record<string, any> = {}
    if (body.name !== undefined) {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) {
        return NextResponse.json({ error: 'Namn krävs' }, { status: 400 })
      }
      updates.name = name
    }
    if (body.sort_order !== undefined) updates.sort_order = body.sort_order

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Inget att uppdatera' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('product_categories')
      .update(updates)
      .eq('id', body.id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ category: data })
  } catch (error: any) {
    console.error('PATCH product categories error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/products/categories?id=xxx
 * Underrubriker raderas via FK CASCADE; produkter i kategorin får
 * category_id = NULL via FK ON DELETE SET NULL.
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const id = request.nextUrl.searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id krävs' }, { status: 400 })
    }

    const { error } = await supabase
      .from('product_categories')
      .delete()
      .eq('id', id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE product categories error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
