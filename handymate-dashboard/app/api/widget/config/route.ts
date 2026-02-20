import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness, checkFeatureAccess } from '@/lib/auth'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS })
}

/**
 * GET /api/widget/config?bid=xxx — PUBLIC: get widget config for embed
 */
export async function GET(request: NextRequest) {
  const bid = request.nextUrl.searchParams.get('bid')
  if (!bid) {
    return NextResponse.json({ error: 'Missing bid' }, { status: 400, headers: CORS_HEADERS })
  }

  const supabase = getServerSupabase()

  const { data: config } = await supabase
    .from('business_config')
    .select('business_id, business_name, display_name, widget_enabled, widget_color, widget_welcome_message, widget_position, widget_bot_name, widget_max_estimate, widget_collect_contact, widget_book_time, widget_give_estimates, widget_ask_budget, widget_quick_questions, logo_url')
    .eq('business_id', bid)
    .single()

  if (!config || !config.widget_enabled) {
    return NextResponse.json({ error: 'Widget not enabled' }, { status: 404, headers: CORS_HEADERS })
  }

  return NextResponse.json({
    business_name: config.display_name || config.business_name,
    color: config.widget_color || '#0891b2',
    welcome_message: config.widget_welcome_message || 'Hej! 👋 Hur kan vi hjälpa dig?',
    position: config.widget_position || 'right',
    bot_name: config.widget_bot_name || `${config.display_name || config.business_name}s assistent`,
    collect_contact: config.widget_collect_contact !== false,
    give_estimates: config.widget_give_estimates !== false,
    quick_questions: config.widget_quick_questions || ['Vad kostar renovering?', 'Vilka tjänster har ni?', 'Boka en tid'],
    logo_url: config.logo_url || null,
  }, { headers: CORS_HEADERS })
}

/**
 * PUT /api/widget/config — AUTHENTICATED: update widget config
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const featureCheck = checkFeatureAccess(business, 'website_widget')
    if (!featureCheck.allowed) {
      return NextResponse.json({ error: featureCheck.error, feature: featureCheck.feature, required_plan: featureCheck.required_plan }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    const allowedFields = [
      'widget_enabled', 'widget_color', 'widget_welcome_message', 'widget_position',
      'widget_bot_name', 'widget_max_estimate', 'widget_collect_contact', 'widget_book_time',
      'widget_give_estimates', 'widget_ask_budget', 'widget_quick_questions',
    ]

    const updates: Record<string, any> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) updates[field] = body[field]
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { error } = await supabase
      .from('business_config')
      .update(updates)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
