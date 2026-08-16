import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { getCommunicationTrail, normalizeTrailRange } from '@/lib/compliance/communication-trail'
import { renderTrailHtml } from '@/lib/compliance/trail-html'
import { renderHtmlToPdf } from '@/lib/pdf/render-html-to-pdf'

// Chromium-rendering kräver Node-runtime (inte Edge) och tål kallstart —
// samma förutsättningar som offert-/faktura-PDF:erna.
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * Kommunikationsunderlaget som nedladdningsbar PDF.
 *
 * Leveransval (samma mönster som quotes/pdf sedan Andreas-beslutet
 * 2026-08-03): bygg utskriftsvänlig HTML (lib/compliance/trail-html.ts) och
 * skriv ut den via headless Chromium (lib/pdf/render-html-to-pdf.ts). Till
 * skillnad från offerten finns ingen jsPDF-fallback att återanvända här —
 * i stället serveras SAMMA HTML inline som utskriftsvänlig flik när Chromium
 * inte kan starta (lokal dev utan CHROME_EXECUTABLE_PATH, kallstartstimeout).
 * Innehållet är identiskt i båda lägena; bara leveransformatet skiljer.
 * ?format=html tvingar HTML-vyn (förhandsgranskning i flik).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await getAuthenticatedBusiness(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Rollskydd (Andreas beslut 2026-08-16): kompletta transkript — samma
  // see_financials-grind som offert-PDF:en (TD-71-mönstret). Owner/admin auto.
  const currentUser = await getCurrentUser(request)
  if (!currentUser || !hasPermission(currentUser, 'see_financials')) {
    return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
  }

  try {
    const { searchParams } = request.nextUrl
    const from = searchParams.get('from') || undefined
    const to = searchParams.get('to') || undefined
    const { fromIso, toIso } = normalizeTrailRange(from, to)

    const supabase = getServerSupabase()
    const trail = await getCommunicationTrail(supabase, auth.business_id, params.id, { fromIso, toIso })
    if (!trail) {
      return NextResponse.json({ error: 'Kunden hittades inte' }, { status: 404 })
    }

    const { data: config } = await supabase
      .from('business_config')
      .select('business_name')
      .eq('business_id', auth.business_id)
      .single()

    const html = renderTrailHtml({
      businessName: config?.business_name || 'Företaget',
      customerName: trail.customer.name,
      generatedAtIso: new Date().toISOString(),
      fromIso,
      toIso,
      entries: trail.entries,
      sourcesWithErrors: trail.sources_with_errors,
      truncatedSources: trail.truncated_sources,
    })

    const htmlResponse = () => new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })

    if (searchParams.get('format') === 'html') {
      return htmlResponse()
    }

    const pdf = await renderHtmlToPdf(html, 'communication-trail/pdf')
    if (pdf) {
      // Content-Disposition tål bara ASCII — kundnamnet slugifieras hårt.
      const slug = trail.customer.name.replace(/[^a-zA-Z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'kund'
      return new NextResponse(pdf, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="Kommunikationsunderlag-${slug}.pdf"`,
        },
      })
    }

    // Chromium föll — leverera samma innehåll som utskriftsvänlig HTML-flik.
    return htmlResponse()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Okänt fel'
    console.error('[communication-trail/pdf] misslyckades:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
