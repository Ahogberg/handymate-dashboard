import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getCustomerFromPortalToken } from '@/lib/portal-link'
import { listPublishedJobbpassForCustomer, assembleJobbpassView } from '@/lib/jobbpass/jobbpass'

export const dynamic = 'force-dynamic'

/**
 * GET /api/portal/[token]/jobbpass — kundens publicerade jobbpass, i
 * kundportalen ("Ditt hem"). Fastighetspasset steg 1, 2026-08-27.
 *
 * Jobbpasset fanns sedan v154 men nådde aldrig kunden: publiceringen mintade
 * en token som ägaren fick lämna över för hand, och portalen hade noll
 * referenser till det. Här läses samma rader genom samma sammansättning
 * som den publika sidan (assembleJobbpassView) — ingen kopia, ingen ny
 * sanning. Bara status 'published'; fel svaras ärligt, aldrig som tom lista.
 */
export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const supabase = getServerSupabase()
    const customer = await getCustomerFromPortalToken(supabase, params.token)
    if (!customer) return NextResponse.json({ error: 'Ogiltig länk' }, { status: 404 })

    const { entries, error } = await listPublishedJobbpassForCustomer(supabase, customer.business_id, customer.customer_id)
    if (error) {
      console.error('[portal/jobbpass] query error:', error)
      return NextResponse.json({ error: 'Kunde inte hämta jobbpassen just nu' }, { status: 500 })
    }

    const passes = []
    for (const entry of entries) {
      const view = await assembleJobbpassView(supabase, entry.row)
      if (!view) continue
      passes.push({
        project_id: entry.row.project_id,
        project_name: entry.project_name,
        completed_at: entry.completed_at,
        published_at: entry.row.published_at,
        view,
      })
    }
    return NextResponse.json({ passes })
  } catch (error) {
    console.error('[portal/jobbpass] oväntat fel:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}
