import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const ACCENT_RGB = [15, 118, 110] as const
const TEXT_PRIMARY = [30, 41, 59] as const
const TEXT_SECONDARY = [148, 163, 184] as const
const TEXT_MUTED = [100, 116, 139] as const

const WEATHER_LABELS: Record<string, string> = {
  sunny: 'Sol',
  cloudy: 'Mulet',
  rainy: 'Regn',
  snowy: 'Snö',
  windy: 'Blåsigt',
}

/**
 * GET /api/projects/[id]/logs/pdf - Exportera byggdagbok som PDF
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
    const projectId = params.id

    // Fetch project info
    const { data: project } = await supabase
      .from('project')
      .select('name, description, start_date, end_date, customer:customer_id (name)')
      .eq('project_id', projectId)
      .eq('business_id', business.business_id)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Projekt hittades inte' }, { status: 404 })
    }

    // Fetch all logs sorted chronologically
    const { data: logs, error } = await supabase
      .from('project_log')
      .select(`
        *,
        business_user:business_user_id (id, name)
      `)
      .eq('order_id', projectId)
      .eq('business_id', business.business_id)
      .order('date', { ascending: true })

    if (error) throw error

    // Generate PDF
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const margin = 20
    const contentWidth = pageWidth - margin * 2
    let y = margin

    // ── Header ──
    doc.setFontSize(16)
    doc.setTextColor(...TEXT_PRIMARY)
    doc.text(business.business_name || 'Företag', margin, y + 6)

    doc.setFontSize(9)
    doc.setTextColor(...TEXT_SECONDARY)
    const contactLine = [business.contact_phone, business.contact_email].filter(Boolean).join(' · ')
    if (contactLine) doc.text(contactLine, margin, y + 12)

    // Document type
    doc.setFontSize(8)
    doc.setTextColor(...ACCENT_RGB)
    doc.text('BYGGDAGBOK', pageWidth - margin, y + 3, { align: 'right' })

    doc.setFontSize(14)
    doc.setTextColor(...TEXT_PRIMARY)
    doc.text(project.name || 'Projekt', pageWidth - margin, y + 11, { align: 'right' })

    y += 22

    // Customer & date range
    const customer = project.customer as any
    const metaLines: string[] = []
    if (customer?.name) metaLines.push(`Kund: ${customer.name}`)
    if (project.start_date) metaLines.push(`Period: ${project.start_date}${project.end_date ? ` – ${project.end_date}` : ' –'}`)
    metaLines.push(`Antal poster: ${(logs || []).length}`)
    metaLines.push(`Exporterad: ${new Date().toLocaleDateString('sv-SE')}`)

    doc.setFontSize(9)
    doc.setTextColor(...TEXT_MUTED)
    metaLines.forEach(line => {
      doc.text(line, margin, y)
      y += 4.5
    })

    y += 4

    // Separator
    doc.setDrawColor(226, 232, 240)
    doc.setLineWidth(0.3)
    doc.line(margin, y, pageWidth - margin, y)
    y += 6

    // ── Log entries ──
    if (!logs || logs.length === 0) {
      doc.setFontSize(10)
      doc.setTextColor(...TEXT_SECONDARY)
      doc.text('Inga dagboksanteckningar.', margin, y)
    } else {
      for (const log of logs) {
        // Check if we need a new page
        if (y > 260) {
          doc.addPage()
          y = margin
        }

        // Date header
        const dateStr = new Date(log.date + 'T00:00:00').toLocaleDateString('sv-SE', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })

        doc.setFontSize(10)
        doc.setTextColor(...TEXT_PRIMARY)
        doc.text(dateStr.charAt(0).toUpperCase() + dateStr.slice(1), margin, y)

        // Weather + workers on same line (right)
        const metaParts: string[] = []
        if (log.weather) {
          let w = WEATHER_LABELS[log.weather] || log.weather
          if (log.temperature != null) w += `, ${log.temperature}°C`
          metaParts.push(w)
        }
        if (log.workers_count != null) metaParts.push(`${log.workers_count} arbetare`)
        if (log.business_user?.name) metaParts.push(log.business_user.name)

        if (metaParts.length > 0) {
          doc.setFontSize(8)
          doc.setTextColor(...TEXT_MUTED)
          doc.text(metaParts.join('  ·  '), pageWidth - margin, y, { align: 'right' })
        }

        y += 5

        // Work description
        if (log.work_performed) {
          doc.setFontSize(9)
          doc.setTextColor(...TEXT_PRIMARY)
          const lines = doc.splitTextToSize(log.work_performed, contentWidth)
          doc.text(lines, margin, y)
          y += lines.length * 4
        }

        // Materials
        if (log.materials_used) {
          doc.setFontSize(8)
          doc.setTextColor(...TEXT_MUTED)
          doc.text(`Material: ${log.materials_used}`, margin, y)
          y += 4
        }

        // Deviations
        if (log.issues) {
          doc.setFontSize(8)
          doc.setTextColor(180, 83, 9) // amber
          const devLines = doc.splitTextToSize(`Avvikelse: ${log.issues}`, contentWidth)
          doc.text(devLines, margin, y)
          y += devLines.length * 4
        }

        // Notes
        if (log.description) {
          doc.setFontSize(8)
          doc.setTextColor(...TEXT_SECONDARY)
          const noteLines = doc.splitTextToSize(log.description, contentWidth)
          doc.text(noteLines, margin, y)
          y += noteLines.length * 4
        }

        // Separator between entries
        y += 2
        doc.setDrawColor(241, 245, 249)
        doc.setLineWidth(0.2)
        doc.line(margin, y, pageWidth - margin, y)
        y += 5
      }
    }

    // Footer on each page
    const pageCount = doc.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(7)
      doc.setTextColor(...TEXT_SECONDARY)
      doc.text(
        `${business.business_name} — Byggdagbok — Sida ${i} av ${pageCount}`,
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
        'Content-Disposition': `attachment; filename="byggdagbok-${projectId}.pdf"`,
      },
    })

  } catch (error: any) {
    console.error('Byggdagbok PDF error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
