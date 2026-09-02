import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { generateAtaPDF } from '@/lib/ata/pdf'
import { laddaAtaPdfKontext, pdfSvar } from '@/lib/ata/pdf-data'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * GET /api/ata/sign/[token]/pdf — ÄTA-dokumentet för kunden (publik,
 * sign_token är nyckeln — samma modell som signeringssidan).
 *
 * Aldrig för draft/pending: kunden får bara se det hantverkaren faktiskt
 * skickat. Token loggas aldrig.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    if (!params.token) {
      return NextResponse.json({ error: 'Token saknas' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const { data: ata, error } = await supabase
      .from('project_change')
      .select('*')
      .eq('sign_token', params.token)
      .maybeSingle()
    if (error) throw error
    if (!ata || ata.status === 'draft' || ata.status === 'pending') {
      return NextResponse.json({ error: 'ÄTA:n är inte skickad än' }, { status: 404 })
    }

    const kontext = await laddaAtaPdfKontext(supabase, ata)
    const pdf = await generateAtaPDF({ ata, ...kontext })
    return pdfSvar(pdf, ata.ata_number)
  } catch (error: any) {
    console.error('GET /api/ata/sign/[token]/pdf error:', error?.message)
    return NextResponse.json({ error: 'Kunde inte skapa ÄTA-dokumentet' }, { status: 500 })
  }
}
