import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { checkOrgNumber } from '@/lib/karin/org-number'

export const dynamic = 'force-dynamic'

/**
 * GET/PUT /api/business-config/company-profile
 *
 * Företagsprofilen som Karins bolagskalender räknar sina deadlines ur.
 *
 * ═══ VARFÖR ÄGARE/ADMIN ═══
 *
 * Fälten avgör vad systemet påstår om företagets skyldigheter mot Skatteverket
 * och Bolagsverket. En anställd som råkar ändra momsperioden skulle flytta
 * varje datum i kalendern utan att någon märkte det.
 *
 * ═══ VARFÖR VALIDERING PÅ SERVERN ═══
 *
 * Klienten validerar redan, men ett fel värde här ger fel deadline — och en
 * felaktig deadline är värre än ingen. Servern är den enda spärr som inte går
 * att kringgå.
 */

const GILTIGA_FORMER = new Set(['ab', 'ef', 'hb', 'kb', 'ekonomisk_forening', 'annat'])
const GILTIGA_MOMSPERIODER = new Set(['month', 'quarter', 'year', 'none'])

/** Fälten profilen består av — samma lista läses och skrivs. */
const PROFILFALT = [
  'org_number',
  'company_form',
  'fiscal_year_end_month',
  'vat_period',
  'is_employer',
  'employee_count',
  'f_skatt_registered',
  'accounting_firm',
  'accounting_contact',
  'company_profile_source',
  'company_profile_fetched_at',
] as const

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    // `*` eftersom v94-kolumnerna körs manuellt — PostgREST avvisar hela
    // frågan om en uppräknad kolumn inte finns än.
    const { data, error } = await getServerSupabase()
      .from('business_config')
      .select('*')
      .eq('business_id', business.business_id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Kunde inte läsa företagsuppgifterna' }, { status: 500 })
    }

    const rad = data as Record<string, unknown>
    const profile: Record<string, unknown> = { business_name: rad.business_name ?? null }
    for (const f of PROFILFALT) profile[f] = rad[f] ?? null

    return NextResponse.json({ profile })
  } catch (err: any) {
    console.error('[company-profile/GET]', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Ogiltig begäran' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}

    if ('org_number' in body) {
      const kontroll = checkOrgNumber(body.org_number)
      // Tomt är tillåtet — man ska kunna rensa fältet. Skräp är det inte.
      if (body.org_number && !kontroll.valid) {
        return NextResponse.json({ error: kontroll.error }, { status: 400 })
      }
      updates.org_number = body.org_number ? kontroll.formatted : null
    }

    if ('company_form' in body) {
      if (body.company_form && !GILTIGA_FORMER.has(body.company_form)) {
        return NextResponse.json({ error: 'Okänd bolagsform' }, { status: 400 })
      }
      updates.company_form = body.company_form || null
    }

    if ('vat_period' in body) {
      if (body.vat_period && !GILTIGA_MOMSPERIODER.has(body.vat_period)) {
        return NextResponse.json({ error: 'Okänd momsperiod' }, { status: 400 })
      }
      updates.vat_period = body.vat_period || null
    }

    if ('fiscal_year_end_month' in body) {
      const m = Number(body.fiscal_year_end_month)
      if (body.fiscal_year_end_month != null && (!Number.isInteger(m) || m < 1 || m > 12)) {
        return NextResponse.json({ error: 'Räkenskapsårets slutmånad måste vara 1–12' }, { status: 400 })
      }
      updates.fiscal_year_end_month = body.fiscal_year_end_month == null ? null : m
    }

    if ('is_employer' in body) {
      updates.is_employer = body.is_employer == null ? null : !!body.is_employer
    }

    if ('employee_count' in body) {
      const n = Number(body.employee_count)
      if (body.employee_count != null && (!Number.isInteger(n) || n < 0 || n > 9999)) {
        return NextResponse.json({ error: 'Antal anställda ser inte rimligt ut' }, { status: 400 })
      }
      updates.employee_count = body.employee_count == null ? null : n
    }

    if ('f_skatt_registered' in body) {
      updates.f_skatt_registered = !!body.f_skatt_registered
    }

    for (const f of ['accounting_firm', 'accounting_contact'] as const) {
      if (f in body) {
        const v = typeof body[f] === 'string' ? body[f].trim() : ''
        updates[f] = v || null
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Inget att spara' }, { status: 400 })
    }

    // Källan blir 'user' så fort ägaren rört ett fält: gränssnittet ska kunna
    // skilja en registrerad uppgift från något någon skrivit in.
    updates.company_profile_source = 'user'

    const { error } = await getServerSupabase()
      .from('business_config')
      .update(updates)
      .eq('business_id', business.business_id)

    if (error) {
      console.error('[company-profile/PUT]', error.message)
      return NextResponse.json({ error: 'Kunde inte spara' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[company-profile/PUT]', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}
