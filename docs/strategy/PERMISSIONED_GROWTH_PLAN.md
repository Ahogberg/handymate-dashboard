# Permissioned Growth System — analys & utvecklingsplan

**Datum:** 2026-08-18
**Status:** Beslutsunderlag — Fas 1 startar först efter grundarbeslut (se §7) och juridisk granskning av samtyckestexterna.
**Bakgrund:** Codex-förslaget om ett "Permissioned Growth System": agentteamet hittar efterfrågan, väljer rätt kanal och kan bevisa varför varje kontakt är tillåten. Detta dokument analyserar förslaget mot den faktiska kodbasen och lägger en fasindelad utvecklingsplan.

---

## 1. Sammanfattning

Codex-förslaget träffar rätt — och Handymate har ett bättre utgångsläge än förslaget antar. **Cirka 40 % av "Outbound Safety Kernel" finns redan i produktion, men bara för SMS-kanalen.** `lib/outbound/sms-gate.ts` är exakt den typ av deterministisk, fail-closed tillåtelsegrind med typade avslagskoder och purpose-kontrakt som förslaget beskriver. First-Party Growth-agenten är till ~70 % redan byggd i Hannas fyra outbound-producenter. Referral-flödet (Epic C) finns komplett men är avstängt bakom en SQL-flagga utan inställnings-UI.

De verkliga luckorna:

1. **E-postvägen har ingen grind alls** — varken Resend-vägen (`lib/email.ts`) eller Gmail-vägen (`send_email` i tool-router) kontrollerar opt-out, frekvens eller rättslig grund. Det finns inte ens ett `email_opt_out`-fält.
2. **Inget samtyckesregister per slutkund.** Tabellen `consent_log` i `sql/gdpr.sql` har aldrig fått en skribent. Det enda samtyckesliknande fältet är `customer.sms_opt_out`.
3. **Ingen proveniens.** `customer` saknar `source`-fält; CSV-importen skriver varken källa eller batch-id. Endast `leads.source` finns.
4. **Ingen legal_basis-modell, ingen mottagartyps-semantik** (`customer_type` finns men används bara för badges/ROT), **ingen beslutslogg** för varför en kontakt tilläts eller blockerades.
5. **Dött veckotak:** `communication_settings.max_sms_per_customer_per_week` (default 3) läses bara av `lib/smart-communication.ts`-vägen — inte av agent-, kampanj- eller cron-vägarna som går via `lib/sms-send.ts`.

Slutsatsen är densamma som Codex-förslagets: bygg säkerhetskärnan först, låt LLM:en föreslå relevans och text medan en deterministisk regelmotor avgör tillåtlighet. Skillnaden är att vi bygger kärnan **under** den bevisade SMS-grinden i stället för att ersätta den.

---

## 2. Idé-för-idé mot kodbasen

| Codex-idé | Status i kodbasen | Slutsats |
|---|---|---|
| **Outbound Safety Kernel** | ~40 % finns, enbart SMS: `gateCustomerSms()` (fail-closed, typade koder `invalid_contract`/`guard_unavailable`/`customer_not_found`/`recipient_mismatch`/`customer_opted_out`/`recent_customer_contact`/`already_sent`), STOPP/START-parsning, 7-dagars proaktivfönster, nattblock 21–08 via `sms_queue`, approval-idempotens. E-post ogrindat. Inget samtyckesregister, ingen proveniens, ingen beslutslogg. | Bygg delad kärna + e-postgrind. Rör inte SMS-grindens publika kontrakt (35 anropsplatser + `tests/outbound-safety.spec.ts`). |
| **First-Party Growth Agent** | ~70 % finns: `lib/agents/hanna-outbound.ts` (reaktivering ≥180 d tystnad, regeln "en bar importerad kontakt utan historik kontaktas ALDRIG"), `hanna/capacity-fill.ts` (90 d), `hanna/kundbas-svep.ts`, `hanna/avtal-forslag.ts`, `lib/customers/quiet-customer.ts` + `reactivation-signal.ts`, `lib/proactive-care.ts` (JOB_LIFECYCLE-karta), `lib/warranty-followup.ts` (12-mån-fönster), review-request-cron (180-dagarsklocka). | Fas 2 är en uppgradering, inte nybygge: kör producenterna genom kärnan och redovisa alltid permission-uppdelningen ("43 → 28/9/6"). |
| **Consent Capture Network** | Byggstenar finns: HMAC-tokenmönstret i `lib/referral/link.ts` (fail-closed, DB-löst), leads-flödet, webbwidget. Saknas: formulär som skriver ett samtyckesregister. | Fas 3. Litet i appen — ROT-kalkylator och lokala tjänstesidor ligger på marknadssajten utanför repot; här behövs endast capture-endpointen. |
| **Referral Agent** | Finns (Epic C): signerad delningslänk `/rekommendera/[token]`, attribution via `leads.referral_customer_id`/`deal.referral_customer_id`, kunden väljer själv mottagare (inga vänners kontaktuppgifter samlas in). Gated bakom `business_config.referral_ask_enabled` DEFAULT false — kan i dag bara slås på via SQL. | Bygg endast settings-UI + koppla in i permission-redovisningen. Designen uppfyller redan förslagets krav. |
| **B2B Account Scout** | Närmast liggande befintlighet är `leads_outbound` (v19) + grannkampanjer (v20) — men de riktar sig mot **privatpersoner** (villaägare) med **mockade** Lantmäteriet-/Boverket-källor. Det är juridiskt känsligare än B2B-idén. | Fas 4, minimal och valbar: organisationer utan personfält, granskningskö först. Brevpipelinen vidareutvecklas inte utan juridik (se §6). |
| **Lisa Callback (inbound/begärd)** | Röstplanen är sparad, ej startad (`tasks/lisa-voice-plan.md`). `lib/agent/external-actor.ts` har `EXTERNAL_SAFE_TOOLS` = tom mängd — alla 48 verktyg nekade externa aktörer. | Linjerar redan med förslaget: endast inbound, begärda återuppringningar och bokade samtal. Kall AI-uppringning byggs aldrig. |

---

## 3. Arkitekturbeslut

**Behåll `gateCustomerSms` orörd som kanaladapter. Bygg en delad, deterministisk kärna. Lägg en syskon-grind för e-post.**

- **Ny `lib/outbound/contact-permission.ts` — kärnan.** Ren funktion utan LLM-beroende som äger typerna och beslutsmatrisen:

  ```ts
  type ContactChannel   = 'sms' | 'email' | 'phone' | 'post' | 'portal' | 'ad'
  type Relationship     = 'customer' | 'former_customer' | 'lead' | 'cold_prospect'
  type RecipientType    = 'consumer' | 'sole_trader' | 'legal_entity' | 'undeterminable'
  type PermissionDecision = 'permitted' | 'review_required' | 'blocked'
  type LegalBasis       = 'consent' | 'legitimate_interest' | 'customer_exception'
  type PermissionReasonCode =
    | 'opted_out' | 'no_valid_basis' | 'consent_revoked' | 'consent_expired'
    | 'recipient_type_undeterminable' | 'source_unknown' | 'frequency_cap'
    | 'quiet_hours' | 'channel_not_permitted' | 'guard_unavailable' | 'objection_registered'

  decideContactPermission(input): Promise<ContactPermissionRecord>  // en kontakt
  decideAudience(candidates): Promise<AudienceBreakdown>            // målgrupp: { permitted[], reviewRequired[], blocked[], byReason }
  deriveRecipientType(customer): RecipientType                      // customer_type + org_number-heuristik
  ```

  Fail-closed enligt sms-gatens princip: DB-fel ⇒ `blocked` + `guard_unavailable` — "kunde inte kontrollera" får aldrig bli "tillåtet".

- **`lib/outbound/sms-gate.ts` behåller sin publika signatur** och anropar kärnan internt. Ny avslagskod `weekly_cap_exceeded` kopplar in det i dag döda veckotaket — på en enda plats, i grinden.
- **Ny `lib/outbound/email-gate.ts` + chokepoint `lib/outbound/email-send.ts`** (`sendCustomerEmail({ businessId, customerId, purpose, ... })`). `sendEmail` i `lib/email.ts` saknar kundkontext och kan inte grindas på plats; kundriktade anrop migreras till chokepointen, interna (driftlarm m.m.) behåller rå `sendEmail`. Gmail-grenen i tool-routerns `send_email` grindas också — den är i dag helt oskyddad.
- **Landspaket från dag ett:** beslutsmatrisen tar en `CountryPolicy`-parameter med `SE` som enda implementation. Svenska regler hårdkodas aldrig som europeisk default; NO/DE blir framtida policymoduler.
- **Rollfördelningen är exakt Codex-modellen:** Hanna & co föreslår relevans, segment och text — regelmotorn avgör om kontakten får ske, och varje beslut loggas med reason_codes.

Skäl mot att generalisera `gateCustomerSms` direkt till en kanalagnostisk funktion: de 35 anropsplatserna och `tests/outbound-safety.spec.ts` utgör ett bevisat säkerhetskontrakt ("kartan är beslutet", jfr `tests/permission-contract.spec.ts`). Vi utökar under det i stället för att röra det.

---

## 4. Fasplan

### Fas 0 — Juridik & klassificering (2–3 dagar, ingen kod)

1. **Purpose-inventering av e-post.** SMS-anropen bär redan `SmsPurpose`; e-postanropen gör det inte. Klassificera alla `sendEmail`-användare. Facit: faktura/offert/jobbrapport = `transactional`; driftlarm/onboarding-internt = `internal`; nurture = `proactive`; agentens fria kundmejl = `conversational`.
2. **Backfill-beslut** (grundarfråga, §7.1): vilken rättslig grund får befintliga kunder utan samtyckespost?
3. **Juridisk checkpoint:** versionerade samtyckestexter (mönster: `'benchmark-readiness-v1'` i v140), artikel 14-informationstext, e-postens avregistreringstext. Dessa är indata till v151.

### Fas 1 — Outbound Safety Kernel (~2 veckor)

**Migrationer** (körs manuellt/via MCP efter "kör", som alltid):

- **`sql/v151_contact_permission.sql`** — kopiera v140-mönstret (guard-block, append-only audit, SECURITY DEFINER-setter, RLS `TO service_role`, REVOKE/GRANT, COMMENT):
  - `customer`: `email_opt_out BOOLEAN NOT NULL DEFAULT FALSE` + `_at`/`_source`; designade men vilande `phone_opt_out`/`letter_opt_out` (samma trio); `contact_source` (`'manual'|'csv_import'|'gmail_import'|'lead_form'|'portal'|'referral'|'unknown'`) + `contact_source_at`; `article14_notice_at`; `nix_checked_at` (fält utan integration); `recipient_type_override`.
  - Backfill: `contact_source = 'unknown'` — kärnan mappar `unknown` till `review_required` för proaktiva syften, `permitted` för transaktionella.
  - **`customer_consent`** (append-only): `channel`, `scope` (`'marketing'|'service_reminders'|'callback'|'referral_share'`), `status` (`'granted'|'revoked'`), `legal_basis`, `source`, `consent_version`, `evidence JSONB`, `actor_type`/`actor_id`. SECURITY DEFINER `record_customer_consent()` som validerar version + tenant. Vy `customer_consent_current` (senaste rad per kund+kanal+scope). Gamla `consent_log` i `sql/gdpr.sql` återanvänds **inte** (saknar customer_id och scope) — lämnas som ev. cookie/ToS-logg.
  - **`outbound_decision_log`** (endast INSERT för service_role): `stage` (`'audience'|'send'`), `decision`, `reason_codes TEXT[]`, `legal_basis`, `recipient_type`, `channel`, `purpose`, `context_type`/`context_id`. Detta är beviskedjan bakom "Jag blockerade 17 mottagare: nio saknade giltig SMS-grund, fem hade invänt, tre var enskilda firmor där mottagartypen inte kunde fastställas."
- **`sql/v152_email_weekly_cap.sql`**: `communication_settings.max_email_per_customer_per_week INTEGER DEFAULT 2`.

**Kod:**

- Kärnan (`contact-permission.ts`) enligt §3, inkl. beslutsmatrisen: `transactional`/`conversational`/`internal` kräver aldrig marknadsföringsgrund (men respekterar hård opt-out där relevant — en faktura blockeras aldrig av marknadsopt-out); `proactive` kräver aktivt kundundantag ELLER beviljat samtycke i scope ELLER berättigat intresse ⇒ `review_required`; `cold_prospect` + `consumer` ⇒ alltid `blocked` för sms/email/phone (MFL 19 §), endast `post`/`ad` kan bli `review_required`.
- `sms-gate.ts`: kärn-anrop + `weekly_cap_exceeded` (fail-closed).
- `email-gate.ts` + `email-send.ts`: opt-out, kärnbeslut, veckotak via `communication_log`, idempotens per approvalId; migrera kundriktade anropsplatser; grinda tool-routerns båda grenar (Resend + Gmail).
- **Avregistrering e-post:** HMAC-token (mönster `lib/referral/link.ts`) i footer på alla `proactive`-mejl; ny route `app/api/email/unsubscribe/route.ts` sätter `email_opt_out`, skriver `customer_consent` (`revoked`) + beslutslogg. Fail-closed på ogiltig token.
- **Kampanjväljaren** (`app/dashboard/campaigns/new/page.tsx`): filtrera bort `sms_opt_out` vid urval och visa uppdelningen ("38 valbara, 4 har avböjt SMS") i stället för att tyst låta wire-grinden blockera. OBS: `sms_campaign`-tabellerna saknar migrationsfil (MANUAL_TABLES) — verifiera faktiskt schema via Supabase MCP innan queries ändras.
- **Artikel 14-helper** `needsArticle14Notice()` i kärnan (praktiskt relevant först i Fas 4, fältet finns från start).

**Tester (policy-as-test, mönster från `tests/permission-contract.spec.ts`):**

- `tests/contact-permission-contract.spec.ts` — hela beslutsmatrisen tabellbaserad: varje (kanal × syfte × relation × mottagartyp × grund)-cell med förväntat beslut + reason_code. Kartan är beslutet.
- `tests/email-gate.spec.ts` — opt-out, veckotak, idempotens, fail-closed vid DB-fel, transactional-passage förbi marknadsopt-out (kritisk cell).
- `tests/raw-email-forbidden.spec.ts` — grep-baserad (mönster `agent-tool-boundaries.spec.ts`): rå `sendEmail` får bara importeras av allowlist.
- Utöka `tests/outbound-safety.spec.ts` med `weekly_cap_exceeded`.

**Verifiering:** `npx tsc --noEmit`, `npx next build`, Playwright-sviten; SELECT-verifiering av v151/v152 efter körning; manuellt: proaktivt testmejl till opt-out-kund ⇒ blockeras med kod, rad i `outbound_decision_log`.

### Fas 2 — First-Party Growth Agent (~1,5 vecka)

Ingen ny agent — Hannas producenter körs genom kärnan och redovisar alltid uppdelningen.

- **Ändrade filer:** `lib/agents/hanna-outbound.ts`, `hanna/capacity-fill.ts`, `hanna/kundbas-svep.ts`, `hanna/avtal-forslag.ts`, `lib/customers/quiet-customer.ts` + `reactivation-signal.ts`, `lib/warranty-followup.ts`, `lib/proactive-care.ts`, `app/api/cron/review-requests/route.ts`, `lib/nurture.ts` — kandidatlistan går genom `decideAudience()` **före** approval-skapande (stage `audience`); wire-grinden i `sms-send`/`email-send` blir dubbelkollen precis före sändning (stage `send`).
- **Approval-payload** får `permission_breakdown: { total, permitted, review_required, blocked, byReason }` (i befintlig payload-JSONB — ny migration undviks om möjligt; kontrollera `lib/agents/shared/save-and-push.ts`).
- **UI:** approval-kortet visar "43 tidigare badrumskunder: 28 kontaktbara via e-post, 9 behöver förnyat samtycke, 6 blockerade" med expanderbar reason-lista och svenska etiketter per kod. Agenten visar aldrig bara "43 prospekt".
- **`review_required` blir handling:** ny approval_type `request_consent` i `app/api/approvals/[id]/route.ts` — skickar samtyckesförfrågan via befintlig purpose `consent_confirmation` (redan undantagen i sms-gaten); JA-parsning bredvid STOPP-parsningen i `app/api/sms/incoming/route.ts` skriver `customer_consent`.
- **Bugfix på köpet:** warranty-followups inställningar läser i dag obefintliga `automation_settings.settings` — peka om till `communication_settings`.

### Fas 3 — Consent Capture Network (~1–1,5 vecka)

- **`sql/v154_consent_capture.sql`**: source-värden `'qr'|'web_form'|'referral_link'|'callback_request'` för `customer_consent`; `leads.requested_callback_at` + koppling till samtyckespost.
- **Publikt samtyckesformulär:** `app/samtycke/[token]/page.tsx` + `app/api/consent/capture/route.ts` (HMAC-token per business via ny `lib/consent/link.ts`, mönster från referral). Skriver `customer_consent` med `evidence: { ip, user_agent, consent_text_version, ts }` — systemets första riktiga samtyckesskribent.
- **QR på servicebilen:** genererad PNG av samtyckeslänken i settings (qrcode-paketet finns redan).
- **Begärd återuppringning:** "ring mig"-kryssruta ⇒ lead `source='callback_request'` + consent scope `'callback'` ⇒ befintligt leadsflöde till Lisa/Matte. Lisa ringer **endast** dessa.
- **Referral-UI:** settings-toggle för `referral_ask_enabled` (i dag SQL-flip). Flödet i övrigt orört.
- **Tester:** `tests/consent-capture.spec.ts` — tokenvalidering fail-closed, obligatoriska evidence-fält, tenant-bindning, ingen kunddataläcka på `/samtycke`.

### Fas 4 — B2B Account Scout (valbar, ~1 vecka)

- **`sql/v155_b2b_prospects.sql`**: `b2b_prospect` med `org_number`, `org_name`, `org_form`, `source` (`'licensed_api'|'manual'|'public_register'`), `source_ref`, `status` (`found → in_review → approved/rejected → contacted`) — **inga personfält alls** i v1; kontaktdata läggs först vid manuellt godkännande.
- **Kod:** `lib/b2b/scout.ts` med källinterface `B2bSource`; endast `ManualImportSource` i v1 — Bolagsverkets API-adapter stubbas bakom env-flagga tills avtal finns. Kandidater ⇒ `pending_approvals` typ `b2b_prospect_review` (granskningskö först). Godkänd prospect ⇒ vanlig lead med `recipient_type='legal_entity'`; kontakt via `post`/`email` genom kärnan, B2B-mejl = `review_required`, aldrig auto-send. Även juridiska personer får alltid en fungerande stopp-möjlighet (MFL 21 §).
- **Tester:** spec som förbjuder personnummermönster i `b2b_prospect`-writes; matrisceller för `legal_entity`.

**Efter Fas 3–4 (utanför denna plan):** outcome-learning (vilka segment/budskap ger bokning — tenant-isolerat), landspaket NO/DE som `CountryPolicy`-moduler.

---

## 5. Sekvens

`v151+v152` + kärna + e-postgrind + veckotak + kampanjfilter + matristester (**Fas 1**) → Hanna-producenter genom kärnan + breakdown-UX + `request_consent` (**Fas 2**) → samtyckesfångst + callback + referral-UI (**Fas 3**) → B2B-scout (**Fas 4**, valbar). Inget i Fas 2–4 startar innan `tests/contact-permission-contract.spec.ts` är grön — kärnan är, precis som Codex-förslaget säger, förutsättningen för allt annat.

---

## 6. Byggs INTE

1. **Kall AI-telefoni/robocalls — aldrig.** Lisas röstplan förblir inbound/begärd återuppringning/bokade samtal; `EXTERNAL_SAFE_TOOLS` förblir tom för utgående. En kall AI-röstuppringning behandlas som förbjuden utan uttryckligt förhandssamtycke.
2. **Brevpipelinen (`leads_outbound` v19, grannkampanjer v20) vidareutvecklas inte.** Källorna är mockar, och riktiga fastighetsdata om villaägare är profilering av privatpersoner ⇒ kräver DPIA, artikel 14-notis och marknadsrättslig granskning innan en rad kod skrivs. Flaggas som "pausad i väntan på juridik" om den syns i UI.
3. **NIX-integration byggs inte nu** — utgående telefoni är inte planerad. Fältet `nix_checked_at` och reason-koden designas dock i Fas 1 så att aktivering inte kräver ny migration.
4. **Ingen insamling av vänners kontaktuppgifter** i referral — befintlig design (kunden delar själv) behålls.
5. **Ingen SE-hårdkodning i kärnan** — svenska regler blir aldrig default för Europa.

---

## 7. Öppna grundarbeslut & risker

1. **Backfill av legal_basis (viktigast — gate:ar v151).** Rekommendation: kunder med jobb < 12 mån ⇒ `customer_exception` (MFL 19–21 §§, befintligt kundförhållande); äldre ⇒ `legitimate_interest` med `review_required` för proaktiv kontakt tills invändningsvägen (art 21) finns i UI. Konsekvens: Hannas reaktivering (≥180 d tystnad) får initialt fler granskningskort. Alternativet (allt = `customer_exception`) ger mindre friktion men är juridiskt svagare.
2. **Juridisk granskning som checkpoint** före: (a) samtyckestexterna i Fas 1/3, (b) artikel 14-texten, (c) all återupptagning av brevpipelinen, (d) B2B-källors licensvillkor (Bolagsverkets API kräver avtal). Hela systemet bör granskas av svensk dataskydds-/marknadsrättsjurist före skarp lansering.
3. **`sole_trader`-heuristiken.** Enskild firma har personnummer som orgnr — `deriveRecipientType` kommer klassa många som `undeterminable` ⇒ `review_required`. Rekommendation: `recipient_type_override`-fält på kundkortet (med i v151) så hantverkaren kan fastställa typen manuellt.
4. **E-postrefaktorns blast radius.** `sendCustomerEmail`-migreringen rör faktura-/offertutskick. Grinden får aldrig blockera en faktura p.g.a. marknadsopt-out — transactional-cellen i matristestet är kritisk och skrivs först.
5. **Vercel cron-begränsning.** Inga nya cron-scheman behövs i Fas 1–3; om något tillkommer måste det in i befintliga dagliga rutter (Hobby-planens gräns är en känd deploy-blockerare).
6. **Positioneringen är säljargumentet.** "Agenten blockerade 17 mottagare och kan visa varför" är produktvärde, inte bara compliance: Handymate hittar inte bara kunder — agentteamet vet vem som får kontaktas, i vilken kanal och varför, och kan bevisa hela vägen från tillåten kontakt till vunnen affär.

---

## 8. Rättsliga huvudkällor (från Codex-underlaget)

- Intresseavvägning som rättslig grund samt absolut invändningsrätt vid direktmarknadsföring: IMY om intresseavvägning; GDPR art 21.
- E-post/SMS till fysisk person kräver förhandssamtycke; kundundantaget förutsätter insamling vid försäljning, egna likartade produkter och avböjningsmöjlighet vid både insamling och varje utskick; juridiska personer ska alltid kunna stoppa utskick: Marknadsföringslagen (2008:486) 19–21 §§.
- Telefonkontakt med konsument: NIX-kontroll, reklamidentifiering, respekt för invändningar: Konsumentverkets regler för telefonförsäljning.
- Informationsplikt vid uppgifter från extern källa, senast vid första kontakt: GDPR art 14.
- Omfattande marknadsföringsprofilering via samkörning kan kräva samtycke: IMY:s profileringsbeslut.
- Bolagsverkets företags-API kräver avtal: Bolagsverkets API-villkor.
