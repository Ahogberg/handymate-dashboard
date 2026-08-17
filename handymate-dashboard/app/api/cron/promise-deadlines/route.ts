import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { findOpenPromiseDeadlines, type PromiseDeadlineCandidate } from '@/lib/promises/deadline-sweep'

export const dynamic = 'force-dynamic'

/**
 * GET/POST /api/cron/promise-deadlines
 *
 * Promise-to-Proof — daterade kundlöften (Etapp N, smal grind-förenlig
 * skiva, 2026-08-17): svepar ÖPPNA, ÄGARE-BEKRÄFTADE commitment-fakta
 * (customer_fact.promise_status='open', sql/v147_promise_dates.sql) för de
 * som förfaller inom 48 timmar eller redan har passerat sitt datum. Ren
 * day-math och urvalslogik ligger i lib/promises/deadline-sweep.ts och är
 * facit-testad separat.
 *
 * GRINDEN (docs/council/ACTIVE_ROADMAP.md:508, :1029): rådet avvisade en
 * bred "Promise Ledger" ur rå AI-extraktion. Det här svepet bevakar ALDRIG
 * ett obekräftat fynd — bara rader vars promise_status redan är 'open',
 * vilket bara sätts vid ett explicit ägar-godkännande (app/api/approvals/
 * [id]/route.ts, case 'customer_fact'). Extraktionen får föreslå ett datum;
 * den aktiverar aldrig bevakningen själv.
 *
 * PASSERAT DATUM SÄTTER ALDRIG DET BRUTNA TILLSTÅNDET AUTOMATISKT — kortet
 * är en nudge till ägaren, som själv avgör om löftet hölls. Samma princip
 * som v147-kommentaren och stale-signals.ts/expectation-drift följer.
 *
 * NY DEDIKERAD ROUTE (samma avvägning som cron/expectation-drift och
 * cron/cert-expiry-check redan gjorde och dokumenterade): ingen befintlig
 * daglig route äger "daterade kundlöften" semantiskt, och att hänga det på
 * expectation-drift hade blandat två skilda dedupe-domäner (den svepar
 * kö-ålder på OBEHANDLADE kort, inte förfallodatum på BEKRÄFTADE löften) i
 * en route.
 *
 * SCHEMAT: "20 7 * * *" i vercel.json — en gång per dag (Hobby-plan-säkert),
 * ingen kollision med någon befintlig rad.
 *
 * routed_agent är alltid 'matte' — till skillnad från expectation-drift
 * (som routar till Lars/Karin efter källkortets typ) har ett daterat löfte
 * ingen given exekverande agent; det är alltid ägaren själv som gav löftet
 * och ägaren som avgör om det hölls.
 */
const AGENT_FOR_PROMISE = 'matte'

/**
 * Ärlig, agentröst-anpassad kortcopy. Kortet PÅSTÅR ALDRIG att löftet
 * bröts — bara att datumet snart är här eller redan passerat, och att
 * ägaren själv avgör (se filhuvudet).
 */
function buildCopy(
  candidate: PromiseDeadlineCandidate,
  customerName: string | null,
): { title: string; description: string } {
  const kund = customerName || 'en kund'
  const datum = new Date(candidate.due_at).toLocaleDateString('sv-SE')
  const citat = candidate.evidence_quote
    ? ` Löftet: "${candidate.evidence_quote.length > 80 ? candidate.evidence_quote.slice(0, 80) + '…' : candidate.evidence_quote}"`
    : ''

  if (candidate.phase === 'passerat') {
    return {
      title: `Löfte till ${kund} har passerat sitt datum (${datum})`,
      description:
        `${customerName ? `Löftet till ${customerName}` : 'Ett löfte'} skulle vara uppfyllt senast ${datum}, ` +
        `men datumet har passerat.${citat} Bedöm själv om löftet hölls — det sätts aldrig automatiskt.`,
    }
  }
  return {
    title: `Löfte till ${kund} förfaller snart (${datum})`,
    description:
      `${customerName ? `Löftet till ${customerName}` : 'Ett löfte'} ska vara uppfyllt senast ${datum} — ` +
      `mindre än 48 timmar kvar.${citat}`,
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
      // missed-revenue/expectation-drift.
      if (biz.agents_globally_paused) continue
      scanned++
      const businessId = biz.business_id as string
      if (!businessId) continue

      try {
        const candidates = await findOpenPromiseDeadlines(supabase, businessId, { now })

        for (const candidate of candidates) {
          // Dedup: redan ett pending promise_deadline_signal-kort för SAMMA
          // löfte+fas → hoppa. Utan detta skulle varje daglig körning föda
          // ett nytt kort för samma obehandlade signal.
          const { count, error: dedupeErr } = await supabase
            .from('pending_approvals')
            .select('id', { count: 'exact', head: true })
            .eq('business_id', businessId)
            .eq('approval_type', 'promise_deadline_signal')
            .eq('status', 'pending')
            .contains('payload', { dedupe_key: candidate.dedupe_key })

          if (dedupeErr) {
            // Vid osäkerhet: hoppa över. Hellre ett uteblivet larm än ett
            // dubblerat (samma princip som karin-deadlines/expectation-drift).
            console.error(
              '[cron/promise-deadlines] dedupe-koll misslyckades:',
              candidate.dedupe_key,
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
          if (candidate.customer_id) {
            const { data: customer } = await supabase
              .from('customer')
              .select('name')
              .eq('customer_id', candidate.customer_id)
              .eq('business_id', businessId)
              .maybeSingle()
            customerName = (customer as { name?: string } | null)?.name ?? null
          }

          const { title, description } = buildCopy(candidate, customerName)

          const { error: insertErr } = await supabase.from('pending_approvals').insert({
            id: `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            business_id: businessId,
            approval_type: 'promise_deadline_signal',
            // 'any' — precis som expectation_drift_signal: ingen ny bucket
            // behövs, vem som helst i teamet kan kvittera nudgen.
            routing_role: 'any',
            title,
            description,
            status: 'pending',
            // Ren nudge, inga pengar rör sig och ingenting skickas till
            // kund av att kortet skapas eller godkänns.
            risk_level: 'low',
            payload: {
              routed_agent: AGENT_FOR_PROMISE,
              dedupe_key: candidate.dedupe_key,
              promise_fact_id: candidate.fact_id,
              customer_id: candidate.customer_id,
              phase: candidate.phase,
              due_at: candidate.due_at,
            },
          })

          if (insertErr) {
            console.error(
              '[cron/promise-deadlines] kunde inte skapa kort:',
              insertErr.message,
              { businessId, factId: candidate.fact_id },
            )
            continue
          }
          created++
        }
      } catch (err: any) {
        // Ett företags fel får inte fälla svepet för alla andra.
        console.error(`[cron/promise-deadlines] ${businessId}:`, err?.message || err)
        errors.push(`${businessId}: ${err?.message || 'okänt fel'}`)
      }
    }

    return NextResponse.json({ success: errors.length === 0, scanned, created, skipped, errors: errors.slice(0, 10) })
  } catch (err: any) {
    console.error('[cron/promise-deadlines] svepet failade:', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}
