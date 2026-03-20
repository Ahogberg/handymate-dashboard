import { getServerSupabase } from '@/lib/supabase'

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
    .single()

  if (!project) return { success: false, error: 'Projekt hittades inte' }

  // Fetch customer
  const { data: customer } = await supabase
    .from('customer')
    .select('name, email, address_line')
    .eq('customer_id', project.customer_id)
    .single()

  // Fetch business
  const { data: business } = await supabase
    .from('business_config')
    .select('business_name, contact_name, org_number, logo_url')
    .eq('business_id', businessId)
    .single()

  // Fetch field reports (byggdagbok)
  const { data: reports } = await supabase
    .from('field_reports')
    .select('title, work_performed, materials_used')
    .eq('project_id', projectId)
    .eq('business_id', businessId)
    .order('created_at')

  const workPerformed = (reports || [])
    .filter((r: any) => r.work_performed)
    .map((r: any) => r.work_performed as string)

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

  const allPhotos = [
    ...(photos || []),
    ...(projectPhotos || []),
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

  await supabase.from('pending_approvals').insert({
    business_id: businessId,
    approval_type: 'job_report',
    title: `📋 Jobbrapport — ${project.name}`,
    description: `${customer?.name || 'Kund'} · ${workPerformed.length} arbetsmoment · ${materialCount} material · ${photoCount} foton`,
    payload: reportData,
    status: 'pending',
    risk_level: 'low',
  })

  // Log
  try {
    await supabase.from('v3_automation_logs').insert({
      business_id: businessId,
      rule_name: 'job_report_followup',
      trigger_type: 'event',
      action_taken: `Jobbrapport förberedd för ${project.name}`,
      success: true,
      agent_id: 'lars',
    })
  } catch { /* non-blocking */ }

  return { success: true }
}

/**
 * Generera jobbrapport-PDF med jsPDF.
 */
export async function generateJobReportPdf(data: JobReportData): Promise<Buffer> {
  // Dynamic import to avoid SSR issues
  const jsPDFModule = await import('jspdf')
  const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF
  await import('jspdf-autotable')

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 15

  // Header bar
  doc.setFillColor(15, 118, 110) // teal-700
  doc.rect(0, 0, pageWidth, 25, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(data.businessName, 15, 16)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  if (data.orgNumber) {
    doc.text(`Org.nr: ${data.orgNumber}`, pageWidth - 15, 16, { align: 'right' })
  }

  y = 35
  doc.setTextColor(30, 41, 59) // gray-800

  // Title
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(`Jobbrapport`, 15, y)
  y += 8
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(data.projectName, 15, y)
  y += 8

  // Info box
  doc.setFontSize(9)
  doc.setTextColor(107, 114, 128) // gray-500
  doc.text(`Kund: ${data.customerName}`, 15, y)
  y += 5
  if (data.customerAddress) {
    doc.text(`Adress: ${data.customerAddress}`, 15, y)
    y += 5
  }
  doc.text(`Avslutat: ${new Date(data.completedAt).toLocaleDateString('sv-SE')}`, 15, y)
  y += 5
  doc.text(`Utfört av: ${data.contactName}`, 15, y)
  y += 10

  // Utfört arbete
  doc.setTextColor(30, 41, 59)
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
      headStyles: { fillColor: [15, 118, 110], textColor: 255 },
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

  // Footer
  doc.setFontSize(8)
  doc.setTextColor(156, 163, 175) // gray-400
  const footerY = doc.internal.pageSize.getHeight() - 10
  doc.text(`${data.businessName} · ${data.contactName}${data.orgNumber ? ` · ${data.orgNumber}` : ''}`, 15, footerY)
  doc.text('Genererad via Handymate', pageWidth - 15, footerY, { align: 'right' })

  return Buffer.from(doc.output('arraybuffer'))
}

/**
 * Godkänn jobbrapport: generera PDF, ladda upp, skicka mail.
 */
export async function approveJobReport(
  businessId: string,
  _projectIdOrApprovalId: string,
  reportData: JobReportData
): Promise<{ success: boolean; pdfUrl?: string; error?: string }> {
  const supabase = getServerSupabase()

  try {
    // Generate PDF
    const pdfBuffer = await generateJobReportPdf(reportData)

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

    const { data: urlData } = supabase.storage
      .from('customer-documents')
      .getPublicUrl(storagePath)

    const pdfUrl = urlData?.publicUrl || ''

    // Save to generated_document
    await supabase.from('generated_document').insert({
      id: `jrep_${Math.random().toString(36).slice(2, 11)}`,
      business_id: businessId,
      project_id: reportData.projectId,
      customer_id: reportData.customerEmail ? undefined : undefined,
      title: `Jobbrapport — ${reportData.projectName}`,
      content: [{ type: 'job_report', data: reportData }],
      variables_data: reportData,
      status: 'completed',
      pdf_url: pdfUrl,
    })

    // Send email if customer has email
    if (reportData.customerEmail) {
      try {
        const { sendEmail } = await import('@/lib/email')
        await sendEmail({
          to: reportData.customerEmail,
          subject: `Jobbrapport — ${reportData.projectName} från ${reportData.businessName}`,
          html: `
            <p>Hej ${reportData.customerName.split(' ')[0]}!</p>
            <p>Här kommer jobbrapporten för <strong>${reportData.projectName}</strong>.</p>
            <p>Rapporten innehåller utfört arbete, material och garantiinformation.</p>
            <p><a href="${pdfUrl}" style="display:inline-block;padding:12px 24px;background:#0F766E;color:white;text-decoration:none;border-radius:8px;font-weight:600;">Öppna jobbrapport (PDF)</a></p>
            <p>Med vänliga hälsningar,<br/>${reportData.contactName}<br/>${reportData.businessName}</p>
          `,
          fromName: reportData.businessName,
        })
      } catch { /* non-blocking */ }
    }

    // Log
    await supabase.from('v3_automation_logs').insert({
      business_id: businessId,
      rule_name: 'job_report_followup',
      trigger_type: 'event',
      action_taken: `Jobbrapport skickad till ${reportData.customerEmail || 'kund'}`,
      success: true,
      agent_id: 'lars',
    })

    return { success: true, pdfUrl }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
