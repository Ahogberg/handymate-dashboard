import { getServerSupabase } from '@/lib/supabase'
import { findNextAvailableSlot } from './find-slot'
import { generateCustomerSms } from './generate-sms'
import { hasFeature, PlanType } from '@/lib/feature-gates'

export interface AutopilotAction {
  id: string
  type: 'project_info' | 'booking_suggestion' | 'customer_sms' | 'material_list'
  title: string
  description: string
  data: Record<string, unknown>
}

/**
 * Trigga autopilot efter offertacceptans.
 * Skapar ett godkännande-paket i pending_approvals.
 */
export async function triggerAutopilot(
  businessId: string,
  quoteId: string
): Promise<{ success: boolean; approvalId?: string; error?: string }> {
  try {
    const supabase = getServerSupabase()

    // Hämta business config
    const { data: business } = await supabase
      .from('business_config')
      .select('business_name, contact_name, subscription_plan, autopilot_enabled, autopilot_auto_book, autopilot_auto_sms, autopilot_auto_materials, autopilot_booking_buffer_days, autopilot_default_duration_hours, working_hours')
      .eq('business_id', businessId)
      .single()

    if (!business?.autopilot_enabled) {
      return { success: false, error: 'Autopilot ej aktiverad' }
    }

    // Feature gate
    const plan = (business.subscription_plan || 'starter') as PlanType
    if (!hasFeature(plan, 'deal_autopilot')) {
      return { success: false, error: 'Funktionen kräver Professional eller Business' }
    }

    // Hämta offert med kund och items
    const { data: quote } = await supabase
      .from('quotes')
      .select('quote_id, title, total, customer_id, lead_id, customer:customer(*)')
      .eq('quote_id', quoteId)
      .single()

    if (!quote) {
      return { success: false, error: 'Offert hittades inte' }
    }

    // Hämta quote items separat
    const { data: quoteItems } = await supabase
      .from('quote_items')
      .select('*')
      .eq('quote_id', quoteId)

    const customer = quote.customer as any
    const customerName = customer?.name || 'Kund'
    const customerPhone = customer?.phone_number || null

    // Hitta eller skapa projekt
    let projectId: string | null = null
    let projectName: string | null = null

    // Kolla befintligt projekt
    const { data: existingProject } = await supabase
      .from('project')
      .select('project_id, name')
      .eq('business_id', businessId)
      .eq('quote_id', quoteId)
      .maybeSingle()

    if (existingProject) {
      projectId = existingProject.project_id
      projectName = existingProject.name
    } else {
      // Skapa projekt
      const newProjectId = 'proj_' + Math.random().toString(36).substr(2, 9)
      const name = quote.title || 'Projekt från offert'
      const { error: projErr } = await supabase.from('project').insert({
        project_id: newProjectId,
        business_id: businessId,
        customer_id: quote.customer_id,
        name,
        status: 'active',
        quote_id: quoteId,
        budget_amount: quote.total || null,
      })
      if (!projErr) {
        projectId = newProjectId
        projectName = name
      }
    }

    // Bygg actions
    const actions: AutopilotAction[] = []

    // Action 1: Projekt-info (alltid)
    actions.push({
      id: 'act_' + Math.random().toString(36).substr(2, 9),
      type: 'project_info',
      title: 'Projekt skapat',
      description: projectName || 'Projekt',
      data: { project_id: projectId },
    })

    // Action 2: Bokning (om aktiverad)
    let bookingDateFormatted: string | undefined
    if (business.autopilot_auto_book) {
      const slot = await findNextAvailableSlot(
        businessId,
        business.autopilot_booking_buffer_days ?? 2,
        business.autopilot_default_duration_hours ?? 4
      )

      if (slot) {
        const startDate = new Date(slot.start)
        const dayNames = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag']
        const dayName = dayNames[startDate.getDay()]
        const dateStr = startDate.toLocaleDateString('sv-SE')
        const timeStr = startDate.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
        bookingDateFormatted = `${dayName} ${dateStr} kl ${timeStr}`

        actions.push({
          id: 'act_' + Math.random().toString(36).substr(2, 9),
          type: 'booking_suggestion',
          title: 'Föreslå bokning',
          description: bookingDateFormatted,
          data: {
            customer_id: quote.customer_id,
            project_id: projectId,
            scheduled_start: slot.start,
            scheduled_end: slot.end,
            notes: quote.title || '',
          },
        })
      }
    }

    // Action 3: Kund-SMS (om aktiverad)
    if (business.autopilot_auto_sms && customerPhone) {
      const smsText = await generateCustomerSms({
        businessName: business.business_name || '',
        contactName: business.contact_name || '',
        customerName,
        quoteTitle: quote.title || 'er offert',
        bookingDate: bookingDateFormatted,
      })

      actions.push({
        id: 'act_' + Math.random().toString(36).substr(2, 9),
        type: 'customer_sms',
        title: 'Skicka kund-SMS',
        description: smsText.length > 60 ? smsText.slice(0, 57) + '...' : smsText,
        data: {
          to: customerPhone,
          message: smsText,
        },
      })
    }

    // Action 4: Material-lista (om aktiverad)
    if (business.autopilot_auto_materials && quoteItems && quoteItems.length > 0) {
      const materials = quoteItems
        .filter((item: any) =>
          item.item_type === 'material' ||
          item.group_name?.toLowerCase().includes('material')
        )
        .map((item: any) => ({
          name: item.description || item.group_name || 'Material',
          quantity: item.quantity || 1,
          unit: item.unit || 'st',
          unit_price: item.unit_price || 0,
        }))

      if (materials.length > 0) {
        actions.push({
          id: 'act_' + Math.random().toString(36).substr(2, 9),
          type: 'material_list',
          title: 'Material-checklista',
          description: `${materials.length} poster att förbereda`,
          data: {
            materials,
            project_id: projectId,
          },
        })
      }
    }

    // Skapa godkännande-paket
    const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    const pendingCount = actions.filter(a => a.type !== 'project_info').length

    const { error: approvalErr } = await supabase.from('pending_approvals').insert({
      id: approvalId,
      business_id: businessId,
      approval_type: 'autopilot_package',
      title: `Autopilot — ${quote.title || 'Offert'}`,
      description: `${customerName} · ${formatAmount(quote.total || 0)}`,
      status: 'pending',
      risk_level: 'medium',
      payload: {},
      package_id: approvalId,
      package_type: 'deal_to_delivery',
      package_data: {
        quote_id: quoteId,
        customer_id: quote.customer_id,
        project_id: projectId,
        customer_name: customerName,
        customer_phone: customerPhone,
        actions,
      },
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 dagar
    })

    if (approvalErr) {
      console.error('Autopilot approval creation error:', approvalErr)
      return { success: false, error: approvalErr.message }
    }

    // Push-notis (non-blocking)
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
      await fetch(`${appUrl}/api/push/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          title: 'Autopilot klar',
          body: `${customerName} godkände offerten — ${pendingCount} förslag redo`,
          data: { url: '/dashboard/approvals' },
        }),
      })
    } catch { /* non-blocking */ }

    return { success: true, approvalId }
  } catch (error: any) {
    console.error('Autopilot trigger error:', error)
    return { success: false, error: error.message }
  }
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}
