import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { verifyReferralToken } from '@/lib/referral/link'
import { createLeadAndDeal } from '@/lib/leads/golden-path'
import { checkRateLimitDb } from '@/lib/rate-limit-db'
import { createHash } from 'crypto'

/**
 * /api/referral-lead — Epic C spel 1 (tasks/hanna-sales-engine-v2-spec.md).
 *
 * Publik route utan inloggad session — kunden når den via länken en
 * hantverkares NÖJDA KUND delat, se app/rekommendera/[token]/page.tsx.
 * Autentiseringen här är token-verifiering (lib/referral/link.ts), samma
 * mönster som portal_code i app/api/lead-portal/[code] och API-nyckeln i
 * app/api/leads/intake — INTE getAuthenticatedBusiness() (det finns ingen
 * inloggad session att slå upp på en publik landningssida för en främling).
 *
 * GET  ?token=...        — slår upp företagsnamnet för landningssidan.
 * POST { token, name, phone, message } — skapar leaden via Golden Path med
 *      source:'referral' + referralCustomerId ur token.
 *
 * MIGRATIONSTOLERANS (v107 EJ KÖRD ÄNNU): 'referral' är inte ett giltigt
 * source-värde och leads/deal.referral_customer_id finns inte förrän
 * sql/v107_referral_attribution.sql körts. Ett submit-försök innan dess ger
 * antingen PostgRESTs "column ... not found in schema cache"
 * (referral_customer_id saknas) eller en CHECK-krock på valid_source
 * ('referral' saknas i listan) — INTE en tyst fallback som tappar
 * attributionen (t.ex. genom att byta source till 'website_form' och skicka
 * ändå), utan ett explicit 503 (samma mönster som
 * app/api/integrations/email-lead).
 */

const MISSING_MIGRATION_MESSAGE = 'Funktionen aktiveras inom kort'
const INVALID_LINK_MESSAGE = 'Länken är ogiltig eller har upphört.'

/**
 * golden-path.ts kastar en generisk Error som bara bär vidare
 * leadInsertError.message (inte .code) — matcha därför på textmönster,
 * samma idiom som isMissingTableError i
 * app/api/integrations/email-lead/route.ts och isMissingRelationError i
 * lib/agreements/invoice-visit.ts.
 */
function isMigrationPendingError(err: any): boolean {
  const message = String(err?.message || '')
  if (/schema cache/i.test(message) && /column/i.test(message)) return true
  if (/does not exist/i.test(message) && /column/i.test(message)) return true
  if (/violates check constraint/i.test(message) && /valid_source/i.test(message)) return true
  return false
}

function missingMigrationResponse() {
  return NextResponse.json({ error: 'not_available', message: MISSING_MIGRATION_MESSAGE }, { status: 503 })
}

function invalidLinkResponse() {
  return NextResponse.json({ error: INVALID_LINK_MESSAGE }, { status: 404 })
}

// Privacy: hash IP istället för att lagra raw — samma mönster som
// app/api/leads/intake/route.ts och app/api/widget/chat/route.ts.
function hashIp(ip: string): string {
  return createHash('sha256').update(ip + 'hm-referral-lead-salt').digest('hex').slice(0, 16)
}

function getClientIp(request: NextRequest): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}

/**
 * Kunden vars länk det är måste fortfarande finnas hos rätt företag —
 * annars är länken stale (t.ex. GDPR-raderad kund) och ska visas som
 * ogiltig. v107:s FK är visserligen ON DELETE SET NULL (raderad källkund
 * stjälper inte redan skapade leads/deals), men en NY inlämning mot en
 * redan raderad kund ska hellre nekas tidigt än skapa en lead vars
 * attribution är dömd att gå förlorad.
 */
async function resolveReferrer(
  supabase: ReturnType<typeof getServerSupabase>,
  businessId: string,
  customerId: string,
) {
  const { data } = await supabase
    .from('customer')
    .select('customer_id')
    .eq('customer_id', customerId)
    .eq('business_id', businessId)
    .maybeSingle()
  return data
}

/**
 * GET /api/referral-lead?token=... — Hämta företagsnamn för landningssidan.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token')
    const decoded = verifyReferralToken(token)
    if (!decoded) return invalidLinkResponse()

    const supabase = getServerSupabase()

    const referrer = await resolveReferrer(supabase, decoded.businessId, decoded.customerId)
    if (!referrer) return invalidLinkResponse()

    const { data: business } = await supabase
      .from('business_config')
      .select('business_name, logo_url')
      .eq('business_id', decoded.businessId)
      .maybeSingle()
    if (!business) return invalidLinkResponse()

    return NextResponse.json({
      business_name: business.business_name || 'företaget',
      logo_url: business.logo_url || null,
    })
  } catch (error: any) {
    console.error('[referral-lead] GET-fel', error)
    return NextResponse.json({ error: 'Internt fel' }, { status: 500 })
  }
}

/**
 * POST /api/referral-lead — Skicka in en rekommenderad lead.
 */
export async function POST(request: NextRequest) {
  try {
    // IP-rate-limit (anti-abuse) — publikt formulär utan CAPTCHA. Samma
    // gräns som /api/leads/intake: 10/IP/timme.
    const ipHash = hashIp(getClientIp(request))
    const rateCheck = await checkRateLimitDb(`referral-lead:ip:${ipHash}`, {
      maxRequests: 10,
      windowMs: 60 * 60 * 1000,
    })
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'För många förfrågningar. Försök igen om en stund.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.max(1, Math.ceil((rateCheck.resetAt - Date.now()) / 1000))) },
        },
      )
    }

    const body = await request.json().catch(() => null)
    const token = body?.token
    const name = body?.name
    const phone = body?.phone
    const message = body?.message

    // Fail-closed: ogiltig/manipulerad token ⇒ ingen lead skapas alls.
    const decoded = verifyReferralToken(token)
    if (!decoded) return invalidLinkResponse()

    if (!name || typeof name !== 'string' || !name.trim() || !phone || typeof phone !== 'string' || !phone.trim()) {
      return NextResponse.json({ error: 'Namn och telefon krävs.' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    const referrer = await resolveReferrer(supabase, decoded.businessId, decoded.customerId)
    if (!referrer) return invalidLinkResponse()

    const { data: business } = await supabase
      .from('business_config')
      .select('business_id, business_name, phone_number')
      .eq('business_id', decoded.businessId)
      .maybeSingle()
    if (!business) return invalidLinkResponse()

    let gp: Awaited<ReturnType<typeof createLeadAndDeal>>
    try {
      gp = await createLeadAndDeal(
        {
          businessId: business.business_id,
          businessPhoneNumber: business.phone_number,
          name: name.trim(),
          phone: phone.trim(),
          email: null,
          message: typeof message === 'string' && message.trim() ? message.trim() : null,
          source: 'referral',
          referralCustomerId: decoded.customerId,
        },
        supabase,
      )
    } catch (err: any) {
      if (isMigrationPendingError(err)) return missingMigrationResponse()
      throw err
    }

    // Ett dealError kan i teorin bära samma migrationssignatur (leads-
    // kolumnerna körda men deal-ALTER:n inte) — samma fail-closed-hantering:
    // hellre 503 än en lead som ser klar ut men saknar attribution i
    // pipeline (Golden Paths egen princip: "En lead som aldrig landade får
    // ALDRIG se ut som success" gäller här attributionen, inte bara raden).
    if (gp.dealError) {
      if (isMigrationPendingError({ message: gp.dealError })) return missingMigrationResponse()
      console.error('[referral-lead] Lead skapad men deal misslyckades:', gp.dealError)
    }

    return NextResponse.json({ success: true, lead_id: gp.leadId })
  } catch (error: any) {
    console.error('[referral-lead] POST-fel', error)
    return NextResponse.json({ error: 'Internt fel' }, { status: 500 })
  }
}
