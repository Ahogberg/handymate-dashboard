# Aha-onboardingen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hantverkaren ringer sitt nya nummer i steg 3 (före Stripe) och upplever fångsten live: hör Lisas hälsning, får catch-SMS på egen telefon, ser checklistan tändas — deterministiskt oavsett natt/seeding.

**Architecture:** Armerat 10-min testfönster i `business_config.onboarding_data.test_call` (JSONB, ingen migrering). Fångst-gren tidigt i `voice/incoming` (innesluten i armerings-check): omedelbar direktsändning via `sendSmsViaElks`, lead via `createLeadAndDeal` märkt test, `play` = befintlig greeting, avarmering. Tre små API:er (arm/status/delete) + test-fas i `Step4PhoneNumber`. Reservationen görs RIKTIG (idag 404→platshållare).

**Tech Stack:** Next.js 14 App Router, Supabase, 46elks, Playwright (`--no-deps`) för rena enhetstester. Spec: `tasks/aha-onboarding-spec.md`.

**Verifierade fakta (gissa ALDRIG om dessa):**
- `Step4PhoneNumber.tsx:47` anropar `POST /api/onboarding/phone/reserve` som INTE finns → fallback-platshållare `'+46 76 000 00 00'` (medveten, rad 60-62). Riktiga köp-logiken ligger i `app/api/onboarding/phone/route.ts` POST (kräver `businessId` i body + user-ägarskaps-check): 46elks-köp med `voice_start: ${APP_URL}/api/voice/incoming` (rad 99) + skriver `assigned_phone_number` + `elks_number_id` (rad 120-122). **Webhooken sätts vid köpet → numret är aktivt direkt** (spec-förutsättning 1 ✓).
- `voice/incoming`: business-uppslag på `assigned_phone_number` (rad 61-73, `.single()`), guard rad 75-78. `from`/`to`/`callId`/`APP_URL`/`supabase` i scope. Greeting-mönster: `play: ${APP_URL}/api/voice/greeting?business_id=...` (rad 206). `whenhangup` med `handled=1` = ingen dubbel call_missed.
- `createLeadAndDeal(input, supabase)` (lib/leads/golden-path.ts): input `{businessId, businessPhoneNumber, name, phone, email?, message?, source, sourceRef?, initialStatus?, createDealAndNotify?}` → `{leadId, dealId|null, customerId}`. Kund dedupas på telefon. `source: 'vapi_call'` giltig (valid_source: vapi_call/inbound_sms/website_form/manual + v56-tillägg).
- `sendSmsViaElks({supabase, businessId, businessName, to, message, customerId, relatedId, messageType})` (lib/sms-send.ts).
- `onboarding_data` spread-mergas redan i `app/api/onboarding/route.ts:80-88` (förutsättning 2 ✓). Auth: `getAuthenticatedBusiness`.
- Onboarding-sidan: completion i slutet av Step6LiveTour; `onboarding_completed_at` null under hela flödet.

---

### Task 1: Riktig reservation — extrahera köp-logiken + reserve-endpoint

**Files:**
- Create: `lib/phone/purchase-number.ts`
- Create: `app/api/onboarding/phone/reserve/route.ts`
- Modify: `app/api/onboarding/phone/route.ts` (använd hjälparen — behåll beteende)

- [ ] **Step 1: Läs `app/api/onboarding/phone/route.ts` i sin helhet.** Identifiera exakt köp-block (46elks-anropet ~rad 88-125: purchase-fetch med `voice_start`/ev. `sms_url`, response-parsning, `business_config`-uppdatering med `assigned_phone_number`+`elks_number_id`, felhantering inkl. rollback-försöket ~rad 132). Notera env-nycklar som används (ELKS-credentials).

- [ ] **Step 2: Extrahera till `lib/phone/purchase-number.ts`**

```typescript
/**
 * Köp + koppla ett 46elks-nummer till ett företag. Extraherad ur
 * app/api/onboarding/phone (delas nu med onboarding/phone/reserve).
 * Idempotent: har företaget redan assigned_phone_number returneras det.
 * Sätter voice_start-webhooken VID KÖPET → numret är aktivt direkt.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface PurchaseResult {
  ok: boolean
  phone_number?: string
  already_assigned?: boolean
  error?: string
}

export async function purchaseAndAssignNumber(
  supabase: SupabaseClient,
  businessId: string
): Promise<PurchaseResult> {
  // 1. Idempotens: redan tilldelat?
  const { data: biz } = await supabase
    .from('business_config')
    .select('assigned_phone_number')
    .eq('business_id', businessId)
    .maybeSingle()
  if (biz?.assigned_phone_number) {
    return { ok: true, phone_number: biz.assigned_phone_number, already_assigned: true }
  }

  // 2. Env-check → ärligt otillgängligt (dev utan 46elks)
  if (!process.env.ELKS_API_USERNAME || !process.env.ELKS_API_PASSWORD) {
    return { ok: false, error: 'not_configured' }
  }

  // 3. Köp — FLYTTA det exakta 46elks-blocket från app/api/onboarding/phone/route.ts
  //    hit oförändrat (samma body inkl voice_start, samma parsning, samma
  //    business_config-update med assigned_phone_number + elks_number_id,
  //    samma rollback vid update-fel). Behåll env-variabelnamnen filen använder
  //    (verifiera — kan vara ELKS_USERNAME/ELKS_PASSWORD; matcha koden, inte denna plan).
  // return { ok: true, phone_number: numberData.number }
  // vid köp-fel: return { ok: false, error: '46elks_purchase_failed' }
}
```

**OBS:** Steg 3-kommentaren är en INSTRUKTION att flytta verklig kod — läs originalet och flytta blocket exakt (inkl. env-namnen originalet använder; om `ELKS_API_USERNAME` inte är namnet i originalet, använd originalets).

- [ ] **Step 3: Skapa `app/api/onboarding/phone/reserve/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { purchaseAndAssignNumber } from '@/lib/phone/purchase-number'

/**
 * POST /api/onboarding/phone/reserve — köper + kopplar numret i STEG 3
 * (aha-testet kräver ett RIKTIGT, aktivt nummer före betalningen).
 * Komponentens fallback-platshållare kvarstår om env saknas (dev).
 */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await purchaseAndAssignNumber(getServerSupabase(), business.business_id)
  if (!result.ok) {
    // 200 med tom kropp → komponenten faller till platshållare (befintligt beteende)
    return NextResponse.json({ error: result.error })
  }
  return NextResponse.json({ phone_number: result.phone_number })
}
```

- [ ] **Step 4: Uppdatera `app/api/onboarding/phone/route.ts`** att anropa `purchaseAndAssignNumber` istället för sitt inline-block (behåll routens egen auth/ägarskaps-check och response-form oförändrad). Om routens omgivande logik gör MER än köpet (settings-update etc.) — rör inte det.

- [ ] **Step 5: Verifiera + commit**

```bash
npx tsc --noEmit 2>&1 | grep -v "^\.next/" | head -3   # tomt
git add lib/phone/purchase-number.ts app/api/onboarding/phone
git commit -m "feat(onboarding): riktig nummer-reservation i steg 3 — delad köp-hjälpare + reserve-endpoint"
```

---

### Task 2: Testfönster-biblioteket (TDD på rena delar)

**Files:**
- Create: `lib/onboarding/test-call.ts`
- Test: `tests/test-call.spec.ts`

- [ ] **Step 1: Failande tester**

```typescript
/**
 * Aha-onboardingens testfönster — rena funktioner.
 * Körs: npx playwright test tests/test-call.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { isTestCallArmed, ARM_WINDOW_MINUTES, type TestCallState } from '../lib/onboarding/test-call'

const NOW = new Date('2026-07-06T12:00:00Z').getTime()

test.describe('isTestCallArmed', () => {
  test('armerad när armed_until ligger i framtiden', () => {
    const s: TestCallState = { armed_until: new Date(NOW + 60_000).toISOString() }
    expect(isTestCallArmed(s, NOW)).toBe(true)
  })
  test('oarmerad när fönstret passerat', () => {
    const s: TestCallState = { armed_until: new Date(NOW - 1_000).toISOString() }
    expect(isTestCallArmed(s, NOW)).toBe(false)
  })
  test('oarmerad för null/undefined/saknad armed_until', () => {
    expect(isTestCallArmed(null, NOW)).toBe(false)
    expect(isTestCallArmed(undefined, NOW)).toBe(false)
    expect(isTestCallArmed({}, NOW)).toBe(false)
    expect(isTestCallArmed({ armed_until: null }, NOW)).toBe(false)
  })
  test('oarmerad för ogiltigt datum', () => {
    expect(isTestCallArmed({ armed_until: 'skräp' }, NOW)).toBe(false)
  })
  test('ARM_WINDOW_MINUTES är 10', () => {
    expect(ARM_WINDOW_MINUTES).toBe(10)
  })
})
```

- [ ] **Step 2: Kör — förvänta FAIL** (`npx playwright test tests/test-call.spec.ts --no-deps 2>&1 | tail -3`, modul saknas)

- [ ] **Step 3: Implementera `lib/onboarding/test-call.ts`**

```typescript
/**
 * Aha-onboardingens testfönster ("Ring ditt nummer nu").
 * State bor i business_config.onboarding_data.test_call (JSONB — ingen
 * migrering). Spec: tasks/aha-onboarding-spec.md.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export const ARM_WINDOW_MINUTES = 10

export interface TestCallState {
  armed_until?: string | null
  called_at?: string | null
  sms_sent?: boolean
  sms_error?: string | null
  lead_id?: string | null
  customer_id?: string | null
  deal_id?: string | null
}

/** Ren: är fönstret armerat vid `nowMs`? Fail-safe: allt tveksamt = false. */
export function isTestCallArmed(
  state: TestCallState | null | undefined,
  nowMs: number
): boolean {
  const until = state?.armed_until
  if (!until) return false
  const t = new Date(until).getTime()
  return isFinite(t) && t > nowMs
}

/** Läs test_call-staten (tom om saknas/fel — fail-safe mot gated). */
export async function readTestCall(
  supabase: SupabaseClient,
  businessId: string
): Promise<TestCallState> {
  const { data } = await supabase
    .from('business_config')
    .select('onboarding_data')
    .eq('business_id', businessId)
    .maybeSingle()
  return ((data?.onboarding_data as Record<string, unknown>)?.test_call as TestCallState) || {}
}

/**
 * Skriv test_call-staten med SPREAD-MERGE på onboarding_data (klipp aldrig
 * andra nycklar — samma mönster som app/api/onboarding/route.ts:80-88).
 * `patch` mergas in i befintlig test_call; skicka helt objekt för reset.
 */
export async function writeTestCall(
  supabase: SupabaseClient,
  businessId: string,
  patch: TestCallState,
  { replace = false }: { replace?: boolean } = {}
): Promise<void> {
  const { data, error: readError } = await supabase
    .from('business_config')
    .select('onboarding_data')
    .eq('business_id', businessId)
    .maybeSingle()
  if (readError) throw new Error(`test_call read failed: ${readError.message}`)
  const existing = (data?.onboarding_data as Record<string, unknown>) || {}
  const current = (existing.test_call as TestCallState) || {}
  const next = replace ? patch : { ...current, ...patch }
  const { error } = await supabase
    .from('business_config')
    .update({ onboarding_data: { ...existing, test_call: next } })
    .eq('business_id', businessId)
  if (error) throw new Error(`test_call write failed: ${error.message}`)
}
```

- [ ] **Step 4: Kör tester — PASS** (10 passed: 5×2 projekt) + `npx tsc --noEmit` tomt

- [ ] **Step 5: Commit**

```bash
git add lib/onboarding/test-call.ts tests/test-call.spec.ts
git commit -m "feat(onboarding): testfönster-bibliotek (armering/state i onboarding_data) + tester"
```

---

### Task 3: arm/status/delete-endpoints

**Files:**
- Create: `app/api/onboarding/test-call/arm/route.ts`
- Create: `app/api/onboarding/test-call/status/route.ts`
- Create: `app/api/onboarding/test-call/lead/route.ts` (DELETE)

- [ ] **Step 1: arm**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { ARM_WINDOW_MINUTES, writeTestCall } from '@/lib/onboarding/test-call'

/**
 * POST /api/onboarding/test-call/arm — armera ring-testet (10 min).
 * Endast under onboarding (completed → 409: testet är en onboarding-upplevelse;
 * post-completion skulle seedade regler dessutom kunna dubbel-SMS:a).
 * Re-armering tillåten (prova igen) — nollställer staten.
 */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const { data: biz } = await supabase
    .from('business_config')
    .select('assigned_phone_number, onboarding_completed_at')
    .eq('business_id', business.business_id)
    .maybeSingle()

  if (biz?.onboarding_completed_at) {
    return NextResponse.json({ available: false, reason: 'completed' }, { status: 409 })
  }
  // Riktigt nummer krävs (platshållaren '+46 76 000 00 00' går inte att ringa)
  if (!biz?.assigned_phone_number || !process.env.ELKS_API_USERNAME) {
    return NextResponse.json({ available: false, reason: 'no_number' })
  }

  await writeTestCall(supabase, business.business_id, {
    armed_until: new Date(Date.now() + ARM_WINDOW_MINUTES * 60_000).toISOString(),
    called_at: null, sms_sent: false, sms_error: null,
    lead_id: null, customer_id: null, deal_id: null,
  }, { replace: true })

  return NextResponse.json({ available: true, phone_number: biz.assigned_phone_number })
}
```

**OBS env-namnet:** använd samma ELKS-env-namn som `purchaseAndAssignNumber` landade på i Task 1 (originalets namn — verifiera, gissa ej).

- [ ] **Step 2: status**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { isTestCallArmed, readTestCall } from '@/lib/onboarding/test-call'

/** GET /api/onboarding/test-call/status — pollas varannan sekund av test-vyn. */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const state = await readTestCall(getServerSupabase(), business.business_id)
  return NextResponse.json({
    armed: isTestCallArmed(state, Date.now()),
    called_at: state.called_at || null,
    sms_sent: state.sms_sent === true,
    sms_error: state.sms_error || null,
    lead_id: state.lead_id || null,
  })
}
```

- [ ] **Step 3: delete (radera test-leadet, hårt scopat + kund-guard)**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { readTestCall, writeTestCall } from '@/lib/onboarding/test-call'

/**
 * DELETE /api/onboarding/test-call/lead — tar bort testets lead/deal, och
 * kunden ENDAST om inget annat refererar den (kunden kan ha funnits innan —
 * createLeadAndDeal dedupar på telefon; radera aldrig en riktig kund).
 * Scopat till EXAKT id:na i test_call-staten — aldrig fri radering.
 */
export async function DELETE(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const bizId = business.business_id
  const state = await readTestCall(supabase, bizId)
  if (!state.lead_id) return NextResponse.json({ ok: true, nothing_to_delete: true })

  if (state.deal_id) {
    await supabase.from('deal').delete().eq('id', state.deal_id).eq('business_id', bizId)
  }
  await supabase.from('leads').delete().eq('lead_id', state.lead_id).eq('business_id', bizId)

  if (state.customer_id) {
    const refs = await Promise.all([
      supabase.from('leads').select('lead_id', { count: 'exact', head: true }).eq('business_id', bizId).eq('customer_id', state.customer_id),
      supabase.from('deal').select('id', { count: 'exact', head: true }).eq('business_id', bizId).eq('customer_id', state.customer_id),
      supabase.from('quotes').select('quote_id', { count: 'exact', head: true }).eq('business_id', bizId).eq('customer_id', state.customer_id),
      supabase.from('invoice').select('invoice_id', { count: 'exact', head: true }).eq('business_id', bizId).eq('customer_id', state.customer_id),
    ])
    const totalRefs = refs.reduce((s, r) => s + (r.count || 0), 0)
    if (totalRefs === 0) {
      await supabase.from('customer').delete().eq('customer_id', state.customer_id).eq('business_id', bizId)
    }
  }

  await writeTestCall(supabase, bizId, { lead_id: null, customer_id: null, deal_id: null })
  return NextResponse.json({ ok: true })
}
```

**Verifiera kolumnnamn** innan commit: `deal` PK är `id`; `leads` PK `lead_id`; `customer` PK `customer_id` (grep i sql/ — matchar tidigare arbete i sessionen).

- [ ] **Step 4: tsc + commit**

```bash
npx tsc --noEmit 2>&1 | grep -v "^\.next/" | head -3
git add app/api/onboarding/test-call
git commit -m "feat(onboarding): arm/status/delete-endpoints för ring-testet"
```

---

### Task 4: Fångst-grenen i voice/incoming

**Files:**
- Modify: `app/api/voice/incoming/route.ts` (select rad ~62-71 + ny gren efter guard rad ~78)

- [ ] **Step 1: Utöka business-selecten** med `onboarding_data` (lägg i den befintliga select-strängen rad ~62-71).

- [ ] **Step 2: Lägg grenen DIREKT efter `if (businessError || !business)`-guarden** (före autoSettings-hämtningen):

```typescript
    // ── Aha-onboardingens ring-test (spec: tasks/aha-onboarding-spec.md) ──
    // Armerat testfönster → deterministisk fångst UTANFÖR regelmotorn
    // (reglerna är inte seedade under onboardingen + nattspärr skulle tyst
    // skippa). Helt innesluten i armerings-checken; fel här får ALDRIG
    // störa normala samtal (yttre try/catch → faller vidare till vanlig routing).
    try {
      const { isTestCallArmed, writeTestCall } = await import('@/lib/onboarding/test-call')
      const testState = ((business as any).onboarding_data?.test_call) || null
      if (isTestCallArmed(testState, Date.now())) {
        console.log('[Voice] Ring-testet armerat — fångar', { from, businessId: business.business_id })

        // 1. Lead + deal, märkt som test (kund dedupas på telefon)
        let leadId: string | null = null, dealId: string | null = null, custId: string | null = null
        try {
          const { createLeadAndDeal } = await import('@/lib/leads/golden-path')
          const gp = await createLeadAndDeal({
            businessId: business.business_id,
            businessPhoneNumber: to,
            name: '🧪 Testsamtal (du)',
            phone: from,
            message: 'Ring-testet från onboardingen — det här leadet är du.',
            source: 'vapi_call',
          }, supabase)
          leadId = gp.leadId; dealId = gp.dealId; custId = gp.customerId
        } catch (gpErr) {
          console.error('[Voice] test-lead misslyckades (fortsätter — SMS:et är aha:t):', gpErr)
        }

        // 2. Catch-SMS OMEDELBART — landar medan de håller telefonen
        const { sendSmsViaElks } = await import('@/lib/sms-send')
        const smsResult = await sendSmsViaElks({
          supabase,
          businessId: business.business_id,
          businessName: business.business_name || null,
          to: from,
          message: `Hej! Det här är Lisa på ${business.business_name || 'ditt företag'}. Precis så här snabbt svarar jag dina kunder när du inte hinner 🚀`,
          customerId: custId,
          relatedId: leadId,
          messageType: 'onboarding_test',
        })

        // 3. Skriv stegen + AVARMERA (nästa samtal behandlas normalt)
        await writeTestCall(supabase, business.business_id, {
          armed_until: null,
          called_at: new Date().toISOString(),
          sms_sent: smsResult.success === true,
          sms_error: smsResult.success ? null : (smsResult.error || 'okänt fel'),
          lead_id: leadId, customer_id: custId, deal_id: dealId,
        })

        // 4. Lisas hälsning + handled=1 (ingen dubbel call_missed)
        return NextResponse.json({
          play: `${APP_URL}/api/voice/greeting?business_id=${business.business_id}`,
          whenhangup: `${APP_URL}/api/voice/missed?business_id=${business.business_id}&from=${encodeURIComponent(from)}&callid=${callId}&handled=1`,
        })
      }
    } catch (testErr) {
      console.error('[Voice] ring-test-gren fel (non-blocking, normal routing fortsätter):', testErr)
    }
```

**Verifiera:** `sendSmsViaElks`s result-fält heter `success` + `error` (lib/sms-send.ts `SendSmsResult`) — om annat, matcha verkligheten. `messageType: 'onboarding_test'` — kontrollera att sms_log inte har CHECK på message_type (grep sql/sms_tables.sql); om CHECK finns, använd ett giltigt värde och rapportera.

- [ ] **Step 3: Regress-kontroll + commit**

```bash
npx tsc --noEmit 2>&1 | grep -v "^\.next/" | head -3
npx playwright test tests/test-call.spec.ts tests/earned-autonomy.spec.ts --no-deps 2>&1 | tail -2   # allt grönt
git add app/api/voice/incoming/route.ts
git commit -m "feat(voice): armerad ring-test-gren — omedelbart catch-SMS + märkt lead + hälsning"
```

---

### Task 5: Test-fasen i Step4PhoneNumber

**Files:**
- Modify: `app/onboarding/components/Step4PhoneNumber.tsx`

- [ ] **Step 1: Läs HELA komponenten** (fas-maskinen `setPhase`, render-strukturen, `ob-`-CSS-klasserna, var Fortsätt-knappen/onNext ligger). Följ dess exakta stil-mönster.

- [ ] **Step 2: Bygg test-sektionen.** Kontrakt (anpassa till komponentens struktur, bevara allt befintligt):

1. När numret är satt OCH är riktigt (`number !== '+46 76 000 00 00'` — bryt ut till konstant `PLACEHOLDER_NUMBER` delad med fallback-koden): rendera "Testa Lisa nu"-kortet under nummervisningen; vid platshållare: rendera INTE kortet (env-lös dev).
2. Vid kortets mount: `POST /api/onboarding/test-call/arm`. `available:false` → dölj kortet tyst. `available:true` → visa checklista + starta poll.
3. Poll `GET /api/onboarding/test-call/status` varannan sekund medan `armed` (avbryt på unmount — `active`-flagga, samma mönster som `EarnedAutonomyPanel`).
4. Checklista (tänds i ordning): `called_at` → "📞 Samtal upptäckt", `sms_sent` → "💬 SMS skickat — kolla din telefon", `lead_id` → "✅ Lead fångat". `sms_error` → ärlig rad: "Samtalet fångades, men SMS:et kunde inte skickas just nu."
5. Success (alla tre): "Det där var Lisa. Precis så snabbt möter hon dina kunder. Nu aktiverar vi henne på riktigt." + knappen **"Ta bort testet"** (DELETE `/api/onboarding/test-call/lead`, disabled under anrop, bekräfta med `confirm('Ta bort test-leadet?')`) + befintliga Fortsätt/onNext.
6. 90 s utan `called_at` (armad): tips-rad "Ringde du med dolt nummer? Prova igen." + "Prova igen"-knapp (re-arm = ny POST arm).
7. **"Testa senare"**-länk alltid synlig i kortet → stänger kortet (onboardingen blockeras aldrig; Fortsätt-knappen är oberoende av testet).
8. All copy svensk, inga tekniska termer. Ingen ny CSS-fil — återanvänd komponentens `ob-`-klasser/inline-mönster.

- [ ] **Step 3: Verifiera + commit**

```bash
npx tsc --noEmit 2>&1 | grep -v "^\.next/" | head -3
npx next build 2>&1 | tail -3   # ren (känd benign fortnox-sync)
git add app/onboarding/components/Step4PhoneNumber.tsx
git commit -m "feat(onboarding): Testa Lisa nu — live-checklista i steg 3 före betalningen"
```

---

### Task 6: Slutverifiering + deploy

- [ ] **Step 1:** `npx playwright test tests/test-call.spec.ts tests/earned-autonomy.spec.ts tests/skv-rot-rut.spec.ts --no-deps 2>&1 | tail -2` (allt grönt) + `npx tsc --noEmit` (tomt) + `npx next build` (ren).
- [ ] **Step 2:** `git push origin HEAD:main` (auto-deploy).
- [ ] **Step 3 — MANUELLT (Andreas, riktig enhet, obligatoriskt):** ny test-onboarding → steg 3 reserverar RIKTIGT nummer → kortet armeras → ring numret → hör Lisas hälsning → SMS på egna telefonen inom sekunder → checklistan tänds i ordning → leadet märkt 🧪 i dashboarden → "Ta bort testet" raderar → ring numret IGEN (oarmerat) → normalt beteende. Upprepa ett kvällstest (efter 21) — ska fungera identiskt.

## Kända risker
1. **46elks-köp kostar pengar per nummer** — reserve i steg 3 köper tidigare i tratten än idag (övergivna onboardingar = köpta oanvända nummer). Accepterat för aha-värdet; städrutin för övergivna nummer = ev. senare.
2. Platshållar-vägen (env-lös dev) visar aldrig testkortet — avsiktligt.
3. `messageType`/env-namn verifieras mot verklig kod i Task 1/4 (instruerat).
