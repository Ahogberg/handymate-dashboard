# Hanna — Proaktiv säljmotor v2 (spec för framtida utveckling)

> Bygger på v1 (commit 402f2539): gatad reaktivering via daglig cron. Läs
> `lib/agents/hanna-outbound.ts` + denna fil innan v2 påbörjas.

## Bärande princip (från v1 — ÄRVS av allt i v2)
1. **Återanvänd befintliga approval-typer** som redan skickar vid godkännande —
   bygg ALDRIG ny exekverings-wiring. Redan wirade i `executeApprovalPayload`
   (`app/api/approvals/[id]/route.ts`): `proactive_care`, `review_request`,
   `seasonal_campaign`, `warranty_followup`, `send_sms`, `quote_nudge`. Varje
   v2-spel mappar till EN av dessa precis som v1 mappar till `proactive_care`.
2. **Gatad som standard** (skapa förslag, hantverkaren godkänner). Per-spel
   auto-skicka är opt-in (se nedan). Skyddar hantverkarens varumärke.
3. **Drip** (cap per körning) → ingen flod, ens vid färsk import.
4. **Dedup** mot öppna förslag + skickade senaste N dagar. Rider på
   `pending_approvals` + `v3_automation_logs` → undvik nya tabeller där det går.
5. **Datadisciplin:** rikta bara mot kunder vi VET nåt om. Historiklösa
   importer kontaktas aldrig. Kvalitet växer med historiken (svänghjul).
6. **Attribuera till agent** i `v3_automation_logs.agent_id` (`pl.agent`) så det
   syns i saved-scoreboard + veckodigest.

---

## Spel 1 — Be om rekommendation (referral)
**Varför:** word of mouth är hantverkarens #1-kanal.
- **Trigger:** kund som nyligen (a) gav 5-stjärnig recension, ELLER (b) fick ett
  jobb avslutat + betalt med hög nöjdhet. Datakälla: review-flödet +
  `invoice.status='paid'` + ev. nöjdhetssignal.
- **Approval-typ:** `proactive_care` (eller egen `referral_ask` om vi vill skilja
  i statistik — kräver då ny case i executeApprovalPayload).
- **Meddelande:** "Tack {namn}! Känner du någon som behöver {tjänst}? Tipsa dem
  gärna om oss." (ev. referral-kod/rabatt i v2.1).
- **Dedup:** max 1 referral-fråga per kund per 12 mån.
- **Återbruk:** `lib/nurture.ts`, review-flödet.

## Spel 2 — Samla recensioner
**Varför:** fler recensioner → högre lokal ranking → mer INKOMMANDE.
- **Trigger:** jobb avslutat + betalt, ingen recension begärd än.
- **Approval-typ:** `review_request` (REDAN wirad — skickar SMS med recensionslänk).
- **Status idag:** finns som cron `review-requests` (0 9 * * *) + automations-mall.
  v2-arbetet = lägga det under Hannas persona + dedup + drip + digest-attribution,
  inte bygga om utskicket.
- **Verifiera:** `review_request`-payloadens fält (kund, länk) innan integration.

## Spel 3 — Säsong / väder-erbjudande
**Varför:** hög konvertering (befintlig relation + rätt timing).
- **Trigger:** säsong (`seasonality_insights`-tabell + `seasonality`-cron) eller
  väder (kräver väder-API — nytt). Riktat mot BEFINTLIGA kunder med relevant
  historik (snöskottning-kund → snö; målning-kund → vår).
- **Approval-typ:** `seasonal_campaign` (REDAN wirad).
- **Dedup:** 1 säsongsutskick per kund per säsong.
- **Nytt:** väder-trigger (valfritt, v2.1) — annars använd seasonality_insights.

## Spel 4 — Daniels offert-jakt (warm pipeline)
**Varför:** närmast pengarna — offerter som svalnat.
- **Ägare:** Daniel (Säljare), inte Hanna. Egen körning/persona.
- **Trigger:** offert skickad men obesvarad 10+ dgr (vi har `quote-follow-up`-cron
  + `quote_followup`-automation + `quote_nudge`-approval).
- **Approval-typ:** `quote_nudge` (REDAN wirad).
- **v2-arbete:** persona-attribution (Daniel) + drip + digest, inte nytt utskick.

---

## Tvärgående funktioner

### A. Per-spel auto-skicka (opt-in)
- **Mål:** när hantverkaren litar på ett spel kan hon låta Hanna skicka utan
  godkännande.
- **Design:** settings-flagga per spel, t.ex. `hanna_autosend` JSONB på
  `v3_automation_settings` eller `business_config`: `{ reactivation:false,
  review:true, ... }`. Default ALLT false (gatad).
- **Implementation:** i körningen — om auto-skicka på för spelet, skicka direkt
  via `sendSmsViaElks` (samma som approval-vägen gör) + logga, i stället för att
  skapa `pending_approvals`. Behåll drip + dedup + nattspärr (21–08).
- **Risk:** auto-skicka utan gate = varumärkesrisk → kräver tydlig opt-in-UI +
  ångra/paus. Bygg UI:t medvetet.

### B. Veckodigest-narrativ ("Hanna väckte X")
- **Mål:** visa Hannas intäktsbidrag i veckovärde-digesten (`/api/dashboard/
  weekly-value` + `components/dashboard/WeeklyValueDigest.tsx`).
- **Design:** lägg ett "Hanna-spår" — räkna proactive_care/referral/review-loggar
  (via `v3_automation_logs` där `agent_id='hanna'` senaste 7 dgr) + koppla till
  resulterande jobb (reaktivering → ny deal/offert/faktura). Visa "Hanna: 4
  väckta kunder, 1 nytt jobb ~X kr".
- **Attribution finns redan** (agent_id sätts i proactive_care-loggen sedan v1).
  Kvar: koppla utskick → resulterande intäkt (svårare; ev. via deal.source eller
  en `source_agent`-markör på leads/deals som skapas efter Hanna-kontakt).

### C. Import-enrichment (tänd reaktivering direkt)
- **Mål:** lös cold-start — ge importerade kunder `last_job_date` + tjänst så
  Hanna kan väcka dem dag 1.
- **Design:** i `lib/customers/import-core` — mappa valfria kolumner "senaste
  jobb (datum)" + "tjänst/kategori" om hantverkarens fil har dem. Sätt
  `customer.last_job_date` + spara tjänst (ny kolumn `customer.last_service`
  eller härled). Många hantverkare har detta i sin gamla fakturadata.
- **Alternativ:** härleda ur historiska Fortnox-fakturor (licens-gated).

### D. Enrichment-flagga i UI
- v1 räknar `historyless` men visar det inte. v2: en liten yta "34 kunder saknar
  historik — fyll i senaste jobb så väcker Hanna dem" (driver enrichment ovan).

---

## Legal / compliance (MÅSTE hållas)
- ALDRIG kallkontakt till okända (ej bekräftade kunder) — marknadsföringslagen +
  GDPR. Hanna rör BARA bekräftade tidigare kunder (har relation = laglig grund).
- Auto-skicka: respektera nattspärr 21–08 (CLAUDE.md) + opt-out.
- Nya främlingar (acquisition) = separat marknadsföringskanal (Google-profil,
  annonser, funnels) — INTE Hannas domän. Håll isär.

## Sekvens (förslag)
1. v2.0: Spel 2 (recension) + Spel 4 (Daniel offert-jakt) under personas + digest
   — mest återbruk, snabbast värde.
2. v2.1: Spel 1 (referral) + import-enrichment (C) + enrichment-flagga (D).
3. v2.2: Spel 3 (säsong) + per-spel auto-skicka (A) med opt-in-UI.
4. v2.3: väder-trigger, referral-koder.

## Verifiering (per spel, innan bygge)
- Bekräfta approval-typens payload-fält i `executeApprovalPayload` (gissa inte —
  läs caset, som vi gjorde för `proactive_care` i v1).
- tsc + build. Dedup testad. Drip-cap. agent_id-attribution satt.
- Inga nya `matte_*`/phantom-kolumner. SQL-migreringar = manuell `.sql` i `sql/`.
