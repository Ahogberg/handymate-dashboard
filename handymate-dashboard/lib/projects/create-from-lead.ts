/**
 * Skapa projekt automatiskt från lead-data.
 * Anropas av automation-engine vid pipeline-stegbyte till ett steg med creates_project=true.
 */

import { getServerSupabase } from '@/lib/supabase'

interface CreateResult {
  success: boolean
  project_id?: string
  error?: string
}

export async function createProjectFromLead(
  businessId: string,
  leadId: string
): Promise<CreateResult> {
  const supabase = getServerSupabase()

  try {
    // 1. Kolla om projekt redan finns för detta lead
    const { data: existingProject } = await supabase
      .from('project')
      .select('project_id')
      .eq('lead_id', leadId)
      .eq('business_id', businessId)
      .limit(1)
      .maybeSingle()

    if (existingProject) {
      return { success: true, project_id: existingProject.project_id }
    }

    // 2. Hämta lead-data
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('lead_id', leadId)
      .eq('business_id', businessId)
      .single()

    if (leadError || !lead) {
      return { success: false, error: 'Lead hittades inte' }
    }

    // 3. Hämta senaste signerade offert (om det finns)
    const { data: quote } = await supabase
      .from('quotes')
      .select('*')
      .eq('lead_id', leadId)
      .eq('business_id', businessId)
      .in('status', ['signed', 'accepted', 'sent'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // 4. Beräkna budget från offert om den finns
    let budgetHours: number | null = null
    let budgetAmount: number | null = null
    let projectType = 'hourly'

    if (quote?.items && Array.isArray(quote.items)) {
      const items = quote.items as any[]
      const laborHours = items
        .filter(i => i.type === 'labor')
        .reduce((sum, i) => sum + (i.quantity || 0), 0)
      const totalAmount = items.reduce((sum, i) => sum + (i.total || 0), 0)

      budgetHours = laborHours || null
      budgetAmount = totalAmount || null

      if (laborHours > 0 && items.some(i => i.type === 'material')) {
        projectType = 'mixed'
      } else if (laborHours > 0) {
        projectType = 'hourly'
      } else {
        projectType = 'fixed_price'
      }
    }

    // 5. Skapa projekt
    const projectName = quote?.title || lead.title || lead.description || 'Nytt projekt'

    const { data: project, error: insertError } = await supabase
      .from('project')
      .insert({
        business_id: businessId,
        name: projectName,
        customer_id: lead.customer_id || null,
        lead_id: leadId,
        quote_id: quote?.quote_id || null,
        project_type: projectType,
        budget_hours: budgetHours,
        budget_amount: budgetAmount || lead.estimated_value || null,
        address: lead.address || null,
        status: 'active',
        source_lead_data: {
          lead_title: lead.title,
          lead_value: lead.estimated_value,
          lead_source: lead.source,
          created_from: 'pipeline_automation',
          created_at: new Date().toISOString(),
        },
      })
      .select('project_id, name')
      .single()

    if (insertError || !project) {
      return { success: false, error: insertError?.message || 'Kunde inte skapa projekt' }
    }

    // 6. Skapa milestones från offertens arbetsrader (om > 1 rad)
    if (quote?.items && Array.isArray(quote.items)) {
      const laborItems = (quote.items as any[]).filter(i => i.type === 'labor')
      if (laborItems.length > 1) {
        const milestones = laborItems.map((item: any, idx: number) => ({
          business_id: businessId,
          project_id: project.project_id,
          name: item.name || item.description || `Moment ${idx + 1}`,
          budget_hours: item.quantity || null,
          budget_amount: item.total || null,
          sort_order: idx,
          status: 'pending',
        }))
        await supabase.from('project_milestone').insert(milestones)
      }
    }

    // 7. Fire project_created event
    try {
      const { fireEvent } = await import('@/lib/automation-engine')
      await fireEvent(supabase, 'project_created', businessId, {
        project_id: project.project_id,
        lead_id: leadId,
        source: 'pipeline_automation',
      })
    } catch {
      // Fire-and-forget — don't fail project creation
    }

    // 8. Skicka SMS-notis till företagsägaren
    try {
      const { data: business } = await supabase
        .from('business_config')
        .select('personal_phone, business_name')
        .eq('business_id', businessId)
        .single()

      if (business?.personal_phone) {
        const customerName = lead.customer_name || lead.name || 'okänd kund'
        const budget = budgetAmount || lead.estimated_value
        const budgetStr = budget ? `\nBudget: ${Math.round(budget).toLocaleString('sv-SE')} kr` : ''

        await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'}/api/sms/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: business.personal_phone,
            message: `Ny deal vunnen! Projekt skapat:\n"${projectName}" för ${customerName}${budgetStr}\n→ app.handymate.se/dashboard/projects/${project.project_id}`,
            business_id: businessId,
          }),
        })
      }
    } catch {
      // SMS failure should not block
    }

    return { success: true, project_id: project.project_id }
  } catch (err: any) {
    console.error('[createProjectFromLead] Error:', err)
    return { success: false, error: err.message || 'Okänt fel' }
  }
}
