import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

const STAGE_LABELS: Record<string, string> = {
  quote_accepted: 'Offert godkänd',
  material: 'Material förbereds',
  work_started: 'Arbete påbörjat',
  inspection: 'Slutbesiktning',
  done: 'Klart',
}

const STAGE_SMS: Record<string, string> = {
  work_started: 'Hej {name}! Vi har nu påbörjat arbetet med {project}. Du kan följa statusen i din kundportal. — {business}',
  done: 'Hej {name}! {project} är nu klart. Tack för förtroendet! — {business}',
}

/**
 * GET /api/projects/[id]/stages — Hämta alla steg för ett projekt
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('project_stages')
    .select('*')
    .eq('project_id', params.id)
    .eq('business_id', business.business_id)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ stages: data || [] })
}

/**
 * POST /api/projects/[id]/stages — Uppdatera/skapa ett steg
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { stage, note } = body

  if (!stage || !STAGE_LABELS[stage]) {
    return NextResponse.json({ error: 'Ogiltigt steg' }, { status: 400 })
  }

  const supabase = getServerSupabase()

  // Upsert stage (unique on project_id + stage)
  const { error } = await supabase
    .from('project_stages')
    .upsert({
      project_id: params.id,
      business_id: business.business_id,
      stage,
      label: STAGE_LABELS[stage],
      completed_at: new Date().toISOString(),
      completed_by: business.contact_name || 'Hantverkaren',
      note: note || null,
    }, { onConflict: 'project_id,stage' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send SMS to customer if stage has a template
  if (STAGE_SMS[stage]) {
    try {
      const { data: project } = await supabase
        .from('project')
        .select('name, customer_id')
        .eq('project_id', params.id)
        .single()

      if (project?.customer_id) {
        const { data: customer } = await supabase
          .from('customer')
          .select('name, phone_number')
          .eq('customer_id', project.customer_id)
          .single()

        if (customer?.phone_number) {
          const ELKS_API_USER = process.env.ELKS_API_USER
          const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD

          if (ELKS_API_USER && ELKS_API_PASSWORD) {
            const message = STAGE_SMS[stage]
              .replace('{name}', customer.name || '')
              .replace('{project}', project.name || '')
              .replace('{business}', business.business_name || 'Handymate')

            await fetch('https://api.46elks.com/a1/sms', {
              method: 'POST',
              headers: {
                'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                from: (business.business_name || 'Handymate').substring(0, 11),
                to: customer.phone_number,
                message,
              }),
            })
          }
        }
      }
    } catch (smsErr) {
      console.error('[project-stages] SMS failed:', smsErr)
    }
  }

  return NextResponse.json({ success: true })
}
