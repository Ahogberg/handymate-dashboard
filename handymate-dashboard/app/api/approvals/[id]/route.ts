import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { recordLearningEvent } from '@/lib/agent/learning-engine'
import { sendSmsViaElks } from '@/lib/sms-send'
import { classifyExecutionResult } from '@/lib/approvals/execution-outcome'
import type { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * POST /api/approvals/[id]
 * Body: { action: 'approve' | 'reject' }
 *
 * On approve: execute the payload action (send SMS, quote, etc.)
 * On reject: mark as rejected
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, edited_payload, reject_reason, action_overrides } = body
    if (!action || !['approve', 'reject', 'edit'].includes(action)) {
      return NextResponse.json({ error: 'action must be approve, reject or edit' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    // Fetch the approval
    const { data: approval, error: fetchError } = await supabase
      .from('pending_approvals')
      .select('*')
      .eq('id', params.id)
      .eq('business_id', business.business_id)
      .single()

    if (fetchError || !approval) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 })
    }

    if (approval.status !== 'pending') {
      return NextResponse.json({ error: `Approval already ${approval.status}` }, { status: 409 })
    }

    // For edit action: merge edited_payload into original payload
    // edited: true stämplas så streak-räkningen (förtjänad autonomi) inte räknar korrigerade förslag som blind tillit.
    const finalPayload = action === 'edit'
      ? { ...approval.payload, ...edited_payload, edited: true }
      : approval.payload

    // Update status
    const newStatus = action === 'reject' ? 'rejected' : 'approved'
    const updateData: Record<string, unknown> = {
      status: newStatus,
      resolved_at: new Date().toISOString(),
      resolved_by: business.business_id,
    }
    if (action === 'edit') {
      updateData.payload = finalPayload
    }

    // Atomisk compare-and-set: flippa BARA om raden fortfarande är 'pending'.
    // Utan .eq('status','pending') här är status-checken på rad 47 en ren
    // TOCTOU-läsning — två snabba klick (eller web+mobil samtidigt) läser båda
    // 'pending', passerar båda, och exekverar payloaden två gånger (dubbla
    // SMS/fakturor). Guarden gör att bara den request som faktiskt flippar
    // går vidare till executeApprovalPayload.
    const { data: flippedApproval, error: updateError } = await supabase
      .from('pending_approvals')
      .update(updateData)
      .eq('id', params.id)
      .eq('status', 'pending')
      .select('id')

    if (updateError) throw updateError
    if (!flippedApproval || flippedApproval.length === 0) {
      // En parallell request hann före oss mellan fetch och update.
      return NextResponse.json({ error: `Approval already resolved` }, { status: 409 })
    }

    // Record learning event (non-blocking)
    try {
      const agentSuggestion = approval.payload as Record<string, unknown>

      if (action === 'approve') {
        await recordLearningEvent(
          business.business_id,
          'approval_accepted',
          params.id,
          'approval',
          agentSuggestion,
          null
        )
      } else if (action === 'edit') {
        await recordLearningEvent(
          business.business_id,
          'approval_edited',
          params.id,
          'approval',
          agentSuggestion,
          edited_payload || {}
        )
      } else if (action === 'reject') {
        await recordLearningEvent(
          business.business_id,
          'approval_rejected',
          params.id,
          'approval',
          agentSuggestion,
          reject_reason ? { reason: reject_reason } : null
        )
      }
    } catch {
      // Non-blocking — learning event failure should not break approval flow
    }

    // Förtjänad autonomi (non-blocking): godkännande av allowlistad typ kan
    // trigga erbjudande vid 15 raka; avvisning nedgraderar + nollar streak
    // (streaken nollas implicit — den avvisade raden ligger nu i historiken).
    try {
      const { autonomyKeyFromApproval, maybeCreateOffer, revokeAutonomy } =
        await import('@/lib/autonomy/earned-autonomy')
      const autonomyKeyForRow = autonomyKeyFromApproval(approval)
      if (autonomyKeyForRow) {
        if (action === 'approve') {
          await maybeCreateOffer(supabase, business.business_id, autonomyKeyForRow)
        } else if (action === 'reject') {
          await revokeAutonomy(supabase, business.business_id, autonomyKeyForRow)
        }
      }
    } catch (autonomyErr) {
      console.error('[approvals] earned-autonomy hook error (non-blocking):', autonomyErr)
    }

    // Reject-side-effect för specifika types som behöver mer än status-flip
    if (action === 'reject' && approval.approval_type === 'lead_review') {
      const leadId = (approval.payload as Record<string, unknown>)?.lead_id as string | undefined
      if (leadId) {
        try {
          await supabase
            .from('leads')
            .update({ status: 'declined', updated_at: new Date().toISOString() })
            .eq('lead_id', leadId)
            .eq('business_id', business.business_id)
        } catch (err) {
          console.error('[approvals/lead_review] Failed to mark lead declined:', err)
        }
      }
    }

    // If approved or edited, execute the payload action
    let executionResult: Record<string, unknown> | null = null
    if (action === 'approve' || action === 'edit') {
      // Defense-in-depth: approval hämtades redan med .eq('business_id', business.business_id)
      // så detta ska aldrig kunna trigga, men explicit check förebygger framtida regressioner
      // där fetch-logiken ändras utan att vi tänker på cross-business-säkerhet.
      if (approval.business_id !== business.business_id) {
        console.error(
          `[approvals/${params.id}] CRITICAL: business_id mismatch — approval.business_id=${approval.business_id}, session=${business.business_id}`,
        )
        return NextResponse.json(
          { error: 'Approval business mismatch — säkerhetsfel' },
          { status: 403 },
        )
      }
      const approvalWithPayload = { ...approval, payload: finalPayload }
      // Audit-4 Fix DEF (2026-06-02): forward cookies så target-endpoints
      // (quotes/send, invoices/send, bookings, ai-generate) får giltig
      // auth-context via samma session som klickade Godkänn. Tidigare
      // failade alla server-side fetches med 401 → silent failure.
      const cookieHeader = request.headers.get('cookie')
      // B2-fix (2026-06-27): mobilen autentiserar med Authorization: Bearer
      // utan cookie → forwarda även den, annars 401 tyst på icke-SMS-actions.
      const authHeader = request.headers.get('authorization')

      // Utfalls-hårdning (juli-audit): executeApprovalPayload har idag ett
      // internt catch-all runt hela sin switch, men om den ändå skulle kasta
      // (t.ex. ett icke-Error-objekt kastas och err.message i det interna
      // catchet själv kraschar) fångar vi det HÄR — annars bubblar det till
      // det yttre catchet nedan och ger ett 500-svar med raden redan
      // status='approved' och INGENTING sparat. Det är precis den tysta
      // dubbel-lögnen (kunden trodde det gick ut, raden säger godkänt, DB
      // har inget spår) som denna hårdning ska stänga.
      try {
        executionResult = await executeApprovalPayload(
          approvalWithPayload,
          business.business_id,
          action_overrides as Record<string, string> | undefined,
          cookieHeader,
          authHeader
        )
      } catch (execErr: any) {
        console.error(`[approvals/${params.id}] executeApprovalPayload kastade okontrollerat:`, execErr)
        executionResult = { error: String(execErr?.message || execErr), ok: false }
      }

      // Persistera utfallet på raden — oavsett om execution lyckades,
      // misslyckades eller kastade. payload är JSONB så detta kräver ingen
      // schema-ändring. Utan detta finns felet BARA i HTTP-svaret ovan; om
      // klienten missar det (mobilkrasch, stängd flik) är det osynligt för
      // alltid och hantverkaren tror felaktigt att handlingen gick igenom.
      const { outcome, error_text } = classifyExecutionResult(executionResult)
      const { error: persistError } = await supabase
        .from('pending_approvals')
        .update({
          payload: {
            ...finalPayload,
            execution_result: {
              outcome,
              error_text,
              executed_at: new Date().toISOString(),
            },
          },
        })
        .eq('id', params.id)
        .eq('business_id', business.business_id)

      if (persistError) {
        // Non-blocking — exekveringen har redan skett och svaret nedan
        // innehåller ändå det faktiska utfallet. Men loggas synligt så vi
        // upptäcker om persisteringen systematiskt failar.
        console.error(`[approvals/${params.id}] Kunde inte spara execution_result:`, persistError)
      }
    }

    return NextResponse.json({
      success: true,
      action,
      execution: executionResult,
    })
  } catch (error: any) {
    console.error('POST /api/approvals/[id] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * Internal helper för SMS-baserade approval-cases (Audit-3 Fix A, 2026-06-01).
 *
 * Tidigare använde 9 cases `fetch(appUrl + /api/sms/send)` som FAILAR
 * server-side: /api/sms/send har getAuthenticatedBusiness-check som
 * returnerar 401 utan cookie/Authorization-header → silent failure
 * (status='approved' men SMS skickas aldrig).
 *
 * Lösning: kalla sendSmsViaElks direkt — bypassar route-layer-auth,
 * loggar i sms_log, returnerar { success, error }. Samma pattern som
 * review_request använde redan (rad 215-282 i originalfilen).
 *
 * Helpern är scoped till executeApprovalPayload via closure så
 * business_name fetchas lazy + bara EN gång per execution oavsett hur
 * många SMS-cases triggas (autopilot_package kan ha flera).
 */
async function fetchBusinessName(
  supabase: SupabaseClient,
  businessId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('business_config')
    .select('business_name')
    .eq('business_id', businessId)
    .maybeSingle()
  return data?.business_name || null
}

/**
 * Execute the payload action based on approval_type.
 * Returns result info (non-fatal — approval is already marked approved).
 *
 * TD: Status-flip ordning (Audit-3 Fix B framtida).
 * Status='approved' sätts i POST-handler INNAN denna funktion kallas.
 * Vid execution-fail kan vi inte återställa pending utan att skapa
 * edge-cases (SMS skickat men status fail-back, etc.). Bygg när vi
 * har pilot-data om vilka edge-cases som faktiskt händer.
 */
async function executeApprovalPayload(
  approval: { approval_type: string; payload: Record<string, unknown>; business_id: string; package_data?: any },
  businessId: string,
  actionOverrides?: Record<string, string>,
  cookieHeader?: string | null,
  authHeader?: string | null,
): Promise<Record<string, unknown>> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
  const { approval_type, payload } = approval

  /**
   * Audit-4 Fix DEF (2026-06-02): bygger headers som forwardar
   * sessions-cookien till target-endpoints. Utan cookien fallbackar
   * getAuthenticatedBusiness till 401 → silent failure.
   */
  function forwardHeaders(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' }
    if (cookieHeader) h['Cookie'] = cookieHeader
    // B2-fix (2026-06-27): forwarda även Authorization — mobilen skickar Bearer
    // utan cookie → icke-SMS-actions (send_quote/send_invoice/create_booking)
    // failade TYST med 401 vid mobil-godkännande (status flippades till
    // 'approved' men handlingen skedde aldrig).
    // TD: ta bort i execution-chain Steg 6 (städning) — efter Steg 3 kör
    // execute.ts lib direkt utan HTTP-forward → forwardHeaders blir överflödig.
    if (authHeader) h['Authorization'] = authHeader
    return h
  }

  /**
   * Audit-4 Fix DEF (2026-06-02): klassificera target-endpoint-response
   * så UI kan visa kontext-känslig feedback istället för bara "ok=true/false".
   *
   * Kategorier:
   *   - permission_denied (HTTP 403): användaren saknar behörighet
   *   - four_eyes_required (HTTP 200 + requires_approval): högvärdes-flow
   *   - rate_limited (HTTP 429): för många försök
   *   - fail (HTTP 401/404/5xx eller body-success=false): hård fail
   */
  async function classifyResponse(
    res: Response,
  ): Promise<{
    ok: boolean
    reason?: 'fail' | 'four_eyes_required' | 'permission_denied' | 'rate_limited'
    error?: string
    metadata?: Record<string, unknown>
  }> {
    let data: any = null
    try { data = await res.json() } catch { /* ignore non-JSON */ }

    if (res.status === 401) {
      return { ok: false, reason: 'fail', error: 'Auth-fel — sessionen kanske gick ut. Logga in på nytt.' }
    }
    if (res.status === 403) {
      return { ok: false, reason: 'permission_denied', error: data?.error || 'Du saknar behörighet för denna handling.' }
    }
    if (res.status === 404) {
      return { ok: false, reason: 'fail', error: 'Endpoint hittades inte (404).' }
    }
    if (res.status === 429) {
      return { ok: false, reason: 'rate_limited', error: data?.error || 'För många försök, vänta en stund.' }
    }
    if (!res.ok) {
      return { ok: false, reason: 'fail', error: data?.error || `HTTP ${res.status}` }
    }

    // HTTP 200 — kolla body
    if (data?.requires_approval) {
      return {
        ok: false,
        reason: 'four_eyes_required',
        error: data.message || `Värdet kräver ny granskning. Ny approval skapad.`,
        metadata: { new_approval_id: data.approval_id },
      }
    }
    if (data && data.success === false) {
      const errMsg = Array.isArray(data?.errors) && data.errors.length > 0
        ? data.errors.join('; ')
        : (data.error || 'Handlingen genomfördes inte fullt ut.')
      return { ok: false, reason: 'fail', error: errMsg }
    }

    return { ok: true, metadata: data || undefined }
  }

  // Lazy supabase + business_name — laddas bara om SMS-case triggas
  let supabaseClient: SupabaseClient | null = null
  let businessNameCache: string | null | undefined = undefined  // undefined = ej hämtad än
  async function getSupabase(): Promise<SupabaseClient> {
    if (!supabaseClient) supabaseClient = getServerSupabase()
    return supabaseClient
  }
  async function getBusinessName(): Promise<string | null> {
    if (businessNameCache === undefined) {
      businessNameCache = await fetchBusinessName(await getSupabase(), businessId)
    }
    return businessNameCache
  }

  /**
   * Skicka SMS via sendSmsViaElks. Använder cachad supabase + business_name.
   * Returnerar standardiserad shape som varje case spreader in i sin
   * return-value: { sms_sent, sms_id?, elks_id?, error?, sms_status? }.
   */
  async function sendSms(opts: {
    to: string
    message: string
    customerId?: string | null
    relatedId?: string | null
    messageType: string
  }): Promise<{
    sms_sent: boolean
    sms_id?: string
    elks_id?: string
    error?: string
    sms_status?: number | null
  }> {
    const supabase = await getSupabase()
    const businessName = await getBusinessName()
    const result = await sendSmsViaElks({
      supabase,
      businessId,
      businessName,
      to: opts.to,
      message: opts.message,
      customerId: opts.customerId,
      relatedId: opts.relatedId,
      messageType: opts.messageType,
    })
    return {
      sms_sent: result.success,
      sms_id: result.smsId,
      elks_id: result.elksId,
      error: result.error,
      sms_status: result.status,
    }
  }
  // appUrl används fortfarande av icke-SMS-cases (send_quote, create_booking,
  // etc.) — separat audit för deras silent-failure-risk (TD).

  try {
    switch (approval_type) {
      case 'quote_nudge':
      case 'send_sms': {
        // Audit-3 Fix A (2026-06-01): sendSmsViaElks direkt istället för
        // internal fetch som failade server-side. Karin/Daniel/Lisa typed
        // actions går via denna case.
        const to = (payload.to as string | undefined) || (payload.customer_phone as string | undefined)
        const message = payload.message as string | undefined
        if (!to || !message) {
          return { action: 'send_sms', error: 'payload saknar to eller message' }
        }
        const r = await sendSms({
          to,
          message,
          customerId: (payload.customer_id as string | undefined) || null,
          relatedId: (payload.related_id as string | undefined) || null,
          messageType: approval_type,
        })
        return { action: 'send_sms', ...r }
      }

      case 'send_email': {
        // TD-52: motsvarighet till 'send_sms' ovan för agentens send_email-
        // verktyg när det köats för godkännande (system-triggerad, ej
        // förtjänad autonomi). Minimal — Resend direkt (lib/email.ts), ingen
        // Gmail-koppling här (den kräver OAuth-token-hantering som redan
        // sköts av tool-router:ns egen sendEmail för direkta skick).
        const to = payload.to as string | undefined
        const subject = payload.subject as string | undefined
        const bodyText = payload.body as string | undefined
        if (!to || !subject || !bodyText) {
          return { action: 'send_email', error: 'payload saknar to, subject eller body' }
        }
        const { sendEmail: sendEmailViaResend, logEmail } = await import('@/lib/email')
        const businessName = await getBusinessName()
        const r = await sendEmailViaResend({
          to,
          subject,
          html: bodyText.replace(/\n/g, '<br>'),
          fromName: businessName || 'Handymate',
        })
        await logEmail({
          businessId,
          customerId: (payload.customer_id as string | undefined) || undefined,
          to,
          subject,
          status: r.success ? 'sent' : 'failed',
          messageId: r.messageId,
        })
        return { action: 'send_email', ok: r.success, error: r.error, message_id: r.messageId }
      }

      case 'send_quote': {
        // Audit-4 Fix DEF (2026-06-02): tidigare URL `/api/quotes/[id]/send`
        // existerade aldrig — failade med 404 silent. Korrekt: `/api/quotes/send`
        // med body { quoteId, method }.
        if (!payload.quote_id) return { action: 'send_quote', skipped: 'no quote_id' }
        const res = await fetch(`${appUrl}/api/quotes/send`, {
          method: 'POST',
          headers: forwardHeaders(),
          body: JSON.stringify({
            quoteId: payload.quote_id,
            method: (payload.method as string) || 'both',
            extraEmails: payload.extra_emails || [],
            bccEmails: payload.bcc_emails || [],
          }),
        })
        const r = await classifyResponse(res)
        return { action: 'send_quote', ...r }
      }

      case 'send_invoice': {
        // Audit-4 Fix DEF (2026-06-02): tidigare URL `/api/invoices/[id]/send`
        // existerade aldrig — failade med 404 silent. Korrekt: `/api/invoices/send`
        // med body { invoice_id, send_email, send_sms }.
        if (!payload.invoice_id) return { action: 'send_invoice', skipped: 'no invoice_id' }
        const res = await fetch(`${appUrl}/api/invoices/send`, {
          method: 'POST',
          headers: forwardHeaders(),
          body: JSON.stringify({
            invoice_id: payload.invoice_id,
            send_email: payload.send_email !== false,
            send_sms: payload.send_sms !== false,
          }),
        })
        const r = await classifyResponse(res)
        return { action: 'send_invoice', ...r }
      }

      case 'confirm_payment': {
        // Kundens "Jag har betalat"-bekräftelse (2026-07-12). Godkänn =
        // hantverkaren bekräftar att pengarna kommit in → markera betald via
        // delad apply-payment-kärna (samma som manuell mark-paid). Ingen
        // markedByUserId (bekräftas via kortet, inte en dashboard-användare).
        if (!payload.invoice_id) return { action: 'confirm_payment', skipped: 'no invoice_id' }
        const { applyInvoicePayment } = await import('@/lib/invoices/apply-payment')
        const r = await applyInvoicePayment({
          businessId,
          invoiceId: payload.invoice_id as string,
          markedByUserId: null,
          source: 'customer_confirmed',
        })
        return {
          action: 'confirm_payment',
          ok: r.ok,
          error: r.error,
          metadata: { already_paid: r.already_paid ?? false, fortnox_synced: r.fortnox_synced ?? null },
        }
      }

      case 'create_booking': {
        // Audit-4 Fix DEF (2026-06-02): cookie-forwarding så /api/bookings
        // POST inte returnerar 401.
        const res = await fetch(`${appUrl}/api/bookings`, {
          method: 'POST',
          headers: forwardHeaders(),
          body: JSON.stringify({ ...payload, business_id: businessId }),
        })
        const r = await classifyResponse(res)
        return { action: 'create_booking', ...r }
      }

      case 'autonomy_offer': {
        // Beviljar förtjänad autonomi för en åtgärdstyp. Ingen extern effekt —
        // endast settings-skrivning (låg risk). Kräver att sql/v65 är körd.
        const { grantAutonomy, isAllowlistedKey } = await import('@/lib/autonomy/earned-autonomy')
        const key = payload.autonomy_key
        if (!isAllowlistedKey(key)) {
          return { action: 'autonomy_offer', ok: false, error: `Okänd autonomi-nyckel: ${String(key)}` }
        }
        const supabaseAO = (await import('@/lib/supabase')).getServerSupabase()
        try {
          await grantAutonomy(supabaseAO, businessId, key)
          return { action: 'autonomy_offer', ok: true, granted: true, autonomy_key: key }
        } catch (err: any) {
          return { action: 'autonomy_offer', ok: false, error: err?.message || 'Kunde inte spara' }
        }
      }

      case 'review_request': {
        // A4 — auto-recensionsbegäran efter projekt-completion.
        // SMS direkt via 46elks (sendSmsViaElks) — inte internal fetch
        // mot /api/sms/send (TD-lärdom: relativ URL fungerar inte server-
        // side i Next-routes, plus rate-limit/billing/auth-check är inte
        // relevant för system-triggade SMS).
        const { sendSmsViaElks } = await import('@/lib/sms-send')
        const supabase = (await import('@/lib/supabase')).getServerSupabase()

        const phone = payload.to as string | undefined
        const message = payload.message as string | undefined
        const customerId = (payload.customer_id as string | undefined) || null
        const projectId = (payload.project_id as string | undefined) || null

        if (!phone || !message) {
          return { action: 'review_request', error: 'payload saknar to eller message' }
        }

        // Hämta business_name för SMS-sender (max 11 tecken på 46elks-from).
        // Best-effort — sendSmsViaElks default:ar till 'Handymate' om saknas.
        const { data: bizCfg } = await supabase
          .from('business_config')
          .select('business_name')
          .eq('business_id', businessId)
          .maybeSingle()

        const smsResult = await sendSmsViaElks({
          supabase,
          businessId,
          businessName: bizCfg?.business_name || null,
          to: phone,
          message,
          customerId,
          relatedId: projectId,
          messageType: 'review_request',
        })

        if (!smsResult.success) {
          return {
            action: 'review_request',
            sms_sent: false,
            error: smsResult.error || 'SMS kunde inte skickas',
            sms_status: smsResult.status,
          }
        }

        // Markera kunden så cron inte triggar igen inom 180d.
        // Non-blocking om UPDATE failar — SMS är redan ute, customer.flag
        // är spam-skydd. Logga warning men håll success-state.
        if (customerId) {
          const { error: updateErr } = await supabase
            .from('customer')
            .update({ review_request_sent_at: new Date().toISOString() })
            .eq('customer_id', customerId)
            .eq('business_id', businessId)

          if (updateErr) {
            console.warn('[review_request] customer.review_request_sent_at update failed (SMS already sent):', updateErr)
          }
        }

        return {
          action: 'review_request',
          sms_sent: true,
          sms_id: smsResult.smsId,
          elks_id: smsResult.elksId,
        }
      }

      case 'autopilot_package': {
        const packageData = approval.package_data
        if (!packageData?.actions) return { action: 'autopilot_package', skipped: 'no package_data' }

        const results: Record<string, unknown>[] = []
        const supabase = (await import('@/lib/supabase')).getServerSupabase()

        for (const act of packageData.actions as any[]) {
          // Kolla individuella overrides
          const override = actionOverrides?.[act.id]
          if (override === 'rejected') {
            results.push({ id: act.id, type: act.type, skipped: 'rejected' })
            continue
          }

          switch (act.type) {
            case 'project_info':
              results.push({ id: act.id, type: 'project_info', ok: true, info: true })
              break

            case 'booking_suggestion': {
              // Audit-4 Fix DEF (2026-06-02): cookie-forwarding
              const bookRes = await fetch(`${appUrl}/api/bookings`, {
                method: 'POST',
                headers: forwardHeaders(),
                body: JSON.stringify({
                  business_id: businessId,
                  customer_id: act.data.customer_id,
                  scheduled_start: act.data.scheduled_start,
                  scheduled_end: act.data.scheduled_end,
                  notes: act.data.notes || '',
                }),
              })
              const br = await classifyResponse(bookRes)
              results.push({ id: act.id, type: 'booking', ...br })
              break
            }

            case 'customer_sms': {
              // Audit-3 Fix A (2026-06-01)
              const to = act.data.to as string | undefined
              const message = act.data.message as string | undefined
              if (!to || !message) {
                results.push({ id: act.id, type: 'sms', ok: false, error: 'no to/message' })
                break
              }
              const r = await sendSms({
                to,
                message,
                customerId: (act.data.customer_id as string | undefined) || null,
                messageType: 'autopilot_customer_sms',
              })
              results.push({ id: act.id, type: 'sms', ok: r.sms_sent, error: r.error })
              break
            }

            case 'material_list': {
              const materials = act.data.materials as any[]
              if (materials?.length > 0 && act.data.project_id) {
                for (const mat of materials) {
                  await supabase.from('project_material').insert({
                    material_id: 'mat_' + Math.random().toString(36).substr(2, 9),
                    project_id: act.data.project_id,
                    business_id: businessId,
                    name: mat.name,
                    quantity: mat.quantity,
                    unit: mat.unit,
                    purchase_price: mat.unit_price || 0,
                  })
                }
              }
              results.push({ id: act.id, type: 'materials', ok: true, count: materials?.length || 0 })
              break
            }

            default:
              results.push({ id: act.id, type: act.type, skipped: 'unknown action type' })
          }
        }

        // Utfalls-hårdning: paketet hade tidigare inget aggregerat ok/error-
        // fält — även om ALLA sub-actions misslyckades klassades hela
        // approval-raden som 'success' (results-arrayen fångades aldrig av
        // classifyExecutionResult). Speglar sub-resultatens ok-fält uppåt.
        const anyFailed = results.some((r) => r.ok === false)
        return {
          action: 'autopilot_package',
          results,
          ok: !anyFailed,
          error: anyFailed ? 'En eller flera delåtgärder i paketet misslyckades' : undefined,
        }
      }

      case 'dispatch_suggestion': {
        const supabaseDispatch = (await import('@/lib/supabase')).getServerSupabase()
        const plDispatch = payload as any
        const memberId = plDispatch.member_id
        const memberName = plDispatch.member_name
        const ctxType = plDispatch.context_type
        const ctxId = plDispatch.context_id

        if (ctxType === 'booking' && ctxId) {
          await supabaseDispatch.from('booking').update({
            assigned_to: memberName,
            assigned_user_id: memberId,
          }).eq('booking_id', ctxId)
        } else if (ctxType === 'work_order' && ctxId) {
          await supabaseDispatch.from('work_orders').update({
            assigned_to: memberName,
          }).eq('id', ctxId)
        }

        return { action: 'dispatch_suggestion', assigned: memberName, context_type: ctxType }
      }

      case 'time_attestation': {
        const supabaseTime = (await import('@/lib/supabase')).getServerSupabase()
        const plTime = payload as any
        if (!plTime.checkin_id) return { action: 'time_attestation', skipped: 'no checkin_id' }

        // Approve the checkin via the approve API logic
        const minutes = plTime.duration_minutes || 0
        await supabaseTime.from('time_checkins').update({
          status: 'approved',
          approved_by: 'via godkännanden',
          approved_at: new Date().toISOString(),
          duration_minutes: minutes,
        }).eq('id', plTime.checkin_id)

        // Create time_entry
        const entryId = 'te_' + Math.random().toString(36).substr(2, 9)
        await supabaseTime.from('time_entry').insert({
          time_entry_id: entryId,
          business_id: businessId,
          project_id: plTime.project_id || null,
          description: `Incheckning ${plTime.checked_in_at ? new Date(plTime.checked_in_at).toLocaleDateString('sv-SE') : ''}${plTime.project_name ? ' · ' + plTime.project_name : ''}`,
          duration_minutes: minutes,
          work_date: plTime.checked_in_at?.split('T')[0] || new Date().toISOString().split('T')[0],
          is_billable: true,
        })

        return { action: 'time_attestation', time_entry_id: entryId, minutes }
      }

      case 'seasonal_campaign': {
        const supabase = (await import('@/lib/supabase')).getServerSupabase()
        const pl = payload as any
        const smsText = pl.sms_text || ''
        const customers = pl.customers || []

        if (customers.length === 0 || !smsText) {
          return { action: 'seasonal_campaign', skipped: 'no customers or sms text' }
        }

        // Skapa sms_campaign
        const campaignId = 'camp_' + Math.random().toString(36).substr(2, 9)
        await supabase.from('sms_campaign').insert({
          campaign_id: campaignId,
          business_id: businessId,
          name: `Säsong: ${pl.theme || pl.month_name}`,
          message: smsText,
          status: 'scheduled',
          scheduled_at: new Date().toISOString(),
          recipient_count: customers.length,
          campaign_type: 'broadcast',
        })

        // Skapa mottagare
        const recipients = customers.map((c: any) => ({
          campaign_id: campaignId,
          customer_id: c.customer_id,
          phone_number: c.phone_number,
          status: 'pending',
        }))
        await supabase.from('sms_campaign_recipient').insert(recipients)

        // Uppdatera seasonal_campaigns status
        if (pl.month && pl.year) {
          await supabase
            .from('seasonal_campaigns')
            .update({ status: 'approved' })
            .eq('business_id', businessId)
            .eq('year', pl.year)
            .eq('month', pl.month)
        }

        return { action: 'seasonal_campaign', campaign_id: campaignId, recipients: customers.length }
      }

      case 'proactive_care': {
        const pl = payload as any
        if (!pl.customer_phone || !pl.suggested_sms) {
          return { action: 'proactive_care', skipped: 'no phone or message' }
        }
        // Audit-3 Fix A (2026-06-01)
        const r = await sendSms({
          to: pl.customer_phone,
          message: pl.suggested_sms,
          customerId: pl.customer_id || null,
          relatedId: pl.project_id || null,
          messageType: 'proactive_care',
        })

        // Logga i v3_automation_logs
        const supabasePC = await getSupabase()
        await supabasePC.from('v3_automation_logs').insert({
          business_id: businessId,
          // Attribuera till agenten som föreslog (Hanna proaktiv säljmotor) så
          // den syns i per-agent-scoreboardet; null för icke-agent-flöden.
          agent_id: pl.agent || null,
          rule_name: 'proactive_customer_care',
          trigger_type: 'approval_executed',
          action_type: 'send_sms',
          status: r.sms_sent ? 'success' : 'failed',
          context: {
            customer_id: pl.customer_id,
            customer_name: pl.customer_name,
            project_id: pl.project_id,
            job_type: pl.job_type,
            suggested_service: pl.suggested_service,
          },
        })

        return {
          action: 'proactive_care',
          sms_sent: r.sms_sent,
          error: r.error,
          customer: pl.customer_name,
          suggested_service: pl.suggested_service,
        }
      }

      case 'warranty_followup': {
        const pl = payload as any
        if (!pl.customer_phone || !pl.suggested_sms) {
          return { action: 'warranty_followup', skipped: 'no phone or message' }
        }
        // Audit-3 Fix A (2026-06-01)
        const r = await sendSms({
          to: pl.customer_phone,
          message: pl.suggested_sms,
          customerId: pl.customer_id || null,
          relatedId: pl.project_id || null,
          messageType: 'warranty_followup',
        })

        // Logga i automation_logs
        const supabaseW = await getSupabase()
        await supabaseW.from('automation_logs').insert({
          business_id: businessId,
          rule_name: 'warranty_followup',
          trigger_type: 'approval_executed',
          status: r.sms_sent ? 'completed' : 'failed',
          input: { project_id: pl.project_id, customer_name: pl.customer_name },
          output: { sms_sent: r.sms_sent, error: r.error },
        })

        return { action: 'warranty_followup', sms_sent: r.sms_sent, error: r.error, customer: pl.customer_name }
      }

      case 'job_report': {
        const { approveJobReport } = await import('@/lib/job-report')
        const reportPayload = payload as any
        const result = await approveJobReport(businessId, reportPayload.projectId || '', reportPayload)
        return { action: 'job_report', ...result }
      }

      // ── V33 Matte approval types ──────────────────────────

      case 'propose_booking_times':
      case 'reschedule_request':
      case 'new_booking_request': {
        const pl = payload as any
        const message = pl.customer_reply_pending
          || (pl.available_slots?.length
            ? `Hej! Vi kan komma:\n${(pl.available_slots as any[]).map((s: any, i: number) => `${i + 1}. ${s.label}`).join('\n')}\nVilket passar bäst?`
            : null)

        if (!message || !pl.entity?.phone) {
          return { action: 'propose_booking_times', skipped: 'no message or phone' }
        }

        // Audit-3 Fix A (2026-06-01)
        const r = await sendSms({
          to: pl.entity.phone,
          message,
          customerId: pl.entity?.customerId || null,
          messageType: approval_type,
        })
        return {
          action: 'propose_booking_times',
          sms_sent: r.sms_sent,
          error: r.error,
          slots_count: pl.available_slots?.length || 0,
        }
      }

      case 'create_quote_draft':
      case 'quote_request':
      case 'quote_addition': {
        // Audit-4 Fix DEF (2026-06-02): cookie-forwarding
        const pl = payload as any
        const res = await fetch(`${appUrl}/api/quotes/ai-generate`, {
          method: 'POST',
          headers: forwardHeaders(),
          body: JSON.stringify({
            textDescription: pl.description || pl.job_description || pl.customer_reply_pending,
            customerId: pl.entity?.customerId,
            businessId,
          }),
        })
        const r = await classifyResponse(res)
        return { action: 'create_quote_draft', ...r }
      }

      case 'create_ata_draft': {
        // Audit-4 Fix DEF (2026-06-02): cookie-forwarding
        const pl = payload as any
        const res = await fetch(`${appUrl}/api/quotes/ai-generate`, {
          method: 'POST',
          headers: forwardHeaders(),
          body: JSON.stringify({
            textDescription: `ÄTA-tillägg: ${pl.description || ''}`,
            customerId: pl.entity?.customerId,
            businessId,
          }),
        })
        const r = await classifyResponse(res)
        return { action: 'create_ata_draft', ...r }
      }

      case 'send_matte_customer_reply': {
        const pl = payload as any
        const msg = pl.customer_reply_pending || pl.message
        if (!msg || !pl.entity?.phone) {
          return { action: 'send_matte_customer_reply', skipped: 'no message or phone' }
        }
        // Audit-3 Fix A (2026-06-01)
        const r = await sendSms({
          to: pl.entity.phone,
          message: msg,
          customerId: pl.entity?.customerId || null,
          messageType: 'matte_customer_reply',
        })
        return { action: 'send_matte_customer_reply', sms_sent: r.sms_sent, error: r.error }
      }

      case 'low_stock_alert': {
        return { action: 'low_stock_alert', acknowledged: true }
      }

      case 'four_eyes_quote': {
        const pl = payload as any
        if (!pl.quote_id) return { action: 'four_eyes_quote', skipped: 'no quote_id' }

        const supabase4e = (await import('@/lib/supabase')).getServerSupabase()

        // Återställ till draft — skaparen kan nu skicka
        await supabase4e
          .from('quotes')
          .update({ status: 'draft' })
          .eq('quote_id', pl.quote_id)

        // Push-notis till skaparen. Fire-and-forget — fördröjer inte
        // approval-response, men loggar fel så vi kan upptäcka push-issues
        // (TD: bygg push-fail-monitoring-cron eller Sentry-integration).
        // Audit-4 Fix H (2026-06-02): ersatte `.catch(() => {})` med loggat
        // catch. /api/push/send har ingen auth-check, så cookie-forwarding
        // behövs ej här.
        fetch(`${appUrl}/api/push/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_id: businessId,
            title: 'Offert godkänd',
            body: `Din offert på ${(pl.quote_total || 0).toLocaleString('sv-SE')} kr har godkänts — du kan nu skicka den`,
            url: `/dashboard/quotes/${pl.quote_id}`,
          }),
        })
          .then(async (r) => {
            if (!r.ok) {
              const errText = await r.text().catch(() => '<unparsable>')
              console.error(`[four_eyes_quote/push] HTTP ${r.status} from /api/push/send:`, errText)
            }
          })
          .catch((err) => {
            console.error('[four_eyes_quote/push] fetch failed:', err)
          })

        return { action: 'four_eyes_quote', ok: true, quote_id: pl.quote_id }
      }

      case 'propose_site_visit': {
        const pl = payload as any
        if (!pl.entity?.phone) return { action: 'propose_site_visit', skipped: 'no phone' }

        // Hämta lediga tider
        let slotsText = ''
        try {
          const { getAvailableSlots } = await import('@/lib/matte/calendar-slots')
          const slots = await getAvailableSlots(businessId, 1)
          if (slots.length > 0) {
            slotsText = slots.map((s: any, i: number) => `${i + 1}) ${s.label}`).join('\n')
          }
        } catch { /* no calendar */ }

        const message = slotsText
          ? `Hej ${pl.entity?.customerName || ''}! Vi skulle gärna komma och titta på jobbet. Passar någon av dessa tider?\n${slotsText}\nSvara med 1, 2 eller 3. //${pl.businessName || ''}`
          : pl.customer_reply_pending || `Hej! Vi vill gärna boka in ett platsbesök. Vilken tid passar dig? //${pl.businessName || ''}`

        // Audit-3 Fix A (2026-06-01)
        const r = await sendSms({
          to: pl.entity.phone,
          message,
          customerId: pl.entity?.customerId || null,
          messageType: 'propose_site_visit',
        })
        return { action: 'propose_site_visit', sms_sent: r.sms_sent, error: r.error }
      }

      case 'four_eyes_project_close': {
        const pl = payload as any
        if (!pl.project_id) return { action: 'four_eyes_project_close', skipped: 'no project_id' }

        const supabase4p = (await import('@/lib/supabase')).getServerSupabase()

        await supabase4p
          .from('project')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('project_id', pl.project_id)

        // Fire job_completed
        try {
          const { fireEvent } = await import('@/lib/automation-engine')
          const { data: proj } = await supabase4p
            .from('project')
            .select('customer_id, name')
            .eq('project_id', pl.project_id)
            .single()

          if (proj) {
            await fireEvent(supabase4p, 'job_completed', businessId, {
              project_id: pl.project_id,
              customer_id: proj.customer_id,
              project_name: proj.name,
            })
          }
        } catch { /* non-blocking */ }

        return { action: 'four_eyes_project_close', ok: true, project_id: pl.project_id }
      }

      case 'price_adjustment': {
        // Uppdatera pris i prislista
        const pl = payload as any
        // Utfalls-hårdning: saknades item_id/suggested_price gjorde caset
        // ingenting men returnerade ändå ok:true — dolt no-op klassat som
        // success. Returnera 'skipped' istället så det syns i utfallet.
        if (!pl.item_id || !pl.suggested_price) {
          return { action: 'price_adjustment', skipped: 'no item_id or suggested_price' }
        }
        const supabasePa = (await import('@/lib/supabase')).getServerSupabase()
        const { error: priceUpdateError } = await supabasePa.from('price_list').update({
          unit_price: pl.suggested_price,
        }).eq('id', pl.item_id).eq('business_id', businessId)
        if (priceUpdateError) {
          return { action: 'price_adjustment', ok: false, error: priceUpdateError.message }
        }
        return { action: 'price_adjustment', ok: true }
      }

      case 'profitability_warning': {
        // Godkänn = bekräfta att hantverkaren är medveten
        return { action: 'profitability_warning', acknowledged: true }
      }

      case 'customer_reactivation': {
        const pl = payload as any
        if (pl.customer_phone && pl.suggested_sms) {
          // Audit-3 Fix A (2026-06-01)
          const r = await sendSms({
            to: pl.customer_phone,
            message: pl.suggested_sms,
            customerId: pl.customer_id || null,
            messageType: 'customer_reactivation',
          })
          return { action: 'customer_reactivation', sms_sent: r.sms_sent, error: r.error }
        }
        return { action: 'customer_reactivation', skipped: 'no phone or message' }
      }

      case 'create_invoice_from_report': {
        // Navigerar — returnerar bara bekräftelse
        return { action: 'create_invoice_from_report', acknowledged: true, navigate_to: `/dashboard/invoices` }
      }

      case 'review_auto_invoice': {
        // Godkänn = skicka faktura till kund.
        // Audit-4 Fix DEF (2026-06-02): cookie-forwarding ersätter död
        // `_internal_business_id`-workaround (target-route har aldrig
        // läst det fältet → har failat 401 silent sedan epok).
        const invoiceId = (payload as any)?.invoice_id
        if (!invoiceId) return { action: 'review_auto_invoice', error: 'invoice_id saknas' }

        const sendRes = await fetch(`${appUrl}/api/invoices/send`, {
          method: 'POST',
          headers: forwardHeaders(),
          body: JSON.stringify({
            invoice_id: invoiceId,
            send_email: true,
            send_sms: true,
          }),
        })
        const r = await classifyResponse(sendRes)
        return {
          action: 'review_auto_invoice',
          invoice_id: invoiceId,
          navigate_to: `/dashboard/invoices/${invoiceId}`,
          ...r,
        }
      }

      case 'lead_review': {
        // Email-forwarding-flöde (2026-05-28): leaden skapades av
        // /api/email/inbound i status='pending_review' utan deal.
        // Vid approve aktiverar vi den via Golden Path-helpern —
        // status='new', deal skapas i pipeline, SMS + fireEvent.
        const leadId = payload.lead_id as string | undefined
        if (!leadId) return { action: 'lead_review', error: 'payload.lead_id saknas' }

        const { activatePendingLead } = await import('@/lib/leads/golden-path')
        try {
          const result = await activatePendingLead(
            leadId,
            (await import('@/lib/supabase')).getServerSupabase(),
          )
          if (result.dealError) {
            console.error('[approvals/lead_review] Deal skapades inte:', result.dealError)
          }
          return {
            action: 'lead_review',
            lead_id: leadId,
            deal_id: result.dealId,
            deal_error: result.dealError ?? null,
            // Utfalls-hårdning: deal_error surfades tidigare bara under sitt
            // eget fältnamn — classifyExecutionResult (och UI:t) läser
            // 'error', så en misslyckad deal-skapelse klassades som success.
            error: result.dealError ?? undefined,
            navigate_to: result.dealId ? `/dashboard/pipeline` : `/dashboard/leads/${leadId}`,
          }
        } catch (err: any) {
          return { action: 'lead_review', error: err.message }
        }
      }

      case 'invoice_reminder': {
        // Fakturapåminnelse gatad genom godkännande (cron/send-reminders skapar
        // denna för företag som ännu inte förtjänat autonomi). Vid godkännande
        // levereras påminnelsen via SAMMA delade helper som den autonoma
        // cron-vägen — avgift/ränta muteras BARA här, aldrig vid skapandet.
        const pl = payload as any
        const delivery = pl.delivery
        if (!delivery?.invoiceId) {
          return { action: 'invoice_reminder', error: 'payload saknar delivery-data' }
        }
        const { deliverInvoiceReminder } = await import('@/lib/invoice-reminder-send')
        const supabaseIR = getServerSupabase()
        const r = await deliverInvoiceReminder(supabaseIR, delivery)
        return {
          action: 'invoice_reminder',
          sent: !r.skipped,
          sms_sent: r.smsSent,
          email_sent: r.emailSent,
          fee_added: r.feeAdded,
          interest_added: r.interestAdded,
        }
      }

      case 'automation': {
        // En v3-automationsregel med requires_approval skapar denna approval och
        // lägger rule_action_type/rule_action_config i payloaden. Utan detta case
        // föll den till default → no-op (åtgärden utfördes ALDRIG vid godkännande).
        const pl = payload as any
        const actionType = pl.rule_action_type
        if (!actionType) {
          return { action: 'automation', acknowledged: true, note: 'Ingen åtgärd i payload' }
        }
        const { runApprovedAutomationAction } = await import('@/lib/automation-engine')
        const supabaseAuto = getServerSupabase()
        const res = await runApprovedAutomationAction(
          supabaseAuto, businessId, actionType, (pl.rule_action_config || {}) as Record<string, unknown>, pl,
        )
        return { action: 'automation', action_type: actionType, ...res }
      }

      default: {
        // Smart fallback: om payload har SMS-data → skicka SMS
        const pl = payload as any
        const smsMessage = pl.message || pl.suggested_sms || pl.sms_text
        const smsTo = pl.to || pl.customer_phone || pl.entity?.phone

        if (smsMessage && smsTo) {
          // Audit-3 Fix A (2026-06-01)
          const r = await sendSms({
            to: smsTo,
            message: smsMessage,
            customerId: pl.customer_id || pl.entity?.customerId || null,
            messageType: approval_type,
          })
          return { action: approval_type, sms_sent: r.sms_sent, error: r.error, fallback: true }
        }

        // Om inget SMS-data → bara bekräfta (acknowledgement)
        return { action: approval_type, acknowledged: true, note: 'Godkänt utan specifik åtgärd' }
      }
    }
  } catch (err: any) {
    return { action: approval_type, error: err.message }
  }
}
