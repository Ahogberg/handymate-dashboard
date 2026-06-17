# Fable 5-fynd — Verifiering (2026-06-10)

**Uppdrag:** verifiera premisserna bakom B1, B2, B3 + attribution-läckan innan något byggs. Ingen kod ändrad.
**Verifierare:** Opus 4.8, läst källkod rad för rad denna session.

## ⚠️ Viktig begränsning upp front (ärlighet före säkerhet)

**SQL-delen mot Bee (biz_21wswuhrbhy) kunde INTE köras.** Service-role-nyckeln finns inte i någon lokal env-fil:
- `.env.local` (114 bytes, 2 rader) → bara `FIRECRAWL_API_KEY` + `GOOGLE_MAPS_API_KEY`
- `.env.test` → `BASE_URL`, `TEST_USER_EMAIL`, `TEST_BUSINESS_ID`, och `# SUPABASE_URL` / `# SUPABASE_SERVICE_ROLE_KEY` **bortkommenterade**
- Ingen `psql`, ingen `supabase` CLI i PATH, `SUPABASE_SERVICE_ROLE_KEY` ej satt i shell-env
- Länkat projekt = `pktaqedooyzgvzwipslu` ("Handymate") — prod, men jag saknar nyckel att nå det

**Konsekvens:** allt som handlar om *kod* (finns buggen? är den reachable i kodvägar?) är verifierat. Allt som handlar om *prevalens för Bee just nu* (har den triggat? hur många rader?) är **inte** verifierat — de frågorna avgör AKUT-vs-LATENT och kräver att SQL:en längst ned körs i Supabase SQL Editor.

---

## B1 — Auto-approve-spegeln i tool-router

### VERDICT: **BEKRÄFTAT I KOD (mekanism + reachability). AKUT-vs-LATENT för Bee = OAVGJORT utan SQL.**

**Bevis jag själv läst:**

| Premiss (Fable) | Verifierat | Rad |
|---|---|---|
| Auto-approve-väg exekverar vid low/medium utan människa | ✅ JA | `tool-router.ts:1037-1064` (low), `:1067-1094` (medium) — båda kallar `executeApprovalPayloadInternal` + skriver `status='auto_approved'` |
| Använder fetch utan auth-header mot egna routes | ✅ JA | `:1147` `/api/sms/send`, `:1156` `/api/quotes/${id}/send`, `:1165` `/api/invoices/${id}/send`, `:1173` `/api/bookings` — **inga auth-headers** |
| `/api/quotes/${id}/send` + `/api/invoices/${id}/send` finns ej (404) | ✅ BEKRÄFTAT | Glob: bara `app/api/quotes/send/route.ts` och `app/api/invoices/send/route.ts` existerar. `[id]/send` finns INTE (det finns `invoices/[id]/send-via-fortnox`, men inte `[id]/send`). Den dynamiska URL:en 404:ar. |
| `status='auto_approved'` skrivs oavsett execution-utfall | ✅ JA | `:1043-1054` / `:1073-1084` — insert sker efter exec, `execResult` inspekteras aldrig, ingen gate |

**Reachability — starkare än Fable angav:**
- **Alla agenter** har `create_approval_request` i verktygslådan (`personalities.ts:70, 91, 113, 134, 156` — Karin/Daniel/Lars/Hanna/Lisa; Matte = `'all'`). Inte bara Matte.
- Tool-definitionen **instruerar modellen** att välja auto-exekverande nivåer: *"'medium' = utförs direkt och loggas (boka tid, skicka SMS-påminnelse)"* (`tool-definitions.ts:284`). Säljs aktivt till modellen för SMS-påminnelser.
- System-prompten säger till agenten att offert/faktura/bokning är **"auto"** när `require_approval_*=false` (`system-prompt.ts:262-264`). Då är 404-vägarna (quote/invoice send) reachable, inte bara SMS-vägen.
- **Default är dock `high`** om modellen inte sätter risk_level (`tool-router.ts:1027` `|| 'high'`) → kräver att modellen aktivt väljer låg/medium.

**Vad som INTE går via denna väg (viktig nyansering):** de schemalagda observations-cronen (Karin/Daniel 06:00 osv) går via `agent-observations/[agent]` → `save-and-push` → `status='pending'`. De rör **aldrig** spegeln. Spegeln nås bara via `/api/agent/trigger`-tool-loopen: `phone_call`, `incoming_sms`, `manual`, samt event-triggers. För Bee: `incoming_sms=0` (triggers-map), Matte-UI saknas (audit-2-R1), men **phone_call via Vapi är trolig** → om ett samtal får Lisa/Matte att auto-skapa en SMS/boknings-action ⇒ spegeln smäller, tyst.

**Det enda som avgör AKUT-vs-LATENT:** har spegeln redan kört för Bee? → kör **SQL 1** nedan. `auto_approved`-rader = 0 → LATENT (finns i kod, har inte triggat). >0 → **AKUT** och raderna visar exakt vilka typer + om execution failade.

---

## B2 — Mobil tappar auth för icke-SMS-actions

### VERDICT: **BEKRÄFTAT I KOD, end-to-end. Mekanism deterministisk. Faktisk träff för Bee = beror på approval-typmix + mobilanvändning (SQL kan kvantifiera, ej kört).**

**Bevis jag själv läst:**

| Premiss | Verifierat | Rad |
|---|---|---|
| Mobilen skickar Bearer-token + INGEN cookie | ✅ JA | `handymate-mobile/lib/api.ts:7-13` — `Authorization: Bearer ${session.access_token}`, inget cookie-fält |
| `forwardHeaders()` forwardar BARA cookie | ✅ JA | `approvals/[id]/route.ts:218-222` — `if (cookieHeader) h['Cookie']=...`; authorization-headern forwardas inte. Cookien hämtas på `:146` (`request.headers.get('cookie')` → null för mobil) |
| `respondToApproval` läser bara `res.ok`, inte `execution` | ✅ JA | `mobile/lib/api.ts:214-222` — `if (!res.ok) throw ...`; svarets body/`execution` läses aldrig |
| getAuthenticatedBusiness accepterar Bearer (därför lyckas själva approven) | ✅ JA | `lib/auth.ts:58-60` — prioriterar `Authorization: Bearer`, cookie är fallback |

**Kedjan är därmed bekräftad:** mobil approve av `send_quote` → `getAuthenticatedBusiness` OK (Bearer) → status→`approved` → `forwardHeaders()` får `cookie=null` → intern fetch utan auth → 401 → `classifyResponse` returnerar korrekt `{ok:false, "Auth-fel"}` → men mobilen läser bara HTTP-status (200) → **visar grönt**.

**Påverkade approval_types** (de som går via intern fetch i `executeApprovalPayload`, alltså INTE sendSmsViaElks-vägen):
`send_quote`, `send_invoice`, `create_booking`, `create_quote_draft` / `quote_request` / `quote_addition`, `create_ata_draft`, `review_auto_invoice`, samt `booking_suggestion` inom `autopilot_package`.
**Opåverkade:** alla rena SMS-typer (Karin/Daniel/Lisa-nudges, proactive_care, warranty_followup, customer_reactivation, propose_*, send_matte_customer_reply) — de kör `sendSmsViaElks` direkt och behöver ingen forwarding.

**Allvar:** mobilen är pilotens primära yta (hantverkaren på bygget). Mekanismen är deterministisk — den smäller varje gång en påverkad typ godkänns från mobil. Hur ofta det skett för Bee = **SQL 3** (godkända icke-SMS-typer), men buggen kräver ingen tur för att inträffa.

---

## B3 — Ingen atomisk guard mot dubbelklick

### VERDICT: **BEKRÄFTAT I KOD. Checkin-varianten är VÄRRE än Fable beskrev.**

**`approvals/[id]/route.ts:36-72`:** ✅ Bekräftat. Läser approval (`:36-41`), kollar `status !== 'pending'` → 409 (`:47-49`), men UPDATE:n (`:67-71`) har **ingen** `.eq('status','pending')`. Status-checken på `:47` är en ren läs-check (TOCTOU) — två requests läser båda `pending`, båda passerar, båda exekverar.

**`checkin/approve/route.ts:70-98`:** ✅ Bekräftat — och **värre**:
- UPDATE av `time_checkins` (`:70-78`) saknar status-guard
- Det finns **ingen pre-check alls** av `checkin.status` innan `time_entry` INSERT:as (`:85-98`). Routen hämtar checkin, uppdaterar, och insertar ovillkorligt.
- Det betyder att det inte ens krävs en *samtidig* dubbelklick — vilken **om-körning som helst** (retry, långsamt nät, dubbel-submit efter sekunder) skapar en andra `time_entry` med nytt `te_`-id. Fönstret är hela requesten, inte en smal race.

**Konsekvens:** dubbel `time_entry` = dubbel fakturerad tid för hantverkaren. Detta är verkligt oavsett pilotvolym — det är inte volymberoende som de andra.

**Reachability:** AKUT i mening att mekanismen är trivialt triggbar (vem som helst som dubbelklickar Godkänn/Attestera). Att det *händer* i prod beror på UI-debounce — men koden förlitar sig på klienten, vilket är just det som inte håller.

---

## ATTRIBUTION-LÄCKAN (Del 1-B) — den tidskritiska

### VERDICT: **BEKRÄFTAT I KOD (3/3 stickprov läcker). Magnitud för Bee = OKÄND utan SQL — kör SQL 2.**

**Stickprov jag själv läst:**

| Insert-ställe | approval_type | Har agent_id/routed_agent? | Borde vara |
|---|---|---|---|
| `lib/customer-ltv.ts:117-133` | customer_reactivation | ❌ NEJ (payload: customer_id, customer_name, customer_phone, lifetime_value, job_count, months_inactive) | Hanna |
| `lib/autopilot/quote-nudge.ts:75-91` | quote_nudge | ❌ NEJ (payload: quote_id, to, message, customer_name, view_count) | Daniel |
| `lib/matte/action-executor.ts:130-151` | (action.type, dynamisk) | ❌ NEJ (payload: ...action.params, customer_reply_pending, available_slots, entity) | Matte/routed |

Alla tre skapar agent-arbete och saknar attribution → `extractAgentId` returnerar null → exkluderas ur `approve_rate`. Mönstret Fable kartlade håller på stickprovet.

**Varför tidskritiskt (oförändrad bedömning):** payloaden fryses vid insert. Approve_rate-lärandet (roadmapens moat) får aldrig se dessa rader, och de går inte att backfilla med agent-känsla i efterhand annat än via grov `approval_type→agent`-mappning. Varje pilotdag = förlorad signal. **Men** hur stor läckan är *för Bee just nu* (få rader = mindre brådska, många = akut) kräver SQL 2.

En nyans Fable inte betonade: en `approval_type→agent`-backfill ÄR möjlig i efterhand för de flesta typer (mappningen är deterministisk per typ), så datan är inte *helt* förlorad — men korrekt attribution-vid-insert är ändå billigare och robustare än en backfill-heuristik.

---

## Sammanfattande verdict-tabell

| Fynd | Kod-mekanism | Reachable i kodväg | Triggat/prevalens för Bee | Nettobedömning |
|---|---|---|---|---|
| **B1** auto-approve-spegel | ✅ BEKRÄFTAT | ✅ alla agenter, phone_call-väg trolig | ❓ kräver SQL 1 | **CONFIRMED, LATENT-eller-AKUT** — SQL avgör |
| **B2** mobil tappar auth | ✅ BEKRÄFTAT e2e | ✅ deterministisk per icke-SMS-approve | ❓ kräver SQL 3 | **CONFIRMED, AKUT vid mobilanvändning** |
| **B3** ingen atomisk guard | ✅ BEKRÄFTAT (checkin värre) | ✅ trivialt triggbar | n/a (volymoberoende) | **CONFIRMED** |
| **Attribution** | ✅ 3/3 läcker | ✅ | ❓ kräver SQL 2 | **CONFIRMED, magnitud okänd** |

Inga fynd visade sig FELAKTIGA. Inget kunde avfärdas som ren kod-villfarelse.

---

## SQL för Andreas — kör i Supabase SQL Editor (projekt: Handymate/pktaqedooyzgvzwipslu)

```sql
-- SQL 1 (B1): har auto-approve-spegeln triggat för Bee?
-- 0 rader = LATENT. >0 = AKUT, och kolumnerna visar vilka typer + ev. exec-fel.
SELECT approval_type, risk_level, COUNT(*) AS n,
       MIN(created_at) AS first_seen, MAX(created_at) AS last_seen
FROM pending_approvals
WHERE business_id = 'biz_21wswuhrbhy' AND status = 'auto_approved'
GROUP BY approval_type, risk_level
ORDER BY n DESC;

-- SQL 1b: kontext — alla statusvärden för Bee
SELECT status, COUNT(*) FROM pending_approvals
WHERE business_id = 'biz_21wswuhrbhy' GROUP BY status;

-- SQL 2 (attribution): hur stor är läckan för Bee?
SELECT approval_type,
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE payload->>'agent_id' IS NOT NULL
                          OR payload->>'routed_agent' IS NOT NULL) AS attributed,
       COUNT(*) FILTER (WHERE payload->>'agent_id' IS NULL
                          AND payload->>'routed_agent' IS NULL) AS unattributed
FROM pending_approvals
WHERE business_id = 'biz_21wswuhrbhy'
GROUP BY approval_type
ORDER BY unattributed DESC;

-- SQL 3 (B2): icke-SMS-typer som godkänts (kandidat för silent mobil-401).
-- Korsa med om de godkänts via mobil om ni loggar källa; annars visar den
-- exponeringsytan.
SELECT approval_type, status, COUNT(*)
FROM pending_approvals
WHERE business_id = 'biz_21wswuhrbhy'
  AND approval_type IN ('send_quote','send_invoice','create_booking',
        'create_quote_draft','quote_request','quote_addition',
        'create_ata_draft','review_auto_invoice')
GROUP BY approval_type, status
ORDER BY approval_type;
```

**Tolkning:**
- SQL 1 tom → B1 nedprioriteras till LATENT (fixas ändå men inte brandkår). SQL 1 har rader → B1 är AKUT idag.
- SQL 2 ger exakt `unattributed`-summan → hur många pilotdagar av lärande som redan läcker.
- SQL 3 visar om icke-SMS-typer ens förekommer för Bee (om 0 → B2 är latent för Bee även om mekanismen är säker).

*Ingen fix gjord. Andreas beslutar paket efter SQL-utfall. Verifierings-script (scripts/verify-bee.mjs) skapades och raderades — det kunde inte köras utan service-role-nyckeln.*
