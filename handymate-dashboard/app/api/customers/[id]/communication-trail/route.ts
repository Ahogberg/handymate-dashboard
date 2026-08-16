import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { getCommunicationTrail, normalizeTrailRange } from '@/lib/compliance/communication-trail'

/**
 * Kommunikationsunderlaget som JSON — LÄSANDE. Fullständiga poster (inget
 * UI-radtak); bortfall och avkortning redovisas ärligt i svaret så en
 * konsument aldrig kan missta ett ofullständigt underlag för ett komplett.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await getAuthenticatedBusiness(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = request.nextUrl
    const { fromIso, toIso } = normalizeTrailRange(
      searchParams.get('from') || undefined,
      searchParams.get('to') || undefined,
    )

    const supabase = getServerSupabase()
    const trail = await getCommunicationTrail(supabase, auth.business_id, params.id, { fromIso, toIso })
    if (!trail) {
      return NextResponse.json({ error: 'Kunden hittades inte' }, { status: 404 })
    }

    return NextResponse.json({
      entries: trail.entries,
      sources_with_errors: trail.sources_with_errors,
      truncated_sources: trail.truncated_sources,
      customer: { name: trail.customer.name },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Okänt fel'
    console.error('[communication-trail] GET misslyckades:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
