import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getDefaultStandardTexts } from '@/lib/quote-standard-text-defaults'

function genId() {
  return 'qtpl_' + Math.random().toString(36).substr(2, 9)
}

function genItemId() {
  return 'qi_' + Math.random().toString(36).substr(2, 12)
}

interface SeedTemplate {
  name: string
  description: string
  category: string
  introduction_text: string
  conclusion_text: string
  not_included: string
  ata_terms: string
  payment_terms_text: string
  default_items: any[]
  default_payment_plan: any[]
  rot_enabled: boolean
  rut_enabled: boolean
}

function getByggTemplates(texts: any): SeedTemplate[] {
  return [
    {
      name: 'Standard byggoffert',
      description: 'Komplett byggoffert med grupper för rivning, material och arbete',
      category: 'Bygg',
      introduction_text: texts.introduction,
      conclusion_text: texts.conclusion,
      not_included: texts.not_included,
      ata_terms: texts.ata_terms,
      payment_terms_text: texts.payment_terms,
      default_items: [
        { id: genItemId(), item_type: 'heading', description: 'Rivning & Demontering', sort_order: 0, group_name: 'Rivning', quantity: 0, unit: 'st', unit_price: 0, total: 0, is_rot_eligible: false, is_rut_eligible: false },
        { id: genItemId(), item_type: 'item', description: 'Rivningsarbete', sort_order: 1, group_name: 'Rivning', quantity: 8, unit: 'tim', unit_price: 650, total: 5200, is_rot_eligible: true, is_rut_eligible: false },
        { id: genItemId(), item_type: 'subtotal', description: 'Delsumma rivning', sort_order: 2, group_name: 'Rivning', quantity: 0, unit: 'st', unit_price: 0, total: 5200, is_rot_eligible: false, is_rut_eligible: false },
        { id: genItemId(), item_type: 'heading', description: 'Material', sort_order: 3, group_name: 'Material', quantity: 0, unit: 'st', unit_price: 0, total: 0, is_rot_eligible: false, is_rut_eligible: false },
        { id: genItemId(), item_type: 'item', description: 'Byggmaterial', sort_order: 4, group_name: 'Material', quantity: 1, unit: 'st', unit_price: 15000, total: 15000, is_rot_eligible: false, is_rut_eligible: false },
        { id: genItemId(), item_type: 'subtotal', description: 'Delsumma material', sort_order: 5, group_name: 'Material', quantity: 0, unit: 'st', unit_price: 0, total: 15000, is_rot_eligible: false, is_rut_eligible: false },
        { id: genItemId(), item_type: 'heading', description: 'Arbete', sort_order: 6, group_name: 'Arbete', quantity: 0, unit: 'st', unit_price: 0, total: 0, is_rot_eligible: false, is_rut_eligible: false },
        { id: genItemId(), item_type: 'item', description: 'Byggarbete', sort_order: 7, group_name: 'Arbete', quantity: 24, unit: 'tim', unit_price: 650, total: 15600, is_rot_eligible: true, is_rut_eligible: false },
        { id: genItemId(), item_type: 'subtotal', description: 'Delsumma arbete', sort_order: 8, group_name: 'Arbete', quantity: 0, unit: 'st', unit_price: 0, total: 15600, is_rot_eligible: false, is_rut_eligible: false },
      ],
      default_payment_plan: [
        { label: 'Vid beställning', percent: 30, amount: 0, due_description: 'Vid signering av offert' },
        { label: 'Under arbetets gång', percent: 40, amount: 0, due_description: 'Vid halvtid' },
        { label: 'Vid slutbesiktning', percent: 30, amount: 0, due_description: 'Vid godkänd slutbesiktning' },
      ],
      rot_enabled: true,
      rut_enabled: false,
    },
    {
      name: 'Enkel reparation',
      description: 'Kort offert för mindre reparationer utan grupper',
      category: 'Reparation',
      introduction_text: texts.introduction,
      conclusion_text: texts.conclusion,
      not_included: texts.not_included,
      ata_terms: texts.ata_terms,
      payment_terms_text: texts.payment_terms,
      default_items: [
        { id: genItemId(), item_type: 'item', description: 'Arbete', sort_order: 0, quantity: 4, unit: 'tim', unit_price: 650, total: 2600, is_rot_eligible: true, is_rut_eligible: false },
        { id: genItemId(), item_type: 'item', description: 'Material', sort_order: 1, quantity: 1, unit: 'st', unit_price: 500, total: 500, is_rot_eligible: false, is_rut_eligible: false },
      ],
      default_payment_plan: [],
      rot_enabled: true,
      rut_enabled: false,
    },
  ]
}

function getElTemplates(texts: any): SeedTemplate[] {
  return [
    {
      name: 'Elinstallation',
      description: 'Standard elinstallation med material och arbete',
      category: 'El',
      introduction_text: texts.introduction,
      conclusion_text: texts.conclusion,
      not_included: texts.not_included,
      ata_terms: texts.ata_terms,
      payment_terms_text: texts.payment_terms,
      default_items: [
        { id: genItemId(), item_type: 'heading', description: 'Material', sort_order: 0, group_name: 'Material', quantity: 0, unit: 'st', unit_price: 0, total: 0, is_rot_eligible: false, is_rut_eligible: false },
        { id: genItemId(), item_type: 'item', description: 'Elmaterial', sort_order: 1, group_name: 'Material', quantity: 1, unit: 'st', unit_price: 5000, total: 5000, is_rot_eligible: false, is_rut_eligible: false },
        { id: genItemId(), item_type: 'heading', description: 'Arbete', sort_order: 2, group_name: 'Arbete', quantity: 0, unit: 'st', unit_price: 0, total: 0, is_rot_eligible: false, is_rut_eligible: false },
        { id: genItemId(), item_type: 'item', description: 'Elinstallation', sort_order: 3, group_name: 'Arbete', quantity: 8, unit: 'tim', unit_price: 750, total: 6000, is_rot_eligible: true, is_rut_eligible: false },
        { id: genItemId(), item_type: 'subtotal', description: 'Delsumma arbete', sort_order: 4, group_name: 'Arbete', quantity: 0, unit: 'st', unit_price: 0, total: 6000, is_rot_eligible: false, is_rut_eligible: false },
      ],
      default_payment_plan: [],
      rot_enabled: true,
      rut_enabled: false,
    },
    {
      name: 'Elbesiktning',
      description: 'Fast pris för elbesiktning',
      category: 'El',
      introduction_text: texts.introduction,
      conclusion_text: texts.conclusion,
      not_included: texts.not_included,
      ata_terms: '',
      payment_terms_text: texts.payment_terms,
      default_items: [
        { id: genItemId(), item_type: 'item', description: 'Elbesiktning inkl. protokoll', sort_order: 0, quantity: 1, unit: 'st', unit_price: 3500, total: 3500, is_rot_eligible: false, is_rut_eligible: false },
      ],
      default_payment_plan: [],
      rot_enabled: false,
      rut_enabled: false,
    },
  ]
}

function getVvsTemplates(texts: any): SeedTemplate[] {
  return [
    {
      name: 'VVS-installation',
      description: 'VVS-installation med material och arbete',
      category: 'VVS',
      introduction_text: texts.introduction,
      conclusion_text: texts.conclusion,
      not_included: texts.not_included,
      ata_terms: texts.ata_terms,
      payment_terms_text: texts.payment_terms,
      default_items: [
        { id: genItemId(), item_type: 'heading', description: 'Material', sort_order: 0, group_name: 'Material', quantity: 0, unit: 'st', unit_price: 0, total: 0, is_rot_eligible: false, is_rut_eligible: false },
        { id: genItemId(), item_type: 'item', description: 'VVS-material', sort_order: 1, group_name: 'Material', quantity: 1, unit: 'st', unit_price: 8000, total: 8000, is_rot_eligible: false, is_rut_eligible: false },
        { id: genItemId(), item_type: 'heading', description: 'Arbete', sort_order: 2, group_name: 'Arbete', quantity: 0, unit: 'st', unit_price: 0, total: 0, is_rot_eligible: false, is_rut_eligible: false },
        { id: genItemId(), item_type: 'item', description: 'VVS-arbete', sort_order: 3, group_name: 'Arbete', quantity: 12, unit: 'tim', unit_price: 750, total: 9000, is_rot_eligible: true, is_rut_eligible: false },
      ],
      default_payment_plan: [],
      rot_enabled: true,
      rut_enabled: false,
    },
    {
      name: 'Akutjobb VVS',
      description: 'Utryckning + timpris',
      category: 'VVS',
      introduction_text: texts.introduction,
      conclusion_text: texts.conclusion,
      not_included: texts.not_included,
      ata_terms: texts.ata_terms,
      payment_terms_text: texts.payment_terms,
      default_items: [
        { id: genItemId(), item_type: 'item', description: 'Utryckning', sort_order: 0, quantity: 1, unit: 'st', unit_price: 1500, total: 1500, is_rot_eligible: false, is_rut_eligible: false },
        { id: genItemId(), item_type: 'item', description: 'VVS-arbete', sort_order: 1, quantity: 2, unit: 'tim', unit_price: 850, total: 1700, is_rot_eligible: true, is_rut_eligible: false },
      ],
      default_payment_plan: [],
      rot_enabled: true,
      rut_enabled: false,
    },
  ]
}

function getAllroundTemplates(texts: any): SeedTemplate[] {
  return [
    {
      name: 'Enkel offert',
      description: 'Grundläggande offert utan grupper',
      category: 'Allround',
      introduction_text: texts.introduction,
      conclusion_text: texts.conclusion,
      not_included: texts.not_included,
      ata_terms: texts.ata_terms,
      payment_terms_text: texts.payment_terms,
      default_items: [
        { id: genItemId(), item_type: 'item', description: 'Arbete', sort_order: 0, quantity: 8, unit: 'tim', unit_price: 650, total: 5200, is_rot_eligible: false, is_rut_eligible: false },
        { id: genItemId(), item_type: 'item', description: 'Material', sort_order: 1, quantity: 1, unit: 'st', unit_price: 2000, total: 2000, is_rot_eligible: false, is_rut_eligible: false },
      ],
      default_payment_plan: [],
      rot_enabled: false,
      rut_enabled: false,
    },
    {
      name: 'Detaljerad offert',
      description: 'Full struktur med grupper, delsummor och betalningsplan',
      category: 'Allround',
      introduction_text: texts.introduction,
      conclusion_text: texts.conclusion,
      not_included: texts.not_included,
      ata_terms: texts.ata_terms,
      payment_terms_text: texts.payment_terms,
      default_items: [
        { id: genItemId(), item_type: 'heading', description: 'Förberedelser', sort_order: 0, group_name: 'Förberedelser', quantity: 0, unit: 'st', unit_price: 0, total: 0, is_rot_eligible: false, is_rut_eligible: false },
        { id: genItemId(), item_type: 'item', description: 'Etablering och skydd', sort_order: 1, group_name: 'Förberedelser', quantity: 2, unit: 'tim', unit_price: 650, total: 1300, is_rot_eligible: true, is_rut_eligible: false },
        { id: genItemId(), item_type: 'subtotal', description: 'Delsumma', sort_order: 2, group_name: 'Förberedelser', quantity: 0, unit: 'st', unit_price: 0, total: 1300, is_rot_eligible: false, is_rut_eligible: false },
        { id: genItemId(), item_type: 'heading', description: 'Arbete', sort_order: 3, group_name: 'Arbete', quantity: 0, unit: 'st', unit_price: 0, total: 0, is_rot_eligible: false, is_rut_eligible: false },
        { id: genItemId(), item_type: 'item', description: 'Utförande', sort_order: 4, group_name: 'Arbete', quantity: 16, unit: 'tim', unit_price: 650, total: 10400, is_rot_eligible: true, is_rut_eligible: false },
        { id: genItemId(), item_type: 'subtotal', description: 'Delsumma', sort_order: 5, group_name: 'Arbete', quantity: 0, unit: 'st', unit_price: 0, total: 10400, is_rot_eligible: false, is_rut_eligible: false },
        { id: genItemId(), item_type: 'heading', description: 'Material', sort_order: 6, group_name: 'Material', quantity: 0, unit: 'st', unit_price: 0, total: 0, is_rot_eligible: false, is_rut_eligible: false },
        { id: genItemId(), item_type: 'item', description: 'Material', sort_order: 7, group_name: 'Material', quantity: 1, unit: 'st', unit_price: 5000, total: 5000, is_rot_eligible: false, is_rut_eligible: false },
        { id: genItemId(), item_type: 'subtotal', description: 'Delsumma material', sort_order: 8, group_name: 'Material', quantity: 0, unit: 'st', unit_price: 0, total: 5000, is_rot_eligible: false, is_rut_eligible: false },
      ],
      default_payment_plan: [
        { label: 'Vid beställning', percent: 30, amount: 0, due_description: 'Vid signering' },
        { label: 'Under arbetet', percent: 40, amount: 0, due_description: 'Vid halvtid' },
        { label: 'Vid slutförande', percent: 30, amount: 0, due_description: 'Vid godkännande' },
      ],
      rot_enabled: true,
      rut_enabled: false,
    },
  ]
}

/**
 * POST - Skapa seed-mallar baserat på bransch
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id

    // Get branch from business_config
    const { data: config } = await supabase
      .from('business_config')
      .select('branch')
      .eq('business_id', businessId)
      .single()

    const branch = config?.branch || 'allround'

    // Get default texts for this branch
    const defaultTexts = getDefaultStandardTexts(branch)
    const texts: Record<string, string> = {}
    for (const t of defaultTexts) {
      texts[t.text_type] = t.content
    }

    // Pick templates based on branch
    let templates: SeedTemplate[]
    switch (branch) {
      case 'bygg':
      case 'snickeri':
        templates = getByggTemplates(texts)
        break
      case 'el':
        templates = getElTemplates(texts)
        break
      case 'vvs':
        templates = getVvsTemplates(texts)
        break
      default:
        templates = getAllroundTemplates(texts)
    }

    // Insert templates
    const inserts = templates.map(t => ({
      id: genId(),
      business_id: businessId,
      branch,
      ...t,
    }))

    const { data, error } = await supabase
      .from('quote_templates')
      .insert(inserts)
      .select()

    if (error) throw error

    // Also seed standard texts if none exist
    const { count } = await supabase
      .from('quote_standard_texts')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)

    if ((count || 0) === 0) {
      const textInserts = defaultTexts.map((t, i) => ({
        id: 'qst_' + Math.random().toString(36).substr(2, 9),
        business_id: businessId,
        text_type: t.text_type,
        name: t.name,
        content: t.content,
        is_default: true,
      }))

      await supabase.from('quote_standard_texts').insert(textInserts)
    }

    return NextResponse.json({ templates: data || [], count: inserts.length })
  } catch (error: any) {
    console.error('Seed templates error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
