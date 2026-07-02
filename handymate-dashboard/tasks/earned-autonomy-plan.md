# Förtjänad autonomi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agenter graderas upp till autonomi per åtgärdstyp/företag baserat på 15 raka godkännanden (60-dagarsfönster), med ett-trycks-samtycke i befintliga godkännande-UI:t och automatisk nedgradering vid avvisning.

**Architecture:** Ett centralt lager (`lib/autonomy/earned-autonomy.ts`) med ren streak-beräkning + JSONB-state på `v3_automation_settings.earned_autonomy`. Två exekverings-wiringar: motorns `needsApproval`-beslut (täcker invoice/booking/quote-typerna) och `cron/review-requests`. Erbjudande + beviljande + nedgradering går genom befintliga `pending_approvals`-flödet (ny typ `autonomy_offer`).

**Tech Stack:** Next.js 14 App Router, Supabase (JS-klient), Playwright test-runner (`--no-deps`, samma mönster som `tests/skv-rot-rut.spec.ts`). Spec: `tasks/earned-autonomy-spec.md`.

**Verifierade fakta (gissa ALDRIG om dessa):**
- Motorns approval-gren: `lib/automation-engine.ts` rad ~845–878 (`needsApproval` → `handleCreateApproval` med `approval_type: 'automation'` och `payload = context` inkl. `rule_id`/`rule_action_type`/`rule_action_config`).
- Approvals-routen (`app/api/approvals/[id]/route.ts`): atomisk status-flip rad ~72–85 (`.eq('status','pending')`-guard), learning-events rad ~87–120, reject-side-effects rad ~123, exekvering via `executeApprovalPayload` switch (case `review_request` rad ~430).
- `cron/review-requests` skapar `pending_approvals` med `approval_type:'review_request'` och payload-fälten `to`, `message`, `customer_id`, `project_id` (rad ~200–222).
- `v3_automation_settings.business_id` är `NOT NULL UNIQUE` → upsert `onConflict:'business_id'` funkar.
- `pending_approvals` statusvärden i data: `pending`/`approved`/`rejected`.
- Trust-ladder: `app/api/dashboard/trust-ladder/route.ts`, konsument `app/dashboard/agent/page.tsx`. `SavedScoreboard` mountas på `app/dashboard/agent/page.tsx:1326`.
- Veckodigest: `app/api/dashboard/weekly-value/route.ts` + `components/dashboard/WeeklyValueDigest.tsx`.

**Deploy-ordning (kritisk):** Task 1 (sql/v65) körs av Andreas i Supabase INNAN något `autonomy_offer` godkänns i prod — annars misslyckas grant-skrivningen (kolumnen saknas). All läs-kod är tolerant (catch → gatad).

---

### Task 1: SQL-migration (manuell körning)

**Files:**
- Create: `sql/v65_earned_autonomy.sql`

- [ ] **Step 1: Skapa migrationsfilen**

```sql
-- v65_earned_autonomy.sql
-- Förtjänad autonomi: per-åtgärdstyp-state på v3_automation_settings.
-- Form: { "invoice_reminder": { "status": "autonomous", "granted_at": "<iso>" }, ... }
-- Endast beviljande-state persisteras — streaks härleds ur pending_approvals-historik.
-- Körs manuellt i Supabase SQL Editor (konvention).

ALTER TABLE v3_automation_settings
  ADD COLUMN IF NOT EXISTS earned_autonomy JSONB DEFAULT '{}';
```

- [ ] **Step 2: Commit**

```bash
git add sql/v65_earned_autonomy.sql
git commit -m "feat(autonomy): sql/v65 — earned_autonomy JSONB på v3_automation_settings"
```

- [ ] **Step 3: Be Andreas köra sql/v65 i Supabase SQL Editor** (blockerar inte fortsatt kodning, men MÅSTE vara kört innan ett autonomy_offer godkänns i prod)

---

### Task 2: Kärnbiblioteket — rena funktioner först (TDD)

**Files:**
- Create: `lib/autonomy/earned-autonomy.ts`
- Test: `tests/earned-autonomy.spec.ts`

- [ ] **Step 1: Skriv failande tester för de RENA funktionerna**

Skapa `tests/earned-autonomy.spec.ts`:

```typescript
/**
 * Förtjänad autonomi — enhetstester för de rena funktionerna
 * (deriveAutonomyKey, autonomyKeyFromApproval, computeStreakFromRows).
 * Körs: npx playwright test tests/earned-autonomy.spec.ts --no-deps
 * (samma mönster som tests/skv-rot-rut.spec.ts — inga browser/server-beroenden)
 */
import { test, expect } from '@playwright/test'
import {
  deriveAutonomyKey,
  autonomyKeyFromApproval,
  computeStreakFromRows,
  STREAK_TARGET,
  type ResolvedApprovalRow,
} from '../lib/autonomy/earned-autonomy'

function row(over: Partial<ResolvedApprovalRow>): ResolvedApprovalRow {
  return {
    approval_type: 'automation',
    status: 'approved',
    payload: { autonomy_key: 'invoice_reminder' },
    created_at: new Date().toISOString(),
    ...over,
  }
}

test.describe('deriveAutonomyKey', () => {
  test('mappar de tre motor-signaturerna', () => {
    expect(deriveAutonomyKey({ trigger_type: 'threshold', action_type: 'send_sms', trigger_config: { entity: 'invoice', field: 'days_overdue' } })).toBe('invoice_reminder')
    expect(deriveAutonomyKey({ trigger_type: 'threshold', action_type: 'send_sms', trigger_config: { entity: 'booking', field: 'hours_until' } })).toBe('booking_reminder')
    expect(deriveAutonomyKey({ trigger_type: 'threshold', action_type: 'send_sms', trigger_config: { entity: 'quote', field: 'days_since_sent' } })).toBe('quote_followup_sms')
  })
  test('returnerar null för allt utanför allowlisten', () => {
    expect(deriveAutonomyKey({ trigger_type: 'event', action_type: 'send_sms', trigger_config: { event_name: 'call_missed' } })).toBeNull()
    expect(deriveAutonomyKey({ trigger_type: 'threshold', action_type: 'send_email', trigger_config: { entity: 'invoice', field: 'days_overdue' } })).toBeNull()
    expect(deriveAutonomyKey({ trigger_type: 'threshold', action_type: 'send_sms', trigger_config: { entity: 'customer', field: 'months_since_last_job' } })).toBeNull()
  })
})

test.describe('autonomyKeyFromApproval', () => {
  test('review_request mappar via approval_type (historik räknas)', () => {
    expect(autonomyKeyFromApproval({ approval_type: 'review_request', payload: null })).toBe('review_request')
  })
  test('automation mappar via payload.autonomy_key', () => {
    expect(autonomyKeyFromApproval({ approval_type: 'automation', payload: { autonomy_key: 'booking_reminder' } })).toBe('booking_reminder')
  })
  test('automation utan autonomy_key → null (äldre rader)', () => {
    expect(autonomyKeyFromApproval({ approval_type: 'automation', payload: { rule_id: 'x' } })).toBeNull()
  })
  test('okänd nyckel i payload → null (aldrig utanför allowlist)', () => {
    expect(autonomyKeyFromApproval({ approval_type: 'automation', payload: { autonomy_key: 'send_invoice' } })).toBeNull()
    expect(autonomyKeyFromApproval({ approval_type: 'proactive_care', payload: {} })).toBeNull()
  })
})

test.describe('computeStreakFromRows (rader sorterade NYAST först)', () => {
  test('räknar raka godkännanden av nyckeln', () => {
    const rows = [row({}), row({}), row({})]
    expect(computeStreakFromRows(rows, 'invoice_reminder')).toBe(3)
  })
  test('avvisning av samma nyckel stoppar (nollar) streaken', () => {
    const rows = [row({}), row({ status: 'rejected' }), row({}), row({})]
    expect(computeStreakFromRows(rows, 'invoice_reminder')).toBe(1)
  })
  test('andra nycklar mitt i påverkar inte', () => {
    const rows = [
      row({}),
      row({ approval_type: 'review_request', payload: null, status: 'rejected' }),
      row({}),
    ]
    expect(computeStreakFromRows(rows, 'invoice_reminder')).toBe(2)
  })
  test('rader utan nyckel (äldre automation) hoppas över', () => {
    const rows = [row({}), row({ payload: { rule_id: 'x' } }), row({})]
    expect(computeStreakFromRows(rows, 'invoice_reminder')).toBe(2)
  })
  test('tom lista → 0', () => {
    expect(computeStreakFromRows([], 'review_request')).toBe(0)
  })
  test('STREAK_TARGET är 15', () => {
    expect(STREAK_TARGET).toBe(15)
  })
})
```

- [ ] **Step 2: Kör testerna — förvänta FAIL (modulen finns inte)**

Kör: `npx playwright test tests/earned-autonomy.spec.ts --no-deps 2>&1 | tail -5`
Förväntat: FAIL / "Cannot find module '../lib/autonomy/earned-autonomy'"

- [ ] **Step 3: Implementera biblioteket**

Skapa `lib/autonomy/earned-autonomy.ts`:

```typescript
/**
 * Förtjänad autonomi — agenter graderas upp till att agera utan godkännande
 * per åtgärdstyp/företag, baserat på mätt godkännande-historik.
 *
 * Spec: tasks/earned-autonomy-spec.md. Kärnprinciper:
 *  - HÅRDKODAD allowlist (4 typer) — inga andra typer kan graderas, ens av misstag.
 *  - Streak härleds ur pending_approvals (approved/rejected) — ingen räknartabell.
 *  - Endast beviljande-state persisteras (v3_automation_settings.earned_autonomy).
 *  - Alltid reversibelt: manuell revoke + auto-nedgradering vid avvisning.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export const STREAK_TARGET = 15
export const WINDOW_DAYS = 60
const OFFER_EXPIRES_DAYS = 14

export type AutonomyKey =
  | 'invoice_reminder'
  | 'booking_reminder'
  | 'quote_followup_sms'
  | 'review_request'

const ALLOWLIST: AutonomyKey[] = [
  'invoice_reminder', 'booking_reminder', 'quote_followup_sms', 'review_request',
]

/** Svenska etiketter + ansvarig agent (för erbjudande-copy + UI). */
export const AUTONOMY_META: Record<AutonomyKey, { label: string; agent: string; agentName: string }> = {
  invoice_reminder:  { label: 'fakturapåminnelser',      agent: 'karin',  agentName: 'Karin' },
  booking_reminder:  { label: 'bokningspåminnelser',     agent: 'lars',   agentName: 'Lars' },
  quote_followup_sms:{ label: 'offertuppföljningar',     agent: 'daniel', agentName: 'Daniel' },
  review_request:    { label: 'recensionsförfrågningar', agent: 'hanna',  agentName: 'Hanna' },
}

export function isAllowlistedKey(key: unknown): key is AutonomyKey {
  return typeof key === 'string' && (ALLOWLIST as string[]).includes(key)
}

/**
 * Mappa en v3-regel → autonomi-nyckel via trigger-SIGNATUR (inte namn — namn
 * är användarredigerbara). Endast de tre motor-typerna; review_request skapas
 * av cron, inte regler. Null = ej allowlistad → beteende oförändrat.
 */
export function deriveAutonomyKey(rule: {
  trigger_type: string
  action_type: string
  trigger_config: Record<string, unknown> | null
}): AutonomyKey | null {
  if (rule.trigger_type !== 'threshold' || rule.action_type !== 'send_sms') return null
  const cfg = rule.trigger_config || {}
  const sig = `${cfg.entity}/${cfg.field}`
  if (sig === 'invoice/days_overdue') return 'invoice_reminder'
  if (sig === 'booking/hours_until') return 'booking_reminder'
  if (sig === 'quote/days_since_sent') return 'quote_followup_sms'
  return null
}

export interface ResolvedApprovalRow {
  approval_type: string
  status: string
  payload: Record<string, unknown> | null
  created_at: string
}

/**
 * Nyckel ur en approval-rad. review_request → direkt via approval_type
 * (historiska rader räknas). automation → payload.autonomy_key (stämplas av
 * motorn fr.o.m. denna feature — äldre rader saknar den och hoppas över,
 * dvs. streak för motor-typerna räknas från deploy. Medvetet: robust utan
 * regel-uppslag mot ev. raderade regler).
 */
export function autonomyKeyFromApproval(row: {
  approval_type: string
  payload: Record<string, unknown> | null
}): AutonomyKey | null {
  if (row.approval_type === 'review_request') return 'review_request'
  if (row.approval_type === 'automation') {
    const k = row.payload?.autonomy_key
    return isAllowlistedKey(k) ? k : null
  }
  return null
}

/**
 * Räkna raka godkännanden av `key` ur rader SORTERADE NYAST FÖRST.
 * Andra nycklar/nyckellösa rader hoppas över; 'rejected' av samma nyckel
 * stoppar. 'pending'/'expired' är inte beslut → hoppas över.
 */
export function computeStreakFromRows(rows: ResolvedApprovalRow[], key: AutonomyKey): number {
  let streak = 0
  for (const r of rows) {
    if (autonomyKeyFromApproval(r) !== key) continue
    if (r.status === 'approved') { streak++; continue }
    if (r.status === 'rejected') break
    // pending/expired → inget beslut, hoppa
  }
  return streak
}

// ── DB-lager ────────────────────────────────────────────────────────────────

type AutonomyState = Record<string, { status: 'autonomous'; granted_at: string }>

async function readState(supabase: SupabaseClient, businessId: string): Promise<AutonomyState> {
  try {
    const { data } = await supabase
      .from('v3_automation_settings')
      .select('earned_autonomy')
      .eq('business_id', businessId)
      .maybeSingle()
    return (data?.earned_autonomy as AutonomyState) || {}
  } catch {
    // Kolumn saknas (v65 ej körd) eller transient fel → behandla som gatad.
    return {}
  }
}

export async function isAutonomous(
  supabase: SupabaseClient, businessId: string, key: AutonomyKey
): Promise<boolean> {
  const state = await readState(supabase, businessId)
  return state[key]?.status === 'autonomous'
}

async function writeState(
  supabase: SupabaseClient, businessId: string, state: AutonomyState
): Promise<void> {
  // business_id är NOT NULL UNIQUE (sql/v3_automation_settings.sql) → upsert säkert.
  const { error } = await supabase
    .from('v3_automation_settings')
    .upsert({ business_id: businessId, earned_autonomy: state }, { onConflict: 'business_id' })
  if (error) throw new Error(`earned_autonomy write failed: ${error.message}`)
}

export async function grantAutonomy(
  supabase: SupabaseClient, businessId: string, key: AutonomyKey
): Promise<void> {
  const state = await readState(supabase, businessId)
  state[key] = { status: 'autonomous', granted_at: new Date().toISOString() }
  await writeState(supabase, businessId, state)
}

export async function revokeAutonomy(
  supabase: SupabaseClient, businessId: string, key: AutonomyKey
): Promise<void> {
  const state = await readState(supabase, businessId)
  if (!state[key]) return
  delete state[key]
  await writeState(supabase, businessId, state)
}

/** Hämta beslutade approvals i fönstret och räkna streak för nyckeln. */
export async function computeStreak(
  supabase: SupabaseClient, businessId: string, key: AutonomyKey
): Promise<number> {
  const sinceIso = new Date(Date.now() - WINDOW_DAYS * 24 * 3600_000).toISOString()
  const { data } = await supabase
    .from('pending_approvals')
    .select('approval_type, status, payload, created_at')
    .eq('business_id', businessId)
    .in('approval_type', ['automation', 'review_request'])
    .in('status', ['approved', 'rejected'])
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(200)
  return computeStreakFromRows((data as ResolvedApprovalRow[]) || [], key)
}

/**
 * Skapa erbjudande om tröskeln nås. Dedup: ej om redan autonom, ej om ett
 * pending autonomy_offer för nyckeln finns. Returnerar true om skapat.
 */
export async function maybeCreateOffer(
  supabase: SupabaseClient, businessId: string, key: AutonomyKey
): Promise<boolean> {
  if (await isAutonomous(supabase, businessId, key)) return false

  const { count } = await supabase
    .from('pending_approvals')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('approval_type', 'autonomy_offer')
    .eq('status', 'pending')
    .contains('payload', { autonomy_key: key })
  if ((count || 0) > 0) return false

  const streak = await computeStreak(supabase, businessId, key)
  if (streak < STREAK_TARGET) return false

  const meta = AUTONOMY_META[key]
  const id = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  const { error } = await supabase.from('pending_approvals').insert({
    id,
    business_id: businessId,
    approval_type: 'autonomy_offer',
    title: `Låt ${meta.agentName} sköta ${meta.label} själv?`,
    description: `Du har godkänt de ${streak} senaste ${meta.label}na utan ändringar. Godkänner du detta skickas de automatiskt framöver — du ser allt i loggen och kan alltid ta tillbaka ratten under Förtroendetrappan.`,
    payload: { autonomy_key: key, streak, agent: meta.agent },
    status: 'pending',
    risk_level: 'low',
    expires_at: new Date(Date.now() + OFFER_EXPIRES_DAYS * 24 * 3600_000).toISOString(),
  })
  return !error
}
```

- [ ] **Step 4: Kör testerna — förvänta PASS**

Kör: `npx playwright test tests/earned-autonomy.spec.ts --no-deps 2>&1 | tail -3`
Förväntat: alla PASS (desktop + mobile-projekt = 2× testerna)

- [ ] **Step 5: tsc + commit**

```bash
npx tsc --noEmit
git add lib/autonomy/earned-autonomy.ts tests/earned-autonomy.spec.ts
git commit -m "feat(autonomy): kärnbibliotek — streak/allowlist/grant/revoke/offer + enhetstester"
```

---

### Task 3: Motor-wiring (autonom bypass + nyckel-stämpling)

**Files:**
- Modify: `lib/automation-engine.ts` (~rad 845–878, `needsApproval`-blocket i `executeRule`)

- [ ] **Step 1: Lägg import överst i filen** (bland övriga imports)

```typescript
import { deriveAutonomyKey, isAutonomous as isAutonomyGranted } from '@/lib/autonomy/earned-autonomy'
```

(Alias för att inte kollidera med ev. lokala namn — verifiera med grep att `isAutonomous` inte redan finns i filen: `grep -n "isAutonomous" lib/automation-engine.ts`.)

- [ ] **Step 2: Ersätt approval-beslutet**

Hitta (exakt befintlig kod, rad ~853):

```typescript
  const needsApproval = typedRule.requires_approval || globalApproval

  if (needsApproval && typedRule.action_type !== 'create_approval') {
    const approvalResult = await handleCreateApproval(supabase, typedRule.business_id, {
      title: typedRule.name,
      description: typedRule.description || '',
      approval_type: 'automation',
    }, { ...context, rule_id: ruleId, rule_action_type: typedRule.action_type, rule_action_config: typedRule.action_config })
```

Ersätt med:

```typescript
  const needsApproval = typedRule.requires_approval || globalApproval

  // Förtjänad autonomi: om regeln mappar till en allowlistad nyckel OCH
  // hantverkaren beviljat autonomi för den → hoppa över approval-grenen och
  // fall igenom till exekvering (steg 7). Markera i context för logg/digest.
  const autonomyKey = deriveAutonomyKey(typedRule)
  let autonomousBypass = false
  if (needsApproval && autonomyKey) {
    try {
      autonomousBypass = await isAutonomyGranted(supabase, typedRule.business_id, autonomyKey)
    } catch { autonomousBypass = false }
  }
  if (autonomousBypass) context.earned_autonomy = true

  if (needsApproval && !autonomousBypass && typedRule.action_type !== 'create_approval') {
    const approvalResult = await handleCreateApproval(supabase, typedRule.business_id, {
      title: typedRule.name,
      description: typedRule.description || '',
      approval_type: 'automation',
    }, {
      ...context,
      rule_id: ruleId,
      rule_action_type: typedRule.action_type,
      rule_action_config: typedRule.action_config,
      // Stämpla nyckeln → streak-räkning kan mappa raden (autonomyKeyFromApproval)
      ...(autonomyKey ? { autonomy_key: autonomyKey } : {}),
    })
```

(Resten av approval-grenen — logExecution/updateRuleStats/return — lämnas orörd. Fall-through till steg 7 `executeAction` exekverar + loggar redan, inkl. `context` med `earned_autonomy: true` in i `v3_automation_logs.context`.)

- [ ] **Step 3: Ägarnotis vid misslyckat AUTONOMT utskick (spec-krav: ingen tyst svält)**

I steg 8-området av `executeRule` (direkt EFTER `const status: LogStatus = result.success ? 'success' : 'failed'`, ~rad 888), lägg:

```typescript
  // Förtjänad autonomi: ett autonomt utskick som failar får inte svälta tyst —
  // hantverkaren har delegerat och måste få veta när delegationen fallerar.
  if (status === 'failed' && context.earned_autonomy === true) {
    try {
      await fetch(`${APP_URL}/api/push/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: typedRule.business_id,
          title: 'Självständig åtgärd misslyckades',
          body: `${typedRule.name} kunde inte utföras — kontrollera i loggen.`,
        }),
      })
    } catch { /* non-blocking */ }
  }
```

(`APP_URL` finns redan i filen — används av `handleCreateApproval`s push, ~rad 449. Verifiera med `grep -n "APP_URL" lib/automation-engine.ts`.)

- [ ] **Step 4: tsc + commit**

```bash
npx tsc --noEmit
git add lib/automation-engine.ts
git commit -m "feat(autonomy): motor-wiring — autonom bypass + autonomy_key-stämpling i approvals"
```

---

### Task 4: Approvals-routen — autonomy_offer-case + streak/nedgraderings-hookar

**Files:**
- Modify: `app/api/approvals/[id]/route.ts`

- [ ] **Step 1: Lägg hook efter learning-event-blocket** (efter `} catch {` -blocket som slutar ~rad 120, FÖRE `// Reject-side-effect för specifika types`)

```typescript
    // Förtjänad autonomi (non-blocking): godkännande av allowlistad typ kan
    // trigga erbjudande vid 15 raka; avvisning nedgraderar + nollar streak
    // (streaken nollas implicit — den avvisade raden ligger nu i historiken).
    try {
      const { autonomyKeyFromApproval, maybeCreateOffer, revokeAutonomy } =
        await import('@/lib/autonomy/earned-autonomy')
      const autonomyKeyForRow = autonomyKeyFromApproval(approval)
      if (autonomyKeyForRow) {
        if (action === 'approve') {
          await maybeCreateOffer(supabase, business.business_id, autonomyKeyForRow)
        } else if (action === 'reject') {
          await revokeAutonomy(supabase, business.business_id, autonomyKeyForRow)
        }
      }
    } catch (autonomyErr) {
      console.error('[approvals] earned-autonomy hook error (non-blocking):', autonomyErr)
    }
```

- [ ] **Step 2: Lägg nytt case i `executeApprovalPayload`-switchen** (bredvid `case 'review_request'`, ~rad 430)

```typescript
      case 'autonomy_offer': {
        // Beviljar förtjänad autonomi för en åtgärdstyp. Ingen extern effekt —
        // endast settings-skrivning (låg risk). Kräver att sql/v65 är körd.
        const { grantAutonomy, isAllowlistedKey } = await import('@/lib/autonomy/earned-autonomy')
        const key = payload.autonomy_key
        if (!isAllowlistedKey(key)) {
          return { action: 'autonomy_offer', error: `Okänd autonomi-nyckel: ${String(key)}` }
        }
        const supabaseAO = (await import('@/lib/supabase')).getServerSupabase()
        try {
          await grantAutonomy(supabaseAO, businessId, key)
          return { action: 'autonomy_offer', granted: true, autonomy_key: key }
        } catch (err: any) {
          return { action: 'autonomy_offer', error: err?.message || 'Kunde inte spara' }
        }
      }
```

- [ ] **Step 3: tsc + commit**

```bash
npx tsc --noEmit
git add "app/api/approvals/[id]/route.ts"
git commit -m "feat(autonomy): autonomy_offer-exekvering + streak/nedgraderings-hookar i approvals"
```

---

### Task 5: review-requests-cronen — autonom direkt-sändning

**Files:**
- Modify: `app/api/cron/review-requests/route.ts` (~rad 200, precis FÖRE `pending_approvals`-inserten)

- [ ] **Step 1: Verifiera variabelnamn i cronens loop**

Läs rad ~130–225. Bekräfta att loopen har: `biz.business_id`, `customer.phone_number`, `customer.customer_id`, `project.project_id`, `smsText`. Kontrollera om `biz`-selecten inkluderar `business_name` — om INTE, lägg till `business_name` i select-listan för business-hämtningen (behövs som SMS-avsändare).

- [ ] **Step 2: Lägg autonomi-grenen före approval-inserten**

Precis före `const { error: insertError } = await supabase.from('pending_approvals').insert({`:

```typescript
      // Förtjänad autonomi: om hantverkaren beviljat Hanna autonomi för
      // recensionsförfrågningar → skicka direkt (samma sendSmsViaElks-väg som
      // approve-exekveringen) istället för att skapa godkännande.
      const { isAutonomous } = await import('@/lib/autonomy/earned-autonomy')
      if (await isAutonomous(supabase, biz.business_id, 'review_request')) {
        const { sendSmsViaElks } = await import('@/lib/sms-send')
        const smsResult = await sendSmsViaElks({
          supabase,
          businessId: biz.business_id,
          businessName: biz.business_name || null,
          to: customer.phone_number,
          message: smsText,
          customerId: customer.customer_id,
          relatedId: project.project_id,
          messageType: 'review_request',
        })
        await supabase.from('v3_automation_logs').insert({
          business_id: biz.business_id,
          agent_id: 'hanna',
          rule_name: 'review_request',
          trigger_type: 'cron',
          action_type: 'send_sms',
          status: smsResult.success ? 'success' : 'failed',
          context: {
            earned_autonomy: true,
            customer_id: customer.customer_id,
            project_id: project.project_id,
          },
          result: smsResult.success ? {} : { error: smsResult.error || 'okänt fel' },
        })
        if (!smsResult.success) {
          // Ingen tyst svält: misslyckat autonomt utskick → notifiera ägaren.
          try {
            const { notifyOwner } = await import('@/lib/notifications')
            await notifyOwner({
              businessId: biz.business_id,
              title: 'Autonom recensionsförfrågan misslyckades',
              body: `SMS till ${customer.phone_number} gick inte fram — kontrollera numret.`,
            })
          } catch { /* non-blocking */ }
        }
        approvalsCreated++ // räknaren betyder nu "hanterade" — behåll för cron-svaret
        continue
      }
```

**OBS:** Verifiera att `lib/notifications` exporterar `notifyOwner` med denna signatur (`grep -n "export.*notifyOwner\|export.*function notify" lib/notifications.ts`). Om namnet/signaturen skiljer — använd den faktiska (t.ex. `notifyMissedCall`-syskonfunktion) eller skapa push via `fetch(APP_URL + '/api/push/send', ...)` med samma mönster som `handleCreateApproval` i motorn (rad ~449). ANPASSA till verklig kod, hitta inte på.

- [ ] **Step 3: Kontrollera att `v3_automation_logs`-inserten matchar schemat**

Kör: `grep -nE "rule_name|trigger_type|action_type|agent_id|context|result" sql/*.sql | grep -i "automation_logs" | head`
Förväntat: kolumnerna finns (rule_name, trigger_type, action_type, status, context, result, agent_id per v21). Om `result` saknas → ta bort fältet ur inserten.

- [ ] **Step 4: tsc + commit**

```bash
npx tsc --noEmit
git add app/api/cron/review-requests/route.ts
git commit -m "feat(autonomy): review-requests skickar direkt vid beviljad autonomi"
```

---

### Task 6: Status- + revoke-API

**Files:**
- Create: `app/api/autonomy/route.ts` (GET status för UI)
- Create: `app/api/autonomy/revoke/route.ts` (POST återkalla)

- [ ] **Step 1: Skapa GET-endpointen**

`app/api/autonomy/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import {
  AUTONOMY_META, STREAK_TARGET, computeStreak, isAutonomous, type AutonomyKey,
} from '@/lib/autonomy/earned-autonomy'

/**
 * GET /api/autonomy — per-typ-status för Förtroendetrappan:
 * gatad (streak X/15) | autonom sedan {datum}. Streaks härleds live.
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const keys = Object.keys(AUTONOMY_META) as AutonomyKey[]

  // Läs granted-state en gång (isAutonomous per nyckel läser samma rad — ok, 4 läsningar, enkelt)
  const items = await Promise.all(keys.map(async (key) => {
    const autonomous = await isAutonomous(supabase, business.business_id, key)
    const streak = autonomous ? STREAK_TARGET : await computeStreak(supabase, business.business_id, key)
    return {
      key,
      label: AUTONOMY_META[key].label,
      agent: AUTONOMY_META[key].agentName,
      status: autonomous ? 'autonomous' : 'gated',
      streak,
      target: STREAK_TARGET,
    }
  }))

  return NextResponse.json({ items })
}
```

- [ ] **Step 2: Skapa revoke-endpointen**

`app/api/autonomy/revoke/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { isAllowlistedKey, revokeAutonomy } from '@/lib/autonomy/earned-autonomy'

/** POST /api/autonomy/revoke { key } — "ta tillbaka ratten" för en åtgärdstyp. */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  if (!isAllowlistedKey(body.key)) {
    return NextResponse.json({ error: 'Ogiltig nyckel' }, { status: 400 })
  }

  await revokeAutonomy(getServerSupabase(), business.business_id, body.key)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: tsc + commit**

```bash
npx tsc --noEmit
git add app/api/autonomy
git commit -m "feat(autonomy): status- och revoke-API för Förtroendetrappan"
```

---

### Task 7: UI — Förtroendetrappan-panel + veckodigest-rad

**Files:**
- Create: `components/dashboard/EarnedAutonomyPanel.tsx`
- Modify: `app/dashboard/agent/page.tsx:1326` (mounta bredvid `<SavedScoreboard />`)
- Modify: `app/api/dashboard/weekly-value/route.ts` (autonom-räknare)
- Modify: `components/dashboard/WeeklyValueDigest.tsx` (rad under tid)

- [ ] **Step 1: Skapa panelen**

`components/dashboard/EarnedAutonomyPanel.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'

/**
 * Förtroendetrappan — per åtgärdstyp: Gatad (streak X/15) → Autonom, med
 * "ta tillbaka ratten". All svensk copy, inga tekniska termer (CLAUDE.md).
 */

interface AutonomyItem {
  key: string
  label: string
  agent: string
  status: 'autonomous' | 'gated'
  streak: number
  target: number
}

export default function EarnedAutonomyPanel() {
  const [items, setItems] = useState<AutonomyItem[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const load = () => {
    fetch('/api/autonomy')
      .then(r => (r.ok ? r.json() : null))
      .then(d => setItems(d?.items || []))
      .catch(() => {})
  }
  useEffect(load, [])

  async function revoke(key: string) {
    if (!confirm('Ta tillbaka ratten? Åtgärderna kräver ditt godkännande igen.')) return
    setBusy(key)
    try {
      await fetch('/api/autonomy/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key }),
      })
      load()
    } finally { setBusy(null) }
  }

  if (items.length === 0) return null

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <h3 className="text-sm font-bold text-gray-900 mb-1">Självständighet</h3>
      <p className="text-xs text-gray-400 mb-4">
        Teamet förtjänar rätten att agera själv — i takt med att du godkänner. Du kan alltid ta tillbaka ratten.
      </p>
      <div className="space-y-3">
        {items.map(it => (
          <div key={it.key} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-gray-800 capitalize">{it.label}</p>
              <p className="text-xs text-gray-400">{it.agent}</p>
            </div>
            {it.status === 'autonomous' ? (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">Sköts självständigt</span>
                <button
                  onClick={() => revoke(it.key)}
                  disabled={busy === it.key}
                  className="text-xs text-gray-400 hover:text-red-600 underline disabled:opacity-50"
                >
                  Ta tillbaka
                </button>
              </div>
            ) : (
              <span className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded-full">
                {it.streak}/{it.target} godkända i rad
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Mounta i agent-sidan**

I `app/dashboard/agent/page.tsx`: lägg till import bland övriga dashboard-imports:

```typescript
import EarnedAutonomyPanel from '@/components/dashboard/EarnedAutonomyPanel'
```

och direkt EFTER `<SavedScoreboard />` (rad ~1326):

```tsx
      <div className="mt-4">
        <EarnedAutonomyPanel />
      </div>
```

(Läs närmaste JSX-kontext först — om `<SavedScoreboard />` ligger i en grid, placera panelen som syskon i samma grid istället för egen div.)

- [ ] **Step 3: Digest-räknaren — utöka weekly-value-routen**

I `app/api/dashboard/weekly-value/route.ts`: lägg till i `Promise.all`-batchen (efter `leadsRes`):

```typescript
    supabase
      .from('v3_automation_logs')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('status', 'success')
      .gte('created_at', sinceIso)
      .contains('context', { earned_autonomy: true }),
```

Destrukturera som `autonomousRes` och lägg i svaret:

```typescript
    autonomous_count: autonomousRes.count || 0,
```

- [ ] **Step 4: Digest-raden — utöka komponenten**

I `components/dashboard/WeeklyValueDigest.tsx`: lägg `autonomous_count: number` i `WeeklyValue`-interfacet, och under tid-kolumnens `<div className="text-xs text-gray-400">uppskattat</div>`:

```tsx
          {data.autonomous_count > 0 && (
            <div className="text-xs text-primary-700 mt-1">
              varav {data.autonomous_count} utförda självständigt
            </div>
          )}
```

- [ ] **Step 5: tsc + build + commit**

```bash
npx tsc --noEmit
npx next build 2>&1 | tail -4
git add components/dashboard/EarnedAutonomyPanel.tsx app/dashboard/agent/page.tsx app/api/dashboard/weekly-value/route.ts components/dashboard/WeeklyValueDigest.tsx
git commit -m "feat(autonomy): Förtroendetrappan-panel + självständighets-rad i veckodigest"
```

---

### Task 8: Slutverifiering + deploy

- [ ] **Step 1: Full testsvit + build**

```bash
npx playwright test tests/earned-autonomy.spec.ts tests/skv-rot-rut.spec.ts --no-deps 2>&1 | tail -3
npx tsc --noEmit
npx next build 2>&1 | tail -4
```

Förväntat: alla tester PASS, 0 tsc-fel, build ren (endast kända benigna fortnox-sync/themeColor-varningar).

- [ ] **Step 2: Manuellt flödestest (dev eller prod efter deploy + v65)**

1. Säkerställ att ett företag har ≥15 godkända approvals av en typ (eller sänk `STREAK_TARGET` temporärt i dev — ALDRIG i commit).
2. Godkänn en approval av typen → verifiera att `autonomy_offer` skapas (exakt ETT — kör igen, inget dubblett-erbjudande).
3. Godkänn erbjudandet → verifiera `v3_automation_settings.earned_autonomy` innehåller nyckeln.
4. Trigga regeln (t.ex. `evaluate-thresholds`) → åtgärden exekveras UTAN nytt godkännande; `v3_automation_logs`-raden har `context.earned_autonomy=true`.
5. `/api/autonomy` visar "autonomous"; panelen visar "Sköts självständigt".
6. Avvisa en approval av samma typ (skapa en manuellt vid behov) → nedgraderad; panelen visar streak 0/15.
7. "Ta tillbaka"-knappen → samma nedgradering.

- [ ] **Step 3: Deploy**

```bash
git push origin HEAD:main   # auto-deploy till prod (verifierad metod)
```

Påminn Andreas: **sql/v65 måste vara körd i Supabase innan första autonomy_offer godkänns.**

---

### Task 9 (uppföljning, SEPARAT repo): mobil-rendering av autonomy_offer

**Files (i `c:\Users\Gaming\handymate-mobile`):**
- Modify: `lib/api.ts` (Approval-typunion) + approvals-skärmens label-mappning

- [ ] **Step 1:** Följ prejudikatet från commit `8af205b`/`a30eb14` (review_request lades till i union + label): lägg `'autonomy_offer'` i Approval-typunionen och svensk label `'Självständighet'` med lämplig ikon i approvals-skärmen. Generisk title/description-rendering täcker resten (title/description är redan på svenska från servern).
- [ ] **Step 2:** `npx tsc --noEmit` i mobil-repot → 0 fel → commit på aktuell branch. **OBS:** kräver EAS-bygge för att nå enheter (samma som övriga mobil-ändringar).

---

## Kända risker & mitigeringar

1. **v65 ej körd vid beviljande** → grant kastar → exekverings-resultatet visar fel (ej tyst). Mitigering: deploy-ordningen ovan; läsvägar är catch→gatad.
2. **Streak för motor-typer räknas från deploy** (äldre automation-rader saknar `autonomy_key`) — medvetet, dokumenterat i spec. `review_request` räknar full historik.
3. **`approvalsCreated`-räknaren i review-cronen** byter semantik till "hanterade" — kontrollera att inget annat konsumerar den som exakt approval-antal (grep i cron-svaret).
4. **Dubbelläsning av settings-raden** i GET /api/autonomy (4× isAutonomous) — acceptabelt (4 små reads); optimera INTE i förväg (YAGNI).
