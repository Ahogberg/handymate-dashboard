# Pilot-feedback från Christoffer (Bee Service) — 2026-05-14

Tre punkter rapporterade. Status efter audit:

- **#1 Logotyp visar "B" istället för uppladdad logo** — sannolikt data-bug, inte kod-bug
- **#2 Standardtexter per kundtyp (BRF / Privat / Företag)** — verklig feature gap, denna plan
- **#3 Kundens referens-fält ej förvalt** — koden gör det redan, behöver utredas separat (väntar på Christoffers steg)

---

## #1 — Logo-bug — DIAGNOS-STEG (kräver din input)

**Hypotes:** `business_config.logo_url` är NULL eller pekar på otillgänglig fil. Render-fallback i [lib/quote-templates/modern.ts:156-158](../lib/quote-templates/modern.ts) → "B" matchar exakt symptomet.

**SQL att köra i Supabase SQL Editor:**

```sql
SELECT
  business_id,
  name,
  logo_url,
  CASE
    WHEN logo_url IS NULL THEN 'NULL — upload sparades aldrig'
    WHEN logo_url = '' THEN 'TOM STRING — upload misslyckades'
    ELSE 'URL FINNS — testa öppna den i webbläsare'
  END AS diagnos
FROM business_config
WHERE name ILIKE '%bee service%' OR business_id ILIKE '%bee%';
```

**Beslutsträd efter resultat:**

| Resultat | Trolig orsak | Fix |
|----------|-------------|-----|
| `logo_url IS NULL` | Upload-flödet sparade aldrig till DB | Audit `/app/api/business/logo/route.ts` upload-handler + Settings-UI |
| `logo_url` finns men URL ger 404/403 | Supabase Storage-bucket `business-assets` saknar public read-access, eller fil raderad | Sätt bucket public + kolla att fil finns |
| `logo_url` finns och URL fungerar i webbläsare | CORS-block när PDF/portal försöker ladda | Lägg `business-assets`-bucket på CORS-whitelist |

→ **Action:** Andreas kör SQL, rapporterar resultat. Sen fixar jag.

---

## #2 — Standardtexter per kundtyp — PLAN

### Beslut

- **Schema-strategi:** Lägg till `customer_type` (nullable) på befintliga `quote_standard_texts`-tabell. `NULL` = "gäller alla kundtyper" (bakåtkompatibel default).
- **Datavärden:** `'private'`, `'company'`, `'brf'` — matchar exakt `customer.customer_type` som redan finns i `sql/pilot_fixes.sql:24`.
- **Fallback-ordning vid offert-skapning:** specifik kundtyp → NULL (generisk) → ingen text. Aldrig krasch.
- **Edge case:** Om användaren redan redigerat texten manuellt och sen byter kund → byt inte ut, för att inte förlora arbete. Bara prefyll vid initial kundval.

**Varför kolumn istället för separat tabell:**
Befintliga texter behåller `customer_type=NULL` automatiskt = inga migrationsproblem, ingen kod-disruption, alla nuvarande offerter fortsätter fungera. Matchar "Simplicity First" i CLAUDE.md.

### Implementation — checkable items

#### Schema (1 SQL-fil)
- [ ] Skriv `sql/v14_quote_texts_customer_type.sql`:
  - `ALTER TABLE quote_standard_texts ADD COLUMN customer_type TEXT CHECK (customer_type IN ('private', 'company', 'brf'))`
  - Drop befintliga UNIQUE-index och ersätt med ett som inkluderar customer_type: `(business_id, text_type, customer_type, name)` (för att `is_default` kan finnas en per kombo)
  - Drop+create `idx_quote_standard_texts_biz_type` → `(business_id, text_type, customer_type)`
- [ ] Andreas kör SQL manuellt i Supabase (per CLAUDE.md-regel — aldrig programmatiskt)

#### API
- [ ] [app/api/quote-standard-texts/route.ts](../app/api/quote-standard-texts/route.ts):
  - GET stödjer `?customer_type=brf` query — filtrera där `customer_type = ?` ELLER `customer_type IS NULL`, sortera så specifik kommer först
  - POST stödjer `customer_type` i body (nullable — backwards compat)
  - PATCH/PUT (om finns) — samma

#### Settings-UI
- [ ] [app/dashboard/settings/quote-texts/page.tsx](../app/dashboard/settings/quote-texts/page.tsx):
  - Lägg till kundtyp-väljare i text-editorn (Alla / Privat / Företag / BRF)
  - Visa kundtyp som badge på text-kort i listan
  - "Skapa ny text" — välj typ + kundtyp
  - Behåll `is_default` men nu per (text_type, customer_type)-kombo

#### Offert-skapning + redigering
- [ ] [app/dashboard/quotes/new/page.tsx](../app/dashboard/quotes/new/page.tsx):
  - I `fetchStandardTexts()` (rad 598-620): hämta utan filter, behåll all data i state
  - Skapa hjälpfunktion `getDefaultText(textType, customerType)` som applicerar fallback-ordning
  - I `onCustomerSelect`-handler (där customer_reference prefylls, rad ~719): om text-fälten är tomma eller matchar tidigare default → fyll om med kundtyp-specifik default
- [ ] [app/dashboard/quotes/[id]/edit/page.tsx](../app/dashboard/quotes/[id]/edit/page.tsx) — samma pattern

#### Seed-data (frivillig)
- [ ] Överväg: ska vi seeda 3 default-texter per text_type (en per kundtyp) för Bee Service? Eller låter vi Christoffer skapa själv?
  - **Förslag:** Låt Christoffer skapa själv — han vet bäst hur en BRF-text skiljer sig från en privat-text för sin verksamhet.

### Verifiering (per CLAUDE.md acceptanskrav)
- [ ] `npx tsc --noEmit` — noll fel
- [ ] `npx next build` — ren build
- [ ] Manuellt test: skapa BRF-text i Settings → välj BRF-kund i ny offert → texten ska auto-fyllas
- [ ] Manuellt test: privat-kund + ingen privat-specifik text → fallback till NULL-text (gäller alla)

### Estimat
**4-6 timmar fokuserat arbete** (schema 30 min + API 1h + Settings-UI 2-3h + offert-prefyllning 1h + verifiering 1h).

### Risker
- **R1:** Befintliga `is_default`-rader kan ha duplicates när vi byter UNIQUE-index — SQL bör hantera detta (alla nuvarande texter får `customer_type=NULL` så ingen duplikering vid migration).
- **R2:** Settings-UI:s nuvarande tabs är per `text_type`. Att lägga in kundtyp-väljare gör UI:t mer komplext. Riskerar förvirring för hantverkare. **Mitigering:** Visa kundtyp tydligt i listan, default till "Alla" vid skapande.
- **R3:** Om Christoffer förväntar sig automatiskt seedade BRF-texter — han måste skapa själv. Förtydliga vid leverans.

---

## #3 — Customer reference paradox — Väntar

Koden i [app/dashboard/quotes/new/page.tsx:719](../app/dashboard/quotes/new/page.tsx) gör redan `setCustomerReference(customer.name)` vid kundval. Christoffer säger det inte fungerar.

Behöver veta från Christoffer:
- Vilken flow? (Ny offert från Kunder-vyn? Från Lead-konvertering? Från Kopiera offert?)
- Screenshot av tomt fält
- Om `customer.name` ens är ifyllt på hans kunder (kanske han bara fyller `company_name`?)

→ **Action:** Be Andreas följa upp med Christoffer.

---

## Status

- [x] SQL-diagnos kördes 2026-05-14 → flera business_config-rader för "Bee Service", logo_url finns på `biz_21wswuhrbhy` (prod-konto med 3 @beeservice.se-användare). URL fungerar i webbläsare.
- [x] Christoffer bekräftad inloggad på `biz_21wswuhrbhy` via christoffer@beeservice.se → **kod-bug, inte data-bug**
- [x] **#1 Logo-bug FIXAT 2026-05-15** — se Review nedan
- [ ] Vänta på godkännande av plan för #2 (kundtyp-standardtexter) innan implementation
- [ ] Vänta på Christoffer-input för #3 (vilken flow han använder + om customer.name är ifyllt)

---

## Review — #1 Logo-bug fix (2026-05-15)

### Root cause
`useBusiness()` från [lib/BusinessContext.tsx](../lib/BusinessContext.tsx) returnerar en `Business`-typ med bara 7 fält — **inget logo_url**. Men [app/dashboard/quotes/new/page.tsx:441](../app/dashboard/quotes/new/page.tsx) gjorde `(business as any).logo_url || null` på 14 olika fält. `as any`-casten gjorde TypeScript blint → alla blev `undefined` → fallback till `null` → ModernCanvas föll tillbaka till `name.charAt(0).toUpperCase()` = "B".

Bug aktiverades bara i `previewMode === 'live'` (default på new-sidan). Edit-sidan har inte 'live'-läge → opåverkad. PDF-routen och preview-html-routen fetchade alltid `business_config` separat → opåverkade.

Sekundär bug: `/quote/[token]` (kund-vy innan portal-redirect) hämtade aldrig logo_url från backend och visade Zap-blixt istället. Inte vad Christoffer rapporterar, men samma rot-symptom (saknad data).

### Ändrade filer

| Fil | Ändring |
|-----|---------|
| [app/dashboard/quotes/new/page.tsx](../app/dashboard/quotes/new/page.tsx) | Lade till `businessConfig`-state, utvidgade `fetchData()`-select med 16 nya kolumner (logo_url, address, phone_number, m.fl.), bytte alla `(business as any).XXX` i `liveTemplateData` mot `businessConfig?.XXX` med fallback till context-fält där relevant. Uppdaterade useMemo-deps. |
| [app/api/quotes/public/[token]/route.ts](../app/api/quotes/public/%5Btoken%5D/route.ts) | Utvidgade business-select med `logo_url, accent_color`, returnerar dem i response. |
| [app/quote/[token]/page.tsx](../app/quote/%5Btoken%5D/page.tsx) | Utvidgade `BusinessInfo`-typen med `logo_url` + `accent_color`, ersatte hård-kodad Zap-ikon med logo-rendering (img-tag med onerror-fallback till företagsinitial; om varken logo eller namn finns, fallback till Zap). |
| [tasks/lessons.md](lessons.md) | Lade till lärdom om `(obj as any).field`-anti-pattern. |

### Verifiering
- [x] `npx tsc --noEmit` → exit 0, noll fel
- [x] `npx next build` → exit 0, alla 371 sidor genererade. Pre-existing miljö-warnings (saknad SUPABASE_URL i .env.local för cron-routes) är inte introducerade av detta fix.
- [ ] Manuellt: Christoffer behöver verifiera att logon nu syns i offert-preview när han skapar ny offert.

### Tech-debt noterat (ej i scope för detta fix)
- `BusinessContext` har en minimal 7-fälts type. Många andra ställen i kodbasen använder `(business as any).XXX` (sökbart med grep). Skulle vara eleganta att utöka typen + provider, men det påverkar 10+ filer. Föreslås som separat refactor-task.
