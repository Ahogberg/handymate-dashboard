import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

// System form templates (seeded on first GET)
const SYSTEM_TEMPLATES = [
  {
    name: 'Enkel egenkontroll',
    description: 'Grundläggande kvalitetskontroll för utfört arbete',
    category: 'egenkontroll',
    is_system: true,
    fields: [
      { id: 'h1', type: 'header', label: 'Kvalitetskontroll' },
      { id: 'f1', type: 'checkbox', label: 'Arbetet utfört enligt ritning/beskrivning', required: true },
      { id: 'f2', type: 'checkbox', label: 'Material kontrollerat och godkänt', required: true },
      { id: 'f3', type: 'checkbox', label: 'Städning och återställning utförd', required: false },
      { id: 'f4', type: 'checkbox', label: 'Inga synliga skador eller brister', required: true },
      { id: 'f5', type: 'text', label: 'Avvikelser / kommentarer', required: false },
      { id: 'f6', type: 'photo', label: 'Foto på utfört arbete', required: false },
      { id: 'f7', type: 'signature', label: 'Utförares signatur', required: true },
    ],
  },
  {
    name: 'Daglig säkerhetschecklist',
    description: 'Daglig kontroll av arbetsmiljö och säkerhet på arbetsplatsen',
    category: 'safety',
    is_system: true,
    fields: [
      { id: 'h1', type: 'header', label: 'Säkerhetskontroll' },
      { id: 'f1', type: 'checkbox', label: 'Skyddsutrustning kontrollerad (hjälm, skor, glasögon)', required: true },
      { id: 'f2', type: 'checkbox', label: 'Ställningar och stegar kontrollerade', required: true },
      { id: 'f3', type: 'checkbox', label: 'Brandskydd på plats (släckare, filt)', required: true },
      { id: 'f4', type: 'checkbox', label: 'Elsäkerhet kontrollerad', required: true },
      { id: 'f5', type: 'checkbox', label: 'Första hjälpen-utrustning tillgänglig', required: false },
      { id: 'f6', type: 'checkbox', label: 'Ordning och reda på arbetsplatsen', required: false },
      { id: 'f7', type: 'text', label: 'Noteringar / risker', required: false },
      { id: 'f8', type: 'signature', label: 'Kontrollantens signatur', required: true },
    ],
  },
  {
    name: 'Tomt formulär',
    description: 'Börja från scratch — lägg till egna fält',
    category: 'custom',
    is_system: true,
    fields: [],
  },
]

/**
 * GET /api/form-templates — Lista formulärmallar
 * Seedar systemmallar automatiskt om inga finns.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id

    // Check if templates exist, seed if not
    const { data: existing } = await supabase
      .from('form_templates')
      .select('id')
      .eq('business_id', businessId)
      .limit(1)

    if (!existing || existing.length === 0) {
      await supabase.from('form_templates').insert(
        SYSTEM_TEMPLATES.map(t => ({
          business_id: businessId,
          ...t,
          is_active: true,
        }))
      )
    }

    const { data, error } = await supabase
      .from('form_templates')
      .select('*')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('is_system', { ascending: false })
      .order('name')

    if (error) throw error

    return NextResponse.json({ templates: data || [] })
  } catch (error: any) {
    console.error('GET form-templates error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/form-templates — Skapa ny formulärmall
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    if (!body.name) {
      return NextResponse.json({ error: 'Namn krävs' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('form_templates')
      .insert({
        business_id: business.business_id,
        name: body.name,
        description: body.description || null,
        category: body.category || 'custom',
        fields: body.fields || [],
        is_system: false,
        is_active: true,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ template: data })
  } catch (error: any) {
    console.error('POST form-templates error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT /api/form-templates — Uppdatera formulärmall
 */
export async function PUT(request: NextRequest) {
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

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (body.name !== undefined) updates.name = body.name
    if (body.description !== undefined) updates.description = body.description
    if (body.category !== undefined) updates.category = body.category
    if (body.fields !== undefined) updates.fields = body.fields
    if (body.is_active !== undefined) updates.is_active = body.is_active

    const { data, error } = await supabase
      .from('form_templates')
      .update(updates)
      .eq('id', body.id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ template: data })
  } catch (error: any) {
    console.error('PUT form-templates error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/form-templates?id=xxx — Soft-delete (is_active=false)
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
      .from('form_templates')
      .update({ is_active: false })
      .eq('id', id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE form-templates error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
