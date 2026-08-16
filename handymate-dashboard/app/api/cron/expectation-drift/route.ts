import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { findStaleSignals, type StaleSignalRow } from '@/lib/expectation-drift/stale-signals'

export const dynamic = 'force-dynamic'

/**
 * GET/POST /api/cron/expectation-drift
 *
 * Expectation Drift — Signal 1 (docs/audits/NEXT_MOAT_WAVE.md, Koncept 3):
 * "möjligt ÄTA-kort skapat för N dagar sedan — varken godkänt eller
 * avfärdat" — ren kö-ålder på befintliga kundvända åtagande-kort. Ingen
 * prognos, ingen jämförelse mot kundens faktiska tro (den fulla versionen
 * väntar på X2 + Company Memory, se koncept-dokumentet) — bara ett
 * konstaterande: det här ligger obehandlat, och kunden kan tro något är på
 * gång. Reglerna och day-mathen ligger i lib/expectation-drift/
 * stale-signals.ts och är facit-testade separat.
 *
 * NY DEDIKERAD ROUTE (samma avvägning som app/api/cron/cert-expiry-check/
 * route.ts gjorde och dokumenterade): repot har redan 30+ cron-routes,
 * konsekvent en per fristående koncern. Ingen befintlig daglig route äger
 * "obehandlade signalkort" semantiskt — missed-revenue svepar pengar,
 * check-overdue svepar fakturor, karin-deadlines svepar myndighetsdatum.
 * Att hänga expectation-drift på någon av dem hade blandat två orelaterade
 * koncern i en route.
 *
 * SCHEMAT: "50 6 * * *" i vercel.json — en gång per dag (Hobby-plan-säkert,
 * samma regel som CLAUDE.md flaggar: `0 X * * *`, aldrig ett sub-dagligt
 * uttryck), i luckan mellan cert-expiry-check (35 6) / missed-revenue
 * (40 6) och check-overdue (0 7). Ingen kollision med någon befintlig rad.
 *
 * AGENT-ÄGARSKAP (koncept-dokumentets "Lars (tid/scope), Karin (pris)"):
 *   - meeting_followup → lars: ett lovat samtal/besök är tid/scope, hans
 *     domän.
 *   - create_quote_draft, create_ata_draft → karin: båda är prissignaler —
 *     en offert eller ett ÄTA-belopp kunden väntar på.
 * Matte används aldrig här — nudgen ska kännas som att RÄTT agent hörde av
 * sig, inte en generisk systemavisering.
 */
const AGENT_FOR_SOURCE_TYPE: Record<string, string> = {
  meeting_followup: 'lars',
  create_quote_draft: 'karin',
  create_ata_draft: 'karin',
}

/** Prefixet gör dedupe-nyckeln unik även om samma id-mönster (`appr_...`)
    någon gång skulle återanvändas av en annan korttyp. */
function dedupeKeyFor(sourceApprovalId: string): string {
  return `expectation_drift:${sourceApprovalId}`
}

/**
 * Ärlig, agentröst-anpassad kortcopy. Påstår ALDRIG att vi vet vad kunden
 * faktiskt tror — bara att signalen är obehandlad och att det ÄR en risk
 * i sig. Se docs/audits/NEXT_MOAT_WAVE.md Koncept 3 för varför den
 * distinktionen är medveten (falsklarm om kundens mentala tillstånd är
 * dyrare för förtroendet än ett ärligt "det här ligger stilla").
 */
function buildCopy(
  signal: StaleSignalRow,
  customerName: string | null,
): { title: string; description: string } {
  const kund = customerName || 'en kund'
  const dagar = signal.days_stale

  switch (signal.approval_type) {
    case 'create_quote_draft':
      return {
        title: `Offertförfrågan väntar — ${dagar} dagar utan svar${customerName ? ` (${customerName})` : ''}`,
        description:
          `Offertförfrågan till ${kund} har legat obehandlad i ${dagar} dagar — ` +
          `varken godkänd eller avfärdad. ${kund === 'en kund' ? 'Kunden' : customerName} kan tro att en offert är på väg.`,
      }
    case 'create_ata_draft':
      return {
        title: `Möjligt ÄTA-tillägg väntar — ${dagar} dagar${customerName ? ` (${customerName})` : ''}`,
        description:
          `Ett möjligt ÄTA-tillägg för ${kund} har legat obehandlat i ${dagar} dagar — ` +
          `varken godkänt eller avfärdat. Om kunden nämnt merarbetet kan hen vänta sig ett pris.`,
      }
    case 'meeting_followup':
    default:
      return {
        title: `Lovad uppföljning väntar — ${dagar} dagar${customerName ? ` (${customerName})` : ''}`,
        description:
          `Uppföljningen ${customerName ? `du lovade ${customerName}` : 'som lovades'} är fortfarande obehandlad ` +
          `efter ${dagar} dagar.`,
      }
  }
}

export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return kor()
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return kor()
}

async function kor() {
  const supabase = getServerSupabase()
  const now = new Date()

  let scanned = 0
  let created = 0
  let skipped = 0
  const errors: string[] = []

  try {
    const { data: businesses, error: bizErr } = await supabase
      .from('business_config')
      .select('business_id, agents_globally_paused')
    if (bizErr) throw bizErr

    for (const biz of businesses || []) {
      // Pausade agenter ska vara tysta — samma spärr som karin-deadlines/
      // missed-revenue.
      if (biz.agents_globally_paused) continue
      scanned++
      const businessId = biz.business_id as string
      if (!businessId) continue

      try {
        const staleSignals = await findStaleSignals(supabase, businessId, { now })

        for (const signal of staleSignals) {
          const dedupeKey = dedupeKeyFor(signal.id)

          // Dedup: redan ett pending expectation_drift_signal-kort för
          // samma källkort → hoppa. Utan detta skulle varje daglig körning
          // föda ett nytt kort för samma obehandlade signal.
          const { count, error: dedupeErr } = await supabase
            .from('pending_approvals')
            .select('id', { count: 'exact', head: true })
            .eq('business_id', businessId)
            .eq('approval_type', 'expectation_drift_signal')
            .eq('status', 'pending')
            .contains('payload', { dedupe_key: dedupeKey })

          if (dedupeErr) {
            // Vid osäkerhet: hoppa över. Hellre ett uteblivet larm än ett
            // dubblerat (samma princip som karin-deadlines).
            console.error(
              '[cron/expectation-drift] dedupe-koll misslyckades:',
              dedupeKey,
              dedupeErr.message,
            )
            skipped++
            continue
          }
          if ((count ?? 0) > 0) {
            skipped++
            continue
          }

          let customerName: string | null = null
          if (signal.customer_id) {
            const { data: customer } = await supabase
              .from('customer')
              .select('name')
              .eq('customer_id', signal.customer_id)
              .eq('business_id', businessId)
              .maybeSingle()
            customerName = (customer as { name?: string } | null)?.name ?? null
          }

          const { title, description } = buildCopy(signal, customerName)
          const agentId = AGENT_FOR_SOURCE_TYPE[signal.approval_type] || 'matte'

          const { error: insertErr } = await supabase.from('pending_approvals').insert({
            id: `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            business_id: businessId,
            approval_type: 'expectation_drift_signal',
            // 'any' — precis som create_quote_draft/create_ata_draft: ingen
            // ny bucket behövs, vem som helst i teamet kan kvittera nudgen.
            routing_role: 'any',
            title,
            description,
            status: 'pending',
            // Ren nudge, inga pengar rör sig och ingenting skickas till
            // kund av att kortet skapas eller godkänns.
            risk_level: 'low',
            payload: {
              routed_agent: agentId,
              dedupe_key: dedupeKey,
              stale_approval_id: signal.id,
              stale_approval_type: signal.approval_type,
              days_stale: signal.days_stale,
              customer_id: signal.customer_id,
            },
          })

          if (insertErr) {
            console.error(
              '[cron/expectation-drift] kunde inte skapa kort:',
              insertErr.message,
              { businessId, sourceId: signal.id },
            )
            continue
          }
          created++
        }
      } catch (err: any) {
        // Ett företags fel får inte fälla svepet för alla andra.
        console.error(`[cron/expectation-drift] ${businessId}:`, err?.message || err)
        errors.push(`${businessId}: ${err?.message || 'okänt fel'}`)
      }
    }

    return NextResponse.json({ success: errors.length === 0, scanned, created, skipped, errors: errors.slice(0, 10) })
  } catch (err: any) {
    console.error('[cron/expectation-drift] svepet failade:', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}
