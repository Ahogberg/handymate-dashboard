import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { sendApprovalPush } from '@/lib/notifications/approval-push'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/review-requests
 *
 * Körs dagligen 09 UTC. Skapar pending_approvals för projekt som
 * blev completed för 7 dagar sedan (±12h fönster) så Hanna kan
 * skicka recensionsbegäran via SMS efter manuell approval.
 *
 * Pre-flight per business:
 * - business_config.google_place_id måste vara satt + börja med 'ChIJ'
 *   (om inte: skippa, kan inte bygga giltig review-länk)
 *
 * Pre-flight per kund:
 * - customer.phone_number != NULL (inget SMS möjligt utan nummer)
 * - customer.review_request_sent_at IS NULL OR < (today - 180d)
 *   (undvik spam även om kunden haft flera projekt)
 * - Inget misslyckat SMS i sms_log till samma phone_to senaste 24h
 *   (vänta ut tillfällig nätstörning innan vi ber Christoffer godkänna)
 *
 * Skapar approval med:
 * - approval_type: 'review_request'
 * - risk_level: 'low'
 * - expires_at: NOW() + 14 dagar (auto-utgår om Christoffer ignorerar)
 *
 * IDEMPOTENT: kollar att det inte redan finns en pending-approval för
 * samma project_id innan INSERT. Om cron rullar två gånger samma dag
 * pga retry skapas ingen dubblett.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000)
  const windowStart = new Date(sevenDaysAgo.getTime() - 12 * 3600000)
  const windowEnd = new Date(sevenDaysAgo.getTime() + 12 * 3600000)
  const oneEightyDaysAgo = new Date(now.getTime() - 180 * 86400000)
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 3600000)

  // ── 1. Businesses med konfigurerad google_place_id ──────────
  const { data: businesses, error: bizError } = await supabase
    .from('business_config')
    .select('business_id, business_name, google_place_id')
    .not('google_place_id', 'is', null)

  if (bizError) {
    console.error('[cron/review-requests] business_config error:', bizError)
    return NextResponse.json(
      { error: bizError.message, code: bizError.code, stage: 'business_config' },
      { status: 500 },
    )
  }

  let approvalsCreated = 0
  let projectsScanned = 0
  let skipped = {
    invalid_place_id: 0,
    no_customer: 0,
    no_phone: 0,
    recent_request: 0,
    recent_failed_sms: 0,
    already_pending: 0,
  }
  const errors: { stage: string; message: string; business_id?: string; project_id?: string }[] = []

  for (const biz of businesses || []) {
    // Pre-flight: google_place_id måste börja med 'ChIJ' (mjuk validering).
    // Otherwise kan vi inte bygga giltig länk → bättre att skippa än att
    // skapa approvals som inte resulterar i fungerande SMS.
    const placeId = (biz.google_place_id || '').trim()
    if (placeId.length < 10 || !placeId.startsWith('ChIJ')) {
      skipped.invalid_place_id++
      console.warn('[cron/review-requests] skipping business with invalid google_place_id:', {
        business_id: biz.business_id, place_id_prefix: placeId.slice(0, 8),
      })
      continue
    }

    // ── 2. Projekt med completed_at i ±12h-fönstret ────────────
    const { data: projects, error: projectsError } = await supabase
      .from('project')
      .select('project_id, name, customer_id, completed_at')
      .eq('business_id', biz.business_id)
      .eq('status', 'completed')
      .gte('completed_at', windowStart.toISOString())
      .lte('completed_at', windowEnd.toISOString())

    if (projectsError) {
      console.error('[cron/review-requests] project query error:', {
        business_id: biz.business_id, error: projectsError,
      })
      errors.push({
        stage: 'project_query', message: projectsError.message, business_id: biz.business_id,
      })
      continue
    }

    for (const project of projects || []) {
      projectsScanned++

      if (!project.customer_id) {
        skipped.no_customer++
        continue
      }

      // ── 3. Customer + dedup-checkar ──────────────────────────
      const { data: customer, error: customerError } = await supabase
        .from('customer')
        .select('customer_id, name, phone_number, review_request_sent_at')
        .eq('customer_id', project.customer_id)
        .eq('business_id', biz.business_id)
        .maybeSingle()

      if (customerError) {
        errors.push({
          stage: 'customer_query', message: customerError.message,
          business_id: biz.business_id, project_id: project.project_id,
        })
        continue
      }

      if (!customer?.phone_number) {
        skipped.no_phone++
        continue
      }

      if (customer.review_request_sent_at && new Date(customer.review_request_sent_at) > oneEightyDaysAgo) {
        skipped.recent_request++
        continue
      }

      // Failed SMS-check: skippa om vi senaste 24h har failat skicka till denna phone
      const { data: recentFailed } = await supabase
        .from('sms_log')
        .select('sms_id')
        .eq('business_id', biz.business_id)
        .eq('phone_to', customer.phone_number)
        .eq('status', 'failed')
        .gte('created_at', twentyFourHoursAgo.toISOString())
        .limit(1)

      if ((recentFailed || []).length > 0) {
        skipped.recent_failed_sms++
        continue
      }

      // Idempotens: finns redan pending approval för detta projekt?
      const { data: existingApproval } = await supabase
        .from('pending_approvals')
        .select('id')
        .eq('business_id', biz.business_id)
        .eq('approval_type', 'review_request')
        .eq('status', 'pending')
        .contains('payload', { project_id: project.project_id })
        .limit(1)

      if ((existingApproval || []).length > 0) {
        skipped.already_pending++
        continue
      }

      // ── 4. Bygg SMS-text + payload ────────────────────────────
      const reviewUrl = `https://search.google.com/local/writereview?placeid=${placeId}`
      const businessName = (biz.business_name || '').trim() || 'oss'
      const firstName = customer.name ? customer.name.split(' ')[0] : ''
      const greeting = firstName ? `Hej ${firstName}!` : 'Hej!'
      const projectName = project.name || 'projektet'

      // Tecken-budget: 160 tecken för 1 SMS. Kort variant först.
      let smsText = `${greeting} Tack för förtroendet med ${projectName}. Skulle du vilja dela din upplevelse? Det hjälper oss enormt: ${reviewUrl} /${businessName}`

      // Fallback om för långt: korta ner project-referensen
      if (smsText.length > 160) {
        smsText = `${greeting} Tack för förtroendet! Skulle du vilja dela din upplevelse? ${reviewUrl} /${businessName}`
      }
      // Sista utväg: minimal
      if (smsText.length > 160) {
        smsText = `${greeting} Skulle du vilja recensera oss? ${reviewUrl}`
      }

      const expiresAt = new Date(now.getTime() + 14 * 86400000)

      const reviewPayload = {
        project_id: project.project_id,
        project_name: projectName,
        completed_at: project.completed_at,
        customer_id: customer.customer_id,
        customer_name: customer.name,
        customer_phone: customer.phone_number,
        google_place_id: placeId,
        review_url: reviewUrl,
        suggested_sms_text: smsText,
        // Agent-routing för approval-UI: Hanna äger detta
        routed_agent: 'hanna',
        // Behövs av approve-endpoint för att skicka via sendSmsViaElks:
        to: customer.phone_number,
        message: smsText,
      }

      const { error: insertError } = await supabase
        .from('pending_approvals')
        .insert({
          business_id: biz.business_id,
          approval_type: 'review_request',
          title: `Be ${firstName || 'kunden'} om recension`,
          description: `Projektet "${projectName}" slutfördes ${new Date(project.completed_at).toLocaleDateString('sv-SE')}. Hanna har förberett ett SMS — godkänn för att skicka.`,
          payload: reviewPayload,
          status: 'pending',
          risk_level: 'low',
          expires_at: expiresAt.toISOString(),
        })

      if (insertError) {
        errors.push({
          stage: 'approval_insert', message: insertError.message,
          business_id: biz.business_id, project_id: project.project_id,
        })
        continue
      }

      approvalsCreated++

      // Push-notis (fire-and-forget, helpern loggar fel internt).
      // Mobile-tap → /approvals?filter=review_request enligt template
      // i lib/notifications/approval-push.ts.
      void sendApprovalPush({
        business_id: biz.business_id,
        approval_type: 'review_request',
        payload: reviewPayload,
      })

      // Logga till v3_automation_logs (best-effort, non-blocking)
      try {
        await supabase.from('v3_automation_logs').insert({
          business_id: biz.business_id,
          rule_name: 'review_request_cron',
          action_type: 'create_approval',
          status: 'success',
          metadata: {
            project_id: project.project_id,
            customer_id: customer.customer_id,
          },
        })
      } catch (logErr) {
        console.warn('[cron/review-requests] automation_log insert failed (non-blocking):', logErr)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    businesses_scanned: businesses?.length || 0,
    projects_scanned: projectsScanned,
    approvals_created: approvalsCreated,
    skipped,
    errors: errors.slice(0, 20), // skapa inte response-blob om många errors
    total_errors: errors.length,
  })
}
