import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { sanitizeSenderId } from '@/lib/sms/sender-id'
import { halsning } from '@/lib/customers/namn'

const STAGE_LABELS: Record<string, string> = {
  quote_accepted: 'Offert godkänd',
  material: 'Material förbereds',
  work_started: 'Arbete påbörjat',
  inspection: 'Slutbesiktning',
  done: 'Klart',
}

// R1/R2: hälsning + förnamn interpoleras separat (se {name}-ersättningen
// nedan) och mallarna refererar ALDRIG projektets interna arbetsnamn
// ({project} borttaget — det var project.name, hantverkarens interna namn).
const STAGE_SMS: Record<string, string> = {
  work_started: '{name} Vi har nu påbörjat arbetet. Du kan följa statusen i din kundportal. — {business}',
  done: '{name} Arbetet är nu klart. Tack för förtroendet! — {business}',
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
          {
            // Genom strypunkten (etapp 0 batch 4). Projektstatus går till
            // KUNDEN — opt-out gäller. R1: hälsningen bär förnamn/"Hej!".
            const message = STAGE_SMS[stage]
              .replace('{name}', halsning(customer.name))
              .replace('{business}', business.business_name || 'Handymate')

            const { sendSmsViaElks } = await import('@/lib/sms-send')
            const r = await sendSmsViaElks({
              supabase,
              businessId: business.business_id,
              businessName: business.business_name,
              to: customer.phone_number,
              message,
              customerId: project.customer_id,
              relatedId: params.id,
              messageType: `project_stage_${stage}`,
            })
            if (!r.success) console.error('[project-stages] SMS misslyckades:', r.error)
          }
        }
      }
    } catch (smsErr) {
      console.error('[project-stages] SMS failed:', smsErr)
    }
  }

  // Trigger job report when project marked as done
  if (stage === 'done') {
    try {
      const { triggerJobReport } = await import('@/lib/job-report')
      await triggerJobReport(business.business_id, params.id)
    } catch { /* non-blocking */ }
  }

  return NextResponse.json({ success: true })
}
