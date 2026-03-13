import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { getServerSupabase } from '@/lib/supabase'
import { getGoogleAuthClient, ensureValidToken } from '@/lib/google-calendar'
import { isLikelyLead, parseLeadFromEmail } from '@/lib/gmail-lead-detection'
import { downloadAndSaveAttachments } from '@/lib/gmail-attachments'
import { getNextCustomerNumber, getNextProjectNumber } from '@/lib/numbering'

/**
 * Cron: GET /api/cron/gmail-lead-import
 * Runs every 15 minutes (configured in vercel.json / cron service).
 * For each business with Gmail lead import enabled:
 *   1. Fetch unread emails from the last 20 min (with buffer)
 *   2. Haiku first-pass: is this a lead?
 *   3. Sonnet full parse if yes
 *   4. Dedup customer on phone/email, create if new
 *   5. Create lead in pipeline + lead_activity
 *   6. Mark Gmail message as read + label
 *   7. Record in gmail_imported_message for idempotency
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()

  // Fetch all businesses with Gmail lead import enabled
  const { data: connections, error: connError } = await supabase
    .from('calendar_connection')
    .select(`
      id, business_id, access_token, refresh_token, token_expires_at,
      gmail_scope_granted, gmail_lead_import_enabled,
      gmail_lead_approved_senders, gmail_lead_blocked_senders,
      gmail_lead_last_import_at
    `)
    .eq('gmail_scope_granted', true)
    .eq('gmail_lead_import_enabled', true)
    .not('refresh_token', 'is', null)

  if (connError) {
    console.error('[gmail-lead-import] Failed to fetch connections:', connError)
    return NextResponse.json({ error: connError.message }, { status: 500 })
  }

  if (!connections || connections.length === 0) {
    return NextResponse.json({ success: true, processed: 0, message: 'Inga aktiva Gmail lead-importer' })
  }

  const results: Array<{ businessId: string; imported: number; skipped: number; errors: number }> = []

  for (const conn of connections) {
    const businessId = conn.business_id
    let imported = 0
    let skipped = 0
    let errors = 0

    try {
      // Ensure valid token
      const tokenResult = await ensureValidToken({
        access_token: conn.access_token,
        refresh_token: conn.refresh_token,
        token_expires_at: conn.token_expires_at,
      })

      if (!tokenResult) {
        console.error(`[gmail-lead-import] Token refresh failed for business ${businessId}`)
        errors++
        continue
      }

      // Update token in DB if refreshed
      if (tokenResult.access_token !== conn.access_token) {
        await supabase
          .from('calendar_connection')
          .update({
            access_token: tokenResult.access_token,
            token_expires_at: new Date(tokenResult.expiry_date).toISOString(),
          })
          .eq('id', conn.id)
      }

      // Build Gmail client
      const authClient = getGoogleAuthClient()
      authClient.setCredentials({ access_token: tokenResult.access_token })
      const gmail = google.gmail({ version: 'v1', auth: authClient })

      // Search: unread emails from last 20 min (slight buffer over 15 min cron)
      const afterTime = Math.floor((Date.now() - 20 * 60 * 1000) / 1000)
      const { data: listData } = await gmail.users.messages.list({
        userId: 'me',
        q: `is:unread in:inbox after:${afterTime}`,
        maxResults: 20,
      })

      const messages = listData.messages || []
      if (messages.length === 0) {
        results.push({ businessId, imported, skipped, errors })
        continue
      }

      // Parse sender filters
      const approvedSenders = (conn.gmail_lead_approved_senders || '')
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean)
      const blockedSenders = (conn.gmail_lead_blocked_senders || '')
        .split(',')
        .map((s: string) => s.trim())
        .filter(Boolean)

      for (const msg of messages) {
        if (!msg.id) continue

        // Idempotency check
        const { data: existing } = await supabase
          .from('gmail_imported_message')
          .select('id')
          .eq('id', msg.id)
          .eq('business_id', businessId)
          .maybeSingle()

        if (existing) {
          skipped++
          continue
        }

        try {
          // Fetch full message
          const { data: fullMsg } = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'full',
          })

          if (!fullMsg) {
            skipped++
            continue
          }

          const headers = fullMsg.payload?.headers || []
          const getHeader = (name: string) =>
            headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || ''

          const subject = getHeader('Subject') || '(Inget ämne)'
          const from = getHeader('From')
          const date = getHeader('Date')

          // Extract body text
          let bodyText = ''
          const extractBody = (payload: any): void => {
            if (!payload) return
            if (payload.mimeType === 'text/plain' && payload.body?.data) {
              bodyText += Buffer.from(payload.body.data, 'base64').toString('utf-8')
            }
            if (payload.parts) {
              for (const part of payload.parts) extractBody(part)
            }
          }
          extractBody(fullMsg.payload)

          if (!bodyText && fullMsg.snippet) {
            bodyText = fullMsg.snippet
          }

          const emailInput = { subject, from, body: bodyText, date }

          // Stage 1: Haiku first-pass
          const likelyLead = await isLikelyLead(emailInput, approvedSenders, blockedSenders)

          // Record in idempotency table (even non-leads, so we never re-process)
          await supabase.from('gmail_imported_message').insert({
            id: msg.id,
            business_id: businessId,
            was_lead: likelyLead,
            lead_id: null,
          })

          if (!likelyLead) {
            // Mark as read so it doesn't appear in next run's unread query
            await gmail.users.messages.modify({
              userId: 'me',
              id: msg.id,
              requestBody: { removeLabelIds: [] }, // don't strip UNREAD — not our email
            }).catch(() => {})
            skipped++
            continue
          }

          // Stage 2: Sonnet full parse
          const leadData = await parseLeadFromEmail(emailInput)

          // Dedup customer by email or phone
          let customerId: string | null = null

          if (leadData.email || leadData.phone) {
            const conditions: string[] = []
            if (leadData.email) conditions.push(`email.eq.${leadData.email}`)
            if (leadData.phone) conditions.push(`phone_number.eq.${leadData.phone}`)

            const { data: existingCustomer } = await supabase
              .from('customer')
              .select('customer_id')
              .eq('business_id', businessId)
              .or(conditions.join(','))
              .maybeSingle()

            customerId = existingCustomer?.customer_id || null
          }

          // Create customer if new
          if (!customerId && leadData.name) {
            const customerNumber = await getNextCustomerNumber(supabase, businessId)
            const { data: newCustomer } = await supabase
              .from('customer')
              .insert({
                business_id: businessId,
                name: leadData.name,
                email: leadData.email || null,
                phone_number: leadData.phone || null,
                address_line: leadData.address || null,
                job_status: 'lead',
                customer_number: customerNumber,
              })
              .select('customer_id')
              .single()

            customerId = newCustomer?.customer_id || null
          }

          // Create lead
          const leadTitle = leadData.job_type
            ? `${leadData.job_type}${leadData.name ? ` – ${leadData.name}` : ''}`
            : subject.slice(0, 80)

          const projectNumber = await getNextProjectNumber(supabase, businessId)
          const { data: newLead } = await supabase
            .from('leads')
            .insert({
              business_id: businessId,
              customer_id: customerId,
              name: leadData.name || leadData.email || 'Okänd',
              phone: leadData.phone,
              email: leadData.email,
              source: 'email_lead',
              status: 'new',
              job_type: leadData.job_type,
              urgency: leadData.urgency,
              estimated_value: leadData.estimated_value,
              project_number: projectNumber,
              notes: leadData.description
                ? `${leadData.description}\n\n---\nImporterad från Gmail: ${subject}`
                : `Importerad från Gmail: ${subject}`,
            })
            .select('lead_id')
            .single()

          const leadId = newLead?.lead_id || null

          // Log lead activity
          if (leadId) {
            await supabase.from('lead_activities').insert({
              lead_id: leadId,
              business_id: businessId,
              activity_type: 'created',
              description: `Lead skapad automatiskt från Gmail-meddelande: "${subject}"`,
            })
          }

          // Download and save attachments
          if (fullMsg.payload) {
            try {
              const savedAttachments = await downloadAndSaveAttachments(
                gmail,
                msg.id,
                fullMsg.payload,
                customerId,
                leadId,
                businessId
              )
              if (savedAttachments.length > 0 && leadId) {
                const fileList = savedAttachments.map((a) => `• ${a.filename}`).join('\n')
                await supabase.from('lead_activities').insert({
                  lead_id: leadId,
                  business_id: businessId,
                  activity_type: 'note',
                  description: `${savedAttachments.length} bilaga(r) hämtades automatiskt från Gmail:\n${fileList}`,
                })
              }
            } catch (attErr) {
              console.error(`[gmail-lead-import] Attachment error for message ${msg.id}:`, attErr)
              // non-blocking — lead was still created
            }
          }

          // Update idempotency record with lead_id
          if (leadId) {
            await supabase
              .from('gmail_imported_message')
              .update({ lead_id: leadId })
              .eq('id', msg.id)
              .eq('business_id', businessId)
          }

          // Mark Gmail message as read
          await gmail.users.messages.modify({
            userId: 'me',
            id: msg.id,
            requestBody: { removeLabelIds: ['UNREAD'] },
          }).catch(() => {})

          // Trigger agent notification
          try {
            const { triggerAgentInternal } = await import('@/lib/agent-trigger')
            const customerName = leadData.name || leadData.email || 'Okänd'
            const jobInfo = leadData.job_type ? `om ${leadData.job_type}` : ''
            await triggerAgentInternal(
              businessId,
              'gmail_lead_imported',
              {
                lead_id: leadId,
                customer_id: customerId,
                customer_name: customerName,
                job_info: jobInfo,
                description: leadData.description || '',
                source: 'gmail_lead_import',
              },
              `gmail-lead-${msg.id}`
            )
          } catch { /* non-blocking */ }

          imported++
        } catch (msgErr) {
          console.error(`[gmail-lead-import] Error processing message ${msg.id}:`, msgErr)
          errors++
        }
      }

      // Update last import timestamp
      await supabase
        .from('calendar_connection')
        .update({ gmail_lead_last_import_at: new Date().toISOString() })
        .eq('id', conn.id)

    } catch (bizErr) {
      console.error(`[gmail-lead-import] Business ${businessId} error:`, bizErr)
      errors++
    }

    results.push({ businessId, imported, skipped, errors })
  }

  const totalImported = results.reduce((sum, r) => sum + r.imported, 0)
  console.log(`[gmail-lead-import] Done. Total imported: ${totalImported}`, results)

  return NextResponse.json({
    success: true,
    total_imported: totalImported,
    businesses: results,
  })
}
