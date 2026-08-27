import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { sendPortalNotification } from '@/lib/portal/notification-emails'

export const dynamic = 'force-dynamic'

/**
 * POST /api/projects/[id]/jobbpass/notify — Fastighetspasset steg 1 (2026-08-27).
 *
 * Sanningsgrind 5: publicering och utskick är två handlingar. Publiceringen
 * (POST …/jobbpass/publish) skickar aldrig något själv — mejlet till kunden
 * går bara när ägaren trycker "Meddela kunden", och då genom portalens
 * befintliga utskicksgrind i sendPortalNotification (kundens portal på,
 * e-post finns, 1 h-dedup, loggas i portal_notification_log). Aldrig SMS.
 *
 * Owner-admin, samma grind som publish (tests/permission-contract.spec.ts).
 * Svaret säger ärligt på svenska vad som hände — "skickat" betyder skickat.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const { data: pass, error: passErr } = await supabase
      .from('jobbpass')
      .select('status')
      .eq('business_id', business.business_id)
      .eq('project_id', params.id)
      .maybeSingle()
    if (passErr) {
      console.error('[projects/jobbpass/notify] jobbpass query error:', passErr)
      return NextResponse.json({ error: 'Kunde inte läsa jobbpasset' }, { status: 500 })
    }
    if (!pass || pass.status !== 'published') {
      return NextResponse.json({ error: 'Publicera jobbpasset först — kunden kan inte öppna ett utkast.' }, { status: 400 })
    }

    const { data: project, error: projErr } = await supabase
      .from('project')
      .select('customer_id, name')
      .eq('business_id', business.business_id)
      .eq('project_id', params.id)
      .maybeSingle()
    if (projErr) {
      console.error('[projects/jobbpass/notify] project query error:', projErr)
      return NextResponse.json({ error: 'Kunde inte läsa projektet' }, { status: 500 })
    }
    if (!project?.customer_id) {
      return NextResponse.json({ error: 'Projektet saknar kund — koppla en kund för att kunna mejla.' }, { status: 400 })
    }

    const result = await sendPortalNotification(business.business_id, project.customer_id, 'jobbpass_published', {
      context: { project_id: params.id, project_name: project.name },
    })

    if (!result.success) {
      if (result.skipped === 'no_resend_key') {
        return NextResponse.json({ error: 'Mejlutskick är inte konfigurerat på servern.' }, { status: 500 })
      }
      console.error('[projects/jobbpass/notify] utskick misslyckades:', result.error)
      return NextResponse.json({ error: 'Mejlet kunde inte skickas just nu.' }, { status: 502 })
    }

    const message =
      result.skipped === 'dedup' ? 'Kunden fick redan ett mejl om jobbpasset för mindre än en timme sedan — inget nytt skickades.'
      : result.skipped === 'no_email' ? 'Kunden saknar e-postadress. Lägg till en under Kunder så kan du mejla.'
      : result.skipped === 'no_portal' ? 'Kundportalen är avstängd för den här kunden — inget mejl skickades.'
      : 'Kunden har fått ett mejl med länk till jobbpasset i sin portal.'

    return NextResponse.json({ sent: !result.skipped, skipped: result.skipped ?? null, message })
  } catch (error) {
    console.error('[projects/jobbpass/notify] oväntat fel:', error)
    return NextResponse.json({ error: 'Utskicket misslyckades' }, { status: 500 })
  }
}
