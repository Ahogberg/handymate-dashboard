import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { isAdmin } from '@/lib/admin-auth'
import { getServerSupabase } from '@/lib/supabase'
import { isOnboardingPaymentBlocked, arOnboardingBetald } from '@/lib/onboarding/payment-gate'
import { seedAllDefaults } from '@/lib/seed-defaults'
import { provisionInboundRoute } from '@/lib/email/provision-inbound-route'
import { hamtaAdoptionHandelser, computeAdoption, YTA_NYCKLAR } from '@/lib/admin/adoption'

/**
 * POST /api/debug/e2e-onboarding-fresh
 *
 * Vakten för ett HELT FÄRSKT konto (Etapp B6, 2026-09-02).
 *
 * Golden path-harnessen startar på demokontot, och e2e-quote/e2e-lifecycle
 * kör mot ett befintligt företag. Ingenting körde alltså kedjan för ett konto
 * som just registrerats — vilket är exakt den kedja som måste hålla för att
 * onboardingen ska vara självgående. Den här endpointen gör det:
 *
 * 1. Skapar ett färskt konto (status 'trial', som register-rutten sätter)
 * 2. BETALGRINDEN: finalize-grinden måste BLOCKERA kontot i det läget —
 *    det är hela ingen-provperiod-beslutet, och det som läckte före B2
 * 3. Simulerar betalningen (subscription_status = 'active')
 * 4. Grinden måste nu SLÄPPA IGENOM
 * 5. Finalize-effekterna: seedAllDefaults + lead-adressen provisioneras
 * 6. ADOPTIONEN: ett nyfödt konto ska räknas som 0 av 8 ytor — inget i
 *    seedningen får smyga in som "egen användning"
 * 7. Städning, barn före förälder, även vid tidigt avbrott
 *
 * Verifierar DATAKEDJAN, inte HTTP-lagret: grindarna anropas som funktioner
 * (samma helpers rutterna använder) eftersom server-till-server-auth med
 * cookies är krångligt här — samma avvägning som e2e-lifecycle dokumenterar.
 *
 * Testdata-prefix: business_id 'test_' + Date.now() och namnet 'E2E Ny Firma'
 * så lib/testdata.ts (arTestId/arTestNamn) gömmer raden från hemytan om ett
 * steg misslyckas innan städningen hinner köra.
 */
export const maxDuration = 30

type StepStatus = 'ok' | 'fail'
interface StepLog {
  step: string
  status: StepStatus
  detail: string
  data?: unknown
}

/** Kastas för att hoppa till cleanup+svar när ett steg redan loggat sitt fel. */
class StepFailure extends Error {}

/** Tabeller seedAllDefaults och finalize skriver i, barn före förälder. */
const SEEDADE_TABELLER = [
  'reservation_triggers',
  'reservation_texts',
  'quote_templates',
  'quote_standard_texts',
  'checklist_template',
  'lead_scoring_rules',
  'v3_automation_rules',
  'service_agreement_type',
  'products',
  'email_inbound_route',
  'pending_approvals',
  'business_preferences',
] as const

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    const adminCheck = await isAdmin(request)
    if (!adminCheck.isAdmin) {
      return NextResponse.json({ error: 'Endast för admin i produktion' }, { status: 403 })
    }
  }

  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const steps: StepLog[] = []
  const testBusinessId = 'test_' + Date.now()
  let skapad = false

  function ok(step: string, detail: string, data?: unknown) {
    steps.push({ step, status: 'ok', detail, data })
  }
  function fail(step: string, detail: string, data?: unknown): never {
    steps.push({ step, status: 'fail', detail, data })
    throw new StepFailure(step)
  }

  // Städar allt som skapats, barn före förälder. Best-effort — en misslyckad
  // DELETE stoppar inte resten, den samlas i listan så den kan städas manuellt.
  async function cleanup(): Promise<string[]> {
    const leftover: string[] = []
    if (!skapad) return leftover
    for (const tabell of SEEDADE_TABELLER) {
      const { error } = await supabase.from(tabell).delete().eq('business_id', testBusinessId)
      if (error) leftover.push(`${tabell}: ${error.message}`)
    }
    const { error } = await supabase.from('business_config').delete().eq('business_id', testBusinessId)
    if (error) leftover.push(`business_config ${testBusinessId}: ${error.message}`)
    return leftover
  }

  try {
    // ── 1. Färskt konto, precis som register-rutten skapar det ──────────
    {
      const { error } = await supabase.from('business_config').insert({
        business_id: testBusinessId,
        business_name: 'E2E Ny Firma',
        contact_name: 'E2E Testägare',
        contact_email: `${testBusinessId}@handymate.se`,
        branch: 'carpenter',
        subscription_status: 'trial',
        trial_ends_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
        is_pilot: false,
        onboarding_step: 1,
        default_hourly_rate: 650,
        employee_count: 2,
      })
      if (error) fail('skapa_konto', `Kunde inte skapa testkontot: ${error.message}`)
      skapad = true
      ok('skapa_konto', `Konto ${testBusinessId} skapat med status 'trial'`)
    }

    // ── 2. Betalgrinden MÅSTE blockera ett obetalt konto ────────────────
    {
      const blockerad = await isOnboardingPaymentBlocked(supabase, testBusinessId)
      if (!blockerad) {
        fail(
          'betalgrind_blockerar',
          "Grinden släppte igenom ett konto med status 'trial' — ingen-provperiod-beslutet läcker",
        )
      }
      ok('betalgrind_blockerar', "Obetalt konto ('trial') blockeras av finalize-grinden")
    }

    // ── 3. Simulerad betalning ──────────────────────────────────────────
    {
      const { error } = await supabase
        .from('business_config')
        .update({ subscription_status: 'active' })
        .eq('business_id', testBusinessId)
      if (error) fail('simulera_betalning', `Kunde inte sätta active: ${error.message}`)
      ok('simulera_betalning', "subscription_status satt till 'active'")
    }

    // ── 4. Grinden måste nu släppa igenom ───────────────────────────────
    {
      const blockerad = await isOnboardingPaymentBlocked(supabase, testBusinessId)
      if (blockerad) {
        fail('betalgrind_slapper', 'Grinden blockerade ett BETALT konto — kunden låses ute efter betalning')
      }
      if (!arOnboardingBetald({ business_id: testBusinessId, subscription_status: 'active' })) {
        fail('betalgrind_slapper', 'arOnboardingBetald och grinden är inte överens')
      }
      ok('betalgrind_slapper', 'Betalt konto släpps igenom')
    }

    // ── 5. Finalize-effekterna ──────────────────────────────────────────
    {
      const seedResult = await seedAllDefaults(supabase, testBusinessId, 'carpenter', [], 650)
      ok('seed_defaults', 'Standarddata seedat', seedResult)

      const route = await provisionInboundRoute(supabase, testBusinessId, 'E2E Ny Firma')
      if (!route.ok && route.reason !== 'table_missing') {
        fail('lead_adress', `Lead-adressen kunde inte skapas: ${route.error}`)
      }
      ok(
        'lead_adress',
        route.ok ? `Lead-adress ${route.address} skapad` : 'email_inbound_route saknas i miljön (v106 ej körd)',
        route,
      )

      const { error } = await supabase
        .from('business_config')
        .update({ onboarding_step: 10, onboarding_completed_at: new Date().toISOString() })
        .eq('business_id', testBusinessId)
      if (error) fail('finalize', `Kunde inte markera onboardingen klar: ${error.message}`)
      ok('finalize', 'Onboardingen markerad klar (steg 10)')
    }

    // ── 6. Adoptionen: ett nyfött konto är 0 av 8 ───────────────────────
    {
      const { data: rad } = await supabase
        .from('business_config')
        .select('onboarding_completed_at')
        .eq('business_id', testBusinessId)
        .maybeSingle()

      const biz = { business_id: testBusinessId, onboarding_completed_at: rad?.onboarding_completed_at ?? null }
      const handelser = await hamtaAdoptionHandelser(supabase, [biz])
      const adoption = computeAdoption(handelser.get(testBusinessId) || [], biz, new Date().toISOString())

      if (adoption.antal !== 0) {
        fail(
          'adoption_noll',
          `Ett nyfött konto räknades som aktivt på ${adoption.antal} ytor (${adoption.ytor.join(', ')}) — seedningen läcker in i måttet`,
          adoption,
        )
      }
      if (adoption.dag !== 1) {
        fail('adoption_noll', `Dag-räkningen gav ${adoption.dag}, väntade 1 för ett konto som just blivit klart`, adoption)
      }
      ok('adoption_noll', `0 av ${YTA_NYCKLAR.length} ytor, dag 1 — seedningen räknas inte som egen användning`, adoption)
    }

    const leftover = await cleanup()
    return NextResponse.json({
      success: true,
      business_id: testBusinessId,
      steps,
      leftover,
      note: 'Alla steg gröna. Kontot är borttaget.',
    })
  } catch (err) {
    // Endpointens poäng är att inte lämna spår — städa även vid avbrott.
    const leftover = await cleanup().catch(() => ['cleanup kastade'])
    const isStep = err instanceof StepFailure
    if (!isStep) {
      steps.push({ step: 'ovantat_fel', status: 'fail', detail: String(err) })
    }
    return NextResponse.json(
      { success: false, business_id: testBusinessId, steps, leftover },
      { status: 500 },
    )
  }
}
