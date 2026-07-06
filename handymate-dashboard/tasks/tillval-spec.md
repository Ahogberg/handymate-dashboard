# Tillvalsrader (option rows) — design-spec

_Datum: 2026-07-06 · Status: design godkänd av Andreas ("Kör!")_
_Beslut låsta: v1 = KRYSSRUTOR (alternativ-grupper = v2) · radtyp 'option' i quote_items ·
server-side omräkning vid signering · "Förvald"-toggle per rad_

## Mål

Hantverkaren markerar rader som **tillval**; kunden **kryssar i/ur dem** i
portalen/offertvyn med live-uppdaterad totalsumma och signerar med sina val.
Uppsäljningsmotor med beprövad psykologi (kunden väljer själv → högre acceptans).

**Efterfrågebevis:** piloten (Christoffer) hackar detta manuellt idag —
"OPTION: Måla hela ytan ( Väggar & Tak)" som text i beskrivningsfältet
(verifierat i skärmdump + kodbas: ingen option-funktion existerar).

## Datamodell — sql/v66 (manuell körning FÖRE deploy)

```sql
-- v66_quote_option_rows.sql (körs manuellt i Supabase FÖRE deploy av UI:t —
-- T4-skyddet i quotes-API:t failar numera HÖGLJUTT på ogiltig item_type,
-- så option-rader före migreringen = misslyckade sparningar)
ALTER TABLE quote_items DROP CONSTRAINT IF EXISTS <namn på item_type-CHECK>;
ALTER TABLE quote_items ADD CONSTRAINT <samma namn>
  CHECK (item_type IN ('item','heading','text','subtotal','discount','option'));
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS option_selected BOOLEAN DEFAULT false;
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS option_default  BOOLEAN DEFAULT false;
```
(Implementationsplanen pinnar constraint-namnet ur sql/quote_overhaul.sql:48 —
verifieras, gissas ej. option_selected initieras från option_default vid skapande.)

## EN sanning för summan

`calculateQuoteTotals` (lib/quote-calculations.ts) räknar `option`-rader
**endast när `option_selected === true`**, inkl. ROT/RUT-berättigade tillval i
avdragsmattan. Samma funktion driver editor, alla previews och serverns
omräkning vid signering — ingen yta räknar själv. `recalculateItems` bevarar
option-fälten.

## Editorn (new + edit via delade sektioner)

- "Tillval" läggs i "Fler alternativ"-menyn (`QuoteNewItemsSection` +
  `QuoteEditItemsSection` — byte-identiska idag, håll dem så).
- Option-rad = som item-rad (namn/antal/pris/ROT-dropdown) + **"Förvald"-toggle**.
- `createDefaultItem('option')`: quantity 1, option_selected = option_default.

## Rendering (alla ytor, samma itemType-branch som offert-fixen)

- **Previews (Live/Slutdesign/Kompakt):** tillvalsrad med kryss-symbol
  (☑ när option_selected/förvald, ☐ annars) + pris, visuellt skild från
  vanliga rader ("Tillval"-badge).
- **PDF/HTML-mallarna (modern/premium/friendly):** "Tillval"-sektion; osignerad
  offert visar noten "Välj dina tillval i kundportalen innan du signerar";
  signerad visar kundens faktiska ☑/☐. `QuoteTemplateItem` får
  `optionSelected?: boolean` (itemType 'option' finns redan i unionen efter
  offert-fixen — verifieras).
- **Data-builder:** mappar option-rader med selected-state; totalsumman i
  dokumentet = calculateQuoteTotals-resultatet (aldrig items-summering).

## Kundytorna — interaktivt val + signering

**En datakälla, en signerings-väg, två ytor** (verifierat under offert-auditen:
portalens signerings-modal POST:ar redan till `/api/quotes/public/[token]`,
som redan returnerar `structured_items`):

1. **Publika `/quote/[token]`** + **portalens signerings-modal** renderar
   option-rader som **kryssbara** (init från option_selected) med live-total
   (klientberäkning för visning — matchar calculateQuoteTotals semantik).
2. **Sign-POST** (`/api/quotes/public/[token]`, action 'sign') utökas med
   `selected_option_ids: string[]`. Servern:
   - validerar att id:na är option-rader på JUST denna offert,
   - skriver `option_selected` per rad,
   - **räknar om totals själv** via calculateQuoteTotals (litar ALDRIG på
     klientens summa) och uppdaterar quotes.subtotal/total/rot-fält/customer_pays,
   - stämplar valen i signatur-metadatan (t.ex. signature-payload/kolumn:
     valda + bortvalda tillval med belopp — juridiskt spårbart).
3. Efter signering: valen låsta (redan-signerad-guarden finns).
4. Portal-modalen hämtar raderna via befintliga publika GET:en med sign_token
   (ingen ny portal-API-yta).

## Nedströms

- **from-quote-fakturan:** tar `option_selected = true`-rader som vanliga
  fakturarader; bortvalda EXKLUDERAS (renderas ej, faktureras ej) men ligger
  kvar i quote_items som data (framtida offert-intelligens: valfrekvens).
- ROT-flaggor på valda tillval följer med (befintlig mekanik).
- Hanna/Daniels uppföljningsflöden: orörda.

## Felhantering & kanter

- Ogiltiga selected_option_ids i sign-POST → 400 (aldrig tyst ignorera).
- Utgången/redan signerad offert → befintliga guards gäller före val-skrivning.
- Klient-total är endast VISNING; avvikelse klient/server är omöjlig som
  sanning (servern skriver).
- Pre-v66: editorn får inte erbjuda "Tillval" om sparning skulle faila →
  deploy-ordningen (v66 först) är grinden; ingen feature-flagga byggs (YAGNI).

## Verifiering (acceptanskrav)

- tsc 0 fel · build ren · enhetstester på calculateQuoteTotals med options
  (vald/ovald/förvald/ROT-berättigad/blandat med rabatt) · render-smoke med
  option-rader genom data-builder + alla tre mallar (inkl. XSS-payload i
  tillvalsnamn).
- Manuellt facit: skapa offert med 2 tillval (ett förvalt) → previews visar
  kryss-look → skicka → kryssa i/ur i portalen med live-total → signera →
  quotes-totals uppdaterade server-side → fakturan innehåller exakt valen →
  PDF:en visar ☑/☐.

## Utanför scope (v2+)

Alternativ-grupper (radio/välj-ett), tillvals-statistik i offert-hjärnan,
tillval efter signering (ÄTA-flödet täcker det), mobil-appens offertbyggare.
