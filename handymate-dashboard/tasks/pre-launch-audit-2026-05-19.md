# Pre-Launch Audit — 2026-05-19

Bred system-audit inför launch 2026-05-25. 5 Explore-agenter granskade
parallellt: auth/konvertering, integrationer, agent-pipeline, UX-paths,
data-integritet.

**Total identifierat:** 12 HIGH-risk, 13 MEDIUM-risk, ~10 LOW-risk.
**Estimerad total fix-tid HIGH:** 6-7 timmar (1 hel dag).

═══════════════════════════════════════════════════════════════════
## 🚨 TIER 1: BLOCKERAR LAUNCH (måste fixas, ~30 min)
═══════════════════════════════════════════════════════════════════

Dessa tre kan skada kunder eller exponera data direkt. Verifiera + fixa
INNAN något annat.

### B1. pending_approvals RLS-läcka (cross-business data-läckage)

**Fil:** [sql/v2_pending_approvals.sql:30](sql/v2_pending_approvals.sql#L30) + [sql/v15_autopilot.sql:26](sql/v15_autopilot.sql#L26)
**Status:** HYPOTES — verifiera först:

```sql
SELECT * FROM pg_policies WHERE tablename = 'pending_approvals';
```

Om policy är `FOR ALL USING (true) WITH CHECK (true)` — **ANY autentiserad user kan läsa/skriva approvals för ANY business**. Kund A kan se Kund B:s pending_approvals + ändra status.

**Fix:** Sätt policy till samma pattern som `business_knowledge`:
```sql
DROP POLICY IF EXISTS "..." ON pending_approvals;
CREATE POLICY "users see own business" ON pending_approvals
  FOR ALL USING (
    business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
    OR business_id IN (SELECT business_id FROM business_users WHERE user_id = auth.uid() AND is_active = true)
  );
CREATE POLICY "service_role bypass" ON pending_approvals
  FOR ALL USING (auth.role() = 'service_role');
```
**Tid:** 5 min. **Brand-risk:** ALLVARLIG.

### B2. Step5Activate payment bypass (kund landar på dashboard utan trial)

**Fil:** [app/onboarding/components/Step5Activate.tsx:106-114](app/onboarding/components/Step5Activate.tsx#L106)
**Status:** BEKRÄFTAD

Om `/api/billing/confirm` returnerar 500/timeout men `res.ok` är true för ett split-second → `onNext()` triggas utan att `subscription_status` sätts i DB. Kunden hamnar på dashboard utan aktiv trial → omedelbar redirect till `/dashboard/settings/billing?trial=expired` → konfusion + churn-risk.

**Fix:** Vänta på faktisk DB-state-bekräftelse innan `onNext()`. Verifiera att `business.subscription_status === 'trialing'` innan vidare.

**Tid:** 15 min. **Revenue-risk:** kunder kommer aldrig till Step 6 men betalningen har gått igenom hos Stripe → ekonomisk dispyt.

### B3. Approval-flow cross-business action-leak

**Fil:** [app/api/approvals/[id]/route.ts:34-43, 135](app/api/approvals/[id]/route.ts#L34) + executeApprovalPayload-anropet
**Status:** HYPOTES — verifiera

`executeApprovalPayload(payload, businessId)` tar `businessId` som parameter. Om payload-strukturen tillåter cross-business call (via maliciös request eller om approval.business_id inte verifieras mot session-business före rad 135) → SMS/email/agent-action utförs i FEL businesses namn.

**Fix:** Explicit guard innan executeApprovalPayload:
```typescript
if (approval.business_id !== business.business_id) {
  return NextResponse.json({ error: 'Approval business mismatch' }, { status: 403 })
}
```

**Tid:** 5 min. **Brand/legal-risk:** kund A:s SMS skickas från kund B:s konto.

### B4. SQL-migration deploy-status okänd

**Filer:** `sql/v3_superadmin.sql`, `sql/v46_fortnox_extensions.sql`, `sql/v2_business_knowledge_dedup.sql`
**Status:** OKÄNT — verifiera

Vi har 3+ SQL-filer i `sql/` men ingen klar dokumentation om vilka som körts i prod. Kod förväntar dessa tabeller (`impersonation_tokens`, `fortnox_api_log`, `admin_impersonation_log`, `business_knowledge.dedup_key`).

**Verifiera i Supabase SQL Editor:**
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('impersonation_tokens', 'fortnox_api_log', 'admin_impersonation_log');

SELECT column_name FROM information_schema.columns
WHERE table_name = 'business_knowledge' AND column_name = 'dedup_key';
```

Om 0 rader för någon → kör motsvarande SQL-fil omedelbart.

**Tid:** 3 min verifiering + 5 min ev. körning.

═══════════════════════════════════════════════════════════════════
## 🔴 TIER 2: HIGH-RISK (fixa innan söndag-cron, ~3-4h)
═══════════════════════════════════════════════════════════════════

### H1. Vercel-cron-blockering (om Hobby-plan)

**Fil:** [vercel.json](vercel.json) rad 9-11, 78-91
**Status:** HYPOTES — kolla Vercel-plannivå

CLAUDE.md säger "Hobby-planen tillåter max en körning per dag". Vercel.json har:
- `gmail-poll`: `*/15 * * * *`
- `send-campaigns`: `*/15 * * * *`
- `gmail-lead-import`: `*/15 * * * *`
- `fortnox-sync`: `0 */2 * * *`
- `sync-calendars`: `0 */6 * * *`

Om Hobby → samtliga blockerar deploy tyst. Om Pro → OK.

**Verifiera:** Vercel Dashboard → Plan. Om Hobby, fixa cron-uttrycken.

**Tid:** 2 min verifiering, 5 min fix om behövs.

### H2. Onboarding step-index 6 vs 10 mismatch

**Filer:** [app/onboarding/page.tsx:13](app/onboarding/page.tsx#L13) (`TOTAL_STEPS = 6`) vs [app/api/onboarding/route.ts:75-76](app/api/onboarding/route.ts#L75) (validerar `step <= 10`) vs CLAUDE.md (10 steg)
**Status:** BEKRÄFTAD

Gamla kunder med `onboarding_step >= 8` får UI-step = 5 (efter `Math.min(dbStep, TOTAL_STEPS-1)`) → landar på Step6LiveTour utan att passera Stripe → trial aktiveras aldrig.

**Fix:** Standardisera schema. Antingen `TOTAL_STEPS = 10` i page.tsx ELLER migration som sätter alla gamla kunder med step >= 8 till `onboarding_completed_at = NOW()`.

**Tid:** 1-2h.

### H3. Fortnox sync silent disconnect (token revoked → 24h synk-brist)

**Filer:** [app/api/cron/fortnox-sync/route.ts:45-58](app/api/cron/fortnox-sync/route.ts#L45) + [lib/fortnox.ts:210-237](lib/fortnox.ts#L210)
**Status:** BEKRÄFTAD

Om Fortnox-token revokeras (kund tar bort app från Fortnox-sidan):
1. `refreshTokenIfNeeded()` returnerar null
2. Logged i `fortnox_api_log` men `fortnox_connected` förblir true i `business_config`
3. UI visar "Kopplad", men nästa 2h-cron failar → fakturor blir aldrig "paid" → kunden tror systemet är trasigt

**Fix:** I `refreshTokenIfNeeded()` när refresh fail → anropa `clearFortnoxConnection(businessId)`. I cron, om N consecutive failures → notifiera business via push/email.

**Tid:** 45 min (båda).

### H4. Dedup inom samma körning saknas

**Fil:** [lib/agents/shared/save-and-push.ts:59-85](lib/agents/shared/save-and-push.ts#L59)
**Status:** BEKRÄFTAD

Dedup-skyddet i `findRecentDuplicate()` är bara cross-run (mellan körningar). Om Claude i SAMMA körning returnerar 2 observationer som normaliserar till samma dedup_key → båda sparas → 2 push-notiser i samma sekund.

**Fix:**
```typescript
const seenKeys = new Set<string>()
for (const obs of observations) {
  const key = computeDedupKey(agentId, obs)
  if (seenKeys.has(key)) continue
  seenKeys.add(key)
  // ... existing dedup-check + INSERT
}
```

**Tid:** 15 min.

### H5. Dashboard silent failures (Christoffer ser tomt utan felmeddelande)

**Filer:** [app/dashboard/page.tsx:359-406](app/dashboard/page.tsx#L359) (6 .catch-handlers utan UI-feedback) + [components/TeamActivityStrip.tsx:91](components/TeamActivityStrip.tsx#L91)
**Status:** BEKRÄFTAD

Om någon `/api/dashboard/*`-anrop failar:
- `.catch(() => setXxxLoaded(true))` sätter loading=false
- Inget error-state — användaren ser "Inget på ditt bord just nu" istället för "Fel: kontakta support"
- Christoffer tror systemet inte fungerar → ringer Andreas

**Fix:** Per sektion: `const [xxxError, setXxxError] = useState(false)` + render error-message när satt.

**Tid:** 30 min.

### H6. Null-safety crashes i dashboard

**Filer:** [app/dashboard/page.tsx:1205, 699](app/dashboard/page.tsx#L1205) — `(activity.customer as any).name` och `(booking.customer as any)?.name`
**Status:** BEKRÄFTAD

`as any`-casts kringgår TS-säkerhet. Om `customer` är null/undefined → krasch under render → React Error Boundary → kund ser blank skärm.

**Fix:** Optional-chaining + fallback: `activity.customer?.name ?? 'Okänd kund'`.

**Tid:** 25 min.

### H7. invoice-fältnamns-mismatch (silent NULL i economic queries)

**Filer:** [app/api/analytics/economics/route.ts](app/api/analytics/economics/route.ts) m.fl. — `.select('total_amount:total')`-alias
**Status:** BEKRÄFTAD (vi fixade några igår men mer kan finnas)

Schema: `invoice.total` (kolumn) men frontend förväntar `total_amount`. Vi har alias-fixar på 4 ställen, men:
```bash
grep -rn ".total_amount" --include="*.ts" --include="*.tsx" | grep -v "/node_modules/"
```
Sök efter fler ställen där queries inte har alias.

**Fix:** Standardisera på `total` i koden eller säkerställ alias överallt.

**Tid:** 30 min audit + 10 min fixes.

### H8. API error responses på engelska

**Filer:** Flera `/api/*` routes returnerar `{ error: 'Unauthorized' }` etc. på engelska. CLAUDE.md säger all UI-text på svenska.
**Status:** BEKRÄFTAD

Om UI visar raw API-error → kund ser engelskt "Unauthorized" istället för "Behörighet saknas".

**Fix:** Per route, byt error-messages till svenska ELLER (bättre) översätt på client-side så API kan returnera kod (`UNAUTHORIZED`) som UI mappar.

**Tid:** 30 min.

═══════════════════════════════════════════════════════════════════
## 🟡 TIER 3: MEDIUM-RISK (fixa under pilot-vecka 1-2, ~3-4h)
═══════════════════════════════════════════════════════════════════

### M1. Trial timer race condition

**Fil:** [app/api/billing/confirm/route.ts:31](app/api/billing/confirm/route.ts#L31) — `trial_ends_at = now + 30 days` (set vid confirm)

Om setupIntent + confirm tar 30+ sek och tab stängs mitt i → trial kan starta utan kund-medvetenhet. Edge case men möjligt.

**Tid:** 1h.

### M2. Password reset link expiry mismatch

**Fil:** [lib/auth/password-reset-email.ts:149](lib/auth/password-reset-email.ts#L149) — email säger "60 minuter" men Supabase-tokens är giltiga 24h.

**Fix:** Ändra mail till "24 timmar" eller dokumentera annorlunda.

**Tid:** 5 min.

### M3. Google Calendar token-refresh failures inte synliga

**Fil:** [app/api/cron/sync-calendars/route.ts:52-61](app/api/cron/sync-calendars/route.ts#L52)

Om token-refresh failar → `sync_error` loggas men inget skickas till kund. Som M3 ovan: silent disconnect.

**Tid:** 30 min.

### M4. 46elks webhook agent-fel sväljs

**Filer:** [app/api/sms/incoming/route.ts:112-115](app/api/sms/incoming/route.ts#L112) + [app/api/voice/incoming/route.ts:249-252](app/api/voice/incoming/route.ts#L249)

Agent-routing-fel loggas men webhook returnerar "OK". → 46elks tror allt funkar, men inget svar genereras → kund får inget SMS-svar på 30+ sek.

**Tid:** 15 min.

### M5. Cron error-rate threshold saknas

**Fil:** [app/api/cron/agent-observations/[agent]/route.ts:69-86](app/api/cron/agent-observations/[agent]/route.ts#L69)

Om Anthropic-API är nere → alla businesses failar → cron returnerar 200 OK med error-array. Ingen alert.

**Fix:** Om errorRate > 50% → return 500 så Vercel cron-monitor flaggar.

**Tid:** 10 min.

### M6. Step4 phone-OTP saknas

**Fil:** [app/onboarding/components/Step4PhoneNumber.tsx](app/onboarding/components/Step4PhoneNumber.tsx)

Fel telefonnummer reserverar 46elks-nummer + SMS till random person.

**Tid:** 4h (post-launch om tid kort).

### M7-M13: Övriga (förkortat)

- M7. Gmail token refresh silent failures — 15 min
- M8. Google Calendar watch expiration silent — 20 min
- M9. Fortnox API logging silent if INSERT failar — 30 min
- M10. SMS night-block DST-edge-case — 5 min
- M11. PWA-manifest icon paths osäkra (192/512) — 10 min
- M12. Mobile hamburger close-button 40px (för liten för tumme) — 2 min
- M13. Dashboard empty-data vs error-data inte skiljbart — 15 min

═══════════════════════════════════════════════════════════════════
## ⚪ TIER 4: LOW-RISK (post-launch)
═══════════════════════════════════════════════════════════════════

- Service worker offline fallback incomplete
- Dark-theme `bg-sidebar` verifiering
- Booking notes fallback "Tjänst" → "—"
- Soft-delete-policy odefinierad
- Backup/PITR-policy odokumenterad
- Lisa-agent saknar dedicated fil-struktur (om planerad)
- Activity list empty state text

═══════════════════════════════════════════════════════════════════
## 📋 REKOMMENDERAD FIX-ORDNING
═══════════════════════════════════════════════════════════════════

**Måndag 19/5 (idag) — Tier 1 + verifieringar (1h):**
1. B4. Verifiera SQL-migrationer i Supabase (3 min)
2. B1. Verifiera + fixa pending_approvals RLS (5 min)
3. B3. Approval-flow business-id-guard (5 min)
4. B2. Step5Activate payment bypass (15 min)
5. H1. Verifiera Vercel-plan + fixa cron-uttryck (5-10 min)
6. H4. Dedup inom samma körning (15 min)

→ Total ~50 min, alla blockerare borta.

**Tisdag-onsdag 20-21/5 — Tier 2 high-risk (3-4h):**
1. H3. Fortnox silent disconnect (45 min)
2. H5. Dashboard silent failures + error-UI (30 min)
3. H6. Null-safety casts (25 min)
4. H7. invoice-fältnamn audit + fix (40 min)
5. H8. Engelska error-messages → svenska (30 min)
6. H2. Onboarding step-schema (1-2h)

→ Total ~3.5-4h.

**Torsdag 22/5 — Buffer + manual testning (4h):**
- Köra en pilot-kund-resa end-to-end (register → onboard → Stripe → dashboard)
- Verifiera Fortnox-flowen är OK för Christoffer
- Mobile testing

**Fredag 23/5 — Pilot-data-analys + ev. hotfixes**
**Söndag 22/5 06:00 UTC — första pilot-cron**
**Söndag-onsdag — Tier 3 medium-risk vid behov**
**Måndag 25/5 — Launch**

═══════════════════════════════════════════════════════════════════
## ✅ VERIFIERAT OK (inga fixar behövs)
═══════════════════════════════════════════════════════════════════

- Stripe webhook signature validering (raw body korrekt)
- 46elks signature validering (HMAC-SHA256 med constant-time)
- `agent_runs` RLS-policy (service_role-only)
- `business_knowledge` RLS-policy (user + service_role)
- Auth via `getAuthenticatedBusiness()` (efter våra fixar 2026-05-18)
- Rate limiting i lib/auth.ts

═══════════════════════════════════════════════════════════════════

**Min rek:** Kör Tier 1 nu (1h) — sen pausa, ta lunch, sen Tier 2 i eftermiddag. Lämna Tier 3 till imorgon. Resten är post-launch.
