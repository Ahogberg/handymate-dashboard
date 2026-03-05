import { NextRequest, NextResponse } from 'next/server'
import { getDueEnrollments } from '@/lib/nurture'
import { getServerSupabase } from '@/lib/supabase'
import { triggerAgentInternal, makeIdempotencyKey } from '@/lib/agent-trigger'

/**
 * Cron job: Process due nurture-enrollments via AI agent.
 * Keeps: Finding due enrollments, enrollment state management.
 * Delegates: Message composition and sending to AI agent.
 */
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const dueEnrollments = await getDueEnrollments(50)

    if (dueEnrollments.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        message: 'Inga väntande nurture-steg',
      })
    }

    const supabase = getServerSupabase()
    const today = new Date().toISOString().split('T')[0]

    // Group by business
    const byBusiness = new Map<string, Array<{ enrollment: any; customer: any; step: any }>>()

    for (const enrollment of dueEnrollments) {
      // Get enrollment details for agent context
      const { data: details } = await supabase
        .from('nurture_enrollment')
        .select(`
          id, business_id, customer_id, current_step, status,
          customer:customer_id (name, phone_number, email),
          sequence:sequence_id (name, steps)
        `)
        .eq('id', enrollment.id)
        .single()

      if (!details || !details.customer) continue

      const steps = (details.sequence as any)?.steps || []
      const currentStep = steps[details.current_step] || null
      if (!currentStep) continue

      const list = byBusiness.get(details.business_id) || []
      list.push({
        enrollment: details,
        customer: details.customer,
        step: currentStep,
      })
      byBusiness.set(details.business_id, list)

      // Advance enrollment state
      const nextStepIndex = details.current_step + 1
      if (nextStepIndex >= steps.length) {
        await supabase.from('nurture_enrollment').update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        }).eq('id', enrollment.id)
      } else {
        const nextDelay = steps[nextStepIndex]?.delay_hours || 24
        await supabase.from('nurture_enrollment').update({
          current_step: nextStepIndex,
          next_step_at: new Date(Date.now() + nextDelay * 60 * 60 * 1000).toISOString(),
        }).eq('id', enrollment.id)
      }
    }

    // Trigger agent per business
    let agentTriggered = 0
    for (const [businessId, items] of Array.from(byBusiness)) {
      const stepList = items.map((item: any) => {
        const c = item.customer as any
        return `- Kund: ${c?.name || 'Okänd'}, telefon: ${c?.phone_number || 'saknas'}, email: ${c?.email || 'saknas'}. Kanal: ${item.step.channel || 'sms'}. Mall: "${item.step.template || item.step.message || 'Uppföljningsmeddelande'}"`
      }).join('\n')

      const result = await triggerAgentInternal(
        businessId,
        'cron',
        {
          cron_type: 'nurture',
          instruction: `Bearbeta nurture-steg: skicka personliga meddelanden till följande kunder. Anpassa tonen efter mallen men gör det naturligt:\n\n${stepList}`,
        },
        makeIdempotencyKey('nurture', businessId, today, String(items.length))
      )
      if (result.success) agentTriggered++
    }

    return NextResponse.json({
      success: true,
      processed: dueEnrollments.length,
      agent_triggered: agentTriggered,
    })
  } catch (error: any) {
    console.error('Nurture cron error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
