import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import jsPDF from 'jspdf'

const ACCENT = [15, 118, 110] as const
const TEXT_PRIMARY = [30, 41, 59] as const
const TEXT_MUTED = [100, 116, 139] as const

/**
 * GET /api/work-orders/[id]/pdf — Exportera arbetsorder som PDF
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

    const { data: wo } = await supabase
      .from('work_orders')
      .select('*')
      .eq('id', params.id)
      .eq('business_id', business.business_id)
      .single()

    if (!wo) {
      return NextResponse.json({ error: 'Arbetsorder hittades inte' }, { status: 404 })
    }

    const { data: project } = await supabase
      .from('project')
      .select('name')
      .eq('project_id', wo.project_id)
      .single()

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 20
    const contentWidth = pageWidth - margin * 2
    let y = margin

    // ── Header ──
    doc.setFontSize(8)
    doc.setTextColor(...ACCENT)
    doc.text('ARBETSORDER', margin, y + 3)

    doc.setFontSize(10)
    doc.setTextColor(...TEXT_MUTED)
    doc.text(wo.order_number, margin, y + 9)

    doc.setFontSize(14)
    doc.setTextColor(...TEXT_PRIMARY)
    doc.text(business.business_name || '', pageWidth - margin, y + 6, { align: 'right' })

    doc.setFontSize(9)
    doc.setTextColor(...TEXT_MUTED)
    const contactLine = [business.contact_phone, business.contact_email].filter(Boolean).join(' · ')
    if (contactLine) doc.text(contactLine, pageWidth - margin, y + 12, { align: 'right' })

    y += 20

    // Separator
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.3)
    doc.line(margin, y, pageWidth - margin, y)
    y += 8

    // ── Title ──
    doc.setFontSize(16)
    doc.setTextColor(...TEXT_PRIMARY)
    const titleLines = doc.splitTextToSize(wo.title, contentWidth)
    doc.text(titleLines, margin, y)
    y += titleLines.length * 7 + 2

    if (project?.name) {
      doc.setFontSize(10)
      doc.setTextColor(...TEXT_MUTED)
      doc.text(`Projekt: ${project.name}`, margin, y)
      y += 6
    }

    y += 4

    // ── Helper: section with label + value ──
    const addSection = (label: string, value: string | null | undefined) => {
      if (!value) return
      if (y > 265) { doc.addPage(); y = margin }

      doc.setFontSize(8)
      doc.setTextColor(...ACCENT)
      doc.text(label.toUpperCase(), margin, y)
      y += 5

      doc.setFontSize(11)
      doc.setTextColor(...TEXT_PRIMARY)
      const lines = doc.splitTextToSize(value, contentWidth)
      doc.text(lines, margin, y)
      y += lines.length * 5 + 4
    }

    // ── Datum & tid ──
    if (wo.scheduled_date) {
      const dateStr = new Date(wo.scheduled_date + 'T00:00:00').toLocaleDateString('sv-SE', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
      let timeStr = ''
      if (wo.scheduled_start) {
        timeStr = ` kl ${wo.scheduled_start.substring(0, 5)}`
        if (wo.scheduled_end) timeStr += `–${wo.scheduled_end.substring(0, 5)}`
      }
      addSection('Datum & tid', `${dateStr.charAt(0).toUpperCase() + dateStr.slice(1)}${timeStr}`)
    }

    addSection('Adress', wo.address)
    addSection('Tillträde / portkod', wo.access_info)

    if (wo.contact_name) {
      const contactStr = wo.contact_phone
        ? `${wo.contact_name}  —  ${wo.contact_phone}`
        : wo.contact_name
      addSection('Kontaktperson på plats', contactStr)
    }

    addSection('Uppdragsbeskrivning', wo.description)
    addSection('Material att ta med', wo.materials_needed)
    addSection('Verktyg att ta med', wo.tools_needed)
    addSection('Övrigt', wo.notes)

    if (wo.assigned_to) {
      const assignStr = wo.assigned_phone
        ? `${wo.assigned_to}  —  ${wo.assigned_phone}`
        : wo.assigned_to
      addSection('Tilldelad', assignStr)
    }

    // Footer
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(7)
      doc.setTextColor(...TEXT_MUTED)
      doc.text(
        `${business.business_name} — Arbetsorder ${wo.order_number} — Sida ${i} av ${pageCount}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      )
    }

    const pdfBuffer = Buffer.from(doc.output('arraybuffer'))

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="arbetsorder-${wo.order_number}.pdf"`,
      },
    })
  } catch (error: any) {
    console.error('Work order PDF error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
