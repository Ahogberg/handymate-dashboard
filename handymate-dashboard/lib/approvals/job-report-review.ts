import type { SupabaseClient } from '@supabase/supabase-js'
import { generateJobReportPdf, type JobReportData } from '@/lib/job-report'
import { brandingFromConfig } from '@/lib/branding/get-branding'
import { loadPdfLogo, pdfBrandingFrom } from '@/lib/branding/pdf'
import { emailLayout, emailHeading, emailParagraph, signature } from '@/lib/email-templates'
import { escapeHtml } from '@/lib/document-html'
import { documentVersion, type ReviewedDocument } from './document-delivery'
import type { ApprovalReview } from './review-contract'

/** No writes, tokens, uploads, public links or sends during preparation. */
export async function prepareJobReport(db: SupabaseClient, businessId: string,
  approvalId: string, payload: Record<string, any>,
): Promise<{ document: ReviewedDocument; review: ApprovalReview }> {
  const read = async (table: string, key: string, id: string) => {
    if (!id) throw new Error('Jobbrapporten saknar kopplat projekt eller kund.')
    const r = await db.from(table).select('*').eq(key, id).eq('business_id', businessId).single()
    if (r.error || !r.data) throw new Error('Jobbrapportens underlag kunde inte verifieras i företaget.')
    return r.data
  }
  const project = await read('project', 'project_id', payload.projectId)
  const customer = await read('customer', 'customer_id', project.customer_id)
  const config = await read('business_config', 'business_id', businessId)
  if (typeof payload.customerEmail !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.customerEmail) || customer.email !== payload.customerEmail) {
    throw new Error('Mottagaradressen saknas eller har ändrats. Uppdatera rapportunderlaget innan utskick.')
  }
  const textList = (value: unknown, label: string): string[] => {
    if (!Array.isArray(value) || value.some(v => typeof v !== 'string' || !v.trim())) throw new Error(`${label} innehåller ogiltiga rader.`)
    return value
  }
  const work = textList(payload.workPerformed, 'Utfört arbete')
  if (!work.length || !Number.isFinite(Date.parse(payload.completedAt))) throw new Error('Rapporten måste ha utfört arbete och avslutsdatum.')
  if (!Array.isArray(payload.materials) || payload.materials.some((m: any) => typeof m.name !== 'string' || !m.name.trim() || !Number.isFinite(m.quantity) || m.quantity <= 0 || typeof m.unit !== 'string')) throw new Error('Materialraderna måste ha namn, positivt antal och enhet.')
  if (![payload.warrantyWorkYears, payload.warrantyMaterialYears].every(v => Number.isFinite(v) && v >= 0)) throw new Error('Garantitider måste vara giltiga årtal.')
  if (payload.diaryHours != null && (!Number.isFinite(payload.diaryHours) || payload.diaryHours < 0)) throw new Error('Arbetstiden är ogiltig.')
  const branding = brandingFromConfig(config)
  const logo = await loadPdfLogo(branding.logoUrl, 'job-report-review')
  if (branding.logoUrl && !logo) throw new Error('Företagets logotyp kunde inte förberedas. Försök igen innan du granskar dokumentet.')
  const photos: Array<{ data: string; format: 'PNG' | 'JPEG'; caption: string | null }> = []
  if (payload.photos != null && !Array.isArray(payload.photos)) throw new Error('Fotounderlaget är ogiltigt.')
  if ((payload.photos || []).length > 6) throw new Error('Rapporten stöder högst sex foton.')
  for (const photo of payload.photos || []) {
    // Only private, tenant-prefixed project-files paths. A payload URL must
    // never cause SSRF, read another tenant's image or bypass bucket privacy.
    const path = photo?.url
    if (typeof path !== 'string' || !path.startsWith(`${businessId}/`) || path.split('/').some(s => s === '..' || s === '.') || /[\\%?#]/.test(path)) {
      throw new Error('Ett foto saknar en verifierbar privat sökväg. Koppla om fotot i rapportunderlaget.')
    }
    const download = await db.storage.from('project-files').download(path)
    if (download.error || !download.data || download.data.size > 5 * 1024 * 1024) throw new Error('Ett foto kunde inte läsas eller är större än 5 MB.')
    const format = download.data.type === 'image/png' ? 'PNG' : download.data.type === 'image/jpeg' ? 'JPEG' : null
    if (!format) throw new Error('Rapportfoton måste vara PNG eller JPEG.')
    photos.push({ data: `data:${download.data.type};base64,${Buffer.from(await download.data.arrayBuffer()).toString('base64')}`, format, caption: typeof photo.caption === 'string' ? photo.caption : null })
  }
  const data: JobReportData = {
    projectId: project.project_id, projectName: project.name, customerName: customer.name,
    customerEmail: customer.email, customerAddress: customer.address_line || null,
    completedAt: payload.completedAt, workPerformed: work, materials: payload.materials,
    photos: payload.photos || [], deviations: textList(payload.deviations || [], 'Avvikelser'), diaryHours: payload.diaryHours ?? null,
    businessName: branding.businessName, contactName: branding.contactName || '', orgNumber: branding.orgNumber || null,
    logoUrl: branding.logoUrl || null, warrantyWorkYears: payload.warrantyWorkYears, warrantyMaterialYears: payload.warrantyMaterialYears,
  }
  const pdf = await generateJobReportPdf(data, { attribution: branding.attribution, brand: pdfBrandingFrom(branding, logo), photos })
  if (pdf.length > 15 * 1024 * 1024) throw new Error('Rapporten är för stor för granskat mejlutskick. Minska fotostorlekarna.')
  const content = emailHeading(`Jobbrapport — ${escapeHtml(data.projectName)}`, `Hej ${escapeHtml(data.customerName)}!`) +
    emailParagraph('Här kommer jobbrapporten som bifogad PDF. Rapporten innehåller utfört arbete, material och garantiinformation samt eventuella avvikelser och foton. Spara den som dokumentation över jobbet.') +
    signature(escapeHtml(data.businessName), data.contactName ? escapeHtml(data.contactName) : undefined)
  const email = { to: customer.email, subject: `Jobbrapport — ${data.projectName} från ${data.businessName}`,
    html: emailLayout(branding, content, { meta: 'Jobbrapport' }), fromName: data.businessName,
    fromAddress: 'noreply@handymate.se', ...(branding.contactEmail ? { replyTo: branding.contactEmail } : {}) }
  const version = documentVersion(pdf, email)
  return {
    document: { businessId, approvalId, projectId: project.project_id, customerId: customer.customer_id,
      title: `Jobbrapport — ${data.projectName}`, pdf, email, version },
    review: { title: `Granska jobbrapport — ${data.projectName}`, confirmLabel: 'Skicka mejlet med granskad PDF',
      effect: 'Sparar den granskade PDF-filen och skickar den som bilaga till mottagaren nedan. Inget SMS skickas. Ingen faktura skapas och inget projekt eller pipeline-steg ändras.',
      messages: [{ channel: 'E-post', recipients: [email.to], subject: email.subject, text: content, html: email.html }],
      details: [{ label: 'Avsändare', text: `${email.fromName} <${email.fromAddress}>` },
        { label: 'Svar till', text: email.replyTo || email.fromAddress },
        { label: 'Kopior / BCC', text: 'Inga' }, { label: 'Bilaga', text: 'jobbrapport.pdf' },
        { label: 'Dokumentversion', text: version }],
      attachments: [{ label: 'Hela jobbrapporten (PDF)', kind: 'document', url: `/api/approvals/${encodeURIComponent(approvalId)}/document?version=${version}` }],
    },
  }
}
