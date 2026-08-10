import { NextRequest, NextResponse } from 'next/server'
import dns from 'dns'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET /api/integrations/email-lead/mx-check — Epic B, B5 (2026-08-10).
 *
 * MX-posten gäller hela domänen leads.handymate.se, inte per företag — det
 * här är alltså en GLOBAL check, inte tenant-specifik. Grindas ändå bakom
 * inloggning (konsekvent med syskonrutten), inte för att svaret är
 * hemligt utan för att slippa ett helt öppet DNS-proxy-endpoint.
 *
 * Kräver Node runtime (dns-modulen finns inte i Edge).
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DOMAIN = 'leads.handymate.se'
// Postmark inbound-servern — se kommentaren i sql/v106_email_inbound_route.sql.
const EXPECTED_MX_SUFFIX = 'inbound.postmarkapp.com'

const CACHE_TTL_MS = 5 * 60 * 1000
let cache: { result: MxCheckResult; expiresAt: number } | null = null

interface MxCheckResult {
  configured: boolean
  records: string[]
  checkedDomain: string
  error: string | null
}

async function resolveMxCached(): Promise<MxCheckResult> {
  if (cache && cache.expiresAt > Date.now()) return cache.result

  const result = await new Promise<MxCheckResult>((resolve) => {
    dns.resolveMx(DOMAIN, (err, addresses) => {
      if (err) {
        resolve({ configured: false, records: [], checkedDomain: DOMAIN, error: err.code || err.message })
        return
      }
      const records = addresses.map((a) => a.exchange.toLowerCase())
      const configured = records.some((r) => r.endsWith(EXPECTED_MX_SUFFIX))
      resolve({ configured, records, checkedDomain: DOMAIN, error: null })
    })
  })

  cache = { result, expiresAt: Date.now() + CACHE_TTL_MS }
  return result
}

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await resolveMxCached()
    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[integrations/email-lead/mx-check] fel', err)
    // Ett DNS-fel är information, inte ett serverfel — svara 200 med
    // configured:false så UI:t kan visa "kunde inte verifiera" utan att
    // hela settings-sidan ser trasig ut.
    return NextResponse.json({
      configured: false,
      records: [],
      checkedDomain: DOMAIN,
      error: err?.message || 'Okänt fel vid DNS-uppslag',
    })
  }
}
