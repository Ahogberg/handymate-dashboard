import type { SupabaseClient } from '@supabase/supabase-js'
import type { PaymentEffect } from './apply-payment'

// Extracted status-route behavior; only selects one durable effect in kernel mode.
export async function runLegacyPaymentThanks(supabase:SupabaseClient,business:{business_id:string},invoice:Record<string,any>,invoiceId:string,only?:'thanks'|'review'):Promise<PaymentEffect> {
      try {
        const customerPhone = (invoice as any)?.customer?.phone_number
        const customerName = (invoice as any)?.customer?.name?.split(' ')[0] || ''
        if (customerPhone) {
          const { data: config } = await supabase
            .from('business_config')
            .select('business_name, google_review_url, review_request_enabled, review_request_delay_days')
            .eq('business_id', business.business_id)
            .single()

          const bizName = config?.business_name || 'Vi'
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

          // Tack-SMS (alltid). Etapp 0 (2026-08-27): gick tidigare via den
          // sessions-grindade /api/sms/send utan cookie → 401 — tack-SMS:et
          // har aldrig nått en kund. Nu strypunkten (STOPP/kvot/logg).
          if (only !== 'review') {
          const { sendSmsViaElks } = await import('@/lib/sms-send')
          const tack = await sendSmsViaElks({
            supabase,
            businessId: business.business_id,
            businessName: bizName,
            to: customerPhone,
            message: `Tack ${customerName}! Vi har mottagit din betalning. Det var ett nöje att hjälpa dig — hör av dig om du behöver mer hjälp! // ${bizName}`,
            customerId: invoice.customer_id ?? null,
            relatedId: invoiceId,
            messageType: 'invoice_paid_thanks',
            recipient: 'customer',
            purpose: 'transactional',
          })
          if (!tack.success) console.error('[invoice status] tack-SMS misslyckades (non-blocking):', tack.error)

          if (only === 'thanks') return {effect:'invoice_paid_thanks',status:tack.success?'succeeded':'failed',message:tack.error}
          }

          // Recensionsförfrågan med Google Reviews-länk (om aktiverad).
          //
          // Buggfix 2026-08-10: payloaden byggdes tidigare UTAN `to`/`message`
          // — exekveringscaset (app/api/approvals/[id]/route.ts, case
          // 'scheduled_review_request') läser just de fälten, så
          // godkännandet failade tyst med "payload saknar to eller message"
          // så fort hantverkaren klickade Godkänn. Kanonisk form nu, samma
          // som cronens (app/api/cron/review-requests/route.ts).
          if (config?.review_request_enabled !== false && config?.google_review_url && invoice.customer_id) {
            // 180-dagarsspärr (review_request_sent_at) — samma spärr som
            // cronen respekterar. Utan den kan denna faktura-triggade väg
            // och cronen be samma kund om recension två gånger.
            const { data: customerReview } = await supabase
              .from('customer')
              .select('review_request_sent_at')
              .eq('customer_id', invoice.customer_id)
              .eq('business_id', business.business_id)
              .maybeSingle()
            const reviewSentAt = customerReview?.review_request_sent_at as string | null | undefined
            const askedRecently = !!reviewSentAt
              && new Date(reviewSentAt) > new Date(Date.now() - 180 * 24 * 3600000)

            if (!askedRecently) {
              const delayDays = config.review_request_delay_days || 3
              const delayMs = delayDays * 24 * 60 * 60 * 1000

              // Schemalägg review-SMS — lagra i pending_approvals som scheduled task
              const scheduledAt = new Date(Date.now() + delayMs).toISOString()
              const { buildReviewRequestMessage } = await import('@/lib/notifications/review-request-message')
              const message = buildReviewRequestMessage({
                customerName,
                businessName: bizName,
                reviewUrl: config.google_review_url,
              })
              const scheduled = await supabase.from('pending_approvals').insert({
                id: `review_${invoiceId}_${Date.now()}`,
                business_id: business.business_id,
                approval_type: 'scheduled_review_request',
                title: `Skicka recensionsförfrågan till ${customerName || 'kund'}`,
                description: `Schemalagd ${delayDays} dagar efter betalning`,
                payload: {
                  customer_id: invoice.customer_id,
                  customer_phone: customerPhone,
                  customer_name: customerName,
                  google_review_url: config.google_review_url,
                  business_name: bizName,
                  invoice_id: invoiceId,
                  to: customerPhone,
                  message,
                  agent_id: 'hanna',
                },
                status: 'pending',
                risk_level: 'low',
                expires_at: scheduledAt,
              })
              if (only === 'review') return {effect:'review_request_schedule',status:scheduled.error?'failed':'succeeded',message:scheduled.error?.message}
            }
          }
        }
      } catch (err) {
        if (only) return {effect:only === 'thanks'?'invoice_paid_thanks':'review_request_schedule',status:'failed',message:String(err)}
        console.error('[invoice status] Golden Path tack-SMS/recensionsförfrågan failed (non-blocking):', invoiceId, err)
      }
return {effect:only==='thanks'?'invoice_paid_thanks':'review_request_schedule',status:'skipped'}
}
export const sendPaymentThanks=(sb:SupabaseClient,biz:string,invoice:Record<string,any>,id:string)=>runLegacyPaymentThanks(sb,{business_id:biz},invoice,id,'thanks')
export const scheduleReviewRequest=(sb:SupabaseClient,biz:string,invoice:Record<string,any>,id:string)=>runLegacyPaymentThanks(sb,{business_id:biz},invoice,id,'review')
