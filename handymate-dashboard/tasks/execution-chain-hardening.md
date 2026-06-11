# Execution-chain hardening — designdokument (B1 + B2 + auto-invoice-anomali)

**Status:** DESIGN ONLY. Ingen kod. Andreas godkänner design **och** Del 1 prod-verifieras innan bygge.
**Datum:** 2026-06-11
**Scope:** En sanning för approval-exekvering. Löser B1 (auto-approve-spegeln), B2 (mobil tappar auth), och den anomala `review_auto_invoice`-insert:en — alla samma silent-failure-klass: *status/handling rapporteras som lyckad oberoende av att den externa effekten skedde.*

---

## 1. Nuläge — de tre exekveringsvägarna kartlagda

Idag finns **tre** ställen som omsätter en approval-payload till en faktisk handling. De delar approval_type-vokabulär men INGEN kod.

### Väg A — Web-godkännande (kanonisk, mest härdad)
`app/api/approvals/[id]/route.ts`
- `POST` → `getAuthenticatedBusiness` (cookie eller Bearer) → status-flip (nu atomisk, Del 1) → `executeApprovalPayload(approval, businessId, overrides, cookieHeader)`
- `executeApprovalPayload` (rad ~204-1026): stor `switch(approval_type)` med ~30 cases.
  - **SMS-cases** (`send_sms`, `quote_nudge`, `proactive_care`, `warranty_followup`, `customer_reactivation`, Matte-reply m.fl.): `sendSmsViaElks(...)` **direkt** (Audit-3 Fix A). Returnerar `{sms_sent}`. ✅ ingen auth-forwarding behövs.
  - **Icke-SMS-cases** (`send_quote`, `send_invoice`, `create_booking`, `create_quote_draft`, `create_ata_draft`, `review_auto_invoice`, `autopilot_package→booking`): `fetch(${appUrl}/api/.../send)` med `forwardHeaders()` som forwardar **bara cookie** (Audit-4 Fix DEF). `classifyResponse()` klassar svaret → `{ok, reason: fail|four_eyes_required|permission_denied|rate_limited}`.
- **Auth-modell:** sidoanrop återanvänder den klickande användarens session → RBAC + four-eyes propageras (önskat, Fix DEF).

### Väg B — Auto-approve-spegeln (B1, trasig)
`app/api/agent/trigger/tool-router.ts:1021-1186`
- `createApprovalRequest(supabase, businessId, params)` — anropas av agent-verktyget `create_approval_request` (alla agenter har det; `tool-definitions.ts:284` instruerar modellen att välja `medium` för SMS-påminnelser → auto).
- `risk_level` `low`/`medium` → `executeApprovalPayloadInternal()` + skriver `status='auto_approved'` **oavsett utfall**; `high` → pending (korrekt).
- `executeApprovalPayloadInternal:1138-1186` är en **frusen spegel** av Väg A före Fix A/DEF:
  - `fetch('/api/sms/send')` **utan auth-header** → 401 tyst
  - `fetch('/api/quotes/${id}/send')` + `fetch('/api/invoices/${id}/send')` → **404** (routerna finns inte; bara `/api/quotes/send` och `/api/invoices/send` existerar)
  - `fetch('/api/bookings')` utan auth → 401
  - returnerar `{ok: res.ok}` som **aldrig inspekteras** innan `auto_approved` skrivs.
- **Auth-modell:** ingen. Körs server-side från cron/agent utan användarsession → det finns ingen cookie att forwarda. Detta är kärnproblemet (se §3).

### Väg C — Mobil-godkännande (B2)
- Mobilen anropar **samma route som web** (`POST /api/approvals/[id]`), men `handymate-mobile/lib/api.ts:7-13` skickar `Authorization: Bearer <token>` och **ingen cookie**.
- `getAuthenticatedBusiness` accepterar Bearer (`lib/auth.ts:58-60`) → själva approven lyckas, status flippas.
- MEN `forwardHeaders()` (`route.ts:218-222`) forwardar **bara cookie** → för mobil-requests blir cookie `null` → icke-SMS-sidoanropen går utan auth → **401** → `classifyResponse` returnerar korrekt `{ok:false}`.
- `respondToApproval` (`mobile/lib/api.ts:214-222`) läser **bara `res.ok`** (HTTP 200), aldrig `execution`-objektet → visar grönt trots silent fail.
- **Påverkade typer:** alla icke-SMS-cases ovan. SMS-typer opåverkade (de går via `sendSmsViaElks`, ingen forwarding).

---

## 2. Utredning: `auto-invoice-on-complete.ts:303` — VERDICT (a) SILENT FAILURE

**Schema (sql/v2_pending_approvals.sql):** kolumnerna är `id, business_id, agent_run_id, approval_type (NOT NULL), title, description, payload (JSONB NOT NULL DEFAULT '{}'), status, risk_level, created_at, expires_at, resolved_at, resolved_by`. **Inga** `type`- eller `context`-kolumner finns (grep över hela sql/ bekräftar — `type`/`context` finns bara på andra tabeller).

**Den anomala insert:en:**
```
await supabase.from('pending_approvals').insert({
  business_id, type: 'review_auto_invoice', title, description,
  risk_level: 'medium', status: 'pending', context: {...}
})  // inom try/catch { /* Non-blocking */ }
```

**Vad som faktiskt händer:**
1. `type` och `context` är okända kolumner → PostgREST returnerar fel (PGRST204 "could not find column" eller 42703).
2. Även om kolumnerna ignorerades: `approval_type` är NOT NULL utan default och sätts aldrig → 23502 NOT NULL-brott.
3. Supabase `.insert()` **kastar inte** — felet hamnar i den olästa `.error`. `await` resolvar utan throw, så `catch`-blocket triggar inte ens. **Dubbelt tyst** (oläst error + onödig catch).

**Konsekvens:** `review_auto_invoice`-approvalen skapas **aldrig** från denna väg. Fakturan har redan INSERT:ats i `invoice`-tabellen (status draft) tidigare i funktionen — men hantverkaren får ingen approval-kort/notis att granska och skicka den. Resultat: **slutförda projekt → osynliga faktura-drafts → obetalt arbete** tills hantverkaren råkar bläddra i fakturalistan.

**Kvantifiering (kräver prod-SQL — kunde ej köras lokalt, service-role saknas):**
```sql
-- Drafts skapade av auto-invoice-vägen som aldrig fått en approval/skickats
SELECT COUNT(*) FROM invoice
WHERE business_id = 'biz_21wswuhrbhy'
  AND status = 'draft'
  AND invoice_id NOT IN (
    SELECT payload->>'invoice_id' FROM pending_approvals
    WHERE approval_type = 'review_auto_invoice' AND payload->>'invoice_id' IS NOT NULL
  );
-- + sanity: har approval_type='review_auto_invoice' NÅGONSIN skapats? (förväntan: 0 från denna väg)
SELECT COUNT(*) FROM pending_approvals WHERE approval_type = 'review_auto_invoice';
```

**Fix (ingår i detta paket):** byt `type→approval_type`, `context→payload`, lägg `agent_id:'karin'`, och **läs `.error`** (logga + ev. retry). Verifiera mot faktiska kolumnnamn. Detta är samma silent-failure-klass som B1/B2 och hör hemma i samma härdning.

---

## 3. Design: `lib/approvals/execute.ts` — en sanning

### 3.1 Kärninsikt som styr designen

Den nuvarande "fetch mot egen route + forwarda auth"-modellen kan **aldrig** tjäna Väg B (auto-approve), eftersom det inte finns någon användarsession att forwarda i cron/agent-kontext. Att försöka lappa det med header-forwarding löser bara web/mobil, inte auto. 

**Därför: execute.ts ska inte göra autentiserade HTTP-anrop till syskonrouter. Den ska anropa den underliggande affärslogiken direkt** med service-role-klient + `businessId` — exakt mönstret `sendSmsViaElks` redan använder för SMS. Det betyder att send-logiken för offert/faktura/bokning extraheras till lib-funktioner som BÅDE HTTP-routerna OCH execute.ts anropar. Då försvinner auth-forwarding-problemet helt.

**Tension att hantera medvetet:** cookie-forwarding (Fix DEF) gav en *gratis* RBAC-propagering — en icke-ägare som godkänner en faktura blockeras för att target-routens permission-check körs i hans session. Om execute.ts kör service-role tappas det skyddet **om vi inte återinför det explicit**. Lösningen: execute.ts tar emot en **actor-kontext** (vem agerar + deras permissions, resolvade EN gång av anroparen) och gate:ar känsliga handlingar själv, innan lib-anropet.

### 3.2 Signatur (illustrativ — design, ej implementation)

```
type Actor =
  | { kind: 'user'; userId: string; permissions: PermissionFlags }   // web/mobil
  | { kind: 'system'; reason: string }                               // auto/cron

interface ExecuteInput {
  approval: { approval_type: string; payload: Record<string,unknown>; business_id: string; package_data?: unknown }
  businessId: string
  actor: Actor
  supabase: SupabaseClient            // service-role, injiceras av anroparen
  actionOverrides?: Record<string,string>
}

interface ExecuteResult {
  ok: boolean
  reason?: 'fail' | 'four_eyes_required' | 'permission_denied' | 'rate_limited'
  error?: string
  metadata?: Record<string,unknown>   // t.ex. { new_approval_id }
}

async function executeApproval(input: ExecuteInput): Promise<ExecuteResult>
```

- **Auth-kontext som param, inte intern request-läsning** (per din riktning). Web-routen resolvar `actor` från sessionen; auto-vägen skickar `{kind:'system'}`. execute.ts läser aldrig `request`/cookies själv.
- **Permission-gate inuti execute.ts:** för `kind:'user'` kontrolleras `permissions` mot handlingens krav (ägar-only för send_invoice etc.) → annars `permission_denied`. För `kind:'system'` gäller policy-definierade systemrättigheter (se §3.5 four-eyes).

### 3.3 Send-logik flyttas till lib-funktioner (delas av route + execute)

| Handling | Ny lib-funktion (service-role) | Ersätter |
|---|---|---|
| Skicka offert | `sendQuote(supabase, businessId, quoteId, opts)` | `fetch /api/quotes/send` |
| Skicka faktura | `sendInvoice(supabase, businessId, invoiceId, opts)` | `fetch /api/invoices/send` |
| Skapa bokning | `createBooking(supabase, businessId, params)` | `fetch /api/bookings` |
| Generera offert/ÄTA-draft | `generateQuoteDraft(...)` | `fetch /api/quotes/ai-generate` |
| Skicka SMS | `sendSmsViaElks(...)` (finns redan) | — |

HTTP-routerna `/api/quotes/send` m.fl. blir **tunna wrappers**: `getAuthenticatedBusiness` → permission-check → anropa lib-funktionen. All faktisk logik i lib. **Korrekta interna vägar är då lib-anrop, inte URL:er** — 404-problemet (B1) försvinner per konstruktion.

### 3.4 Gate ALL status-skrivning på `ok === true`

Tre call-sites, samma regel:
- **Web/mobil** (`approvals/[id]`): status flippas redan atomiskt (Del 1). Behåll flip-före-exec (så att resolved-state finns även om nätet dör mitt i), MEN: om `result.ok === false` → returnera result till klienten med `reason`, och **överväg att flippa tillbaka till `pending`** för retrybara fel (`fail`/`rate_limited`) men INTE för `permission_denied`/`four_eyes_required` (de är terminala för denna actor). Detta är den länge uppskjutna "status-flip-ordningen" (td-approval-status-flip-order.md) — designas klart här.
- **Auto** (tool-router): `auto_approved` skrivs **endast** om `result.ok === true`. Annars → §3.5.

### 3.5 B1-specifikt: auto-approve blir fail-safe

Ersätt `executeApprovalPayloadInternal`-spegeln med:
```
const result = await executeApproval({ approval, businessId, actor:{kind:'system',reason:'auto_approve'}, supabase })
if (result.ok) {
  insert pending_approvals { status:'auto_approved', ... , payload: { ...payload, agent_id } }   // attribuerad
} else if (result.reason === 'four_eyes_required') {
  // redan skapad ny high-approval av lib-funktionen → logga, peka agenten dit
} else {
  // FAIL-SAFE: skapa en HIGH pending_approval för människa istället för att ljuga "auto-utfört"
  insert pending_approvals { status:'pending', risk_level:'high', payload:{...payload, agent_id, auto_failed_reason: result.reason } }
}
```
- Agentens svar till användaren ändras från "Åtgärd utförd direkt" till sanning: vid fail "Jag förberedde X men kunde inte slutföra automatiskt — det väntar på din granskning."
- **four-eyes-loop:** om auto-approve träffar en >50k-offert anropar `sendQuote` internt four-eyes-logiken → returnerar `four_eyes_required` + skapar `four_eyes_quote`-approval (befintligt mönster, `quotes/send/route.ts:292`). Auto-vägen markerar då INTE auto_approved; den höga approvalen som skapades blir människans grind. Ingen dubbel, ingen tyst auto-send av högvärdesoffert. `classifyResponse`-shapen återanvänds rakt av (`requires_approval → four_eyes_required`).

### 3.6 B2-specifikt: mobil

Två ändringar, oberoende av lib-refaktorn (kan göras före som tactical stopgap, eller falla ut gratis efter):
1. **`forwardHeaders()` forwardar både cookie OCH authorization.** Tactical fix som får mobilens Bearer att nå target-routerna SÅ LÄNGE HTTP-fetch-modellen finns kvar. Efter lib-refaktorn (§3.3) blir den överflödig — execute.ts kör service-role och behöver ingen forwarding — men den skadar inte och bör in först för att stoppa blödningen.
2. **`respondToApproval` (mobil) läser `execution`** och visar fel vid `execution.ok === false` / `sms_sent === false`, precis som `PendingApprovalsBlock` gör i web sedan Fix C. Detta är den egentliga B2-fixen (silent grönt). Måste in oavsett refaktor-väg.

### 3.7 Default-fallbacken (fynd 13) — REKOMMENDATION: ta bort

Nuvarande `default`-case (`route.ts:1002-1017`) auto-SMS:ar för **okända** approval_types så fort payloaden råkar ha `phone`+`text`. I en service-role-värld (execute.ts) utan människa i loopen är detta en aktiv foot-gun: en framtida info-only-typ med de fälten skickar oavsiktligt SMS. **Ersätt med:** explicit `{ ok:true, acknowledged:true, note:'okänd typ — ingen sidoeffekt' }` + en `console.warn` så vi upptäcker omappade typer. Inga handlingar ska ske på payload-forms-slump. Tas bort i samma PR som spegeln (annars ärver execute.ts foot-gunen).

---

## 4. Migrationsplan — byt tre konsumenter utan att bryta prod

Princip: **lib-funktionerna byggs och bevisas mot HTTP-routerna FÖRST**, därefter byts call-sites en i taget bakom verifiering. Aldrig "big bang".

| Steg | Vad | Verifiering innan nästa steg |
|---|---|---|
| 0 | **Fixa auto-invoice:303** (type→approval_type, context→payload, läs .error, agent_id:'karin'). Fristående, ofarlig, stoppar pågående blödning. | SQL: nya `review_auto_invoice` skapas vid projekt-completion. |
| 1 | **Extrahera `sendInvoice`/`sendQuote`/`createBooking` till lib.** HTTP-routerna `/api/.../send` görs om till tunna wrappers som anropar lib. Beteende oförändrat utåt. | Befintliga web-godkännanden av send_quote/send_invoice/create_booking fungerar exakt som förr (manuellt + ev. e2e). |
| 2 | **Bygg `execute.ts`** som anropar lib-funktionerna. Ännu INGEN call-site bytt. Enhetstesta mot mockad supabase + alla reason-grenar. | execute.ts-tester gröna; paritets-jämförelse mot gamla switchen per approval_type. |
| 3 | **Byt Väg A (web)** att anropa execute.ts. Behåll gamla switchen bakom feature-flag/kommentar tills verifierad. | Web-godkännande av varje typ (SMS, quote, invoice, booking, four_eyes) ger samma resultat. Permission-denial för icke-ägare bevaras. |
| 4 | **B2: forwardHeaders authorization + mobil respondToApproval läser execution.** | Mobil-godkännande av en icke-SMS-typ visar fel vid simulerad 401; lyckat vid giltig. |
| 5 | **Byt Väg B (auto): ersätt spegeln med execute.ts + fail-safe.** Ta bort default-SMS-fallbacken. | Auto-approve av medium-SMS skickar faktiskt (eller skapar pending vid fail). `auto_approved` skrivs aldrig vid `ok:false`. four-eyes på >50k → human-approval, ingen auto-send. |
| 6 | **Städa:** ta bort gamla `executeApprovalPayload`-switchen + `executeApprovalPayloadInternal`-spegeln. | tsc + full regress av approval-typer. |

Mobilens execution-läsning (steg 4, del 2) är **icke-blockerande för resten** och bör shippa så tidigt som möjligt — den är den enda B2-fixen som krävs oavsett.

---

## 5. Riskanalys — refaktor av pengar-kritisk kod

| Risk | Sannolikhet | Konsekvens | Mitigering |
|---|---|---|---|
| **Dubbel-send under övergång** (route + lib båda kör) | Medel | Dubbel faktura/SMS | Steg 1 gör routen till wrapper runt lib (en väg, inte två). Aldrig båda parallellt. Del 1:s idempotens-guard ligger redan under. |
| **Tappad RBAC** (service-role kringgår permission-check som cookie-forwarding gav) | Hög om förbisedd | Icke-ägare skickar faktura | Actor-param med permissions; execute.ts gate:ar känsliga typer explicit (§3.2). Paritetstest: icke-ägare ska få `permission_denied` i både gammal och ny väg. |
| **four-eyes-regression** (>50k auto-sänds tyst) | Medel | Högvärdesoffert ut utan granskning | §3.5: four_eyes_required → human-approval, aldrig auto_approved. Explicit testfall med 50k+. |
| **Paritets-glapp** (ny switch missar en approval_type) | Medel | Vissa typer slutar fungera | Steg 2 enhetstest per typ; behåll gamla switchen bakom flag tills alla typer verifierade i prod. |
| **auto-invoice-fixen skapar nu approvals som tidigare aldrig fanns** → plötslig svall av `review_auto_invoice` för historiska drafts | Låg-Medel | Hantverkaren översköljs | Steg 0: skapa bara för projekt slutförda framåt (filtrera på completed_at >= deploy), inte retroaktivt. Backfill separat beslut. |
| **Lib-funktion saknar sidoeffekt som routen hade** (pipeline-event, activity-logg) | Medel | Tyst tappad automation | Steg 1: flytta HELA route-bodyn till lib inkl. fireEvent/activity, routen blir ren wrapper. Diffa noga. |
| **Status-flip-tillbaka skapar ny edge-case** (SMS skickat men status→pending → dubbelsänd vid retry) | Medel | Dubbel-SMS | Flippa INTE tillbaka för handlingar med extern sidoeffekt som redan delvis skett; bara för rena pre-exec-fel. Designa per reason (§3.4). |

---

## 6. Beslut som behövs av Andreas innan bygge

1. **Lib-extraktion (strategisk) vs enbart auth-forwarding (taktisk)?** Rekommendation: båda — taktisk B2-fix (steg 4) + mobil-execution-läsning omedelbart för att stoppa blödningen, strategisk lib-refaktor (steg 1-6) som den varaktiga "en sanning". Auto-approve (B1) blir aldrig korrekt utan lib-vägen.
2. **Backfill av historiska auto-invoice-drafts** (skapa retroaktiva `review_auto_invoice`)? Eller bara framåt? Rek: framåt först, backfill som separat medvetet beslut efter att svallet bedömts.
3. **Retry-UX för `fail`/`rate_limited`:** flippa tillbaka till pending automatiskt, eller visa "försök igen"-knapp? Påverkar §3.4.

**INGEN kod skrivs förrän:** (a) denna design godkänd, (b) Del 1 prod-verifierad (attribution-SQL + checkin dubbel-submit-test).
