import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getChecklistsForBranch } from '@/lib/checklist-defaults'

/**
 * GET /api/checklists/templates - Lista checklistmallar
 * Returnerar business-specifika + defaults för bransch
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    // Fetch custom templates for this business
    const { data: customTemplates, error } = await supabase
      .from('checklist_template')
      .select('*')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Fetch business branch
    const { data: config } = await supabase
      .from('business_config')
      .select('branch')
      .eq('business_id', business.business_id)
      .single()

    const branch = config?.branch || ''

    // Get default templates for this branch
    const defaults = getChecklistsForBranch(branch).map((t, i) => ({
      id: `default_${branch || 'generic'}_${i}`,
      business_id: null,
      name: t.name,
      category: t.category,
      items: t.items,
      is_default: true,
      branch: branch || null,
      created_at: null,
    }))

    return NextResponse.json({
      templates: [...(customTemplates || []), ...defaults],
    })

  } catch (error: any) {
    console.error('Get checklist templates error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/checklists/templates - Skapa egen checklistmall
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    const { name, category, items } = body

    if (!name || !items || !Array.isArray(items)) {
      return NextResponse.json({ error: 'Namn och items krävs' }, { status: 400 })
    }

    const id = `tmpl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    const { data: template, error } = await supabase
      .from('checklist_template')
      .insert({
        id,
        business_id: business.business_id,
        name,
        category: category || 'custom',
        items,
        is_default: false,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ template })

  } catch (error: any) {
    console.error('Create checklist template error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
