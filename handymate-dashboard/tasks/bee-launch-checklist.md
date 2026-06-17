# Bee Service — Launch-checklista (pilot GO)

**Business:** Bee Service AB · `biz_21wswuhrbhy` (Christoffer + Mathias + Darius)
**Datum:** 2026-06-15
**Status:** Hårda blockerare B1–B4 (säkerhet, data, integration, drift) **åtgärdade & verifierade**.
Auto-deploy från `main` fungerar. Återstår: **verifiering + ops** — inte byggande.

> Kör SQL i Supabase SQL Editor. Kolumn-/tabellnamn är verifierade mot koden 2026-06-15.

---

## A. Pre-launch SQL-checkar

### A1. Inga oväntade autonoma åtgärder (KRITISK)
```sql
SELECT business_id, auto_invoice_on_complete, auto_invoice_send,
       auto_approve_enabled, agents_globally_paused, agent_cost_cap_usd_daily
FROM business_config WHERE business_id = 'biz_21wswuhrbhy';
```
- [ ] `auto_invoice_on_complete`, `auto_invoice_send`, `auto_approve_enabled` = **false/NULL**
- [ ] `agent_cost_cap_usd_daily` satt till ett rimligt tak (t.ex. 5) som drift-skydd
- [ ] `agents_globally_paused` = false (men vet att den finns — se B nedan)

### A2. Telefoni-konfiguration finns
```sql
SELECT business_id, call_handling_mode, work_start, work_end
FROM v3_automation_settings WHERE business_id = 'biz_21wswuhrbhy';
```
- [ ] Rad finns, `call_handling_mode` satt (default `agent_with_transfer`)

### A3. Webolia som lead-källa
```sql
SELECT * FROM lead_sources WHERE business_id = 'biz_21wswuhrbhy';
```
- [ ] "Webolia" finns. Saknas → INSERT manuellt (annars hamnar Bees leads som fritext-source).

### A4. Bransch satt (för branschspecifika egenkontroll-mallar)
```sql
SELECT business_id, branch FROM business_config WHERE business_id = 'biz_21wswuhrbhy';
```
- [ ] `branch` satt till Bees faktiska bransch. Giltiga värden: `electrician`, `plumber`,
  `carpenter`, `painter`, `hvac`, `locksmith`, `construction`, `roofing`, `flooring`,
  `gardening`, `moving`, `cleaning`. **Är den tom → Bee får bara generiska egenkontroll-mallar, inte sin branschs.**

### A5. Fortnox (förväntat: ej aktivt — extern licens-blocker)
```sql
SELECT fortnox_connected_at, fortnox_company_name FROM business_config
WHERE business_id = 'biz_21wswuhrbhy';
```
- [ ] Sannolikt NULL. OK — Fortnox-sync pitchas som "kommer snart", Christoffer kör manuellt. (Se `tasks/fortnox-license-blocker.md`.)

---

## B. Säkerhets-/kill-switch (drift)
Om en agent börjar bete sig fel under pilot — stäng av direkt:
```sql
UPDATE business_config SET agents_globally_paused = true WHERE business_id = 'biz_21wswuhrbhy';
```
- [ ] Bekräfta att kommandot är känt/dokumenterat (det är er nödbroms). Cronsen läser flaggan via `checkCostGuards()` och hoppar över körningen.

---

## C. Live end-to-end-tester (mot Bee, före GO)

### C1. Live-ring → Lisa svarar
- [ ] Christoffer ringer Bees 46elks-nummer → **Lisa (Vapi)** svarar med Bees knowledge_base + boundaries (inte bara vidarekoppling). **Verifiera att Vapi är aktivt för Bee** — annars svarar ingen AI.

### C2. Offert → signera → projekt (B2-fixet live)
- [ ] Skapa offert → skicka till test-kund (Andreas) → signera i portalen → **projekt skapas** i `/dashboard/projects`. Vid fel ska ett `manual_project_create`-godkännandekort dyka upp (inte silent fail).

### C3. Push end-to-end
- [ ] Trigga en ÄTA-signering på test-projekt → Christoffers **TestFlight-app får push**.
  *(Obs: ÄTA-**mail** är fortfarande stub — använd SMS, eller dölj mail-valet.)*

> Fortnox-sync-test (audit C3) **skippas** — extern licens-blocker.

---

## D. Veckans leveranser — verifiera i prod (live men otestade mot riktig data)

### D1. Auto-projekt vid bokning (offert-lösa jobb)
- [ ] Boka in en kund som **saknar aktivt projekt och öppen offert** → projekt skapas automatiskt + bokningen kopplas till det. Boka en kund som redan har projekt/öppen offert → **inget** nytt projekt (guarden håller).

### D2. Egenkontroll — hela loopen
- [ ] Öppna ett projekt → fliken **"Egenkontroll & checklistor"** → välj branschmall ("Egenkontroll – …") → bocka av punkter → foto → **signera** → **ladda ner PDF**.
- [ ] Bekräfta att branschmallarna dyker upp (kräver A4 — `branch` satt).

### D3. Förtroendetrappan
- [ ] `/dashboard/agent` → autonomi-panelen visar **"Förtroendetrappan"** med facit per förmåga, eller "för lite data än (n av 5)" om < 5 godkännanden. (Fylls på i takt med pilot-användning.)

---

## E. Dokumentation att ge Christoffer
- [ ] **Fortnox:** sköts manuellt tills licensfrågan löst — markera betalningar i båda system.
- [ ] **En person per deal/offert åt gången** (ingen optimistic locking ännu).
- [ ] **Max ~20 fakturor/kunder per sync** (när Fortnox aktiveras) — undvik rate-limit.
- [ ] **Webolia:** använd den pre-skapade `lead_sources`-raden (A3).

---

## F. GO / NO-GO
**GO för TestFlight-pilot när:** A1–A4 gröna · C1–C3 passerade · D1–D3 sanity-checkade.
**Ej blockerande för pilot:** B5 account deletion (App Store-krav), R2 ÄTA-mail, R9 UI-stubbar.
**Externt:** Fortnox-licens (måndags-uppgift, ej kod).
