import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { materializeObligations } from '@/lib/karin/obligations'
import { obligationToEvent } from '@/lib/karin/calendar'
import { HANDLED_KEY, parseHandled } from '@/lib/karin/handled-store'
import { daysBetween } from '@/lib/karin/business-days'
import type { CompanyProfile } from '@/lib/karin/obligation-rules'

export const dynamic = 'force-dynamic'

/**
 * Karins påminnelser om myndighetsdatum (2026-08-07).
 *
 * ═══ TRE TRÖSKLAR, INTE SJU ═══
 *
 * Fjorton dagar, tre dagar, och på dagen. Specen föreslog sju nivåer
 * (30/14/7/3/1/dagen/efter) — det är hur man lär någon att ignorera Karin.
 *
 * Fjorton dagar är när det fortfarande går att göra något: en momsdeklaration
 * kräver att bokföringen är i fas, vilket tar dagar. Tre dagar är sista
 * chansen att hinna. På dagen är en påminnelse, inte en förberedelse.
 *
 * ═══ VARFÖR pending_approvals OCH INTE notification ═══
 *
 * `notification`-tabellen saknar dedupe helt — samma påminnelse kan skapas hur
 * många gånger som helst, och en cron som kör dagligen skulle skicka samma
 * momspåminnelse fjorton dagar i rad.
 *
 * `pending_approvals` har mönstret som resten av huset använder: en
 * existenskoll med `.contains('payload', …)` före insert
 * (app/api/cron/cert-expiry-check/route.ts:104). Dedupe-nyckeln är
 * `<rule_code>:<due_date>:<tröskel>`, så varje tröskel ger exakt en
 * påminnelse per skyldighet.
 *
 * `routing_role: 'owner_admin'` — moms och bokslut hör till den som driver
 * bolaget.
 *
 * ═══ INGEN PÅMINNELSE UTAN PROFIL ═══
 *
 * Saknar företaget momsperiod eller bolagsform materialiseras ingenting, och
 * då skapas heller ingen påminnelse. Att gissa fram ett datum och sedan
 * påminna om det vore att göra ett fel högljutt.
 */

/** Dagar före förfall vi hör av oss. */
const TROSKLAR = [14, 3, 0] as const

function troskelEtikett(dagar: number): string {
  if (dagar === 0) return 'idag'
  if (dagar === 3) return 'om 3 dagar'
  return 'om 2 veckor'
}

export async function GET(request: NextRequest) {
  return kor(request)
}

export async function POST(request: NextRequest) {
  return kor(request)
}

async function kor(request: NextRequest) {
  // Tenant-svepet 2026-09-01: jämförelsen mot `Bearer ${process.env.CRON_SECRET}`
  // blev bokstavligen "Bearer undefined" när variabeln saknades — samma
  // fail-open som N2 stängde i alla andra cron-rutter. Rutten läser
  // business_config för ALLA företag och skriver kort per företag.
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const idag = new Date()

  // Bara femton dagar fram — längre än den yttersta tröskeln behövs inte.
  const till = new Date()
  till.setDate(till.getDate() + 15)

  let granskade = 0
  let skapade = 0
  let hoppade = 0

  try {
    const { data: foretag, error } = await supabase.from('business_config').select('*')
    if (error) throw error

    for (const rad of (foretag || []) as Array<Record<string, unknown>>) {
      const businessId = rad.business_id as string
      if (!businessId) continue

      // Pausade agenter ska vara tysta — samma spärr som serviceavtalen.
      if (rad.agents_globally_paused === true) continue

      const profile: CompanyProfile = {
        company_form: (rad.company_form as string) ?? null,
        fiscal_year_end_month: (rad.fiscal_year_end_month as number) ?? null,
        vat_period: (rad.vat_period as CompanyProfile['vat_period']) ?? null,
        is_employer: (rad.is_employer as boolean) ?? null,
        f_skatt_registered: (rad.f_skatt_registered as boolean) ?? null,
      }

      const events = materializeObligations(profile, idag, till).map(obligationToEvent)
      if (events.length === 0) continue
      granskade++

      // Det ägaren redan bockat av ska inte påminnas om.
      let hanterade = new Set<string>()
      try {
        const { data: pref } = await supabase
          .from('business_preferences')
          .select('value')
          .eq('business_id', businessId)
          .eq('key', HANDLED_KEY)
          .maybeSingle()
        hanterade = parseHandled((pref as { value?: string } | null)?.value)
      } catch { /* saknad preferens betyder bara att inget bockats av */ }

      for (const e of events) {
        if (hanterade.has(e.id)) continue

        const kvar = daysBetween(idag, new Date(e.due_date + 'T12:00:00'))
        const troskel = TROSKLAR.find(t => t === kvar)
        if (troskel === undefined) continue

        const dedupeNyckel = `${e.id}:${troskel}`

        const { count, error: dedupeFel } = await supabase
          .from('pending_approvals')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', businessId)
          .eq('approval_type', 'karin_deadline')
          .contains('payload', { dedupe_key: dedupeNyckel })

        if (dedupeFel) {
          // Vid osäkerhet: hoppa över. Hellre en utebliven påminnelse än två.
          console.error('[karin-deadlines] dedupe-koll misslyckades:', dedupeNyckel, dedupeFel.message)
          hoppade++
          continue
        }
        if ((count ?? 0) > 0) { hoppade++; continue }

        const { error: insertFel } = await supabase.from('pending_approvals').insert({
          id: `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          business_id: businessId,
          approval_type: 'karin_deadline',
          routing_role: 'owner_admin',
          title: `${e.title} förfaller ${troskelEtikett(troskel)} — ${e.due_date}`,
          description: `${e.why} Avser ${e.period_label}. Myndighet: ${e.authority}.`,
          risk_level: troskel === 0 ? 'medium' : 'low',
          status: 'pending',
          payload: {
            routed_agent: 'karin',
            dedupe_key: dedupeNyckel,
            event_id: e.id,
            rule_code: e.rule_code,
            rule_version: e.rule_version,
            due_date: e.due_date,
            authority: e.authority,
            source_url: e.source_url,
            confidence: e.confidence,
          },
          // Kortet ska inte ligga kvar efter att datumet passerat.
          expires_at: new Date(new Date(e.due_date + 'T12:00:00').getTime() + 3 * 86400000).toISOString(),
        })

        if (insertFel) {
          console.error('[karin-deadlines] insert misslyckades:', dedupeNyckel, insertFel.message)
          continue
        }
        skapade++
      }
    }

    return NextResponse.json({ ok: true, granskade, skapade, hoppade })
  } catch (err: any) {
    console.error('[karin-deadlines] oväntat fel:', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}
