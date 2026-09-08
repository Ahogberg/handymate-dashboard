import { getServerSupabase } from '@/lib/supabase'
import { buildAttribution, loadAttribution, stampAttributionOnPdf, type Attribution } from '@/lib/branding/attribution'
import { DEFAULT_ACCENT_COLOR } from '@/lib/branding/get-branding'
import {
  drawBrandHeader,
  drawBrandFooter,
  loadPdfBranding,
  pdfBrandingFrom,
  PDF_TEXT_PRIMARY,
  PDF_TEXT_MUTED,
  type PdfBranding,
} from '@/lib/branding/pdf'

/**
 * V23: Automatisk jobbrapport vid avslutat jobb.
 * Skapar pending_approval med rapportdata.
 * Vid godkännande → genererar PDF → skickar till kund.
 */

interface JobReportData {
  projectId: string
  projectName: string
  customerName: string
  customerEmail: string | null
  customerAddress: string | null
  completedAt: string
  workPerformed: string[]
  materials: Array<{ name: string; quantity: number; unit: string }>
  photos: Array<{ url: string; caption: string | null }>
  /** Avvikelser ur byggdagboken ("YYYY-MM-DD: text"). Valfri — äldre payloads saknar fältet. */
  deviations?: string[]
  /** Summerade timmar enligt byggdagboken, null om inga rader har timmar. */
  diaryHours?: number | null
  businessName: string
  contactName: string
  orgNumber: string | null
  logoUrl: string | null
  warrantyWorkYears: number
  warrantyMaterialYears: number
}

/**
 * Triggas vid job_completed event.
 * Samlar ihop all data och skapar en pending_approval.
 */
export async function triggerJobReport(
  businessId: string,
  projectId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getServerSupabase()

  // Check if automation is enabled
  const { data: settings } = await supabase
    .from('v3_automation_settings')
    .select('job_report_enabled')
    .eq('business_id', businessId)
    .single()

  if (settings && settings.job_report_enabled === false) {
    return { success: true } // Disabled
  }

  // Fetch project
  const { data: project } = await supabase
    .from('project')
    .select('project_id, name, customer_id, completed_at, start_date')
    .eq('project_id', projectId)
    .eq('business_id', businessId)
    .single()

  if (!project) return { success: false, error: 'Projekt hittades inte' }

  // Fetch customer
  const { data: customer } = await supabase
    .from('customer')
    .select('customer_id, name, email, address_line')
    .eq('customer_id', project.customer_id)
    .eq('business_id', businessId)
    .single()

  if (!customer) return { success: false, error: 'Kunden kunde inte verifieras för företaget' }

  // Fetch business
  const { data: business } = await supabase
    .from('business_config')
    .select('business_name, contact_name, org_number, logo_url')
    .eq('business_id', businessId)
    .single()

  // Fetch field reports (byggdagbok)
  const { data: reports } = await supabase
    .from('field_reports')
    .select('id, title, work_performed, materials_used')
    .eq('project_id', projectId)
    .eq('business_id', businessId)
    .order('created_at')

  const workPerformed = (reports || [])
    .filter((r: any) => r.work_performed)
    .map((r: any) => r.work_performed as string)

  // Byggdagboken (project_log) — Etapp E3, 2026-09-02. Slutrapporten läste
  // tidigare bara field_reports och missade allt hantverkaren skrev dag för
  // dag. `log_report_%`-raderna är Mattes egna slutrapportsutkast (Work
  // Report V1) — utan vakten skulle rapporten läsa sina egna rader.
  const { data: diaryRows } = await supabase
    .from('project_log')
    .select('id, date, work_performed, issues, hours_worked, photos')
    .eq('order_id', projectId)
    .eq('business_id', businessId)
    .not('id', 'like', 'log_report_%')
    .order('date', { ascending: true })

  const diary = (diaryRows || []) as Array<{
    id: string; date: string; work_performed: string | null; issues: string | null
    hours_worked: number | null; photos: unknown
  }>
  for (const row of diary) {
    if (row.work_performed && !workPerformed.includes(row.work_performed)) {
      workPerformed.push(`${row.date}: ${row.work_performed}`)
    }
  }
  const deviations = diary
    .filter(r => r.issues)
    .map(r => `${r.date}: ${r.issues}`)
  const diaryHoursSum = diary.reduce((s, r) => s + (typeof r.hours_worked === 'number' ? r.hours_worked : 0), 0)
  const diaryHours = diaryHoursSum > 0 ? Math.round(diaryHoursSum * 100) / 100 : null
  // Privat bucket (project-files) — vi lagrar SÖKVÄGEN, aldrig en signerad
  // URL, i ett payload som kan ligga i kön i dagar (v151-principen).
  const diaryPhotos = diary.flatMap(r =>
    (Array.isArray(r.photos) ? (r.photos as unknown[]) : [])
      .filter((p): p is string => typeof p === 'string')
      .map(p => ({ url: p, caption: `Byggdagbok ${r.date}` })),
  )

  // Fetch materials
  const { data: materials } = await supabase
    .from('project_material')
    .select('name, quantity, unit')
    .eq('project_id', projectId)
    .eq('business_id', businessId)

  // Fetch photos (max 6)
  const { data: photos } = await supabase
    .from('field_report_photos')
    .select('url, caption')
    .eq('business_id', businessId)
    .in('report_id', (reports || []).map((r: any) => r.id).filter(Boolean))
    .limit(6)

  // Also fetch from project_photos if available
  const { data: projectPhotos } = await supabase
    .from('project_photos')
    .select('url, caption')
    .eq('project_id', projectId)
    .eq('business_id', businessId)
    .limit(6)

  // Dagboksfoton fyller upp till 6 om fältrapporter/projektfoton inte räcker.
  const allPhotos = [
    ...(photos || []),
    ...(projectPhotos || []),
    ...diaryPhotos,
  ].slice(0, 6)

  const reportData: JobReportData = {
    projectId,
    projectName: project.name,
    customerName: customer?.name || 'Kund',
    customerEmail: customer?.email || null,
    customerAddress: customer?.address_line || null,
    completedAt: project.completed_at || new Date().toISOString(),
    workPerformed: workPerformed.length > 0 ? workPerformed : ['Arbete utfört enligt offert'],
    materials: (materials || []).map((m: any) => ({
      name: m.name,
      quantity: Number(m.quantity) || 1,
      unit: m.unit || 'st',
    })),
    photos: allPhotos.map(p => ({ url: p.url, caption: p.caption || null })),
    deviations,
    diaryHours,
    businessName: business?.business_name || '',
    contactName: business?.contact_name || '',
    orgNumber: business?.org_number || null,
    logoUrl: business?.logo_url || null,
    warrantyWorkYears: 2,
    warrantyMaterialYears: 5,
  }

  // Create pending approval
  const photoCount = allPhotos.length
  const materialCount = (materials || []).length

  const { error: approvalError } = await supabase.from('pending_approvals').insert({
    business_id: businessId,
    approval_type: 'job_report',
    title: `📋 Jobbrapport — ${project.name}`,
    description: `${customer?.name || 'Kund'} · ${workPerformed.length} arbetsmoment · ${materialCount} material · ${photoCount} foton`,
    payload: { ...reportData, agent_id: 'lars' },
    status: 'pending',
    risk_level: 'low',
  })

  if (approvalError) return { success: false, error: 'Jobbrapportens godkännandekort kunde inte sparas' }

  // Log
  try {
    // Sanering 2026-08-05: action_taken/success finns inte som kolumner och
    // NOT NULL-fälten action_type/status saknades → varje insert failade.
    const { error: logErr } = await supabase.from('v3_automation_logs').insert({
      business_id: businessId,
      rule_name: 'job_report_followup',
      trigger_type: 'event',
      action_type: 'create_approval',
      status: 'success',
      agent_id: 'lars',
      context: {
        project_id: projectId,
        customer_id: (customer as any)?.customer_id || null,
        project_name: project.name,
        action_taken: `Jobbrapport förberedd för ${project.name}`,
      },
    })
    if (logErr) console.warn('[job-report] v3-logg insert misslyckades:', logErr.message)
  } catch { /* non-blocking */ }

  return { success: true }
}

/**
 * Generera jobbrapport-PDF med jsPDF.
 *
 * Handymate-stämpeln (lib/branding/attribution.ts) skickas som separat option — inte i
 * JobReportData, som är den lagrade payloaden i pending_approvals och inte
 * ska bära ett värde som slås upp vid renderingstillfället. Samma sak med
 * varumärket (yta 2, 2026-09-07): sidhuvud/sidfot ritas ur brand-lagret
 * (lib/branding/pdf.ts) så att rapporten ser ut som firmans övriga dokument
 * även om payloaden är dagar gammal. Utan `brand` faller vi tillbaka på
 * payloadens namn/org.nr — loggan ritas då inte.
 */
export async function generateJobReportPdf(
  data: JobReportData,
  opts: { attribution?: Attribution; brand?: PdfBranding } = {},
): Promise<Buffer> {
  // Dynamic import to avoid SSR issues
  const jsPDFModule = await import('jspdf')
  const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF
  await import('jspdf-autotable')

  const brand: PdfBranding = opts.brand ?? pdfBrandingFrom({
    businessName: data.businessName,
    accentColor: DEFAULT_ACCENT_COLOR,
    contactName: data.contactName || undefined,
    orgNumber: data.orgNumber || undefined,
    fSkattRegistered: false,
    attribution: opts.attribution ?? buildAttribution(null),
  })
  const ACCENT = brand.accent

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()

  // Sidhuvud ur brand-lagret (logga, firma, org.nr) + titel/projekt till höger.
  const meta: string[] = [`Kund: ${data.customerName}`]
  if (data.customerAddress) meta.push(`Adress: ${data.customerAddress}`)
  meta.push(`Avslutat ${new Date(data.completedAt).toLocaleDateString('sv-SE')}`)
  let y = drawBrandHeader(doc, brand, {
    docType: 'Jobbrapport',
    title: data.projectName,
    meta,
    y: 15,
    margin: 15,
  })

  // Info
  doc.setFontSize(9)
  doc.setTextColor(...PDF_TEXT_MUTED)
  doc.text(`Utfört av: ${data.contactName}`, 15, y)
  y += 5
  if (data.diaryHours != null && data.diaryHours > 0) {
    doc.text(`Arbetstid enligt byggdagbok: ${data.diaryHours} h`, 15, y)
    y += 5
  }
  y += 5

  // Utfört arbete
  doc.setTextColor(...PDF_TEXT_PRIMARY)
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Utfört arbete', 15, y)
  y += 6
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  for (const work of data.workPerformed) {
    const lines = doc.splitTextToSize(`• ${work}`, pageWidth - 30)
    doc.text(lines, 15, y)
    y += lines.length * 4.5
    if (y > 270) { doc.addPage(); y = 15 }
  }
  y += 4

  // Avvikelser ur byggdagboken — kunden ska se vad som hände, inte bara vad som gjordes
  const deviations = Array.isArray(data.deviations) ? data.deviations : []
  if (deviations.length > 0) {
    if (y > 250) { doc.addPage(); y = 15 }
    doc.setTextColor(30, 41, 59)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Avvikelser under arbetet', 15, y)
    y += 6
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(180, 83, 9)
    for (const dev of deviations) {
      const lines = doc.splitTextToSize(`• ${dev}`, pageWidth - 30)
      doc.text(lines, 15, y)
      y += lines.length * 4.5
      if (y > 270) { doc.addPage(); y = 15 }
    }
    doc.setTextColor(30, 41, 59)
    y += 4
  }

  // Material
  if (data.materials.length > 0) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Material', 15, y)
    y += 2
    ;(doc as any).autoTable({
      startY: y,
      margin: { left: 15, right: 15 },
      head: [['Material', 'Antal', 'Enhet']],
      body: data.materials.map(m => [m.name, String(m.quantity), m.unit]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [...ACCENT], textColor: 255 },
      alternateRowStyles: { fillColor: [249, 250, 251] },
    })
    y = (doc as any).lastAutoTable.finalY + 8
  }

  // Garanti
  if (y > 250) { doc.addPage(); y = 15 }
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text('Garanti', 15, y)
  y += 6
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  const warrantyFrom = new Date(data.completedAt).toLocaleDateString('sv-SE')
  doc.text(`Arbetsgaranti: ${data.warrantyWorkYears} år (från ${warrantyFrom})`, 15, y)
  y += 5
  doc.text(`Materialgaranti: ${data.warrantyMaterialYears} år (från ${warrantyFrom})`, 15, y)
  y += 10

  // Sidfot (firma · org.nr · F-skatt · kontakt + sidnummer) + stämpeln sist.
  drawBrandFooter(doc, brand, { margin: 15 })
  stampAttributionOnPdf(doc, opts.attribution ?? buildAttribution(null))

  return Buffer.from(doc.output('arraybuffer'))
}

/**
 * Godkänn jobbrapport: generera PDF, ladda upp, skicka mail.
 */
export async function approveJobReport(
  businessId: string,
  _projectIdOrApprovalId: string,
  reportData: JobReportData
): Promise<{ success: boolean; pdfUrl?: string; error?: string; email_sent?: boolean; partial?: boolean }> {
  const supabase = getServerSupabase()

  let documentSaved = false
  let emailSent = false
  try {
    const { data: project, error: projectError } = await supabase.from('project')
      .select('project_id, customer_id').eq('project_id', reportData.projectId).eq('business_id', businessId).single()
    if (projectError || !project) return { success: false, error: 'Projektet kunde inte verifieras för företaget' }
    const { data: customer, error: customerError } = await supabase.from('customer')
      .select('customer_id, email').eq('customer_id', project.customer_id).eq('business_id', businessId).single()
    if (customerError || !customer || !reportData.customerEmail || customer.email !== reportData.customerEmail) {
      return { success: false, error: 'Rapportens mottagare saknas eller har ändrats. Förbered ett nytt underlag.' }
    }
    // Generate PDF — stämpeln laddas här (EN query) eftersom rutten bara
    // har businessId, inte business_config-raden. Varumärket (logga, accent,
    // F-skatt) laddas färskt i stället för ur payloaden — den kan vara
    // dagar gammal och firman kan ha bytt logga sedan dess.
    const attribution = await loadAttribution(supabase, businessId)
    const brand = await loadPdfBranding(supabase, businessId, 'job-report')
    const pdfBuffer = await generateJobReportPdf(reportData, { attribution, brand })

    // Upload to Supabase Storage
    const fileName = `job-report-${reportData.projectId}-${Date.now()}.pdf`
    const storagePath = `${businessId}/reports/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('customer-documents')
      .upload(storagePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadError) {
      console.error('PDF upload error:', uploadError)
      return { success: false, error: 'Kunde inte ladda upp PDF' }
    }

    // v151: bucketen är privat — pdf_url lagrar PATH (aldrig en publik/
    // signerad URL). Signering sker vid läsning.
    const { error: documentError } = await supabase.from('generated_document').insert({
      id: `jrep_${Math.random().toString(36).slice(2, 11)}`,
      business_id: businessId,
      project_id: reportData.projectId,
      customer_id: customer.customer_id,
      title: `Jobbrapport — ${reportData.projectName}`,
      content: [{ type: 'job_report', data: reportData }],
      variables_data: reportData,
      status: 'completed',
      pdf_url: storagePath,
    })

    if (documentError) return { success: false, partial: true, error: 'PDF-filen laddades upp men dokumentet kunde inte registreras. Inget mejl skickades.' }
    documentSaved = true

    // Mejlet länkar (bifogar inte bytes) — kunden kan öppna det dagar
    // senare, så en 1h-TTL räcker inte. 7 dygn är den dokumenterade
    // avvägningen för länkad-i-mejl (Etapp Z-instruktionen): länge nog för
    // att rimligen hinna öppnas, men aldrig permanent. Denna signerade URL
    // returneras till approval-anroparen (transient API-svar) men skrivs
    // ALDRIG till databasen — se pdf_url ovan.
    const { signStorageUrl } = await import('@/lib/storage-signing')
    const pdfUrl = (await signStorageUrl(supabase, 'customer-documents', storagePath, 7 * 24 * 3600)) || ''

    if (!pdfUrl) return { success: false, partial: true, error: 'Rapporten är sparad men PDF-länken kunde inte skapas. Inget mejl skickades.' }

    // Send email if customer has email
    if (reportData.customerEmail) {
      try {
        const { sendEmail } = await import('@/lib/email')
        // Varumärkeslagret 2026-09-07: masterlayouten (logotyp/accent/stämpel)
        // i stället för nakna <p> med hårdkodad teal.
        const { loadBranding } = await import('@/lib/branding/get-branding')
        const { emailLayout, emailHeading, emailParagraph, actionBlock, signature } = await import('@/lib/email-templates')
        const { escapeHtml } = await import('@/lib/document-html')
        const branding = await loadBranding(supabase, businessId)
        const firstName = escapeHtml(reportData.customerName.split(' ')[0])
        const content = `
          ${emailHeading(`Jobbrapport — ${escapeHtml(reportData.projectName)}`, `${firstName ? `Hej ${firstName}! ` : ''}Här kommer jobbrapporten för arbetet hos dig.`)}
          ${emailParagraph('Rapporten innehåller utfört arbete, material och garantiinformation. Spara den — det är din dokumentation över jobbet.')}
          ${actionBlock({ text: 'Öppna jobbrapporten (PDF)', url: pdfUrl }, branding.accentColor)}
          ${signature(escapeHtml(reportData.businessName), reportData.contactName ? escapeHtml(reportData.contactName) : undefined, { phone: branding.contactPhone ? escapeHtml(branding.contactPhone) : undefined })}
        `
        const delivery = await sendEmail({
          businessId,
          to: reportData.customerEmail,
          subject: `Jobbrapport — ${reportData.projectName} från ${reportData.businessName}`,
          html: emailLayout(branding, content, { meta: 'Jobbrapport' }),
          fromName: reportData.businessName,
        })
        if (!delivery.success) return { success: false, partial: true, email_sent: false, pdfUrl, error: delivery.error || 'Rapporten är sparad men mejltjänsten avvisade utskicket.' }
        emailSent = true
      } catch (error) {
        return { success: false, partial: true, email_sent: false, pdfUrl, error: error instanceof Error ? error.message : 'Mejlutskicket kunde inte bekräftas' }
      }
    }

    // Log
    // Sanering 2026-08-05: samma trasiga insert-form som ovan — rättad.
    const { error: sendLogErr } = await supabase.from('v3_automation_logs').insert({
      business_id: businessId,
      rule_name: 'job_report_followup',
      trigger_type: 'event',
      action_type: 'send_email',
      status: 'success',
      agent_id: 'lars',
      context: {
        project_id: reportData.projectId || null,
        project_name: reportData.projectName,
        action_taken: `Jobbrapport skickad till ${reportData.customerEmail || 'kund'}`,
      },
    })
    if (sendLogErr) return { success: false, partial: true, email_sent: emailSent, pdfUrl, error: 'Mejltjänsten accepterade rapporten men historiken kunde inte sparas. Skicka inte igen.' }

    return { success: true, pdfUrl, email_sent: emailSent }
  } catch (err: any) {
    return { success: false, partial: documentSaved, email_sent: emailSent, error: err.message }
  }
}
