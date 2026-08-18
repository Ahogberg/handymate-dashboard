import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import {
  getAbsenceWindow,
  setAbsenceWindow,
  endAbsenceNow,
  isAbsenceActive,
  isValidAbsenceRange,
} from '@/lib/absence/absence-window'
import { raknaFranvaroStatus } from '@/lib/absence/escalation'

export const dynamic = 'force-dynamic'

/**
 * GET/POST/DELETE /api/absence — Owner Absence V1 (Etapp Å).
 *
 * Ägaren sätter/avslutar ett frånvarofönster ("jag är borta till fredag").
 * Samma rollgrind som mission/active (owner-admin) — det här är en
 * styrande inställning för hela företaget, inte något en anställd ska
 * kunna sätta eller läsa av. Registrerad i tests/permission-contract.spec.ts.
 *
 * GET svarar { window, active, status } — status (samlade/eskaleringar)
 * beräknas BARA när fönstret är aktivt, annars null. Räkningen är en ren
 * derivation (raknaFranvaroStatus) över pending_approvals skapade sedan
 * fönstret öppnades — ALDRIG en gissning.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const window = await getAbsenceWindow(business.business_id)
    const active = isAbsenceActive(window, new Date())

    let status: { samlade: number; eskaleringar: number } | null = null
    if (active && window) {
      try {
        const supabase = getServerSupabase()
        const { data, error } = await supabase
          .from('pending_approvals')
          .select('approval_type, risk_level, payload')
          .eq('business_id', business.business_id)
          .gte('created_at', window.from)
        if (!error) {
          status = raknaFranvaroStatus((data as any[]) || [])
        }
      } catch (err) {
        console.warn('[absence] statusräkning misslyckades (svarar status: null):', err)
      }
    }

    return NextResponse.json({ window, active, status })
  } catch (error: any) {
    console.error('GET /api/absence error:', error)
    return NextResponse.json({ window: null, active: false, status: null })
  }
}

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const from = typeof body.from === 'string' ? body.from : null
    const to = typeof body.to === 'string' ? body.to : null
    if (!from || !to || !isValidAbsenceRange(from, to)) {
      return NextResponse.json({ error: 'Ogiltigt datumintervall — sluttiden måste ligga efter starttiden' }, { status: 400 })
    }

    const window = await setAbsenceWindow(business.business_id, { from, to, setBy: currentUser.id })
    return NextResponse.json({ window, active: isAbsenceActive(window, new Date()) })
  } catch (error: any) {
    console.error('POST /api/absence error:', error)
    return NextResponse.json({ error: 'Kunde inte spara frånvarofönstret' }, { status: 500 })
  }
}

/** Avslutar ett aktivt fönster i förtid (kortar `to` till nu). */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const window = await endAbsenceNow(business.business_id)
    return NextResponse.json({ window, active: false })
  } catch (error: any) {
    console.error('DELETE /api/absence error:', error)
    return NextResponse.json({ error: 'Kunde inte avsluta frånvaron' }, { status: 500 })
  }
}
