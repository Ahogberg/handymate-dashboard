import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { checkSmsRateLimitDb, checkEmailRateLimitDb } from '@/lib/rate-limit-db'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { sendQuote } from '@/lib/quotes/send-quote'

/**
 * POST - Skicka offert via SMS och/eller email.
 *
 * Steg 1 (execution-chain): själva sändningen + sidoeffekterna bor nu i
 * lib/quotes/send-quote.ts (service-role-kapabel, delas med execute.ts i
 * Steg 3). Routen är en tunn wrapper: auth → permission → rate-limit →
 * ägarskaps-verifiering → four-eyes → sendQuote. Beteende utåt oförändrat.
 *
 * Four-eyes + ägarskap ligger kvar här (beror på currentUser.role och
 * business.user_id). När four-eyes triggar returneras `requires_approval`
 * UTAN att sendQuote anropas.
 */
export async function POST(request: NextRequest) {
  try {
    // Auth check
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Permission check: kräver create_invoices
    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'create_invoices')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const { quoteId, method, extraEmails, bccEmails } = await request.json()

    if (!quoteId) {
      return NextResponse.json({ error: 'Missing quoteId' }, { status: 400 })
    }

    // Rate limit check
    if (method === 'sms' || method === 'both') {
      const smsLimit = await checkSmsRateLimitDb(business.business_id)
      if (!smsLimit.allowed) {
        return NextResponse.json({ error: smsLimit.error }, { status: 429 })
      }
    }
    if (method === 'email' || method === 'both') {
      const emailLimit = await checkEmailRateLimitDb(business.business_id)
      if (!emailLimit.allowed) {
        return NextResponse.json({ error: emailLimit.error }, { status: 429 })
      }
    }

    // Hämta offert (service role, ej RLS)
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .select('*, sign_token')
      .eq('quote_id', quoteId)
      .single()

    if (quoteError || !quote) {
      console.error('Quote fetch error:', quoteError, 'quoteId:', quoteId)
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    // Verifiera ägarskap: kolla att offertens business tillhör inloggad användare
    const { data: ownerCheck } = await supabase
      .from('business_config')
      .select('business_id')
      .eq('business_id', quote.business_id)
      .eq('user_id', business.user_id)
      .maybeSingle()

    if (!ownerCheck) {
      // Fallback: kolla om det är samma e-post (multi-account scenario)
      const { data: emailCheck } = await supabase
        .from('business_config')
        .select('business_id')
        .eq('business_id', quote.business_id)
        .eq('contact_email', business.contact_email)
        .maybeSingle()

      if (!emailCheck) {
        return NextResponse.json({ error: 'Ingen behörighet för denna offert' }, { status: 403 })
      }
    }

    // 4-eyes check: kräv admin-godkännande för stora offerter
    const { data: fourEyesConfig } = await supabase
      .from('business_config')
      .select('four_eyes_enabled, four_eyes_threshold_sek')
      .eq('business_id', quote.business_id)
      .single()

    const quoteTotal = quote.total || quote.subtotal || 0
    if (
      fourEyesConfig?.four_eyes_enabled &&
      quoteTotal >= (fourEyesConfig.four_eyes_threshold_sek || 50000) &&
      currentUser?.role !== 'owner' && currentUser?.role !== 'admin'
    ) {
      // Skapa approval istf att skicka direkt
      const approvalId = `appr_4e_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
      const { error: apprErr } = await supabase.from('pending_approvals').insert({
        id: approvalId,
        business_id: quote.business_id,
        approval_type: 'four_eyes_quote',
        title: `Offert kräver godkännande — ${(quoteTotal).toLocaleString('sv-SE')} kr`,
        description: `${quote.title || 'Offert'} till ${quote.customer?.name || 'kund'}. Beloppet överstiger gränsen på ${(fourEyesConfig.four_eyes_threshold_sek || 50000).toLocaleString('sv-SE')} kr.`,
        payload: {
          quote_id: quoteId,
          quote_title: quote.title,
          quote_total: quoteTotal,
          threshold: fourEyesConfig.four_eyes_threshold_sek,
          requested_by: currentUser?.name || 'Användare',
          send_method: method,
          extra_emails: extraEmails,
          bcc_emails: bccEmails,
        },
        status: 'pending',
        risk_level: 'high',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })

      if (apprErr) {
        console.error('[quotes/send] Failed to create approval:', apprErr)
        return NextResponse.json({ error: 'Kunde inte skapa godkännandebegäran' }, { status: 500 })
      }

      // Uppdatera status till pending_approval
      const { error: statusErr } = await supabase
        .from('quotes')
        .update({ status: 'pending_approval' })
        .eq('quote_id', quoteId)

      if (statusErr) {
        console.error('[quotes/send] Failed to update quote status:', statusErr)
        return NextResponse.json({ error: 'Godkännande skapad men offertens status kunde inte uppdateras' }, { status: 500 })
      }

      return NextResponse.json({
        requires_approval: true,
        approval_id: approvalId,
        message: `Offerten kräver godkännande av admin innan den skickas (belopp: ${quoteTotal.toLocaleString('sv-SE')} kr)`,
      })
    }

    // Klar att skickas → delegera till lib-funktionen
    const result = await sendQuote(supabase, business, quote, {
      quoteId,
      method,
      extraEmails,
      bccEmails,
    })
    return NextResponse.json(result.body, { status: result.status })

  } catch (error: any) {
    console.error('Send quote error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
