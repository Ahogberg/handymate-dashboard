import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import jsPDF from 'jspdf'
import { brandingFromConfig } from '@/lib/branding/get-branding'
import { stampAttributionOnPdf } from '@/lib/branding/attribution'
import {
  drawBrandHeader,
  drawBrandFooter,
  loadPdfLogo,
  pdfBrandingFrom,
  PDF_TEXT_PRIMARY as TEXT_PRIMARY,
  PDF_TEXT_MUTED as TEXT_MUTED,
} from '@/lib/branding/pdf'
// Auth via request.headers i importerad helper — utan force-dynamic kan
// rutten frysas i Full Route Cache och servera fel företags data
// (2026-08-22-klassen, se CLAUDE.md; residualsvep 2026-08-31).
export const dynamic = 'force-dynamic'

/**
 * GET /api/work-orders/[id]/pdf — Exportera arbetsorder som PDF.
 *
 * Sidhuvud/sidfot ur brand-lagret (lib/branding/pdf.ts, yta 2 2026-09-07):
 * arbetsordern följer ofta med till kunden på plats och ska se ut som
 * resten av firmans dokument.
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

    // Varumärket: business är hela business_config-raden (select('*')) —
    // ingen extra query, bara loggan hämtas.
    const brand = pdfBrandingFrom(brandingFromConfig(business), await loadPdfLogo(business.logo_url, 'work-orders/pdf'))
    const ACCENT = brand.accent

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const contentWidth = doc.internal.pageSize.getWidth() - 40
    const margin = 20
    let y = margin

    // ── Sidhuvud ur brand-lagret ──
    y = drawBrandHeader(doc, brand, {
      docType: 'Arbetsorder',
      title: String(wo.order_number ?? ''),
    })

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

    // Sidfot (firma · org.nr · F-skatt · kontakt + sidnummer) + stämpeln sist.
    drawBrandFooter(doc, brand)
    stampAttributionOnPdf(doc, brand.branding.attribution)

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
