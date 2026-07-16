/**
 * Skapa projekt automatiskt från en signerad offert.
 * Anropas från alla signeringsflöden (manuellt accept, publik signering, portal).
 * Dedup: om projekt redan finns för offerten, returneras det befintliga.
 */

import { getServerSupabase } from '@/lib/supabase'
import { getQuoteBudgetDerivation } from '@/lib/quotes/get-quote-budget-derivation'

interface CreateResult {
  success: boolean
  project_id?: string
  already_existed?: boolean
  error?: string
}

export async function createProjectFromQuote(
  businessId: string,
  quoteId: string
): Promise<CreateResult> {
  const supabase = getServerSupabase()

  try {
    // 1. Dedup: kolla om projekt redan finns för denna offert
    const { data: existing } = await supabase
      .from('project')
      .select('project_id')
      .eq('quote_id', quoteId)
      .eq('business_id', businessId)
      .limit(1)
      .maybeSingle()

    if (existing) {
      return { success: true, project_id: existing.project_id, already_existed: true }
    }

    // 2. Hämta offert — quotes saknar FK till customer i prod, en embed
    // (`customer:customer_id(...)`) avvisar HELA queryn (PGRST200) vilket
    // gjorde att INGET PROJEKT skapades alls för signerade offerter.
    const { data: quote, error: quoteErr } = await supabase
      .from('quotes')
      .select('*')
      .eq('quote_id', quoteId)
      .eq('business_id', businessId)
      .single()

    if (quoteErr || !quote) {
      return { success: false, error: 'Offert hittades inte' }
    }

    // Kunden används bara för valfria SMS-notiser (steg 7-8) — icke-kritisk,
    // degradera till null vid fel i stället för att stoppa projektskapandet.
    if (quote.customer_id) {
      const { data: customerData, error: customerErr } = await supabase
        .from('customer')
        .select('name, phone_number, portal_token, portal_enabled')
        .eq('customer_id', quote.customer_id)
        .maybeSingle()
      if (customerErr) {
        console.error('[createProjectFromQuote] customer fetch error (non-blocking):', customerErr)
        quote.customer = null
      } else {
        quote.customer = customerData
      }
    } else {
      quote.customer = null
    }

    // 3. Beräkna budget från offertens rader via gemensam helper
    // (pilot-blocker fix 2026-05-22 — samma helper som /api/projects POST).
    // Läser quote_items-tabellen primärt, JSONB-fallback, total-fallback.
    const budgetDerivation = await getQuoteBudgetDerivation(
      supabase,
      quoteId,
      businessId,
    )
    const budgetHours = budgetDerivation.budget_hours
    const budgetAmount = budgetDerivation.budget_amount
    const projectType = budgetDerivation.project_type

    // 4. Skapa projekt
    const projectName = quote.title || 'Projekt från offert'
    const projectId = 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)

    const { error: insertErr } = await supabase
      .from('project')
      .insert({
        project_id: projectId,
        business_id: businessId,
        customer_id: quote.customer_id,
        name: projectName,
        quote_id: quoteId,
        lead_id: quote.lead_id || null,
        project_type: projectType,
        budget_hours: budgetHours,
        budget_amount: budgetAmount || quote.customer_pays || quote.total || null,
        address: quote.project_address || null,
        status: 'active',
        source_lead_data: {
          created_from: 'quote_signed',
          quote_title: quote.title,
          quote_total: quote.total,
          created_at: new Date().toISOString(),
        },
      })

    if (insertErr) {
      return { success: false, error: insertErr.message }
    }

    // 5. Skapa milestones från offertens arbetsrader
    // Använder labor_items från budgetDerivation (samma helper) så
    // milestones byggs från quote_items-tabellen, inte tom JSONB.
    if (budgetDerivation.labor_items.length > 1) {
      const milestones = budgetDerivation.labor_items.map((item, idx) => ({
        business_id: businessId,
        project_id: projectId,
        name: item.description || `Moment ${idx + 1}`,
        budget_hours: item.unit === 'tim' || item.unit === 'h' ? item.quantity : null,
        budget_amount: item.total || null,
        sort_order: idx,
        status: 'pending',
      }))
      await supabase.from('project_milestone').insert(milestones).then(() => {})
    }

    // 6. Fire project_created event
    try {
      const { fireEvent } = await import('@/lib/automation-engine')
      await fireEvent(supabase, 'project_created', businessId, {
        project_id: projectId,
        quote_id: quoteId,
        customer_id: quote.customer_id,
        source: 'quote_signed',
      })
    } catch { /* non-blocking */ }

    // 7. SMS till företagsägaren
    try {
      const { data: biz } = await supabase
        .from('business_config')
        .select('personal_phone, business_name')
        .eq('business_id', businessId)
        .single()

      if (biz?.personal_phone) {
        const customer = quote.customer as any
        const customerName = customer?.name || 'kund'
        const budget = budgetAmount || quote.customer_pays || quote.total
        const budgetStr = budget ? ` (${Math.round(budget).toLocaleString('sv-SE')} kr)` : ''
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

        await fetch(`${appUrl}/api/sms/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: biz.personal_phone,
            message: `Ny deal vunnen! Projekt "${projectName}" för ${customerName}${budgetStr} skapat automatiskt.\n→ ${appUrl}/dashboard/projects/${projectId}`,
            business_id: businessId,
          }),
        })
      }
    } catch { /* non-blocking */ }

    // 8. SMS till kund med portallänk
    try {
      const customer = quote.customer as any
      if (customer?.phone_number && customer?.portal_token && customer?.portal_enabled) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
        const portalUrl = `${appUrl}/portal/${customer.portal_token}?tab=projects`
        const firstName = customer.name?.split(' ')[0] || ''

        const { data: biz } = await supabase
          .from('business_config')
          .select('business_name')
          .eq('business_id', businessId)
          .single()

        await fetch(`${appUrl}/api/sms/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: customer.phone_number,
            message: `Hej ${firstName}! Ditt projekt "${projectName}" har startats. Följ projektets gång här: ${portalUrl} // ${biz?.business_name || ''}`,
            business_id: businessId,
          }),
        })
      }
    } catch { /* non-blocking */ }

    return { success: true, project_id: projectId }
  } catch (err: any) {
    console.error('[createProjectFromQuote] Error:', err)
    return { success: false, error: err.message || 'Okänt fel' }
  }
}
