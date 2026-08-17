import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getManadsLedger, MANADS_LEDGER_METHOD_VERSION } from '@/lib/value/ledger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/value/ledger/history?months=N — Bekräftat betalt per månad,
 * bakåt från innevarande kalendermånad. N klampas 1–12, default 7.
 *
 * ═══ ÄRLIGHETSBRASKLAPPEN ═══
 *
 * Det här är REN OMBERÄKNING — inget lagras. Varje anrop kör samma
 * getManadsLedger som systerrutten /api/value/ledger, en gång per månad
 * bakåt. Det betyder två saker, med flit:
 *
 *   1. Siffrorna är alltid dagens sanning om historiken: en faktura som
 *      betalas i dag lyfter förra månadens kohort retroaktivt (ledgern
 *      följer kohorten, inte händelsemånaden — se lib/value/ledger.ts).
 *   2. En framtida method_version-bump ÄNDRAR historiska siffror — det är
 *      priset för att aldrig visa en lagrad siffra som metoden inte längre
 *      står för. Svaret bär method_version så ytan kan säga det ärligt.
 *
 * Beräkningen är dyr-ish (N× ledger-uppslag) men cacheas medvetet inte i
 * V1 — sidan är owner/admin-låg-trafik (se plan, Etapp B5).
 *
 * Rollgrind IDENTISK med /api/value/ledger: ägare/admin
 * (tests/permission-contract.spec.ts + tests/value-ledger-history.spec.ts).
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const DEFAULT_MANADER = 7
    const MAX_MANADER = 12
    const raw = Number.parseInt(request.nextUrl.searchParams.get('months') || '', 10)
    const manader = Number.isFinite(raw) ? Math.min(MAX_MANADER, Math.max(1, raw)) : DEFAULT_MANADER

    const supabase = getServerSupabase()
    const nu = new Date()
    const historik: Array<{ period: string; betalt_kr: number; betalt_antal: number }> = []
    // Äldst först: i räknar bakåt från den äldsta månaden ned till 0 = nu,
    // så raderna pushas i stigande tidsordning — redo för stapelraden.
    for (let i = manader - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(nu.getUTCFullYear(), nu.getUTCMonth() - i, 1))
      const period = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
      const ledger = await getManadsLedger(supabase, business.business_id, period)
      if (!ledger) continue // ogiltig period kan inte uppstå här, men gissa aldrig
      historik.push({ period, betalt_kr: ledger.betalt.kr, betalt_antal: ledger.betalt.antal })
    }

    return NextResponse.json({ historik, method_version: MANADS_LEDGER_METHOD_VERSION })
  } catch (err: any) {
    console.error('[value/ledger/history] oväntat fel:', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}
