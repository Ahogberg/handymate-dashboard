# Offert-identitet + "Vår referens" — spec & plan

_Datum: 2026-07-08 · Grund: kartläggning (agent ad7a72ff) + Andreas designbeslut._
_Pilotfeedback: kundoffisar visar kontoägarens (admin) namn/tel/mail även när en annan
användare skapar offerten; "Vår referens" renderas inte i kunddokumentet._

## Designbeslut (låsta av Andreas)
1. **Avsändaren = skaparens uppgifter.** Kunddokumentets avsändarblock visar den SKAPANDE
   användarens namn/telefon/mail (från `business_users`). Företagsnamn, orgnr, adress, logga,
   bankgiro m.m. behålls från `business_config`. Fallback till ägarens `business_config`-
   kontaktfält när `created_by` saknas (alla gamla offerter → oförändrade).
2. **"Vår referens" = skaparen, auto men redigerbar.** Vid skapande förifylls det befintliga
   `reference_person`-fritextfältet med skaparens namn om det är tomt; hantverkaren kan skriva
   över. EN person. Renderas i kunddokumentet (idag dött — sparas men mappas aldrig till mallarna).

## Root cause (verifierat)
- Identitet renderas enbart ur `business_config` i `lib/quote-templates/data-builder.ts:229-231`
  (contactName/phone/email). Ingen `created_by`-kolumn på quotes; `getCurrentUser` hämtas i
  POST men kastas efter behörighetskollen.
- `reference_person` (sql/quote_overhaul.sql:19) sparas + editeras + syns i INTERN preview
  (`components/quotes/QuotePreview.tsx`), men `data-builder` mappar det aldrig → mallarna
  (modern/premium/friendly) renderar det aldrig för kund.
- `business_users`: id, name, email, phone, title, role, user_id (sql/business_users.sql).
  `getCurrentUser(request)` → hela posten (permissions.ts:124, select *).

## Avgränsning
- EN referensperson (ej fleranställd-väljare — separat framtida bygge; ingen quote↔anställda-
  tabell byggs nu). Rör inte execution-chain/approvals. Legacy/AI-offerter oförändrade
  (fallback-vägen). Signeringsflöde orört.

---

## Bygge — branch feat/offert-identitet från main (har produktbanken)

### Commit 1 — SCHEMA: sql/v68_quote_created_by.sql (Andreas kör manuellt)
```sql
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES business_users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_created_by ON quotes(created_by) WHERE created_by IS NOT NULL;
```
Additiv + nullable → noll påverkan på befintliga offerter. → STOPP: Andreas kör mot prod.

### Commit 2 — CAPTURE: app/api/quotes/route.ts POST
- Sätt `created_by: currentUser.id` i insert-datat (currentUser hämtas redan via getCurrentUser).
- Default: om `reference_person` saknas/tom i payloaden → sätt `currentUser.name`. Fyller på
  redan ifyllt fält orört (hantverkarens override vinner).
- Ingen ändring i PUT (redigering av gammal offert byter inte skapare).
- Test `tests/quote-created-by.spec.ts`: ren funktion `resolveReferencePerson(payloadRef, creatorName)`
  extraheras till lib och testas (tom → creator, ifylld → behålls, whitespace → creator).

### Commit 3 — RENDER: data-builder + types + mallar
- `lib/quote-templates/data-builder.ts`: ny valfri param `creator?: { name; phone; email } | null`.
  Business-blockets contactName/phone/email → `creator?.name ?? config?.contact_name || ...`
  (skaparen först, annars exakt dagens fallback-kedja). Lägg `referencePerson:
  quote.reference_person || null` i returobjektet (utanför business — egen fält).
- `lib/quote-templates/types.ts`: `QuoteTemplateData.referencePerson?: string | null`.
  (Business-blocket behåller sina fält; bara källan byts i builder.)
- Routes som bygger kunddata hämtar skaparen och skickar in:
  `app/api/quotes/pdf/route.ts`, `app/api/quotes/public/[token]/route.ts`,
  `app/api/quotes/send/route.ts`, `app/api/quotes/preview-html/route.ts` — där quote hämtas,
  lägg `created_by` i `.select()` + hämta `business_users` (name/phone/email) för det id:t
  (en query, null om saknas) och skicka som `creator` till buildQuoteTemplateData.
- Mallarna (`modern.ts`/`premium.ts`/`friendly.ts`): rendera "Vår referens: {referencePerson}"
  som en rad i avsändar-/metadatasektionen (escapeHtml, villkorad — visas bara när satt).
  Avsändarblockets namn/tel/mail behöver ingen ändring i mallen (data-buildern har redan bytt
  källan). Verifiera att interna QuotePreview fortsatt visar samma sak (den läser referencePerson).
- Test `tests/quote-sender-identity.spec.ts`: buildQuoteTemplateData med creator satt →
  business.contactName/phone/email = skaparen; utan creator → business_config-fallback;
  referencePerson mappas.

### Verifiering per commit
`npx tsc --noEmit` 0 fel · `npx next build` ren (bara pre-existing fortnox-sync) ·
enhetstester gröna · fallback bevisad (gammal offert utan created_by → ägaren, oförändrat).

### Slutverifiering
- Skapa offert som icke-ägare → kunddokument (PDF + public + portal) visar SKAPARENS namn/
  tel/mail, företagsnamn/logga kvar.
- "Vår referens" syns i kunddokumentet, förifylld med skaparens namn, redigerbar.
- Gammal offert (utan created_by) → ägarens uppgifter, exakt som förr.
