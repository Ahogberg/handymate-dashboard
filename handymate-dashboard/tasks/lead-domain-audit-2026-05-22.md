# Lead-domän-audit — Handymate

**Datum:** 2026-05-22
**Syfte:** Förstå varför Bee Service-pilot har 56 deals utan `lead_id` (43 "manual" + 13 "Webolia X") trots att vi byggt lead-portal-infrastruktur tidigare. Kartlägga vad som finns, vad som används, vad som är frånkopplat.
**Metod:** Två parallella Explore-agenter mot UI-flöden, API-routes och tabeller.

---

## TL;DR

- **Lead-portalen och partner-portalen är två olika system** med olika syften. Partner-portalen är ett **referral-system** (provision för värvning), inte ett lead-submission-system.
- **Lead-portalen skapar lead-rader men aldrig deals.** Auto-deal sker bara via `/api/leads/intake` (Golden Path).
- **Webolia-deals är manuellt skapade fritext-deals.** Andreas öppnar `/dashboard/pipeline`, klickar "Ny deal", skriver "Webolia Bygg & Snickeri" som source. Ingen koppling till eventuella lead-portal-leads.
- **`fireEvent('lead_received')` är dead-letter** — ingen automation-handler skapar deal från det.
- **Frånkopplingen är systematisk:** lead-flödet → deal-flödet bryts på alla portal-baserade vägar. Bara Golden Path har attribution-kedjan intakt.

---

## 1. Alla vägar lead/deal kan skapas

### Deal-create (2 källor)

| Endpoint | Vem anropar | Sätter `lead_id`? | Källa för `source` | Status |
|---|---|---|---|---|
| `app/api/leads/intake/route.ts:189` (Golden Path auto-deal) | Server, efter intake | ✓ Ja (rad 193) | `sourceName.toLowerCase()` från `lead_sources.name` | Aktiv |
| `app/api/pipeline/deals/route.ts:328` (manuell "Ny deal") | UI-användare | ✗ Nej | Från POST body (fritext, default `'manual'`) | Aktiv — **detta är vägen för Bee Service 56 deals** |
| `app/api/widget/chat/route.ts:295` (widget-konvertering) | Widget-konversation | ✗ Nej (ingen lead-rad alls) | `'website_widget'` | Aktiv |

**Inga andra deal-create-vägar finns.** Verifierat: inga cron-jobs, inga automation-handlers, inga agent-tools skapar deals automatiskt. `lib/pipeline/automations.ts` hanterar bara UPPDATERINGAR av deals (stage-ändringar, auto-project-creation), inte create.

### Lead-create (5 källor)

| Endpoint | Sätter `source` | Skapar deal samtidigt? | Status |
|---|---|---|---|
| `app/api/leads/intake/route.ts:159` (Golden Path) | `sourceName.toLowerCase()` | ✓ Ja | Aktiv |
| `app/api/lead-portal/[code]/route.ts:161` (extern portal) | `source.name.toLowerCase()` (från `lead_sources.name`) | ✗ Nej | Aktiv men **frånkopplad från deal-flödet** |
| `app/api/voice/incoming/route.ts:131` (46elks inbound call) | `'phone_call'` | ✗ Nej | Aktiv |
| `lib/matte/action-executor.ts:85` (Matte autonomous action) | `{signal.channel}_inbound` | ✗ Nej | Aktiv |
| `app/api/agent/trigger/tool-router.ts:802` (`qualify_lead`-tool) | Från params.source | ✗ Nej | Aktiv |

**Endast Golden Path (intake) skapar lead + deal tillsammans.** Övriga fyra lead-create-vägar producerar lead-rader som kan bli helt orphans om ingen manuellt skapar deal.

---

## 2. Lead-portalen vs Partner-portalen vs Customer-portalen

Tre helt separata system, lätt att förväxla:

### `/portal/[token]` — Customer-portal
- **För:** Befintliga kunder
- **Innehåll:** Kund-vy av egna offerter, fakturor, projekt, meddelanden
- **Auth:** Hemlig token-länk per kund
- **Skapar:** Inget (read-only kundvy)

### `/lead-portal/[code]` — Lead-portal (för partners att skicka leads)
- **För:** Externa partners/leverantörer (Webolia, BRF-hjälpen, m.fl.)
- **Innehåll:** Formulär att skicka in nya leads (namn + telefon obligatoriska)
- **Auth:** `portal_code` från `lead_sources`-tabellen — publik URL men kod-skyddad
- **Skapar:** Lead-rad i `leads`-tabellen + customer-rad om ny. **INGEN deal.**
- **Bekräftelse:** "Lead skickat!" + lead-nummer. Status visas på samma portal.

### `/partners/dashboard` — Partner-portal (referral-system)
- **För:** Hantverkare/säljare som värvar andra företag till Handymate
- **Innehåll:** Login + dashboard med referral-länk, provision-statistik, webhook-config
- **Auth:** JWT-cookie efter login
- **Skapar:** `partners`-rad vid registrering. Webhook fires på events: `trial_started`, `converted`, `plan_upgraded`, `churned`
- **Affärsmodell:** 20% provision i 12 månader för värvade SaaS-kunder
- **Helt separat från lead-submission**

### `lead_sources`-tabellen — konfig för lead-portal

Kolumner:
- `id`, `business_id`, `name`, `portal_code`, `is_active`, `created_at`
- `api_key` (för programmatisk intake)
- `source_type` ('manual' = egendefinierad kanal, 'portal' = leverantörsportal)
- `default_category`, `color`, `notes`

**Saknar:** `webhook_url` (det ligger på `partners`, inte `lead_sources`)

---

## 3. Varför Webolia-deals hamnar som fritext utan `lead_id`

### Verifierat scenario

1. **Andreas konfigurerar "Webolia Bygg & Snickeri"** som `lead_sources`-rad via `/dashboard/settings/lead-sources`. Den får ett portal-code och en API-nyckel.
2. **Webolia-partnern får portal-länken**, kan skicka in leads via `/lead-portal/[code]`. Vid submit:
   - `leads`-rad skapas med `source='webolia bygg & snickeri'`, `lead_source_id=<id>`
   - `customer`-rad skapas eller länkas
   - `fireEvent('lead_received')` fyrar
   - **INGEN deal skapas**
3. **`lead_received`-eventet är dead-letter:** `lib/automation-engine.ts` har ingen built-in handler. Det triggar bara matchande `v3_automation_rules`-rader med `trigger_type='event'`. Om kunden inte har konfigurerat sådan regel → ingenting händer.
4. **Andreas ser leadet** i ... ja, var? `/dashboard/marketing/leads` är BARA outbound-leads (kalla brev). Inbound leads från portal visas inte i en dedikerad UI-vy. Sannolikt visas de bara i dashboards-statistik (lead-count på Today-sidan).
5. **Andreas skapar deal manuellt** via `/dashboard/pipeline` → "Ny deal"-knapp → skriver **"Webolia Bygg & Snickeri"** som source-fritext.
6. **POST `/api/pipeline/deals`** insertar deal med `source` från body, **inget `lead_id`**.

### Konsekvens

- `leads`-tabellen för Bee Service har sannolikt 13+ lead-rader från Webolia-källorna (verifiera nedan)
- `deal`-tabellen har 13 fritext-deals med source="Webolia X"
- **Det finns ingen koppling mellan dem** — varken via `lead_id` på deal eller via någon mapping-tabell
- Datasynkron-attribution är förlorad

### SQL för att verifiera

Kör i Supabase:

```sql
-- Räkna lead-rader per business
SELECT business_id,
       COUNT(*) AS total_leads,
       COUNT(*) FILTER (WHERE source ILIKE 'webolia%') AS webolia_leads,
       COUNT(*) FILTER (WHERE lead_source_id IS NOT NULL) AS via_portal_or_intake
FROM leads
GROUP BY business_id
ORDER BY total_leads DESC;

-- Är Webolia-leads orphans (har ingen motsvarande deal)?
SELECT l.lead_id, l.name, l.source, l.created_at,
       (SELECT COUNT(*) FROM deal d WHERE d.lead_id = l.lead_id) AS via_lead_id,
       (SELECT COUNT(*) FROM deal d WHERE d.customer_id = l.customer_id
          AND d.source ILIKE '%webolia%') AS via_source_match
FROM leads l
WHERE l.source ILIKE 'webolia%'
ORDER BY l.created_at DESC;
```

Förväntat: `via_lead_id = 0` för alla, `via_source_match ≥ 1` för många (= bekräftar att Andreas skapat motsvarande deal manuellt med matchande source-text).

---

## 4. Frånkopplingen: byggd portal vs faktiskt arbetsflöde

### Vad är byggt

- ✅ Lead-portal-UI (publik formulär per partner)
- ✅ Lead-portal-API (skapar lead-rader korrekt)
- ✅ Lead_sources-konfig + UI för att skapa partners
- ✅ Lead-attribution via `source` + `lead_source_id` på lead-raden
- ✅ `fireEvent('lead_received')`-event fyrar
- ✅ Customer-portal helt separat (orörd av denna problematik)

### Vad saknas eller inte används

- ❌ **UI där hantverkaren ser inkommande portal-leads** (dedicated leads-inbox)
- ❌ **"Konvertera lead → deal"-knapp** som tar lead-rad och skapar pipeline-deal med lead_id satt
- ❌ **Automation-handler för `lead_received`** som auto-skapar deal (eller bara skickar notifikation till hantverkaren)
- ❌ **`lead_id` på deal** sätts inte vid manuell pipeline-creation
- ❌ **Notifikation till hantverkaren** när en lead kommer in via portalen (verifiera — finns `notification`-insert i lead-portal-route? Inte i POST-handlern jag läste)

### Resultat: portal-infrastrukturen är BYGGD men FUNKTIONELLT ISOLERAD

Andreas (och troligen alla pilots) ser ingen praktisk fördel av portalen eftersom den inte syns i deras arbetsflöde. Den fungerar som en passiv "lead-inkorg" som ingen läser. När Andreas skapar deals manuellt i pipeline gör han det baserat på email/SMS från Webolia (inte från portal-databasen).

---

## 5. Rekommendation: hur leads-byrå-flödet BORDE fungera

För att lead → deal-attributionskedjan ska fungera (vilket är vad Daniel/Hanna behöver för konvertings-analys) behövs ett ENDA av två val:

### Alternativ A — Auto-deal på portal-inkommande (snabb fix)

Mimik Golden Path: när lead-portal-route skapar en lead-rad, skapa OMEDELBART en motsvarande deal:

```
POST /lead-portal/[code]
  → INSERT leads (source, lead_source_id, ...)
  → INSERT deal (lead_id=<nya lead_id>, source=<lead.source>, stage='new_lead', customer_id=<lead.customer_id>)
  → fireEvent('lead_received')  // för automation-rules
```

**Fördelar:**
- Snabb implementering (~2h kod, samma mönster som intake-route rad 176-203)
- Lead-attribution fungerar omedelbart
- Daniel/Hanna kan analysera lead-källa→konverterings-rate
- Inga UI-ändringar krävs

**Nackdelar:**
- Pipelinen "skräpas" med varje portal-lead, även lågkvalitativa
- Andreas vill kanske trigea/filtrera först innan något hamnar i pipeline
- Manuell kontroll förlorad

### Alternativ B — UI "Konvertera till deal"-knapp (rätt långsiktigt)

Lägg till en lead-inbox-UI (eventuellt på `/dashboard/leads` eller integrerat i pipeline-sidan):
- Visar leads med `lead_source_id IS NOT NULL` (från portalen)
- Status-filter (ny / kontaktad / dödad)
- Knapp "Konvertera till deal" på varje rad
  - POSTar till `/api/pipeline/deals` (eller ny route) med `lead_id=<X>` + `source=<lead.source>` + `customer_id=<lead.customer_id>`
  - Markerar leadet som konverterat
- Eller: dra-och-släpp av lead till pipeline-stage

**Fördelar:**
- Andreas behåller kontroll (filtrera spam-leads först)
- Korrekt lead_id-attribution när konvertering sker
- Synlig "lead-inkorg" för hantverkaren
- Daniel/Hanna analysera både inkomna och konverterade leads (konverterings-rate per källa)

**Nackdelar:**
- Större bygge (~6-8h UI + backend)
- Kräver UX-design för lead-inbox

### Tredje val — gör båda (snabb-fix + senare polish)

1. **Nu:** Alternativ A (auto-deal-create i lead-portal-route) → omedelbart attribution-fix
2. **Senare:** Alternativ B UI-konvertering → bättre kontroll

Detta är samma princip som **Golden Path redan etablerat** för `/api/leads/intake`. Att lead-portal-route inte fick samma auto-deal-creation är troligen en oavsiktlig avvikelse från designen.

### Vid båda alternativen — verifiera

- Att `fireEvent('lead_received')` fortsätter fyra (för befintliga automation-rules)
- Att notifikation skickas till hantverkaren när lead/deal skapas
- Att `lead_source_id` propageras till dealen (så källa kan grupperas även om `source`-string skulle bli ändrat senare)

---

## 6. Bredare upptäckt om lead-domänen

Tre lead-create-vägar utöver Golden Path och portal är också "isolerade" från deal-flödet:

1. **`voice/incoming` (inbound calls)** — Lead skapas, ingen deal. Andreas/hantverkaren måste manuellt skapa deal.
2. **Matte agent (`create_lead`-tool)** — Lead skapas autonomt, ingen deal.
3. **Agent `qualify_lead`-tool** — Lead skapas/uppdateras via agent-konversation, ingen deal.

Samma fix-mönster (auto-deal eller UI-konvertering) gäller alla fyra "isolerade" vägar.

**Widget-chat är inverterad** — skapar deal men inte lead-rad. Det är samma underliggande problem fast spegelvänd. Loggat som TD-72.

---

## Sammanfattning

| Aspekt | Status |
|---|---|
| Lead-portal | Byggd, fungerar tekniskt, men funktionellt isolerad från deal-flödet |
| Partner-portal | Helt annat system (referral/provision). Ej relaterad till lead-submission |
| Webolia-deals | Manuellt skapade via pipeline-UI med fritext-source. Inga lead_id |
| Lead → deal-attribution | Fungerar BARA via Golden Path (`/api/leads/intake`). Alla andra vägar är brutna |
| Daniel/Hanna lead-källa-analys | Blockerad — inte pga audit-rapportens "saknad FK" utan pga inkonsistens i hur deals skapas |
| Rekommendation | Alternativ A (snabb auto-deal-create i lead-portal-route) eller Alternativ B (UI-konvertering) — eller båda i sekvens |

---

## Verifierings-källor

- `app/api/leads/intake/route.ts:159, 189`
- `app/api/pipeline/deals/route.ts:328`
- `app/api/lead-portal/[code]/route.ts:161, 187`
- `app/api/widget/chat/route.ts:295`
- `app/api/voice/incoming/route.ts:131`
- `lib/matte/action-executor.ts:85`
- `app/api/agent/trigger/tool-router.ts:802`
- `app/lead-portal/[code]/page.tsx`
- `app/portal/[token]/page.tsx` (kund-portal, för referens)
- `app/partners/dashboard/page.tsx` (referral-system, för referens)
- `app/dashboard/settings/lead-sources/page.tsx`
- `app/api/settings/lead-sources/route.ts`
- `lib/automation-engine.ts:1051-1085` (`fireEvent`)
- `app/dashboard/marketing/leads/page.tsx` (outbound bara, inte inbound)
