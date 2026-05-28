import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { sendApprovalPush } from '@/lib/notifications/approval-push'

/**
 * GET /api/quotes/public/[token] - Hämta offert via publik signeringslänk
 * Ingen auth krävs
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const supabase = getServerSupabase()
    const token = params.token

    if (!token) {
      return NextResponse.json({ error: 'Token saknas' }, { status: 400 })
    }

    // Fetch quote by sign_token
    const { data: quote, error } = await supabase
      .from('quotes')
      .select('*')
      .eq('sign_token', token)
      .single()

    if (error || !quote) {
      console.error('[quote/public] Fetch error:', error?.message, 'token:', token)
      return NextResponse.json({ error: 'Offert hittades inte eller länken är ogiltig' }, { status: 404 })
    }

    // Hämta kund separat (FK-relation kan saknas)
    let customer: any = null
    if (quote.customer_id) {
      const { data: c } = await supabase
        .from('customer')
        .select('name, phone_number, email, address_line, portal_token')
        .eq('customer_id', quote.customer_id)
        .single()
      customer = c
    }
    ;(quote as any).customer = customer

    // Fetch business info
    const { data: business } = await supabase
      .from('business_config')
      .select('business_name, contact_name, contact_email, phone_number, org_number, f_skatt_registered, logo_url, accent_color')
      .eq('business_id', quote.business_id)
      .single()

    // Check if already signed
    const alreadySigned = quote.status === 'accepted' && quote.signed_at

    return NextResponse.json({
      quote: {
        ...quote,
        business_id: undefined, // Don't expose
      },
      business: {
        name: business?.business_name || '',
        contact_name: business?.contact_name || '',
        email: business?.contact_email || '',
        phone: business?.phone_number || '',
        org_number: business?.org_number || '',
        f_skatt: business?.f_skatt_registered || false,
        logo_url: business?.logo_url || null,
        accent_color: business?.accent_color || null,
      },
      alreadySigned,
    })

  } catch (error: any) {
    console.error('Get public quote error:', error)
    return NextResponse.json({ error: 'Kunde inte läsa offerten' }, { status: 500 })
  }
}

/**
 * POST /api/quotes/public/[token] - Signera eller avböj offert
 * action: 'sign' (default) | 'decline'
 * Ingen auth krävs
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const supabase = getServerSupabase()
    const token = params.token
    const body = await request.json()
    const { action = 'sign', name, signature_data, reason } = body

    // Fetch quote by sign_token
    const { data: quote, error: fetchError } = await supabase
      .from('quotes')
      .select('*')
      .eq('sign_token', token)
      .single()

    if (fetchError || !quote) {
      return NextResponse.json(
        { error: 'Offert hittades inte eller länken är ogiltig' },
        { status: 404 }
      )
    }

    if (quote.status === 'accepted' && quote.signed_at) {
      return NextResponse.json({ error: 'Offerten är redan signerad' }, { status: 400 })
    }

    if (quote.status === 'declined') {
      return NextResponse.json({ error: 'Offerten är redan avböjd' }, { status: 400 })
    }

    // ── Decline ───────────────────────────────────────────────────────────────
    if (action === 'decline') {
      if (!reason) {
        return NextResponse.json({ error: 'Ange ett skäl för avböjandet' }, { status: 400 })
      }

      const { error: updateError } = await supabase
        .from('quotes')
        .update({
          status: 'declined',
          declined_at: new Date().toISOString(),
          lost_reason: reason,
        })
        .eq('sign_token', token)

      if (updateError) throw updateError

      // Trigger agent automation for declined quote (non-blocking)
      try {
        const { triggerEventCommunication } = await import('@/lib/smart-communication')
        await triggerEventCommunication({
          businessId: quote.business_id,
          event: 'quote_declined',
          customerId: quote.customer_id,
          context: { quoteId: quote.quote_id, extraVariables: { reason } },
        })
      } catch { /* non-blocking */ }

      console.log(`[quote/public] Declined: ${quote.quote_id}, reason: ${reason}`)
      return NextResponse.json({ success: true })
    }

    // ── Sign ──────────────────────────────────────────────────────────────────
    if (!name || !signature_data) {
      return NextResponse.json({ error: 'Namn och signatur krävs' }, { status: 400 })
    }

    const ip =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      'unknown'

    const { error: updateError } = await supabase
      .from('quotes')
      .update({
        status: 'accepted',
        signed_at: new Date().toISOString(),
        signed_by_name: name,
        signed_by_ip: ip,
        signature_data,
        accepted_at: new Date().toISOString(),
      })
      .eq('sign_token', token)

    if (updateError) throw updateError

    // Pipeline: move deal to accepted on signature
    try {
      const { findDealByQuote, moveDeal, getAutomationSettings } = await import('@/lib/pipeline')
      const settings = await getAutomationSettings(quote.business_id)
      if (settings?.auto_move_on_signature) {
        const deal = await findDealByQuote(quote.business_id, quote.quote_id)
        if (deal) {
          await moveDeal({
            dealId: deal.id,
            businessId: quote.business_id,
            toStageSlug: 'accepted',
            triggeredBy: 'system',
          })
        }
      }
    } catch (pipelineErr) {
      console.error('Pipeline trigger error (non-blocking):', pipelineErr)
    }

    // Smart communication + notifications (non-blocking)
    try {
      const { triggerEventCommunication } = await import('@/lib/smart-communication')
      await triggerEventCommunication({
        businessId: quote.business_id,
        event: 'quote_signed',
        customerId: quote.customer_id,
        context: { quoteId: quote.quote_id },
      })

      try {
        const { notifyQuoteSigned } = await import('@/lib/notifications')
        await notifyQuoteSigned({
          businessId: quote.business_id,
          customerName: (quote.customer as any)?.name || 'Kund',
          quoteId: quote.quote_id,
          total: quote.total || 0,
        })
      } catch { /* non-blocking */ }

      // Push-notis till Christoffer — quote_signed har INGEN pending_approval-rad
      // (info, inte action — kunden behöver veta att offerten signerats, inte agera).
      // Anropas med "syntetiskt" approval-objekt så helpern kan återanvända
      // template-logiken. Fire-and-forget, helpern loggar fel internt.
      void sendApprovalPush({
        business_id: quote.business_id,
        approval_type: 'quote_signed',
        payload: {
          customer_name: (quote.customer as any)?.name || 'Kund',
          quote_id: quote.quote_id,
          project_id: (quote as any).project_id || null,
          total: quote.total || 0,
        },
      })

      try {
        const { handleProjectEvent } = await import('@/lib/project-ai-engine')
        await handleProjectEvent({
          type: 'quote_accepted',
          businessId: quote.business_id,
          quoteId: quote.quote_id,
        })
      } catch { /* non-blocking */ }
    } catch (commErr) {
      console.error('Communication trigger error (non-blocking):', commErr)
    }

    // V3 Automation Engine: fire quote_signed event för pipeline-regler
    try {
      const { fireEvent } = await import('@/lib/automation-engine')
      await fireEvent(supabase, 'quote_signed', quote.business_id, {
        quote_id: quote.quote_id,
        customer_id: quote.customer_id,
        quote_title: quote.title,
        total: quote.total,
      })
    } catch { /* non-blocking */ }

    // Autopilot: förbered deal-to-delivery-paket
    try {
      const { triggerAutopilot } = await import('@/lib/autopilot/trigger')
      await triggerAutopilot(quote.business_id, quote.quote_id)
    } catch { /* non-blocking */ }

    // Bekräftelsemail till kund (non-blocking)
    try {
      const { sendQuoteSignedConfirmation } = await import('@/lib/quote-confirmation-email')
      await sendQuoteSignedConfirmation(quote.business_id, quote.quote_id)
    } catch { /* non-blocking */ }

    // Auto-skapa projekt från signerad offert (non-blocking).
    // Om creation failar: skapa pending_approval så Christoffer SER problemet i UI
    // istället för att det försvinner. Kund-signeringen får inte faila — men
    // hantverkaren MÅSTE få veta att projekt-skapande misslyckades och kräver
    // manuell uppföljning (kunden har redan fått bekräftelse via SMS).
    try {
      const { createProjectFromQuote } = await import('@/lib/projects/create-from-quote')
      const result = await createProjectFromQuote(quote.business_id, quote.quote_id)
      if (result.success) {
        console.log(`[quote/public] Auto-created project ${result.project_id} from quote ${quote.quote_id}`)
      } else {
        // High-severity log så Vercel-loggar fångar det
        console.error(
          `[quote/public] CRITICAL: Auto-project creation failed for quote ${quote.quote_id}: ${result.error}`,
        )
        // Skapa pending_approval (egen try/catch så insert-fel inte bryter kund-signering)
        try {
          await supabase.from('pending_approvals').insert({
            business_id: quote.business_id,
            approval_type: 'manual_project_create',
            title: `Skapa projekt manuellt — ${(quote as any).title || quote.quote_id}`,
            description: `Offerten är signerad av kund (${(quote.customer as any)?.name || 'okänd'}) men automatisk projekt-skapande misslyckades: ${result.error || 'okänt fel'}. Kunden har fått bekräftelse — skapa projektet manuellt eller kontakta support.`,
            payload: {
              quote_id: quote.quote_id,
              quote_number: (quote as any).quote_number || null,
              quote_title: (quote as any).title || null,
              customer_id: quote.customer_id,
              customer_name: (quote.customer as any)?.name || null,
              customer_phone: (quote.customer as any)?.phone_number || null,
              total: quote.total || null,
              signed_at: new Date().toISOString(),
              error: result.error || 'unknown',
            },
            status: 'pending',
            risk_level: 'high',
          })
        } catch (approvalErr) {
          console.error('[quote/public] Failed to create manual_project_create approval:', approvalErr)
        }
      }
    } catch (projErr) {
      // Thrown exception (separat från result.success === false)
      console.error('[quote/public] Auto project creation exception (non-blocking):', projErr)
      try {
        await supabase.from('pending_approvals').insert({
          business_id: quote.business_id,
          approval_type: 'manual_project_create',
          title: `Skapa projekt manuellt — ${(quote as any).title || quote.quote_id}`,
          description: `Offerten är signerad av kund men automatisk projekt-skapande kastade ett undantag. Kunden har fått bekräftelse — skapa projektet manuellt eller kontakta support.`,
          payload: {
            quote_id: quote.quote_id,
            quote_number: (quote as any).quote_number || null,
            customer_id: quote.customer_id,
            customer_name: (quote.customer as any)?.name || null,
            signed_at: new Date().toISOString(),
            error: projErr instanceof Error ? projErr.message : String(projErr),
          },
          status: 'pending',
          risk_level: 'high',
        })
      } catch (approvalErr) {
        console.error('[quote/public] Failed to create manual_project_create approval after exception:', approvalErr)
      }
    }

    // Golden Path: flytta deal till "Vunnen"
    try {
      const { data: linkedDeal } = await supabase
        .from('deal')
        .select('id')
        .eq('business_id', quote.business_id)
        .eq('quote_id', quote.quote_id)
        .maybeSingle()

      if (linkedDeal) {
        const { moveDeal } = await import('@/lib/pipeline')
        await moveDeal({
          dealId: linkedDeal.id,
          businessId: quote.business_id,
          toStageSlug: 'won',
          triggeredBy: 'system',
          aiReason: 'Offert signerad av kund — deal vunnen',
        })
      }
    } catch { /* non-blocking */ }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Quote public POST error:', error)
    return NextResponse.json({ error: 'Kunde inte behandla din begäran' }, { status: 500 })
  }
}
