# Pengar in-radarn — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Karins framåtblickande inbetalnings-radar: 5 veckostaplar (fakturor + viktad pipeline-potential), dipp-detektion mot egen normal, en-trycks-åtgärder via befintliga gated vägar.

**Architecture:** Ren projektionsmotor (`lib/cash-radar.ts`, TDD) + server-datalager (`lib/cash-radar-data.ts`, delas av API + morgonbrief — ingen drift) + GET/POST-endpoints + dashboard-kort + brief-rad. Inga nya tabeller, ingen SQL.

**Tech Stack:** Next.js 14, Supabase, Playwright `--no-deps`. Spec: `tasks/cash-radar-spec.md`.

**Verifierade fakta (gissa ej):**
- invoice: `due_date, paid_at, status, total, invoice_number, customer_id` (används av weekly-value/agent-context). Obetalda = status in ('sent','overdue').
- deal: `value NUMERIC, stage_id (FK pipeline_stage), expected_close_date DATE` (sql/pipeline.sql:28-34). Stage-slugs: new_inquiry/contacted/quote_sent/quote_accepted/won/lost; is_won/is_lost på pipeline_stage.
- Påminn-vägen: `POST /api/invoices/[id]/reminder` finns med getAuthenticatedBusiness (rad 14-21).
- quote_nudge-approvals: exekveras i approvals-routen (case 'quote_nudge' → sendSms; payload kräver `to` + `message`; customer_phone accepteras som to-fallback).
- Morgonbrief: `lib/matte/morning-brief.ts` — `buildKarinBrief(overdue, upcoming): AgentBrief` (rad 118) med `details: BriefDetail[]` ({text, urgency, link}).
- Dashboard-mount: `<WeeklyValueDigest />` på app/dashboard/page.tsx:672 — kortet monteras direkt efter.
- pending_approvals-insert-mönster: id `appr_`-prefix, business_id, approval_type, title, description, payload, status 'pending', risk_level, expires_at (Hanna v1-prejudikat i lib/agents/hanna-outbound.ts).

---

### Task 1: Projektionsmotorn (TDD)

**Files:** Create `lib/cash-radar.ts` · Test `tests/cash-radar.spec.ts`

- [ ] **Step 1: Failande tester** — `tests/cash-radar.spec.ts`:

```typescript
/**
 * Pengar in-radarn — enhetstester för den rena projektionsmotorn.
 * Körs: npx playwright test tests/cash-radar.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  medianDelayDays, bucketWeekStart, projectInflows, weeklyNormal, detectDips,
  STAGE_WEIGHTS, DIP_THRESHOLD, MIN_HISTORY_WEEKS,
} from '../lib/cash-radar'

const NOW = new Date('2026-07-06T09:00:00Z').getTime() // måndag

test.describe('medianDelayDays', () => {
  test('median av förseningar (udda antal)', () => {
    expect(medianDelayDays([
      { due_date: '2026-06-01', paid_at: '2026-06-04' }, // +3
      { due_date: '2026-06-01', paid_at: '2026-06-11' }, // +10
      { due_date: '2026-06-01', paid_at: '2026-06-01' }, // 0
    ])).toBe(3)
  })
  test('<3 datapunkter → 0 (ingen gissning)', () => {
    expect(medianDelayDays([{ due_date: '2026-06-01', paid_at: '2026-06-09' }])).toBe(0)
    expect(medianDelayDays([])).toBe(0)
  })
  test('negativ försening (betald i förtid) sänker medianen men golvas ej', () => {
    expect(medianDelayDays([
      { due_date: '2026-06-10', paid_at: '2026-06-05' }, // -5
      { due_date: '2026-06-10', paid_at: '2026-06-10' }, // 0
      { due_date: '2026-06-10', paid_at: '2026-06-15' }, // +5
    ])).toBe(0)
  })
})

test.describe('bucketWeekStart', () => {
  test('måndag är veckans start (sv-SE)', () => {
    expect(bucketWeekStart(new Date('2026-07-08'))).toBe('2026-07-06') // ons → mån
    expect(bucketWeekStart(new Date('2026-07-06'))).toBe('2026-07-06') // mån → samma
    expect(bucketWeekStart(new Date('2026-07-12'))).toBe('2026-07-06') // sön → föreg. mån
  })
})

test.describe('projectInflows', () => {
  test('faktura hamnar i vecka = due_date + medianförsening; potential viktas', () => {
    const weeks = projectInflows({
      unpaidInvoices: [{ invoice_id: 'i1', total: 10000, due_date: '2026-07-08' }],
      openDeals: [{ id: 'd1', value: 20000, stageSlug: 'quote_sent', expected_close_date: '2026-07-15' }],
      medianDelay: 7,
      nowMs: NOW,
    })
    const w2 = weeks.find(w => w.week_start === '2026-07-13') // 8/7 + 7d = 15/7 → v. 13/7
    expect(w2?.invoiced_kr).toBe(10000)
    const w2pot = weeks.find(w => w.week_start === '2026-07-13')
    expect(w2pot?.potential_kr).toBe(20000 * STAGE_WEIGHTS.quote_sent)
  })
  test('förfallen faktura (due+delay i dåtid) läggs i innevarande vecka', () => {
    const weeks = projectInflows({
      unpaidInvoices: [{ invoice_id: 'i1', total: 5000, due_date: '2026-06-01' }],
      openDeals: [], medianDelay: 0, nowMs: NOW,
    })
    expect(weeks[0].week_start).toBe('2026-07-06')
    expect(weeks[0].invoiced_kr).toBe(5000)
  })
  test('deal utanför 5-veckorsfönstret ignoreras; won/lost skickas aldrig in', () => {
    const weeks = projectInflows({
      unpaidInvoices: [],
      openDeals: [{ id: 'd1', value: 9999, stageSlug: 'quote_sent', expected_close_date: '2026-12-01' }],
      medianDelay: 0, nowMs: NOW,
    })
    expect(weeks.every(w => w.potential_kr === 0)).toBe(true)
    expect(weeks).toHaveLength(5)
  })
  test('deal utan expected_close_date → stage-schablon (quote_accepted +1v)', () => {
    const weeks = projectInflows({
      unpaidInvoices: [],
      openDeals: [{ id: 'd1', value: 10000, stageSlug: 'quote_accepted', expected_close_date: null }],
      medianDelay: 0, nowMs: NOW,
    })
    expect(weeks[1].potential_kr).toBe(10000 * STAGE_WEIGHTS.quote_accepted)
  })
})

test.describe('weeklyNormal + detectDips + cold start', () => {
  const paid = (week: string, kr: number) => ({ paid_at: week, total: kr })
  test('normal = median av veckosummor', () => {
    const n = weeklyNormal([
      paid('2026-06-01', 40000), paid('2026-06-08', 50000),
      paid('2026-06-15', 45000), paid('2026-06-22', 60000),
    ], NOW)
    expect(n.ready).toBe(true)
    expect(n.normal_kr).toBe(47500)
  })
  test('cold start: <MIN_HISTORY_WEEKS veckor med inbetalning → ready:false', () => {
    const n = weeklyNormal([paid('2026-06-22', 60000)], NOW)
    expect(n.ready).toBe(false)
    expect(MIN_HISTORY_WEEKS).toBe(4)
  })
  test('dipp när vecka < 60% av normal; ej dipp annars', () => {
    const weeks = [
      { week_start: '2026-07-06', invoiced_kr: 10000, potential_kr: 5000 },  // 15k < 27k → dipp
      { week_start: '2026-07-13', invoiced_kr: 40000, potential_kr: 0 },     // 40k ≥ 27k → ok
    ]
    const dips = detectDips(weeks, 45000)
    expect(DIP_THRESHOLD).toBe(0.6)
    expect(dips.map(d => d.week_start)).toEqual(['2026-07-06'])
  })
})
```

- [ ] **Step 2: Kör → FAIL** (modul saknas)
- [ ] **Step 3: Implementera `lib/cash-radar.ts`** — exporterna exakt som testerna kräver:

```typescript
/**
 * Pengar in-radarn — ren, deterministisk projektionsmotor (spec:
 * tasks/cash-radar-spec.md). INFLÖDEN endast. Tre siffror hålls isär:
 * fakturerat (åtagande) / viktad potential / normal (historisk median).
 */
export const STAGE_WEIGHTS: Record<string, number> = {
  quote_accepted: 0.9,
  quote_sent: 0.35,
  contacted: 0.15,
  new_inquiry: 0.15,
}
/** Stage-schablon när expected_close_date saknas (veckor framåt). */
const STAGE_HORIZON_WEEKS: Record<string, number> = {
  quote_accepted: 1, quote_sent: 2, contacted: 3, new_inquiry: 3,
}
export const DIP_THRESHOLD = 0.6
export const MIN_HISTORY_WEEKS = 4
export const RADAR_WEEKS = 5

export function medianDelayDays(rows: { due_date: string; paid_at: string }[]): number {
  const delays = rows
    .map(r => Math.round((new Date(r.paid_at).getTime() - new Date(r.due_date).getTime()) / 86_400_000))
    .filter(d => isFinite(d))
    .sort((a, b) => a - b)
  if (delays.length < 3) return 0 // för lite data → gissa inte
  const mid = Math.floor(delays.length / 2)
  return delays.length % 2 ? delays[mid] : Math.round((delays[mid - 1] + delays[mid]) / 2)
}

/** Måndag som veckostart, ISO-datum (sv-SE-vecka). */
export function bucketWeekStart(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow = (x.getUTCDay() + 6) % 7 // mån=0 ... sön=6
  x.setUTCDate(x.getUTCDate() - dow)
  return x.toISOString().slice(0, 10)
}

export interface RadarWeek { week_start: string; invoiced_kr: number; potential_kr: number }

export function projectInflows(input: {
  unpaidInvoices: { invoice_id: string; total: number; due_date: string | null }[]
  openDeals: { id: string; value: number; stageSlug: string; expected_close_date: string | null }[]
  medianDelay: number
  nowMs: number
}): RadarWeek[] {
  const start = bucketWeekStart(new Date(input.nowMs))
  const weeks: RadarWeek[] = Array.from({ length: RADAR_WEEKS }, (_, i) => {
    const d = new Date(start + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i * 7)
    return { week_start: d.toISOString().slice(0, 10), invoiced_kr: 0, potential_kr: 0 }
  })
  const index = new Map(weeks.map((w, i) => [w.week_start, i]))
  const clampWeek = (iso: string): string => {
    // Före fönstret (förfallet) → innevarande vecka; efter fönstret → utanför (ignoreras)
    if (iso < weeks[0].week_start) return weeks[0].week_start
    return iso
  }
  for (const inv of input.unpaidInvoices) {
    if (!inv.due_date || !(Number(inv.total) > 0)) continue
    const expected = new Date(inv.due_date + 'T00:00:00Z')
    expected.setUTCDate(expected.getUTCDate() + input.medianDelay)
    const w = clampWeek(bucketWeekStart(expected))
    const i = index.get(w)
    if (i !== undefined) weeks[i].invoiced_kr += Math.round(Number(inv.total))
  }
  for (const deal of input.openDeals) {
    const weight = STAGE_WEIGHTS[deal.stageSlug]
    if (!weight || !(Number(deal.value) > 0)) continue
    let expected: Date
    if (deal.expected_close_date) {
      expected = new Date(deal.expected_close_date + 'T00:00:00Z')
    } else {
      expected = new Date(input.nowMs)
      expected.setUTCDate(expected.getUTCDate() + (STAGE_HORIZON_WEEKS[deal.stageSlug] ?? 3) * 7)
    }
    const w = clampWeek(bucketWeekStart(expected))
    const i = index.get(w)
    if (i !== undefined) weeks[i].potential_kr += Math.round(Number(deal.value) * weight)
  }
  return weeks
}

export function weeklyNormal(
  paidRows: { paid_at: string; total: number }[],
  nowMs: number
): { ready: boolean; normal_kr: number } {
  const sums = new Map<string, number>()
  const cutoff = nowMs - 12 * 7 * 86_400_000
  for (const r of paidRows) {
    const t = new Date(r.paid_at).getTime()
    if (!isFinite(t) || t < cutoff || t > nowMs) continue
    const w = bucketWeekStart(new Date(t))
    sums.set(w, (sums.get(w) || 0) + Math.round(Number(r.total) || 0))
  }
  const values = Array.from(sums.values()).sort((a, b) => a - b)
  if (values.length < MIN_HISTORY_WEEKS) return { ready: false, normal_kr: 0 }
  const mid = Math.floor(values.length / 2)
  const normal = values.length % 2 ? values[mid] : Math.round((values[mid - 1] + values[mid]) / 2)
  return { ready: true, normal_kr: normal }
}

export interface RadarDip { week_start: string; expected_kr: number }

export function detectDips(weeks: RadarWeek[], normalKr: number): RadarDip[] {
  if (!(normalKr > 0)) return []
  return weeks
    .filter(w => w.invoiced_kr + w.potential_kr < normalKr * DIP_THRESHOLD)
    .map(w => ({ week_start: w.week_start, expected_kr: w.invoiced_kr + w.potential_kr }))
}
```

- [ ] **Step 4: Kör → PASS (22 = 11×2)** + tsc tomt
- [ ] **Step 5: Commit** `git add lib/cash-radar.ts tests/cash-radar.spec.ts && git commit -m "feat(radar): ren projektionsmotor — median-forsening, veckobuckets, stage-vikter, dipp + cold-start"`

---

### Task 2: Server-datalager + endpoints

**Files:** Create `lib/cash-radar-data.ts`, `app/api/dashboard/cash-radar/route.ts`, `app/api/dashboard/cash-radar/nudge/route.ts`

- [ ] **Step 1: `lib/cash-radar-data.ts`** — `assembleCashRadar(supabase, businessId)`:
  1. Betalda fakturor 180 dgr: `invoice.select('total, due_date, paid_at').eq(business).eq('status','paid').not('paid_at','is',null).gte('paid_at', ...)` → medianDelayDays (rader med due_date) + weeklyNormal.
  2. Obetalda: `invoice.select('invoice_id, invoice_number, total, due_date, customer_id').in('status',['sent','overdue'])`.
  3. Öppna deals: hämta pipeline_stage för businessId (id→slug, is_won/is_lost) → deals `.select('id, value, stage_id, expected_close_date, quote_id, customer_id, title')` → filtrera bort won/lost-stages → mappa stageSlug.
  4. projectInflows + detectDips. Åtgärdsobjekt per dipp (max 3, sorterade på belopp, HELA listan över kandidater — inte per vecka-matchade, enkelhet i v1): förfallna/skickade fakturor (typ 'remind_invoice': invoice_id, invoice_number, total) + deals i quote_sent med quote_id (typ 'nudge_quote': quote_id, title, value, dedup-flagga om öppet quote_nudge-förslag finns för quote_id via pending_approvals-count) + statisk 'wake_customer'-länk-action.
  5. Returnera { ready, normal_kr, weeks, dips: dips.map(d => ({...d, actions})) }.
- [ ] **Step 2: GET-routen** — auth (getAuthenticatedBusiness) → assembleCashRadar → json. 401 annars.
- [ ] **Step 3: nudge-routen** — POST { quote_id }: auth; hämta offerten (quote_id, title, total, customer_id, business_id-scopad) + kundens telefon; 404 om saknas; dedup (öppet pending quote_nudge med payload.quote_id → `{ ok:true, already_pending:true }`); skapa pending_approvals (mönster från lib/agents/hanna-outbound.ts: id `appr_`-prefix, approval_type 'quote_nudge', title `Påminn {kund} om offerten`, payload `{ quote_id, to: kundtelefon, customer_phone: kundtelefon, message: 'Hej {förnamn}! Ville bara höra om du hunnit titta på offerten "{titel}". Hör gärna av dig vid frågor! /{företagsnamn}', customer_id }`, risk_level 'low', expires_at +7d). VERIFIERA payload-fälten mot approvals-routens case 'quote_nudge' (kräver to+message — bekräftat).
- [ ] **Step 4:** tsc + build + commit `"feat(radar): cash-radar-API — delat datalager + nudge-endpoint (gated via quote_nudge)"`

---

### Task 3: Dashboard-kortet + måndagsbriefen

**Files:** Create `components/dashboard/CashRadarCard.tsx` · Modify `app/dashboard/page.tsx:672` (mount efter WeeklyValueDigest) · Modify `lib/matte/morning-brief.ts` (Karin-raden)

- [ ] **Step 1: Kortet.** Kontrakt (följ WeeklyValueDigest/EarnedAutonomyPanel-mönstren: 'use client', fetch en gång med active-guard, return null tills data, ingen chart-lib):
  - `ready:false` → litet stillsamt kort: "📈 Pengar in-radarn bygger din normal — kommer igång efter några veckors fakturering."
  - `ready:true` → rubrik "Pengar in — 5 veckor framåt" + normal-rad ("din normal: ~{X} kr/vecka") + 5 staplar (ren CSS flex: höjd ∝ belopp relativt max; solid teal = fakturerat, ovanpå streckad/50%-opacity = potential; amber ram + "⚠ tunn vecka" på dipp; veckolabel "v.28" + belopp under). Fotnot: "Visar pengar in (fakturor + viktad potential). Utgifter ingår inte."
  - Dipp-sektion under staplarna: "Karin föreslår:" + åtgärdsrader — remind_invoice → knapp som POST:ar `/api/invoices/{id}/reminder` (disabled under anrop → ✓ Påmind); nudge_quote → POST `/api/dashboard/cash-radar/nudge` (→ "✓ Förslag skapat — godkänn i Att godkänna"; already_pending → visa direkt ✓); wake_customer → länk till /dashboard/approvals. Svensk copy, inga tekniska termer.
- [ ] **Step 2: Mount** direkt efter `<WeeklyValueDigest />` (page.tsx:672) med import bland dashboard-komponenterna.
- [ ] **Step 3: Briefen.** I `lib/matte/morning-brief.ts`: generateMorningBrief anropar `assembleCashRadar` (import från lib/cash-radar-data) inuti try/catch (non-blocking); vid `ready && dips.length>0` läggs BriefDetail först i Karins details: `{ text: 'Vecka {v} ser tunn ut (~{X} kr mot normala ~{Y}) — åtgärder finns på dashboarden.', urgency: 'high', link: '/dashboard' }` + Karins badge eskaleras om buildKarinBrief-strukturen tillåter (läs funktionen; minsta ingrepp: injicera detail-raden i resultatet efter buildKarinBrief-anropet i generateMorningBrief — rör inte funktionssignaturen om det blir enklare).
- [ ] **Step 4:** tsc + build + alla tester (`tests/cash-radar.spec.ts` + regressionssviterna) + commit `"feat(radar): Pengar in-kortet pa dashboarden + Karins mandagsrad"`

---

### Task 4: Slutverifiering + deploy

- [ ] Full svit: `npx playwright test tests/cash-radar.spec.ts tests/quote-options.spec.ts tests/test-call.spec.ts tests/earned-autonomy.spec.ts tests/skv-rot-rut.spec.ts --no-deps 2>&1 | tail -1` (förväntat 158 passed) + tsc + build.
- [ ] `git push origin HEAD:main` (ingen SQL-grind — inga nya tabeller).
- [ ] Manuellt facit (Andreas): dashboarden visar kortet (Bee bör ha ready:true), staplarna rimliga mot verkliga fakturor, dipp-åtgärderna fungerar (påminn → SMS-flöde; jaga → förslag i Att godkänna), måndagsbriefen nästa måndag.

## Kända risker
1. Bee kan ha få betalda fakturor med paid_at → cold-start-gaten visar bygger-läget (ärligt, ej bugg).
2. Stage-vikterna är schabloner — märkta "viktad potential"; kalibrering per företag = v2.
3. expected_close_date sätts sällan → schablon-horisonten dominerar initialt (dokumenterat).
