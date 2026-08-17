/**
 * Promise-to-Proof — daterade kundlöften (Etapp N, 2026-08-17).
 *
 * ═══ SMAL, GRIND-FÖRENLIG SKIVA ═══
 *
 * Rådets roadmap avvisade en bred "Promise Ledger" (docs/council/
 * ACTIVE_ROADMAP.md:508, grinden vid :1029): löften får ALDRIG bevakas ur rå
 * AI-extraktion, bara ur något ägaren uttryckligen bekräftat. Den här skivan
 * respekterar grinden strikt:
 *
 *   1. Extraktionen (lib/customer-facts/extract-from-text.ts,
 *      app/api/voice/analyze/route.ts) FÅR FÖRESLÅ ett datum på ett
 *      commitment-fynd — men fyndet är fortfarande bara ett okänt kort i
 *      Inkorgen, ingenting bevakas än.
 *   2. Godkännande (app/api/approvals/[id]/route.ts, case 'customer_fact')
 *      skriver customer_fact-raden. FINNS ett giltigt datum sätts
 *      promise_status='open' i SAMMA skrivning — det är ägarens klick som
 *      aktiverar bevakningen, aldrig extraktionen själv.
 *   3. Det här svepet läser BARA rader med promise_status='open' (sql/
 *      v147_promise_dates.sql). En obekräftad fakta (promise_status IS NULL,
 *      oavsett om due_at råkar vara satt) syns aldrig här.
 *
 * ═══ VARFÖR "PASSERAT" INTE SÄTTER NÅGOT AUTOMATISKT ═══
 *
 * v147-kommentaren är entydig: promise_status sätts ALDRIG till det brutna
 * tillståndet av datumpassage. Svepet skapar bara ett informationskort —
 * människan avgör om löftet faktiskt hölls eller inte. Se
 * tests/promise-deadlines.spec.ts, som förbjuder den bokstaven i den här
 * filen rakt av.
 *
 * ═══ STRUKTUR (speglar lib/expectation-drift/stale-signals.ts) ═══
 *
 * hittaLoftenSomBehoverKort — ren funktion, inget klockberoende buret via
 * new Date()/Date.now() internt (now injiceras alltid), inget I/O. Facit-
 * testad direkt.
 *
 * findOpenPromiseDeadlines — I/O: läser öppna daterade löften för ETT
 * företag. Fail-soft: en omigrerad miljö (v147 ej körd, promise_status/
 * due_at saknas) ger tom lista, aldrig ett kastat fel — cron-svepet
 * (app/api/cron/promise-deadlines/route.ts) gör den slutgiltiga
 * dedupe-kollen mot pending_approvals, precis som expectation-drift.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

/** 48 timmar — fönstret där ett öppet löfte får en påminnelse-signal innan
    det räknas som passerat. */
export const PROMISE_REMINDER_WINDOW_MS = 48 * 60 * 60 * 1000

export type PromiseDeadlinePhase = 'paminnelse' | 'passerat'

/** Formen på en öppen, daterad löftesrad ur customer_fact. */
export interface OpenPromiseRow {
  id: string
  business_id: string
  customer_id: string
  due_at: string | null
  content: string
  evidence_quote: string | null
}

export interface PromiseDeadlineCandidate {
  fact_id: string
  business_id: string
  customer_id: string
  due_at: string
  content: string
  evidence_quote: string | null
  phase: PromiseDeadlinePhase
  dedupe_key: string
}

/** Samma dedupe-idiom som expectation-drift: prefixad, unik per löfte OCH
    fas — ett löfte kan behöva BÅDE en påminnelse (tidigare) och en
    passerat-signal (senare), de är två olika kort. */
export function dedupeKeyForPromise(factId: string, phase: PromiseDeadlinePhase): string {
  return `promise_deadline:${factId}:${phase}`
}

/**
 * Ren funktion: given en lista öppna, daterade löften och en tidpunkt — vilka
 * behöver ett kort, och i vilken fas?
 *
 *   - due_at <= now                         → 'passerat'
 *   - now < due_at <= now + 48h              → 'paminnelse'
 *   - due_at > now + 48h, eller due_at saknas/ogiltigt → inget kort
 *
 * Ett löfte utan due_at (odaterat commitment, eller en rad som av någon
 * anledning saknar datum trots promise_status='open') bevakas aldrig —
 * svepet har ingenting att jämföra mot.
 */
export function hittaLoftenSomBehoverKort(
  promises: OpenPromiseRow[],
  now: Date,
): PromiseDeadlineCandidate[] {
  const nowMs = now.getTime()
  const out: PromiseDeadlineCandidate[] = []

  for (const p of promises) {
    if (!p.due_at) continue
    const dueMs = new Date(p.due_at).getTime()
    if (Number.isNaN(dueMs)) continue

    let phase: PromiseDeadlinePhase | null = null
    if (dueMs <= nowMs) {
      phase = 'passerat'
    } else if (dueMs - nowMs <= PROMISE_REMINDER_WINDOW_MS) {
      phase = 'paminnelse'
    }
    if (!phase) continue

    out.push({
      fact_id: p.id,
      business_id: p.business_id,
      customer_id: p.customer_id,
      due_at: p.due_at,
      content: p.content,
      evidence_quote: p.evidence_quote,
      phase,
      dedupe_key: dedupeKeyForPromise(p.id, phase),
    })
  }

  return out
}

/**
 * I/O: läser öppna, daterade löften för ETT företag och kör dem genom den
 * rena funktionen. Tenant-filtrerad på businessId i varje anrop.
 *
 * Fail-soft vid DB-fel (inkl. v147 inte körd än — promise_status/due_at
 * saknas, PostgREST svarar 42703/"does not exist"/"schema cache"): tom
 * lista, aldrig ett kastat fel som skulle fälla anroparens svep för alla
 * andra företag.
 */
export async function findOpenPromiseDeadlines(
  supabase: SupabaseClient,
  businessId: string,
  opts: { now?: Date } = {},
): Promise<PromiseDeadlineCandidate[]> {
  const now = opts.now ?? new Date()

  const { data, error } = await supabase
    .from('customer_fact')
    .select('id, business_id, customer_id, due_at, content, evidence_quote')
    .eq('business_id', businessId)
    .eq('promise_status', 'open')
    .order('due_at', { ascending: true })

  if (error) {
    console.error('[promises/deadline-sweep] kunde inte läsa öppna löften:', error.message)
    return []
  }

  const rows: OpenPromiseRow[] = (data || []).map((r: any) => ({
    id: r.id as string,
    business_id: r.business_id as string,
    customer_id: r.customer_id as string,
    due_at: (r.due_at as string | null) ?? null,
    content: r.content as string,
    evidence_quote: (r.evidence_quote as string | null) ?? null,
  }))

  return hittaLoftenSomBehoverKort(rows, now)
}
