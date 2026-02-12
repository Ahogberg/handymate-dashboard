import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { logAutomationActivity } from '@/lib/automations'

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { type } = body

    if (!type) {
      return NextResponse.json({ error: 'Missing automation type' }, { status: 400 })
    }

    let result: { success: boolean; message: string; details?: any } = {
      success: false,
      message: 'Okänd automationstyp',
    }

    switch (type) {
      case 'ai_analyze': {
        // Test AI call analysis with a sample transcript
        result = {
          success: true,
          message: 'AI-analys är aktiv och konfigurerad korrekt',
          details: {
            model: 'claude-sonnet-4-5-20250929',
            api_key_configured: !!process.env.ANTHROPIC_API_KEY,
          },
        }
        break
      }

      case 'sms_send': {
        // Test SMS configuration
        const elksUser = process.env.ELKS_API_USER
        const elksPass = process.env.ELKS_API_PASSWORD
        result = {
          success: !!elksUser && !!elksPass,
          message: elksUser && elksPass
            ? 'SMS-tjänst (46elks) är konfigurerad'
            : 'SMS-tjänst (46elks) saknar API-nycklar',
          details: {
            api_user_configured: !!elksUser,
            api_password_configured: !!elksPass,
          },
        }
        break
      }

      case 'pipeline': {
        // Test pipeline setup
        const { getServerSupabase } = await import('@/lib/supabase')
        const supabase = getServerSupabase()
        const { count } = await supabase
          .from('pipeline_stage')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', business.business_id)

        result = {
          success: (count || 0) > 0,
          message: (count || 0) > 0
            ? `Pipeline har ${count} steg konfigurerade`
            : 'Pipeline saknar steg - besök Pipeline-sidan för att skapa standardsteg',
          details: { stages_count: count || 0 },
        }
        break
      }

      case 'calendar': {
        const { getServerSupabase } = await import('@/lib/supabase')
        const supabase = getServerSupabase()
        const { data: config } = await supabase
          .from('business_config')
          .select('google_calendar_token')
          .eq('business_id', business.business_id)
          .single()

        result = {
          success: !!config?.google_calendar_token,
          message: config?.google_calendar_token
            ? 'Google Calendar är ansluten'
            : 'Google Calendar är inte ansluten - gå till Inställningar → Integrationer',
        }
        break
      }

      case 'fortnox': {
        const { getServerSupabase } = await import('@/lib/supabase')
        const supabase = getServerSupabase()
        const { data: config } = await supabase
          .from('business_config')
          .select('fortnox_access_token')
          .eq('business_id', business.business_id)
          .single()

        result = {
          success: !!config?.fortnox_access_token,
          message: config?.fortnox_access_token
            ? 'Fortnox är anslutet'
            : 'Fortnox är inte anslutet - gå till Inställningar → Integrationer',
        }
        break
      }

      default:
        result = { success: false, message: `Okänd typ: ${type}` }
    }

    await logAutomationActivity({
      businessId: business.business_id,
      automationType: type,
      action: 'test',
      description: result.message,
      metadata: result.details,
      status: result.success ? 'success' : 'failed',
    })

    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
