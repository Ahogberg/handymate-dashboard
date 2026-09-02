import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { generateAtaPDF } from '@/lib/ata/pdf'
import { laddaAtaPdfKontext, pdfSvar } from '@/lib/ata/pdf-data'

// Auth via request.headers i importerad helper — utan force-dynamic kan
// rutten frysas i Full Route Cache och servera fel företags dokument
// (2026-08-22-klassen, se CLAUDE.md).
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * GET /api/ata/[id]/pdf — ÄTA-dokumentet för hantverkaren (inloggad).
 *
 * Dokumentet visar belopp, så samma grind som övriga ÄTA-rutter:
 * see_financials (TD-77) — annars 403, aldrig ett prisstrippat dokument.
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

    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'see_financials')) {
      return NextResponse.json({ error: 'Du saknar behörighet att se belopp' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const { data: ata, error } = await supabase
      .from('project_change')
      .select('*')
      .eq('change_id', params.id)
      .eq('business_id', business.business_id)
      .maybeSingle()
    if (error) throw error
    if (!ata) {
      return NextResponse.json({ error: 'ÄTA hittades inte' }, { status: 404 })
    }

    const kontext = await laddaAtaPdfKontext(supabase, ata)
    const pdf = await generateAtaPDF({ ata, ...kontext })
    return pdfSvar(pdf, ata.ata_number)
  } catch (error: any) {
    console.error('GET /api/ata/[id]/pdf error:', error)
    return NextResponse.json({ error: 'Kunde inte skapa ÄTA-dokumentet' }, { status: 500 })
  }
}
