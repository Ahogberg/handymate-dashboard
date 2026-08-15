import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { seedAllDefaults } from '@/lib/seed-defaults'
import { skapaStartkort } from '@/lib/onboarding/starter-cards'

export const dynamic = 'force-dynamic'

/**
 * sql/v75_website_url.sql lägger till website_url-kolumnen (hemsida-
 * förgreningen) men körs MANUELLT av Andreas i Supabase SQL Editor efter
 * merge — det finns alltså ett fönster där koden är deployad men kolumnen
 * inte finns än. PostgREST svarar då med PGRST204 ("column ... not found in
 * schema cache"). Samma mönster som isMissingTermsTextColumn i
 * app/api/quote-templates/route.ts — försök om utan website_url istället
 * för att hela steg-sparningen failar.
 */
function isMissingWebsiteUrlColumn(error: unknown): boolean {
  const message = String((error as { message?: string })?.message || '')
  return /website_url/i.test(message) && /schema cache|does not exist|column/i.test(message)
}

/**
 * GET /api/onboarding
 * Hämta onboarding-progress (step + data + business info)
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('business_config')
      .select('business_id, business_name, display_name, contact_name, contact_email, phone_number, branch, service_area, org_number, address, services_offered, default_hourly_rate, callout_fee, rot_enabled, rut_enabled, knowledge_base, assigned_phone_number, forward_phone_number, call_mode, phone_setup_type, lead_sources, lead_email_address, onboarding_step, onboarding_data, onboarding_completed_at, working_hours, industry')
      .eq('business_id', business.business_id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Check Google Calendar status
    let googleConnected = false
    let gmailEnabled = false
    const { data: calConn } = await supabase
      .from('calendar_connection')
      .select('id, gmail_sync_enabled')
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (calConn) {
      googleConnected = true
      gmailEnabled = calConn.gmail_sync_enabled || false
    }

    return NextResponse.json({
      ...data,
      google_connected: googleConnected,
      gmail_enabled: gmailEnabled,
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Okänt fel'
    console.error('GET /api/onboarding error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * PUT /api/onboarding
 * Spara steg-progress + data
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { step, data: stepData, config } = body

    const supabase = getServerSupabase()

    // Build update object
    const updates: Record<string, unknown> = {}

    if (typeof step === 'number' && step >= 1 && step <= 10) {
      updates.onboarding_step = step
    }

    if (stepData && typeof stepData === 'object') {
      // Merge with existing onboarding_data
      const { data: current } = await supabase
        .from('business_config')
        .select('onboarding_data')
        .eq('business_id', business.business_id)
        .single()

      const existing = (current?.onboarding_data as Record<string, unknown>) || {}
      updates.onboarding_data = { ...existing, ...stepData }
    }

    // Direct business_config column writes (whitelisted för säkerhet).
    // Bypassar RLS via server-role klient — fixar tysta save-fail från
    // client-side onboarding.
    if (config && typeof config === 'object') {
      const ALLOWED_COLUMNS = [
        'specialties',
        'working_hours',
        'hourly_rate_min',
        'hourly_rate_max',
        'default_hourly_rate',
        'assigned_phone_number',
        'phone_setup_type',
        'welcome_tour_seen',
        'website_url',
        // ── Företagsprofilen (v94) ────────────────────────────────────────
        // Karins bolagskalender räknar sina deadlines ur de här fyra.
        //
        // OBS: den här listan är den tysta fällan. `fSkatt` har funnits i
        // onboardingens form-state sedan start men aldrig stått här — och
        // har därför ALDRIG sparats. `f_skatt_registered` står på false för
        // varje kund i produktion medan faktura- och ROT-koden läser den.
        // Ett fält som inte står här försvinner utan att något klagar.
        'vat_period',
        'is_employer',
        'fiscal_year_end_month',
        'company_form',
        'f_skatt_registered',
        'company_profile_source',
        // Bolagsverket-uppslag (2026-08-15) — se lib/bolagsverket/client.ts
        // + app/onboarding/components/Step2Business.tsx. Primärt skrivna via
        // /api/auth vid registrering, men vitlistade här också så en
        // efterföljande PUT (t.ex. en framtida redigeringsyta) kan uppdatera
        // dem utan att gå via samma "tysta fälla".
        'address_street',
        'address_postal_code',
        'address_city',
        // Intern timkostnad (2026-08-12) — Guardians lönsamhetsmotor läser
        // den via compute-economics.ts; frivillig, se Step3HowYouWork.tsx.
        'default_internal_hourly_cost',
        // Mål (2026-08-15, backlog #11) — läses av Next Best Action
        // (lib/jarvis/next-best-action-goals.ts) och Månadsrapporten
        // (components/value/MalBlock.tsx); frivillig, se Step3HowYouWork.tsx.
        'revenue_target_annual_sek',
        'margin_target_percent',
      ] as const
      for (const col of ALLOWED_COLUMNS) {
        if (col in config) updates[col] = (config as Record<string, unknown>)[col]
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Inget att uppdatera' }, { status: 400 })
    }

    let { error } = await supabase
      .from('business_config')
      .update(updates)
      .eq('business_id', business.business_id)

    if (error && isMissingWebsiteUrlColumn(error) && 'website_url' in updates) {
      const { website_url: _websiteUrl, ...fallbackUpdates } = updates
      ;({ error } = await supabase
        .from('business_config')
        .update(fallbackUpdates)
        .eq('business_id', business.business_id))
    }

    if (error) {
      console.error('PUT /api/onboarding update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Okänt fel'
    console.error('PUT /api/onboarding error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * POST /api/onboarding
 * Slutför onboarding – spara all data + markera klar
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      business_name,
      contact_name,
      contact_email,
      phone_number,
      branch,
      // Fler branscher än en (v93). Bee är både elektriker och bygg.
      secondary_branches,
      org_number,
      address,
      service_area,
      services_offered,
      default_hourly_rate,
      callout_fee,
      rot_enabled,
      rut_enabled,
      lead_sources,
      knowledge_base,
    } = body

    const supabase = getServerSupabase()

    // Betalgrind: markera INTE onboarding klar om kontot saknar prenumeration.
    // Utan detta kan någon navigera direkt till /onboarding?payment=success,
    // slutföra touren och nå dashboarden utan att ha betalat.
    //
    // Val (konservativt): blockera bara TYDLIGT obetalda states. En
    // nyregistrerad kund har status 'trial' (register-routen sätter det) och
    // släpps igenom — att komma legitimt hit kräver ändå Checkout-redirecten.
    // Vi blockerar alltså bara konton helt utan prenumeration (null/inactive)
    // eller med uppsagd/misslyckad betalning. Detta kan ALDRIG blockera en
    // riktig betalande kund (som minst har 'trial'/'trialing'/'active'/'comp').
    const { data: subRow } = await supabase
      .from('business_config')
      .select('subscription_status, is_pilot')
      .eq('business_id', business.business_id)
      .single()

    const status = String(subRow?.subscription_status ?? '').toLowerCase()
    const isPilot = subRow?.is_pilot === true
    const BLOCKED_STATES = ['', 'inactive', 'cancelled', 'canceled', 'past_due', 'unpaid']
    if (!isPilot && BLOCKED_STATES.includes(status)) {
      return NextResponse.json(
        { error: 'Slutför betalningen för att aktivera kontot' },
        { status: 402 }
      )
    }

    const updates: Record<string, unknown> = {
      onboarding_step: 10, // Mark fully complete (compat with both V1 and V2 flows)
      onboarding_completed_at: new Date().toISOString(),
    }

    // Only set non-undefined values
    if (business_name) updates.business_name = business_name
    if (contact_name) updates.contact_name = contact_name
    if (contact_email) updates.contact_email = contact_email
    if (phone_number) updates.phone_number = phone_number
    if (branch) updates.branch = branch
    // Huvudbranschen får aldrig ligga i listan också — CHECK-villkoret i v93
    // avvisar raden, och den som läser raden ska se avsikten direkt.
    //
    // Sätts BARA när det finns något att spara: kolumnen kommer med v93, som
    // körs manuellt, och en update som nämner en okänd kolumn avvisas i sin
    // helhet. Villkoret gör att vanlig onboarding fungerar oförändrat före
    // migrationen.
    const extraBranches: string[] = Array.isArray(secondary_branches)
      ? secondary_branches.filter((b: unknown): b is string => typeof b === 'string' && !!b && b !== branch)
      : []
    if (extraBranches.length > 0) updates.secondary_branches = extraBranches
    if (org_number !== undefined) updates.org_number = org_number
    if (address !== undefined) updates.address = address
    if (service_area !== undefined) updates.service_area = service_area
    if (services_offered) updates.services_offered = services_offered
    if (default_hourly_rate !== undefined) updates.default_hourly_rate = default_hourly_rate
    if (callout_fee !== undefined) updates.callout_fee = callout_fee
    if (rot_enabled !== undefined) updates.rot_enabled = rot_enabled
    if (rut_enabled !== undefined) updates.rut_enabled = rut_enabled
    if (lead_sources) updates.lead_sources = lead_sources
    if (knowledge_base) updates.knowledge_base = knowledge_base

    const { error } = await supabase
      .from('business_config')
      .update(updates)
      .eq('business_id', business.business_id)

    if (error) {
      console.error('POST /api/onboarding error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Seed all defaults (idempotent — safe to run multiple times)
    const seedResult = await seedAllDefaults(
      supabase,
      business.business_id,
      branch || 'other',
      extraBranches
    )

    // Startkorten (docs/design/FORSTA-30-MINUTERNA.md): fire-and-forget, får
    // ALDRIG blockera eller fälla ett lyckat finalize-svar. Funktionen är
    // själv fail-safe (kastar aldrig) — .catch här är bara ett extra
    // skyddsnät, samma mönster som extractAndSaveMemory i agent/trigger.
    skapaStartkort(supabase, business.business_id).catch((err) =>
      console.error('[onboarding finalize] skapaStartkort failade (non-blocking):', err)
    )

    return NextResponse.json({ success: true, seeded: seedResult })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Okänt fel'
    console.error('POST /api/onboarding finalize error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
