import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * Default project templates for Swedish construction trades
 */
const DEFAULT_TEMPLATES = [
  {
    name: 'Badrumsrenovering',
    description: 'Komplett badrumsrenovering med rivning, tätskikt, kakel och installation',
    project_type: 'fixed_price',
    milestones: [
      { name: 'Rivning', sort_order: 1, budget_hours: 16 },
      { name: 'Rördragning', sort_order: 2, budget_hours: 8 },
      { name: 'Tätskikt', sort_order: 3, budget_hours: 8 },
      { name: 'Kakel & klinker', sort_order: 4, budget_hours: 24 },
      { name: 'Installation (tvättställ, WC, dusch)', sort_order: 5, budget_hours: 8 },
      { name: 'Slutbesiktning', sort_order: 6, budget_hours: 2 },
    ],
  },
  {
    name: 'Köksrenovering',
    description: 'Köksrenovering med demontering, el/VVS och montering',
    project_type: 'fixed_price',
    milestones: [
      { name: 'Demontering gammalt kök', sort_order: 1, budget_hours: 8 },
      { name: 'El-arbete', sort_order: 2, budget_hours: 8 },
      { name: 'VVS-arbete', sort_order: 3, budget_hours: 8 },
      { name: 'Montering skåp & bänk', sort_order: 4, budget_hours: 16 },
      { name: 'Bänkskiva & stänkskydd', sort_order: 5, budget_hours: 8 },
      { name: 'Vitvaror & finslipning', sort_order: 6, budget_hours: 8 },
    ],
  },
  {
    name: 'Takarbete',
    description: 'Takbyte eller takrenovering',
    project_type: 'fixed_price',
    milestones: [
      { name: 'Uppstart & ställning', sort_order: 1, budget_hours: 8 },
      { name: 'Rivning gammalt tak', sort_order: 2, budget_hours: 16 },
      { name: 'Läktning & undertak', sort_order: 3, budget_hours: 16 },
      { name: 'Läggning takpannor/plåt', sort_order: 4, budget_hours: 24 },
      { name: 'Plåtarbeten & beslagning', sort_order: 5, budget_hours: 8 },
      { name: 'Nedmontering ställning', sort_order: 6, budget_hours: 4 },
    ],
  },
  {
    name: 'Elinstallation',
    description: 'Ny elinstallation eller ombyggnad av elsystem',
    project_type: 'hourly',
    milestones: [
      { name: 'Besiktning & planering', sort_order: 1, budget_hours: 4 },
      { name: 'Grovdragning kabel', sort_order: 2, budget_hours: 16 },
      { name: 'Montering centraler', sort_order: 3, budget_hours: 8 },
      { name: 'Slutmontering uttag/strömbrytare', sort_order: 4, budget_hours: 8 },
      { name: 'Provning & besiktning', sort_order: 5, budget_hours: 4 },
    ],
  },
  {
    name: 'Målning & tapetsering',
    description: 'Invändig målning och/eller tapetsering',
    project_type: 'hourly',
    milestones: [
      { name: 'Skydda & avmaskering', sort_order: 1, budget_hours: 4 },
      { name: 'Spackling & slipning', sort_order: 2, budget_hours: 8 },
      { name: 'Grundmålning', sort_order: 3, budget_hours: 8 },
      { name: 'Färdigmålning / tapetsering', sort_order: 4, budget_hours: 16 },
      { name: 'Städning & besiktning', sort_order: 5, budget_hours: 4 },
    ],
  },
  {
    name: 'VVS-installation',
    description: 'Rördragning, vatten och avlopp',
    project_type: 'hourly',
    milestones: [
      { name: 'Planering & materiallista', sort_order: 1, budget_hours: 4 },
      { name: 'Rördragning vatten', sort_order: 2, budget_hours: 16 },
      { name: 'Rördragning avlopp', sort_order: 3, budget_hours: 12 },
      { name: 'Anslutning & tätning', sort_order: 4, budget_hours: 8 },
      { name: 'Provtryckning', sort_order: 5, budget_hours: 4 },
    ],
  },
]

/**
 * GET /api/project-templates - Hämta projektmallar
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Return default templates (could be extended with custom templates from DB)
    return NextResponse.json({
      templates: DEFAULT_TEMPLATES,
    })
  } catch (error: any) {
    console.error('Get templates error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/project-templates - Skapa projekt från mall
 * Body: { template_index, customer_id, name, start_date }
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { template_index, customer_id, name, start_date, end_date } = await request.json()

    const template = DEFAULT_TEMPLATES[template_index]
    if (!template) {
      return NextResponse.json({ error: 'Ogiltig mall' }, { status: 400 })
    }

    // Calculate total budget hours
    const totalHours = template.milestones.reduce((sum, m) => sum + (m.budget_hours || 0), 0)

    // Create project
    const { data: project, error: projError } = await supabase
      .from('project')
      .insert({
        business_id: business.business_id,
        customer_id: customer_id || null,
        name: name || template.name,
        description: template.description,
        project_type: template.project_type,
        status: 'planning',
        budget_hours: totalHours,
        start_date: start_date || null,
        end_date: end_date || null,
      })
      .select()
      .single()

    if (projError) throw projError

    // Create milestones
    const milestones = template.milestones.map((m, i) => {
      // Calculate due dates spread across project duration
      let dueDate = null
      if (start_date && end_date) {
        const s = new Date(start_date).getTime()
        const e = new Date(end_date).getTime()
        const fraction = (i + 1) / template.milestones.length
        const d = new Date(s + (e - s) * fraction)
        dueDate = d.toISOString().split('T')[0]
      }

      return {
        business_id: business.business_id,
        project_id: project.project_id,
        name: m.name,
        budget_hours: m.budget_hours,
        sort_order: m.sort_order,
        status: 'pending',
        due_date: dueDate,
      }
    })

    const { error: msError } = await supabase
      .from('project_milestone')
      .insert(milestones)

    if (msError) throw msError

    return NextResponse.json({ project })
  } catch (error: any) {
    console.error('Create from template error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
