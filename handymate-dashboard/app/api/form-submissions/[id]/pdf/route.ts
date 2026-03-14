import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import jsPDF from 'jspdf'

const ACCENT_RGB = [15, 118, 110] as const
const TEXT_PRIMARY = [30, 41, 59] as const
const TEXT_MUTED = [100, 116, 139] as const

/**
 * GET /api/form-submissions/[id]/pdf — Generera PDF av formulär
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    const { data: submission, error } = await supabase
      .from('form_submissions')
      .select('*, template:template_id(name, category), project:project_id(name)')
      .eq('id', params.id)
      .eq('business_id', business.business_id)
      .single()

    if (error || !submission) {
      return NextResponse.json({ error: 'Formulär hittades inte' }, { status: 404 })
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 20
    const contentWidth = pageWidth - margin * 2
    let y = 20

    const checkPageBreak = (needed: number) => {
      if (y + needed > 270) {
        doc.addPage()
        y = 20
      }
    }

    // Header
    doc.setFontSize(18)
    doc.setTextColor(...ACCENT_RGB)
    doc.text(submission.name, margin, y)
    y += 8

    // Business name
    doc.setFontSize(10)
    doc.setTextColor(...TEXT_MUTED)
    doc.text(business.business_name || '', margin, y)
    y += 5

    // Project name
    const project = submission.project as any
    if (project?.name) {
      doc.text(`Projekt: ${project.name}`, margin, y)
      y += 5
    }

    // Status + date
    const statusLabel = submission.status === 'signed' ? 'Signerat' : submission.status === 'completed' ? 'Ifyllt' : 'Utkast'
    const dateStr = submission.signed_at
      ? new Date(submission.signed_at).toLocaleDateString('sv-SE')
      : new Date(submission.created_at).toLocaleDateString('sv-SE')
    doc.text(`Status: ${statusLabel} · ${dateStr}`, margin, y)
    y += 10

    // Separator line
    doc.setDrawColor(226, 232, 240)
    doc.line(margin, y, pageWidth - margin, y)
    y += 8

    // Fields
    const fields = submission.fields || []
    const answers = submission.answers || {}

    for (const field of fields) {
      const answer = answers[field.id] || {}

      if (field.type === 'header') {
        checkPageBreak(12)
        doc.setFontSize(12)
        doc.setTextColor(...ACCENT_RGB)
        doc.text(field.label || '', margin, y)
        y += 3
        doc.setDrawColor(226, 232, 240)
        doc.line(margin, y, pageWidth - margin, y)
        y += 6
        continue
      }

      if (field.type === 'checkbox') {
        checkPageBreak(8)
        doc.setFontSize(10)
        doc.setTextColor(...TEXT_PRIMARY)
        const checked = answer.checked ? '☑' : '☐'
        const labelText = `${checked}  ${field.label}${field.required ? ' *' : ''}`
        doc.text(labelText, margin, y)
        y += 6
        continue
      }

      if (field.type === 'text') {
        checkPageBreak(14)
        doc.setFontSize(9)
        doc.setTextColor(...TEXT_MUTED)
        doc.text(`${field.label}${field.required ? ' *' : ''}`, margin, y)
        y += 4
        doc.setFontSize(10)
        doc.setTextColor(...TEXT_PRIMARY)
        const value = answer.value || '—'
        const lines = doc.splitTextToSize(value, contentWidth)
        checkPageBreak(lines.length * 5 + 4)
        doc.text(lines, margin, y)
        y += lines.length * 5 + 4
        continue
      }

      if (field.type === 'photo') {
        checkPageBreak(10)
        doc.setFontSize(9)
        doc.setTextColor(...TEXT_MUTED)
        doc.text(`${field.label}${field.required ? ' *' : ''}`, margin, y)
        y += 4
        if (answer.photo_url && answer.photo_url.startsWith('data:image')) {
          checkPageBreak(45)
          try {
            doc.addImage(answer.photo_url, 'JPEG', margin, y, 40, 40)
            y += 44
          } catch {
            doc.setFontSize(10)
            doc.setTextColor(...TEXT_PRIMARY)
            doc.text('[Foto bifogat]', margin, y)
            y += 6
          }
        } else {
          doc.setFontSize(10)
          doc.setTextColor(...TEXT_PRIMARY)
          doc.text(answer.photo_url ? '[Foto bifogat]' : '—', margin, y)
          y += 6
        }
        continue
      }

      if (field.type === 'signature') {
        checkPageBreak(10)
        doc.setFontSize(9)
        doc.setTextColor(...TEXT_MUTED)
        doc.text(`${field.label}${field.required ? ' *' : ''}`, margin, y)
        y += 4
        if (answer.signature_data && answer.signature_data.startsWith('data:image')) {
          checkPageBreak(25)
          try {
            doc.addImage(answer.signature_data, 'PNG', margin, y, 50, 20)
            y += 24
          } catch {
            doc.setFontSize(10)
            doc.setTextColor(...TEXT_PRIMARY)
            doc.text('[Signatur]', margin, y)
            y += 6
          }
        } else {
          doc.setFontSize(10)
          doc.setTextColor(...TEXT_PRIMARY)
          doc.text('—', margin, y)
          y += 6
        }
        continue
      }
    }

    // Form-level signature
    if (submission.status === 'signed' && submission.signed_by_name) {
      checkPageBreak(35)
      y += 8
      doc.setDrawColor(226, 232, 240)
      doc.line(margin, y, pageWidth - margin, y)
      y += 8

      doc.setFontSize(10)
      doc.setTextColor(...TEXT_MUTED)
      doc.text('Signerat av:', margin, y)
      y += 5
      doc.setFontSize(11)
      doc.setTextColor(...TEXT_PRIMARY)
      doc.text(submission.signed_by_name, margin, y)
      y += 5
      doc.setFontSize(9)
      doc.setTextColor(...TEXT_MUTED)
      doc.text(new Date(submission.signed_at).toLocaleDateString('sv-SE'), margin, y)
      y += 5

      if (submission.signature_data && submission.signature_data.startsWith('data:image')) {
        try {
          doc.addImage(submission.signature_data, 'PNG', margin, y, 50, 20)
        } catch { /* ignore */ }
      }
    }

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))
    const filename = `${submission.name.replace(/[^a-zA-Z0-9åäöÅÄÖ\s-]/g, '').trim()}.pdf`

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    })
  } catch (error: any) {
    console.error('GET form-submissions PDF error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
