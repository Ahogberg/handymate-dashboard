import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApprovalReview } from './review-contract'
import { byggProjektFakturaUnderlag } from '@/lib/invoices/project-invoice-draft'

export interface PreparedProjectClose extends Record<string, unknown> {
  projectId: string
  options: { createInvoiceDraft: boolean; createReviewRequest: boolean; runAutomations: boolean }
}

export async function prepareProjectCloseReview(
  db: SupabaseClient,
  businessId: string,
  payload: Record<string, any>,
  actionOverrides: Record<string, unknown> | undefined,
): Promise<{ review: ApprovalReview; snapshot: Record<string, unknown>; executionPayload: PreparedProjectClose; executionEvidence: Record<string, unknown> }> {
  if (typeof payload.project_id !== 'string' || !payload.project_id) throw new Error('Projekt saknas i avslutsunderlaget.')
  const { data: project, error: projectError } = await db.from('project')
    .select('project_id, name, status, customer_id, quote_id, lead_id').eq('project_id', payload.project_id).eq('business_id', businessId).maybeSingle()
  if (projectError || !project) throw new Error('Projektet kunde inte verifieras i företaget.')
  if (project.status === 'completed') throw new Error('Projektet är redan avslutat. Öppna historiken för det tidigare utfallet.')

  let responsible: { id: string; name: string } | null = null
  if (project.quote_id || project.lead_id) {
    let dealQuery = db.from('deal').select('id, assigned_to').eq('business_id', businessId)
    if (project.quote_id && project.lead_id) dealQuery = dealQuery.or(`quote_id.eq.${project.quote_id},lead_id.eq.${project.lead_id}`)
    else if (project.quote_id) dealQuery = dealQuery.eq('quote_id', project.quote_id)
    else dealQuery = dealQuery.eq('lead_id', project.lead_id)
    const deal = await dealQuery.maybeSingle()
    if (deal.error) throw new Error('Projektets ansvariga kunde inte verifieras.')
    if (deal.data?.assigned_to) {
      const member = await db.from('business_users').select('id, name').eq('id', deal.data.assigned_to).eq('business_id', businessId).maybeSingle()
      if (member.error || !member.data) throw new Error('Projektets ansvariga kunde inte verifieras i företaget.')
      responsible = { id: member.data.id, name: member.data.name || member.data.id }
    }
  }

  let customer: any = null
  if (project.customer_id) {
    const result = await db.from('customer').select('customer_id, name, phone_number, email, review_request_sent_at')
      .eq('customer_id', project.customer_id).eq('business_id', businessId).maybeSingle()
    if (result.error || !result.data) throw new Error('Projektets kund kunde inte verifieras i företaget.')
    customer = result.data
  }
  const { data: config, error: configError } = await db.from('business_config')
    .select('auto_invoice_on_complete, google_review_url, personal_phone').eq('business_id', businessId).maybeSingle()
  if (configError) throw new Error('Företagets avslutsinställningar kunde inte verifieras.')

  const invoice = await byggProjektFakturaUnderlag(db, businessId, project.project_id)
  if (!invoice.ok && invoice.reason === 'underlag_otillgangligt') throw new Error(invoice.error)
  const canCreateInvoice = invoice.ok
  const askedRecently = !!customer?.review_request_sent_at && new Date(customer.review_request_sent_at) > new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
  const canPrepareReview = !!customer?.phone_number && !!config?.google_review_url && !askedRecently
  const selected = (id: string, available: boolean) => available && actionOverrides?.[id] !== 'rejected'
  const options = {
    createInvoiceDraft: selected('create_invoice_draft', canCreateInvoice),
    createReviewRequest: selected('create_review_request', canPrepareReview),
    runAutomations: selected('run_automations', true),
  }

  const details: NonNullable<ApprovalReview['details']> = [
    { label: 'Projekt', text: project.name || project.project_id },
    { label: 'Kund', text: customer?.name || 'Ingen kund kopplad' },
    { label: 'Ansvarig', text: responsible?.name || 'Inte tilldelad' },
    { label: 'Projektföljd', text: 'Status blir avslutad, arbetsflödet flyttas till slutkontroll och kopplad affär flyttas till vunnen.' },
    { label: 'Efterkalkyl', text: 'Projektutfall fryses och ett separat debrief-förslag skapas.' },
    { label: 'Övriga förslag', text: 'Jobbpass och installationsregister kan skapas som utkast/förslag; inget publiceras.' },
    { label: 'Fakturapolicy', text: config?.auto_invoice_on_complete ? 'Automatisk fakturasändning är på, men projektavslutet skapar ändå bara ett utkast och ett separat granskningskort.' : 'Fakturan skapas endast som utkast och får ett separat granskningskort.' },
    { label: 'Internt fakturabesked', text: config?.personal_phone ? `Förbereds som ett separat SMS-förslag till ${config.personal_phone}.` : 'Inget internt SMS förbereds eftersom mottagare saknas.' },
  ]
  if (invoice.ok) {
    details.push(
      { label: 'Fakturabelopp exkl. moms', text: `${invoice.subtotal.toLocaleString('sv-SE')} kr` },
      { label: `Moms (${invoice.vatRate} %)`, text: `${invoice.vatAmount.toLocaleString('sv-SE')} kr` },
      { label: 'ROT/RUT-avdrag', text: `${invoice.rotRutDeduction.toLocaleString('sv-SE')} kr` },
      { label: 'Kunden betalar', text: `${invoice.customerPays.toLocaleString('sv-SE')} kr` },
    )
    invoice.items.forEach((item: any, index: number) => details.push({ label: `Fakturarad ${index + 1}`, text: `${item.description || item.name || 'Rad'} · ${item.quantity ?? 1} ${item.unit || 'st'} · ${Number(item.total ?? 0).toLocaleString('sv-SE')} kr` }))
  } else details.push({ label: 'Faktura', text: invoice.reason === 'faktura_finns' ? `Skapas inte — faktura finns redan (${invoice.existingInvoiceId})` : `Skapas inte — ${invoice.error}` })

  const choices: NonNullable<ApprovalReview['choices']> = []
  if (canCreateInvoice) choices.push({ id: 'create_invoice_draft', label: 'Skapa fakturautkast', defaultSelected: true, description: 'Skapar det visade fakturautkastet. Det skickas inte till kunden; ett separat fakturakort kräver ny granskning.' })
  if (canPrepareReview) choices.push({ id: 'create_review_request', label: 'Förbered kunduppföljning', defaultSelected: true, description: 'Skapar ett separat granskningskort med exakt recensions-SMS. Inget SMS skickas av projektavslutet.' })
  choices.push({ id: 'run_automations', label: 'Kör interna avslutsautomationer', defaultSelected: true, description: 'Triggar företagets job_completed-regler. Eventuella nya kundutskick måste bli separata granskningskort.' })

  const executionPayload: PreparedProjectClose = { projectId: project.project_id, options }
  const stableEvidence = {
    kind: 'project_close', project: { id: project.project_id, name: project.name, status: project.status }, responsible,
    customer: customer ? { id: customer.customer_id, name: customer.name, phone: customer.phone_number, email: customer.email } : null,
    invoice: invoice.ok ? { items: invoice.items, subtotal: invoice.subtotal, vatRate: invoice.vatRate, vatAmount: invoice.vatAmount, total: invoice.total, deduction: invoice.rotRutDeduction, customerPays: invoice.customerPays } : { available: false, reason: invoice.reason, existingInvoiceId: invoice.existingInvoiceId || null },
  }
  // Den signerade snapshoten binder till den fulla, tillåtna vallistan och
  // det aktuella underlaget. Själva urvalet görs först i dialogen och sparas
  // separat som executionEvidence; annars skulle varje legitim avmarkering
  // göra den nyss utfärdade token ogiltig.
  const executionEvidence = { ...stableEvidence, options }
  return {
    executionPayload,
    executionEvidence,
    snapshot: { projectClose: stableEvidence, reviewAvailable: canPrepareReview },
    review: {
      title: `Granska projektavslut — ${project.name || project.project_id}`,
      effect: 'Avslutar projektet och utför endast valda följder. Faktura och kundmeddelanden skickas aldrig direkt av detta beslut. Varje faktiskt delutfall redovisas separat.',
      confirmLabel: 'Avsluta projektet med valda följder',
      messages: [], details, choices,
    },
  }
}
