import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { approvalArtifactId, insertApprovalArtifact } from './artifact-write'
import { sendEmail, type SendEmailParams } from '@/lib/email'

export interface ReviewedDocument {
  businessId: string
  approvalId: string
  projectId: string
  customerId: string
  title: string
  pdf: Buffer
  email: Pick<SendEmailParams, 'to' | 'subject' | 'html' | 'fromName' | 'fromAddress' | 'replyTo'>
  /** Hash of rendered bytes AND the full envelope, not just the source row. */
  version: string
}
export function documentVersion(pdf: Buffer, email: ReviewedDocument['email']): string {
  return createHash('sha256').update(pdf).update(JSON.stringify([
    email.to, email.subject, email.html, email.fromName || 'Handymate',
    email.fromAddress || 'noreply@handymate.se', email.replyTo || null,
  ])).digest('hex')
}

/** Persistent per-document delivery journal. An uncertain send is NEVER automatically
 * repeated, even after the provider's 24-hour idempotency window has expired.
 * Definite rejection may be retried with the SAME bytes/envelope; accepted sends
 * return their prior reference. CAS claim precedes all external delivery calls.
 */
export async function deliverReviewedDocument(db: SupabaseClient, doc: ReviewedDocument) {
  const id = approvalArtifactId(doc.businessId, doc.approvalId, 'reviewed-document')
  const failure = (error: string, partial = false) => ({ ok: false, error, partial, document_id: id })
  if (documentVersion(doc.pdf, doc.email) !== doc.version) return failure('Dokumentet har ändrats efter granskningen.')
  const storagePath = `${doc.businessId}/reports/${id}.pdf`
  const created = await insertApprovalArtifact(db, 'generated_document', 'id', doc.businessId, doc.approvalId, 'reviewed-document', {
    project_id: doc.projectId, customer_id: doc.customerId, title: doc.title,
    content: [{ type: 'reviewed_document', version: doc.version }],
    variables_data: { delivery: { version: doc.version, state: 'prepared', attempt: 0, envelope: doc.email, filename: 'jobbrapport.pdf' } },
    status: 'draft', pdf_url: storagePath,
  })
  if (created.error || !created.data) return failure('Dokumentets leveransjournal kunde inte sparas. Inget mejl skickades.')
  const row = created.data
  const variables = row.variables_data || {}
  const delivery = variables.delivery
  if (!delivery || delivery.version !== doc.version || row.project_id !== doc.projectId || row.customer_id !== doc.customerId) {
    return failure('Ett annat dokument är redan kopplat till beslutet. Granska det befintliga utfallet.', true)
  }
  if (delivery.state === 'accepted') return { ok: true, email_sent: true, document_id: id, message_id: delivery.messageId, reused: true }
  if (!['prepared', 'rejected'].includes(delivery.state)) return failure('Utskicket pågår eller saknar säkert leveransbesked. Inget nytt mejl skickades. Kontrollera sändtjänstens referens innan ett nytt försök.', true)
  // Upload is immutable per approval. Only the CAS winner can upload/send.
  const claimed = { ...variables, delivery: { ...delivery, state: 'sending', attempt: delivery.attempt + 1 } }
  const claim = await db.from('generated_document').update({ variables_data: claimed })
    .eq('id', id).eq('business_id', doc.businessId).eq('variables_data', JSON.stringify(variables)).select('id')
  if (claim.error || !claim.data?.length) return failure('Leveransen är redan under behandling eller kunde inte låsas. Inget nytt mejl skickades.', true)
  const record = async (state: string, extra: Record<string, unknown> = {}) => db.from('generated_document')
    .update({ variables_data: { ...claimed, delivery: { ...claimed.delivery, state, ...extra } }, ...(state === 'accepted' ? { status: 'completed' } : {}) })
    .eq('id', id).eq('business_id', doc.businessId).eq('variables_data', JSON.stringify(claimed)).select('id')
  let providerCalled = false
  try {
    const upload = await db.storage.from('customer-documents').upload(storagePath, doc.pdf, { contentType: 'application/pdf', upsert: true })
    if (upload.error) {
      await record('rejected', { error: 'PDF-uppladdningen misslyckades före utskick' })
      return failure('PDF-filen kunde inte sparas. Inget mejl skickades.', true)
    }
    providerCalled = true
    const result = await sendEmail({ ...doc.email, businessId: doc.businessId,
      // No customerId: sending must not silently move pipeline stages.
      attachments: [{ filename: 'jobbrapport.pdf', content: doc.pdf.toString('base64') }],
      idempotencyKey: `reviewed-document/${id}/${doc.version}`,
    })
    const state = result.success && result.messageId ? 'accepted' : result.deliveryState === 'rejected' ? 'rejected' : 'unknown'
    const persisted = await record(state, { messageId: result.messageId || null, error: result.error || null })
    if (state === 'accepted') return { ok: !persisted.error && !!persisted.data?.length, email_sent: true, document_id: id, message_id: result.messageId,
      ...(persisted.error || !persisted.data?.length ? { partial: true, error: 'Mejltjänsten accepterade dokumentet men kvittensen kunde inte sparas. Skicka inte igen.' } : {}) }
    return { ...failure(state === 'unknown' ? 'Dokumentet är sparat, men mejlets leverans är okänd. Inget automatiskt omutskick görs.' : result.error || 'Mejltjänsten avvisade dokumentet.', true), document_id: id, email_sent: false }
  } catch {
    // A crash after provider invocation must remain unknown; a durable sending
    // claim also prevents duplicate delivery if this final write fails.
    await record(providerCalled ? 'unknown' : 'rejected').catch(() => undefined)
    return failure(providerCalled ? 'Leveransbesked saknas. Skicka inte igen innan utfallet har kontrollerats.' : 'Dokumentet kunde inte förberedas. Inget mejl skickades.', true)
  }
}
