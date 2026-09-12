import { approvalArtifactId } from './artifact-write'
import { timeProposalFields, timeProposalMatches } from './time-proposal'
import { normalizeDueDateIso } from '@/lib/customer-facts/build-card'
import { automationSmsText } from './automation-message'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildApprovalReview, type ApprovalReview } from './review-contract'
import { classify } from './action-contract'
import { rejectionEffect } from './receipt'
import type { ReviewedDocument } from './document-delivery'
import { withApprovalEvidence } from './explainability'

export interface PreparedApprovalReview {
  review: ApprovalReview
  snapshot: Record<string, unknown>
  document?: ReviewedDocument
  executionPayload?: Record<string, unknown>
  executionEvidence?: Record<string, unknown>
}
/** Read-only preparation. Each target lookup is explicitly tenant-scoped.
 * Live values are part of the signed review, never silently substituted later.
 */
async function prepareApprovalReviewInternal(db: SupabaseClient, businessId: string,
  approval: { id: string; approval_type: string; title?: string; description?: string; payload?: any; package_data?: any; created_at?: string },
  body: Record<string, any>,
): Promise<PreparedApprovalReview | undefined> {
  const type = approval.approval_type
  const action = body.action === 'preview' ? body.decision_action : body.action
  if (action === 'snooze') return
  const p = action === 'edit' ? { ...approval.payload, ...body.edited_payload, edited: true } : { ...approval.payload }
  const snapshot: Record<string, unknown> = {}
  let verifiedCustomer: Record<string, any> | null = null
  const r: ApprovalReview = { title: approval.title || 'Granska ärendet', effect: '', confirmLabel: null, messages: [], details: [] }
  const detail = (label: string, value: unknown) => {
    if (typeof value === 'string' && value.trim() || typeof value === 'number') r.details!.push({ label, text: String(value) })
  }
  const list = (label: string, values: unknown) => {
    if (!Array.isArray(values)) return
    values.forEach((v, index) => detail(`${label} ${index + 1}`, typeof v === 'string' ? v : v?.text || v?.title || v?.label || v?.name || v?.measure))
  }
  const complete = (effect: string, label: string) => { r.effect = effect; r.confirmLabel = label; return { review: r, snapshot } }
  const row = async (table: string, key: string, id: unknown, label: string, select = '*') => {
    if (typeof id !== 'string' || !id) throw new Error(`${label} saknas i underlaget.`)
    const { data, error } = await db.from(table).select(select).eq(key, id).eq('business_id', businessId).maybeSingle()
    if (error || !data) throw new Error(`${label} kunde inte verifieras i ditt företag. Uppdatera ärendet och försök igen.`)
    snapshot[`${table}:${id}`] = data
    return data as Record<string, any>
  }
  try {
    const journaledProjectSync = type === 'automation' && p.rule_action_type === 'sync_to_fortnox' && (p.rule_action_config?.entity_type || p.entity_type) === 'project'
    const journaledOwnerPush = type === 'automation' && p.rule_action_type === 'notify_owner'
    if (!journaledProjectSync && !journaledOwnerPush && action === 'retry' && p.execution_result?.receipt?.state === 'partial' && !['time_attestation', 'job_report', 'autopilot_package', 'customer_fact'].includes(type)) throw new Error(`Tidigare försök utfördes delvis: ${p.execution_result.receipt.text} Kontrollera det befintliga resultatet innan en ny handling skapas.`)
    if (action === 'reject') return complete(rejectionEffect(type), 'Bekräfta avvisningen')
    if (p.quote_followup_round && ['send_sms', 'send_email'].includes(type)) {
      if (p.quote_followup_send_claimed_at) throw new Error('Uppföljningens utskick har redan påbörjats. Kontrollera leveranskvittensen innan ett nytt meddelande skickas.')
      const { parseQuoteFollowupRound, verifyQuoteFollowupSource } = await import('@/lib/quotes/followup-round')
      const scope = parseQuoteFollowupRound(p.quote_followup_round)
      if (!scope || type !== `send_${scope.channel}` || typeof p.quote_followup_source !== 'string') throw new Error('Uppföljningens underlag saknas.')
      await verifyQuoteFollowupSource(db, businessId, scope, p.to, p.quote_followup_source)
    }
    if (classify(type) === 'INFORMATIONAL' || classify(type) === 'ACKNOWLEDGEMENT') return
    if (type === 'job_report') {
      if (action === 'retry' && !p.execution_result?.artifacts?.document_id) throw new Error('Det äldre försöket saknar en verifierbar leveransjournal. Kontrollera tidigare utskick innan ett nytt rapportbeslut skapas.')
      // This report is edited in its source underlay, not via the generic SMS editor.
      if (action === 'edit') throw new Error('Ändra rapportens underlag och öppna sedan en ny dokumentgranskning.')
      const { prepareJobReport } = await import('./job-report-review')
      const prepared = await prepareJobReport(db, businessId, approval.id, p)
      return { ...prepared, snapshot: { documentVersion: prepared.document.version } }
    }
    if (p.project_id) { const project = await row('project', 'project_id', p.project_id, 'Projektet', 'project_id, name, status'); detail('Projekt', project.name) }
    if (p.customer_id) { verifiedCustomer = await row('customer', 'customer_id', p.customer_id, 'Kunden', 'customer_id, name, phone_number, email'); detail('Kund', verifiedCustomer.name) }
    const navigation: Record<string, { label: string; path: string; effect: string }> = {
      missad_intakt: { label: 'Granska intäktsfyndet', path: p.project_id ? `/dashboard/projects/${encodeURIComponent(p.project_id)}` : '/dashboard/invoices', effect: 'Öppnar underlaget. Ingen faktura skapas eller skickas genom att öppna det.' },
      manual_project_create: { label: 'Öppna projekthanteringen', path: p.project_id ? `/dashboard/projects/${encodeURIComponent(p.project_id)}` : '/dashboard/projects', effect: 'Öppnar projektet för att färdigställa registreringen.' },
      jobbpass_proposal: { label: 'Granska jobbpasset', path: p.project_id ? `/dashboard/projects/${encodeURIComponent(p.project_id)}/jobbpass` : '/dashboard/projects', effect: 'Öppnar urvalet av innehåll till jobbpasset. Publicering görs separat efter granskning.' },
      installation_register: { label: 'Granska installationerna', path: p.project_id ? `/dashboard/projects/${encodeURIComponent(p.project_id)}/installationer` : '/dashboard/projects', effect: 'Öppnar installationerna för bekräftelse rad för rad.' },
      deal_flow_site_visit: { label: 'Planera platsbesöket', path: '/dashboard/schedule', effect: 'Öppnar planeringen. Ingen bokning görs eller skickas innan du har valt underlag där.' },
      create_invoice_from_report: { label: 'Öppna fakturaunderlaget', path: p.project_id ? `/dashboard/projects/${encodeURIComponent(p.project_id)}` : '/dashboard/invoices', effect: 'Öppnar underlaget för fakturering. Ingen faktura skapas av denna knapp.' },
    }
    if (navigation[type]) { const target = navigation[type]; r.open = { label: target.label, path: target.path }; r.effect = target.effect; detail('Underlag', approval.description); return { review: r, snapshot } }
    if (type === 'egenkontroll_avvikelse') { detail('Underlag', approval.description); detail('Rapport', p.description || p.summary || p.message); return complete('Noterar att avvikelsen är sedd. Den markeras inte som åtgärdad.', 'Jag har läst') }
    if (type === 'quote_request' || type === 'quote_addition') {
      const underlag = p.description || p.job_description || p.customer_reply_pending
      if (!underlag) throw new Error('Arbetsbeskrivning saknas.')
      detail('Arbetsbeskrivning', underlag); detail('Kund', p.entity?.customerName || p.entity?.name)
      return complete('AI tar fram och sparar ett offertutkast för separat granskning. Offerten skickas inte nu.', 'Skapa offertutkastet')
    }
    if (type === 'propose_site_visit') {
      const { prepareSiteVisitReview } = await import('./site-visit-review')
      return await prepareSiteVisitReview(db, businessId, p)
    }
    if (type === 'new_booking_request' && p.source === 'quote_signing') {
      const { prepareQuoteSigningBookingReview } = await import('./quote-signing-booking-review')
      return await prepareQuoteSigningBookingReview(db, businessId, approval.id, p)
    }
    if (type === 'four_eyes_project_close') {
      const { prepareProjectCloseReview } = await import('./project-close-review')
      return await prepareProjectCloseReview(db, businessId, p, body.action_overrides)
    }
    if (type === 'confirm_payment') {
      const { preparePaymentReview } = await import('./payment-review')
      return await preparePaymentReview(db, businessId, p, body.action_overrides)
    }
    if (p.source === 'payment_followup' && type === 'send_email' && (!verifiedCustomer?.email || p.to !== verifiedCustomer.email)) {
      throw new Error('Kundens e-postadress har ändrats sedan betalningsbeskedet förbereddes.')
    }
    if (p.source === 'payment_followup' && type === 'review_request' && (!verifiedCustomer?.phone_number || p.to !== verifiedCustomer.phone_number)) {
      throw new Error('Kundens telefonnummer har ändrats sedan omdömesförfrågan förbereddes.')
    }
    if (['propose_booking_times', 'reschedule_request', 'new_booking_request'].includes(type) && p.source !== 'quote_signing') {
      const { prepareBookingTimesReview } = await import('./booking-times-review')
      return await prepareBookingTimesReview(db, businessId, type as 'propose_booking_times' | 'reschedule_request' | 'new_booking_request', p, action === 'retry')
    }
    if (type === 'send_sms' && p.recipient === 'internal') {
      const { data: config, error } = await db.from('business_config').select('personal_phone, phone_number').eq('business_id', businessId).maybeSingle()
      const internalPhone = config?.personal_phone || config?.phone_number || null
      if (error || !internalPhone || internalPhone !== p.to || typeof p.message !== 'string' || !p.message.trim()) {
        throw new Error('Det interna SMS:ets mottagare eller text kunde inte verifieras.')
      }
      r.messages.push({ channel: 'SMS', recipients: [internalPhone], text: p.message })
      detail('Mottagartyp', 'Intern ägare/administratör')
      return { ...complete('Skickar det visade interna SMS:et. Ingen kund kontaktas.', 'Skicka internt SMS'),
        executionPayload: { to: internalPhone, message: p.message, relatedId: p.related_id || null } }
    }
    if (type === 'automation' && p.rule_action_type === 'create_approval') {
      detail('Uppmaning', approval.description)
      return complete('Noterar att du har sett uppmaningen. Detta utför inte uppgiften och skapar inget nytt kort.', 'Jag har läst')
    }
    if (type === 'automation' && p.rule_action_type === 'sync_to_fortnox' && (p.rule_action_config?.entity_type || p.entity_type) === 'project') {
      const { prepareProjectSyncReview } = await import('./project-sync-review')
      return await prepareProjectSyncReview(db, businessId, p, body.action_overrides)
    }
    if (type === 'automation' && p.rule_action_type === 'notify_owner') {
      const { prepareOwnerPushReview } = await import('./owner-push-review')
      return await prepareOwnerPushReview(db, businessId, approval.id, p)
    }
    if (type === 'automation' && p.rule_action_type === 'create_project') {
      const { prepareProjectCreationReview } = await import('./project-create-review')
      return await prepareProjectCreationReview(db, businessId, approval.id, p)
    }
    if (type === 'automation' && p.rule_action_type === 'update_status' && p.rule_action_config?.stage_key) {
      const { preparePipelineReview } = await import('./pipeline-review')
      return await preparePipelineReview(db, businessId, approval.id, p)
    }
    if (type === 'automation' && p.rule_action_type === 'update_status' && !p.rule_action_config?.stage_key) {
      const { prepareAutomationStatusReview } = await import('./automation-status-review')
      return await prepareAutomationStatusReview(db, businessId, p)
    }
    if (type === 'automation' && p.rule_action_type === 'schedule_followup') {
      const { prepareAutomationFollowupReview } = await import('./automation-followup-review')
      return await prepareAutomationFollowupReview(db, businessId, { ...approval, payload: p })
    }
    if (type === 'automation' && p.rule_action_type === 'reject_lead') {
      const { prepareAutomationRejectLeadReview } = await import('./automation-reject-lead-review')
      return await prepareAutomationRejectLeadReview(db, businessId, p, body.action_overrides)
    }
    if (type === 'automation' && ['send_sms', 'send_email'].includes(p.rule_action_type)) {
      const config = p.rule_action_config || {}
      const sms = p.rule_action_type === 'send_sms'
      let to = sms ? (p.phone || p.customer_phone) : (p.email || p.customer_email)
      if (!to && p.customer_id) { const customer = await row('customer', 'customer_id', p.customer_id, 'Kunden'); to = sms ? customer.phone_number : customer.email }
      if (typeof to !== 'string' || !(sms ? /^\+?[0-9 ()-]{7,20}$/.test(to) : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))) throw new Error('Mottagaren måste verifieras före utskick.')
      const business = sms ? await row('business_config', 'business_id', businessId, 'Företaget', 'business_name') : null
      const text = sms ? automationSmsText(config, p, business?.business_name || 'Handymate') : config.body
      if (typeof text !== 'string' || !text.trim() || /\{\{[^{}]+\}\}/.test(text)) throw new Error('Meddelandet måste vara komplett utan olösta platshållare.')
      r.messages.push({ channel: sms ? 'SMS' : 'E-post', recipients: [to], text, ...(!sms ? { subject: config.subject || 'Meddelande' } : {}) })
      return complete('Skickar det visade meddelandet till den angivna mottagaren en gång.', sms ? 'Skicka SMS' : 'Skicka e-post')
    }
    if (type === 'invoice_reminder') {
      const d = p.delivery
      if (!d || d.businessId !== businessId || !d.messages) throw new Error('Påminnelsen saknar verifierat leveransunderlag.')
      const invoice = await row('invoice', 'invoice_id', d.invoiceId, 'Fakturan')
      if (!['sent', 'overdue'].includes(invoice.status) || (invoice.reminder_count || 0) !== d.currentCount || invoice.customer_id !== d.customerId) throw new Error('Fakturan har ändrats. Ta fram en ny påminnelse från det aktuella underlaget.')
      detail('Faktura', invoice.invoice_number); detail('Nuvarande belopp (kr)', invoice.customer_pays ?? invoice.total)
      detail('Påminnelseavgift (kr)', d.currentCount >= 1 ? d.reminderFee : 0); detail('Dröjsmålsränta (kr)', d.currentCount >= 1 ? Math.round(d.interestAmount) : 0)
      if (d.customerPhone) {
        if (typeof d.messages.sms !== 'string' || !d.messages.sms.trim() || !/^\+?[0-9 ()-]{7,20}$/.test(d.customerPhone)) throw new Error('SMS-text eller telefonnummer saknas.')
        r.messages.push({ channel: 'SMS', recipients: [d.customerPhone], text: d.messages.sms })
      }
      if (d.emailToo && d.customerEmail) {
        if (!d.messages.emailSubject || !d.messages.emailBody || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.customerEmail)) throw new Error('E-postens ämne, innehåll eller mottagare saknas.')
        r.messages.push({ channel: 'E-post', recipients: [d.customerEmail], subject: d.messages.emailSubject, text: d.messages.emailBody, html: d.messages.emailBody })
      }
      if (!r.messages.length) throw new Error('Påminnelsen saknar mottagare.')
      if (![d.reminderFee, d.interestAmount].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0)) throw new Error('Avgift och ränta måste vara giltiga belopp.')
      detail('Nästa påminnelsetid', d.nextReminderAt || 'Ingen nästa påminnelse planerad')
      return complete('Skickar påminnelsen via kanalerna ovan. När minst en kanal accepterar utskicket uppdateras fakturans avgift, ränta och nästa påminnelsetid.', 'Skicka påminnelsen')
    }
    if (type === 'autopilot_package') {
      const { prepareAutopilotPackageReview } = await import('./package-review')
      return await prepareAutopilotPackageReview(db, businessId, approval, body.action_overrides, action === 'retry')
    }
    switch (type) {
      case 'project_log_note': {
        if (!p.project_id || typeof p.recording_id !== 'string' || !p.recording_id || typeof p.summary !== 'string' || !p.summary.trim()) throw new Error('Projekt, samtal och sammanfattning måste anges.')
        const sourceDate = p.call_date || approval.created_at
        if (typeof sourceDate !== 'string' || Number.isNaN(Date.parse(sourceDate))) throw new Error('Samtalsdatum saknas eller är ogiltigt. Ange datum före beslut.')
        const plan = { id: `log_call_${p.recording_id}`, project_id: p.project_id, date: new Date(sourceDate).toISOString().slice(0, 10), summary: p.summary.trim() }
        detail('Anteckning', plan.summary); detail('Dagboksdatum', plan.date)
        return { ...complete('Sparar den visade samtalsanteckningen i projektets dagbok. Inget kundmeddelande skickas.', 'Spara i dagboken'), executionPayload: { diaryNote: plan }, executionEvidence: { diaryNote: plan } }
      }
      case 'customer_fact': {
        if (!p.content || !p.customer_id) throw new Error('Kund och innehåll måste anges.')
        if (p.fact_type === 'commitment' && p.due_date_iso && !normalizeDueDateIso(p.due_date_iso)) throw new Error('Löftet måste ha ett giltigt datum.')
        detail('Uppgift', p.content); detail('Källa', p.evidence_quote); detail('Datum för löftet', p.due_date_iso)
        const replaces = ['contact', 'commitment'].includes(p.fact_type)
        let targets: { id: string; content: string }[] = []
        if (replaces) {
          const factId = approvalArtifactId(businessId, approval.id, 'customer_fact')
          if (action === 'retry') {
            const original = p.execution_result?.review_evidence?.customerFactReplacementTargets
            if (!Array.isArray(original) || original.some((f: any) => typeof f.id !== 'string' || typeof f.content !== 'string')) throw new Error('Tidigare granskat ersättningsunderlag saknas. Kontrollera det sparade resultatet.')
            targets = original
            const current = await row('customer_fact', 'id', factId, 'Den sparade kunduppgiften')
            if (current.customer_id !== p.customer_id || current.fact_type !== p.fact_type || current.content !== p.content || current.superseded_by) throw new Error('Den sparade kunduppgiften har ändrats. Kontrollera kundens uppgifter före återförsök.')
            detail('Redan sparad', current.content)
            for (const target of targets) {
              const previous = await row('customer_fact', 'id', target.id, 'Den tidigare kunduppgiften')
              if (previous.customer_id !== p.customer_id || previous.fact_type !== p.fact_type || previous.content !== target.content || (previous.superseded_by && previous.superseded_by !== factId)) throw new Error('En tidigare kunduppgift har ändrats. Kontrollera konflikten före återförsök.')
              detail(previous.superseded_by === factId ? 'Redan ersatt' : 'Återstår att ersätta', target.content)
            }
          } else {
            const { data, error } = await db.from('customer_fact').select('id, content')
              .eq('business_id', businessId).eq('customer_id', p.customer_id)
              .eq('fact_type', p.fact_type).is('superseded_by', null).order('id')
            if (error || !Array.isArray(data) || data.some(f => !f.id || typeof f.content !== 'string')) throw new Error('Tidigare kunduppgifter kunde inte verifieras.')
            targets = data
            if (!targets.length) detail('Tidigare uppgifter', 'Inga aktiva uppgifter av samma typ ersätts.')
            targets.forEach((fact, index) => detail(`Ersätter uppgift ${index + 1}`, fact.content))
          }
          snapshot.replacedCustomerFacts = targets
        }
        return { ...complete(action === 'retry' && replaces ? 'Återanvänder den sparade kunduppgiften och slutför endast kvarvarande granskade ersättningar.' : `Sparar kunduppgiften${replaces ? ` och ersätter ${targets.length} ${targets.length === 1 ? 'granskad uppgift' : 'granskade uppgifter'} av samma typ för kunden` : ''}.${p.fact_type === 'commitment' && p.due_date_iso ? ' Aktiverar bevakning av löftets datum.' : ''}`, action === 'retry' && replaces ? 'Slutför ersättningarna' : 'Spara kunduppgiften'),
          executionPayload: { customerFactReplacementTargets: targets },
          executionEvidence: { customerFactReplacementTargets: targets } }

      }
      case 'agent_memory_confirmation': {
        const memory = await row('agent_memories', 'id', p.memory_id, 'Minnet')
        if (memory.superseded_by) throw new Error('Minnet har ersatts av ett nyare minne.')
        if (typeof memory.content !== 'string' || !memory.content.trim()) throw new Error('Minnets innehåll saknas.')
        const plan = { id: memory.id, content: memory.content, agent_id: memory.agent_id ?? null }
        detail('Minnet som bekräftas', memory.content); detail('Agent', memory.agent_id)
        if (memory.confirmed_at) detail('Status', 'Redan bekräftat. Bekräftelsedatumet ändras inte.')
        return { ...complete('Bekräftar det visade minnet för framtida användning i företagets AI-hantering.', 'Bekräfta minnet'), executionPayload: { memoryConfirmation: plan }, executionEvidence: { memoryConfirmation: plan } }
      }
      case 'price_adjustment': {
        const price = await row('price_lists_v2', 'id', p.price_list_id, 'Prislistan')
        if (!Number.isFinite(p.suggested_rate) || p.suggested_rate <= 0) throw new Error('Det nya timpriset måste vara större än noll.')
        if (price.hourly_rate_normal == null || !Number.isFinite(Number(price.hourly_rate_normal))) throw new Error('Nuvarande timpris kunde inte verifieras.')
        const original = p.execution_result?.review_evidence?.priceChange
        const plan = action === 'retry' ? original : { id: p.price_list_id, before: Number(price.hourly_rate_normal), after: p.suggested_rate }
        if (!plan || plan.id !== p.price_list_id || plan.after !== p.suggested_rate || !Number.isFinite(plan.before)) throw new Error('Tidigare granskat prisunderlag saknas.')
        if (![plan.before, plan.after].includes(Number(price.hourly_rate_normal))) throw new Error('Timpriset har ändrats efter det tidigare försöket. Granska ändringen i prislistan.')
        detail('Prislista', price.name || price.title); detail('Nuvarande timpris (kr)', price.hourly_rate_normal); detail('Nytt timpris (kr)', plan.after)
        return { ...complete('Säkerställer det granskade ordinarie timpriset. Redan skapade dokument ändras inte av denna handling.', 'Ändra timpriset'), executionPayload: { priceChange: plan }, executionEvidence: { priceChange: plan } }
      }
      case 'dispatch_suggestion': {
        const person = await row('business_users', 'id', p.member_id, 'Medarbetaren')
        const booking = p.context_type === 'booking'
        if (!booking && p.context_type !== 'work_order') throw new Error('Tilldelningen saknar giltigt uppdrag.')
        const target = await row(booking ? 'booking' : 'work_orders', booking ? 'booking_id' : 'id', p.context_id, 'Uppdraget')
        if (typeof person.name !== 'string' || !person.name.trim()) throw new Error('Medarbetaren saknar namn.')
        const phone = typeof person.phone === 'string' ? person.phone.trim() || null : null
        const before = { assigned_to: target.assigned_to ?? null, ...(booking ? { assigned_user_id: target.assigned_user_id ?? null } : { assigned_phone: target.assigned_phone ?? null }) }
        const after = { assigned_to: person.name, ...(booking ? { assigned_user_id: person.id } : { assigned_phone: phone }) }
        const savedPlan = action === 'retry' ? p.execution_result?.review_evidence?.dispatchPlan : null
        if (savedPlan && (savedPlan.type !== p.context_type || savedPlan.id !== p.context_id || savedPlan.memberId !== p.member_id || !savedPlan.before || !savedPlan.after)) throw new Error('Tidigare granskat tilldelningsunderlag hör inte till detta uppdrag.')
        const legacy = action === 'retry' && (!savedPlan || (!booking && (!('assigned_phone' in savedPlan.before) || !('assigned_phone' in savedPlan.after))))
        // Missing historical evidence may only be repaired by verifying an already
        // matching assignment. before=after makes this plan strictly read-only.
        if (legacy && !Object.entries(after).every(([key, value]) => (target[key] ?? null) === value)) throw new Error('Tidigare granskningsunderlag saknas och den sparade tilldelningen stämmer inte med förslaget. Ingen ändring görs. Granska uppdraget och skapa ett nytt tilldelningsförslag.')
        const plan = legacy ? { type: p.context_type, id: p.context_id, memberId: p.member_id, before: after, after } : action === 'retry' ? savedPlan :
          { type: p.context_type, id: p.context_id, memberId: p.member_id, before, after }
        if (!plan || plan.type !== p.context_type || plan.id !== p.context_id || plan.memberId !== p.member_id ||
          JSON.stringify(plan.after) !== JSON.stringify(after)) throw new Error('Tidigare granskat tilldelningsunderlag saknas eller medarbetaren har ändrats.')
        const matches = (value: Record<string, unknown>) => Object.entries(value).every(([key, v]) => (target[key] ?? null) === v)
        if (!matches(plan.before) && !matches(plan.after)) throw new Error('Uppdraget har fått en annan tilldelning. Granska uppdraget innan du försöker igen.')
        detail('Tilldela', person.name); detail('Uppdrag', target.title || target.notes || target.description)
        const statusLabels: Record<string, string> = { confirmed: 'Bekräftad', cancelled: 'Avbokad', completed: 'Slutförd', no_show: 'Uteblivet besök', draft: 'Utkast' }
        detail('Uppdragets status', statusLabels[target.status] || target.status || 'Status saknas')
        if (!booking) {
          detail('Nuvarande telefon', target.assigned_phone || 'Saknas')
          detail('Telefon efter tilldelning', phone || (legacy ? 'Saknas' : 'Saknas – tidigare telefonnummer tas bort'))
        }

        detail('Datum', target.scheduled_date); detail('Start', target.scheduled_start); detail('Slut', target.scheduled_end); detail('Nuvarande tilldelning', target.assigned_to || 'Ingen'); list('Skäl', p.reasons)
        return { ...complete(legacy ? 'Kontrollerar den redan sparade tilldelningen och återställer kvittensen. Ingen tilldelning ändras och inget meddelande skickas.' : booking ? 'Byter tilldelad medarbetare på detta uppdrag.' : 'Byter tilldelad medarbetare och telefon på arbetsordern. Inget meddelande skickas.', legacy ? 'Bekräfta befintlig tilldelning' : 'Spara tilldelningen'),
          executionPayload: { dispatchPlan: plan }, executionEvidence: { dispatchPlan: plan } }

      }
      case 'time_attestation': {
        const checkin = await row('time_checkins', 'id', p.checkin_id, 'Incheckningen')
        if (!Number.isSafeInteger(p.duration_minutes) || p.duration_minutes <= 0) throw new Error('Tiden måste vara större än noll minuter.')
        if (checkin.user_id !== p.user_id) throw new Error('Medarbetaren har ändrats sedan tidsförslaget skapades.')
        if ((checkin.project_id || null) !== (p.project_id || null)) throw new Error('Projektet har ändrats sedan tidsförslaget skapades.')
        const person = await row('business_users', 'user_id', p.user_id, 'Medarbetaren')
        detail('Medarbetare', person.name || person.full_name); detail('Arbetsdatum', p.checked_in_at || checkin.checked_in_at); detail('Minuter', p.duration_minutes)
        return complete('Attesterar incheckningen och registrerar tiden som godkänd och fakturerbar.', 'Attestera och registrera tiden')
      }
      case 'tidrapport_forslag': {
        const expected = timeProposalFields(p)
        const entryId = approvalArtifactId(businessId, approval.id, 'time_proposal')
        const existing = await db.from('time_entry').select('*').eq('time_entry_id', entryId).eq('business_id', businessId).maybeSingle()
        if (existing.error) throw new Error('Tidigare tidrapport kunde inte kontrolleras. Försök igen senare.')
        snapshot[`time_entry:${entryId}`] = existing.data || null
        if (existing.data && !timeProposalMatches(existing.data, expected)) throw new Error('Den befintliga tidraden har ändrats och avviker från förslaget. Granska tidrapporten innan du försöker igen. Ingen tid ändras här.')
        if (p.assigned_user_id) { const user = await row('business_users', 'id', p.assigned_user_id, 'Medarbetaren'); detail('Medarbetare', user.name || user.full_name) }
        else detail('Medarbetare', 'Ingen person knuten till tidraden')
        detail('Datum', p.booking_date); detail('Minuter', p.suggested_minutes)
        detail('Beskrivning', expected.description)
        return complete(existing.data ? 'Verifierar den redan registrerade och godkända tidrapporten. Ingen ny tid registreras.' : 'Skapar en godkänd och fakturerbar tidrapport med uppgifterna ovan.', existing.data ? 'Bekräfta registrerad tid' : 'Registrera tidrapporten')
      }
      case 'checklist_forslag': {
        if (!p.project_id || !Array.isArray(p.template_items) || !p.template_items.length) throw new Error('Checklistan saknar projekt eller punkter.')
        const checklistId = approvalArtifactId(businessId, approval.id, 'checklist')
        const existing = await db.from('project_checklist').select('id, project_id, name, items, status').eq('id', checklistId).eq('business_id', businessId).maybeSingle()
        if (existing.error) throw new Error('Tidigare checklistresultat kunde inte kontrolleras. Försök läsa ärendet igen.')
        snapshot.checklist = existing.data || null
        if (existing.data) {
          if (existing.data.project_id !== p.project_id) throw new Error('Den sparade checklistans projekt stämmer inte med förslaget.')
          detail('Sparad checklista', existing.data.name)
          return complete('Checklistan finns redan på projektet. Bekräftar det sparade resultatet utan att skapa en dubblett eller återställa kontrollpunkterna.', 'Bekräfta sparad checklista')
        }
        detail('Checklista', p.template_name)
        if (p.template_items.some((item: any) => typeof item?.text !== 'string' || !item.text.trim())) throw new Error('Alla kontrollpunkter måste ha en text.')
        p.template_items.forEach((item: any, i: number) => detail(`Punkt ${i + 1}${item.required ? ' (obligatorisk)' : ''}`, item.text))
        return complete('Skapar checklistan på projektet. Punkterna börjar som ej utförda.', 'Skapa checklistan')
      }
      case 'egenkontroll_foto': {
        const checklist = await row('project_checklist', 'id', p.checklist_id, 'Checklistan')
        if (!Array.isArray(p.forslag) || !p.forslag.length || !p.photo_ref) throw new Error('Foto och föreslagna kontrollpunkter måste finnas.')
        detail('Checklista', checklist.name)
        for (const proposed of p.forslag) { const item = checklist.items?.find((item: any) => item.id === proposed.punkt_id); if (!item) throw new Error('En kontrollpunkt har ändrats eller tagits bort.'); detail('Markera som utförd', item.text); detail('Bedömning', proposed.reason || proposed.motivering) }
        const photo = await row('project_document', 'id', p.photo_ref, 'Fotot')
        if (photo.project_id !== p.project_id) throw new Error('Fotot hör inte till projektet.')
        r.attachments = [{ label: 'Granska fotot', url: `/api/projects/${encodeURIComponent(p.project_id)}/documents/${encodeURIComponent(p.photo_ref)}?view=inline`, kind: 'image' }]
        return complete('Markerar de visade kontrollpunkterna som utförda med fotot som underlag.', 'Bekräfta kontrollpunkterna')
      }
      case 'project_debrief': {
        const answers = p.answers && typeof p.answers === 'object' ? Object.entries(p.answers).filter(([, value]) => typeof value === 'string' && value.trim()) : []
        for (const [question, answer] of answers) detail(question, answer)
        return complete(answers.length ? 'Sparar dina svar som projektlärdomar för kommande jobb.' : 'Avslutar frågorna utan att spara nya projektlärdomar.', answers.length ? 'Spara mina svar' : 'Avsluta utan svar')
      }
      case 'operating_experiment_proposal': {
        if (!p.hypothesis || !p.job_type || !p.planned_change || !p.guard_rails || !Array.isArray(p.measures)) throw new Error('Försöket saknar ett fullständigt upplägg.')
        if (p.planned_change.type !== 'kickoff_checkpoint' || !p.planned_change.checkpoint_text || p.guard_rails.no_autonomous_customer_send !== true) throw new Error('Försökets åtgärd och begränsningar måste vara fullständiga.')
        detail('Hypotes', p.hypothesis); detail('Jobbtyp', p.job_type); detail('Kontrollpunkt som införs', p.planned_change.checkpoint_text); detail('Högst antal projekt', p.guard_rails.max_projects); detail('Från', p.guard_rails.start_date); detail('Till', p.guard_rails.end_date); detail('Automatiska kundutskick', 'Tillåts inte av detta försök'); list('Mått', p.measures); detail('Minsta antal jämförbara projekt', p.min_comparable_projects ?? 3)
        return complete('Startar det beskrivna försöket för företagets arbetssätt.', 'Starta försöket')
      }
      case 'operating_experiment_readout': {
        const experiment = await row('operating_experiment', 'id', p.experiment_id, 'Försöket')
        if (p.hypothesis !== experiment.hypothesis || p.job_type !== experiment.job_type) throw new Error('Försökets underlag har ändrats; granska det aktuella resultatet.')
        detail('Hypotes', experiment.hypothesis); detail('Kontrollpunkt', experiment.planned_change?.checkpoint_text)
        detail('Resultat', approval.description)
        if (p.measurement) detail('Fullständigt mätunderlag', JSON.stringify(p.measurement, null, 2))
        if (!['continue_testing', 'made_standard'].includes(p.decision)) {
          r.effect = 'Läs resultatet och välj om arbetssättet ska testas vidare eller bli standard.'
          r.open = { label: 'Öppna beslutet', path: `/dashboard/experiments/${encodeURIComponent(approval.id)}` }
          return { review: r, snapshot }
        }
        detail('Valt beslut', p.decision === 'made_standard' ? 'Gör till företagets standard' : 'Fortsätt testa')
        return complete(p.decision === 'made_standard' ? 'Sparar arbetssättet i företagskunskapen och kopplar det till försöket.' : 'Registrerar beslutet att fortsätta testa och tar fram ett nytt separat förslag.', 'Bekräfta beslutet')
      }
      case 'lead_review': {
        const { prepareLeadActivationReview } = await import('./lead-review')
        return await prepareLeadActivationReview(db, businessId, p, body.action_overrides)
      }
      case 'four_eyes_quote': {
        const quote = await row('quotes', 'quote_id', p.quote_id, 'Offerten')
        if (quote.status !== 'pending_approval') throw new Error('Offerten väntar inte längre på intern granskning.')
        const requester = await row('business_users', 'id', p.requested_by_user_id, 'Offertens skapare')
        detail('Intern notis till', requester.name)
        detail('Intern notis', `Din offert på ${(quote.total || 0).toLocaleString('sv-SE')} kr har godkänts — du kan nu skicka den`)
        detail('Offert', quote.title); detail('Belopp inklusive moms (kr)', quote.total)
        list('Offertpost', quote.items)
        r.attachments = [{ label: 'Läs hela offerten', url: `/api/quotes/pdf?id=${encodeURIComponent(p.quote_id)}`, kind: 'document' }]
        return complete('Godkänner intern granskning och återför offerten till utkast. Skaparen får en intern notis och kan sedan skicka offerten separat.', 'Godkänn intern offertgranskning')
      }
      case 'autonomy_offer': {
        const { AUTONOMY_META, DEFAULT_AUTONOMY_CAPS, isAllowlistedKey } = await import('@/lib/autonomy/earned-autonomy')
        const key: unknown = p.autonomy_key
        if (!isAllowlistedKey(key)) throw new Error('Automatisk hantering saknar en tillåten omfattning.')
        const meta = AUTONOMY_META[key]
        detail('Åtgärdstyp', meta.label); detail('Agent', meta.agentName); detail('Beloppsgräns (kr)', DEFAULT_AUTONOMY_CAPS[key] ?? 'Ingen beloppsgräns för denna åtgärdstyp')
        detail('Återkalla', 'Du kan när som helst återkalla tillåtelsen under Förtroendetrappan.')
        return complete('Tillåter framtida automatiska utskick av den angivna typen utan godkännande per meddelande. Övriga kontakt- och kvotregler fortsätter gälla.', 'Tillåt automatisk hantering')
      }
      default: {
        const basic = buildApprovalReview({ ...approval, payload: p })
        basic.details = [...r.details!, ...(basic.details || [])]
        return { review: basic, snapshot }
      }
    }
  } catch (error) {
    r.effect ||= 'Underlaget måste kunna verifieras före beslut.'
    r.confirmLabel = null
    r.blockedReason = error instanceof Error ? error.message : String(error || 'Granskningen kunde inte förberedas.')
    return { review: r, snapshot }
  }
}

/** Attach explainability after every type-specific early return. Evidence is
 * intentionally derived from the stored row, never from edited request data. */
export async function prepareApprovalReview(db: SupabaseClient, businessId: string,
  approval: { id: string; approval_type: string; title?: string; description?: string; payload?: any; package_data?: any; created_at?: string },
  body: Record<string, any>,
): Promise<PreparedApprovalReview | undefined> {
  return withApprovalEvidence(
    await prepareApprovalReviewInternal(db, businessId, approval, body),
    { approval_type: approval.approval_type, payload: approval.payload },
  )
}
