import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'create_invoices')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const { quoteId } = await request.json()
    if (!quoteId) {
      return NextResponse.json({ error: 'Missing quoteId' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    // Hämta offert och verifiera ägarskap
    const { data: quote, error: fetchErr } = await supabase
      .from('quotes')
      .select('*, customer(*)')
      .eq('quote_id', quoteId)
      .eq('business_id', business.business_id)
      .single()

    if (fetchErr || !quote) {
      return NextResponse.json({ error: 'Offert hittades inte' }, { status: 404 })
    }

    if (!['sent', 'opened'].includes(quote.status)) {
      return NextResponse.json({ error: 'Offerten kan inte accepteras i nuvarande status' }, { status: 400 })
    }

    // Uppdatera offert till accepted
    let { error: updateErr } = await supabase
      .from('quotes')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        accepted_manually: true,
      })
      .eq('quote_id', quoteId)

    // Fallback: om accepted_manually/accepted_at inte finns i DB ännu
    if (updateErr && updateErr.message?.includes('column')) {
      const fallback = await supabase
        .from('quotes')
        .update({ status: 'accepted' })
        .eq('quote_id', quoteId)
      updateErr = fallback.error
    }

    if (updateErr) {
      console.error('Quote accept update error:', updateErr)
      return NextResponse.json({ error: `Databasfel: ${updateErr.message}` }, { status: 500 })
    }

    // Pipeline: flytta deal till accepted
    try {
      const { findDealByQuote, moveDeal, getAutomationSettings } = await import('@/lib/pipeline')
      const settings = await getAutomationSettings(business.business_id)
      if (settings?.auto_move_on_signature) {
        const deal = await findDealByQuote(business.business_id, quoteId)
        if (deal) {
          await moveDeal({
            dealId: deal.id,
            businessId: business.business_id,
            toStageSlug: 'quote_accepted',
            triggeredBy: 'system',
          })
        }
      }
    } catch (err) {
      console.error('Pipeline trigger error (non-blocking):', err)
    }

    // Smart communication + notifications
    try {
      const { triggerEventCommunication } = await import('@/lib/smart-communication')
      await triggerEventCommunication({
        businessId: business.business_id,
        event: 'quote_signed',
        customerId: quote.customer_id,
        context: { quoteId },
      })
    } catch { /* non-blocking */ }

    try {
      const { notifyQuoteSigned } = await import('@/lib/notifications')
      await notifyQuoteSigned({
        businessId: business.business_id,
        customerName: quote.customer?.name || 'Kund',
        quoteId,
        total: quote.total || 0,
      })
    } catch { /* non-blocking */ }

    // Project AI engine: quote_accepted event
    try {
      const { handleProjectEvent } = await import('@/lib/project-ai-engine')
      await handleProjectEvent({
        type: 'quote_accepted',
        businessId: business.business_id,
        quoteId,
      })
    } catch { /* non-blocking */ }

    // Automation engine: fire quote_accepted event
    try {
      const { fireEvent } = await import('@/lib/automation-engine')
      await fireEvent(supabase, 'quote_accepted', business.business_id, {
        quote_id: quoteId,
        customer_id: quote.customer_id,
        customer_name: quote.customer?.name,
        total: quote.total,
        title: quote.title,
        lead_id: quote.lead_id,
      })
    } catch { /* non-blocking */ }

    // Golden Path: flytta deal till "Offert accepterad" → "Vunnen"
    try {
      const { data: linkedDeal } = await supabase
        .from('deal')
        .select('id')
        .eq('business_id', business.business_id)
        .eq('quote_id', quoteId)
        .maybeSingle()

      if (linkedDeal) {
        const { moveDeal } = await import('@/lib/pipeline')
        await moveDeal({
          dealId: linkedDeal.id,
          businessId: business.business_id,
          toStageSlug: 'won',
          triggeredBy: 'system',
          aiReason: 'Offert signerad av kund — deal vunnen',
        })
      }
    } catch { /* non-blocking */ }

    // Golden Path: bekräftelse-SMS till kund
    try {
      const customerPhone = quote.customer?.phone_number
      const customerName = quote.customer?.name?.split(' ')[0] || ''
      if (customerPhone) {
        const { data: config } = await supabase
          .from('business_config')
          .select('business_name, contact_name')
          .eq('business_id', business.business_id)
          .single()

        const bizName = config?.business_name || 'Vi'
        const contactName = config?.contact_name || ''
        const smsText = `Tack ${customerName}! Vi har mottagit din signatur på offerten. Vi återkommer inom kort med en tid för att påbörja arbetet. // ${contactName}, ${bizName}`

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
        await fetch(`${appUrl}/api/sms/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_id: business.business_id,
            to: customerPhone,
            message: smsText,
          }),
        })
      }
    } catch { /* non-blocking */ }

    // Auto-create project from quote (with dedup, milestones, notifications)
    try {
      const { createProjectFromQuote } = await import('@/lib/projects/create-from-quote')
      await createProjectFromQuote(business.business_id, quoteId)
    } catch (projErr) {
      console.error('Auto project creation error (non-blocking):', projErr)
    }

    // Autopilot: förbered deal-to-delivery-paket
    try {
      const { triggerAutopilot } = await import('@/lib/autopilot/trigger')
      await triggerAutopilot(business.business_id, quoteId)
    } catch { /* non-blocking */ }

    // Logga aktivitet
    try {
      await supabase.from('customer_activity').insert({
        activity_id: 'act_' + Math.random().toString(36).substr(2, 9),
        customer_id: quote.customer_id,
        business_id: business.business_id,
        activity_type: 'quote_accepted',
        title: 'Offert manuellt accepterad',
        description: `Offert "${quote.title}" markerades som accepterad`,
        created_by: 'user',
      })
    } catch { /* non-blocking */ }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Accept quote error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
