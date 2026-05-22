import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getProjectQuoteContext } from '@/lib/projects/get-quote-context'

export const dynamic = 'force-dynamic'

/**
 * GET /api/projects/[id]/quote-context (Etapp 3.2, 2026-05-22).
 *
 * Returnerar offert-context (rader, textblock, PDF-länk) FRÅN ett
 * projekt via project.quote_id-referensen. Konsumeras av
 * ProjectQuoteSpec-komponenten i Offert-tabben.
 *
 * Rollmodell (samma som intern timkostnad — Andreas 2026-05-22):
 * - ALLA i projektet: ser beskrivning + antal + enhet (arbetsinstruktion)
 * - OWNER/ADMIN: ser dessutom priser (unit_price, total, summor)
 * - Icke-OWA: pris-fält strippas SERVER-SIDE innan response
 *
 * Defense-in-depth: stripping sker i API:t (denna route) — UI:n har
 * också conditional rendering. Anställd som anropar /quote-context
 * direkt får INTE priser via curl/fetch.
 *
 * has_quote=false vid saknat quote_id eller borttagen offert —
 * UI:n hanterar tomma vyn.
 */
function canSeePrices(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    const supabase = getServerSupabase()
    const context = await getProjectQuoteContext(
      supabase,
      params.id,
      business.business_id,
    )

    // Strippa pris-fält för icke-owner/admin. Defense-in-depth utöver
    // UI-rendering. Anställd som anropar direkt får 0/null på priser.
    if (!canSeePrices(currentUser?.role) && context.has_quote) {
      const strippedLine = (r: typeof context.rader.arbete[number]) => ({
        ...r,
        unit_price: 0,
        total: 0,
      })

      return NextResponse.json({
        ...context,
        total_kr: 0,
        vat_amount: 0,
        rader: {
          arbete: context.rader.arbete.map(strippedLine),
          material: context.rader.material.map(strippedLine),
          rubriker_och_texter: context.rader.rubriker_och_texter.map(strippedLine),
        },
        // Flagga för UI att signalera "priser ej tillgängliga" i klartext
        prices_redacted: true,
      })
    }

    return NextResponse.json(context)
  } catch (error: any) {
    console.error('[quote-context] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
