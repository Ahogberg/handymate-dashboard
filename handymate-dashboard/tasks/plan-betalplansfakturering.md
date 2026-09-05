# Fakturera enligt betalplan — delfakturor på fastpris

**Beslut Andreas 2026-09-05:** Codex bygger detta i en egen PR, skild från PR #11. Villkor: grön CI, inloggat prov på demokontot och merge senast **10 september**. Annars går punkten till `tasks/efter-lansering.md` utan vidare diskussion. PR #11 ska inte växa med detta.

## Verifierade fakta (2026-09-05, databas + kod — gissa inte vidare)

- `quotes.payment_plan` är en JSONB-array med steg: `{ label, amount, percent, due_description }`. Exempel i produktion: `[{"label":"Vid etablering","amount":9350,"percent":40}, {"label":"sen","amount":14025,"percent":60}]`.
- Användning i dag: 34 offerter, 3 med flera steg, 1 accepterad med flera steg, 1 firma. Litet men verkligt.
- `invoice.invoice_type` finns med typen `InvoiceType = 'standard' | 'credit' | 'partial' | 'final' | 'reminder'` (`lib/types/invoice.ts`). **Ingen kod skapar `'partial'` i dag.** Slutfakturan sätter `'final'` (`app/api/projects/[id]/create-final-invoice/route.ts:407`). Löpande tid/material sätter `'standard'`.
- Fakturakärnan `lib/invoices/create-invoice.ts` tar `invoiceType` i indata (rad ~194) och sköter nummer/OCR. Ingen ny kärna ska skrivas.
- Ingen avräkning finns: slutfakturan tar hela offerten plus godkända ÄTA oavsett vad som redan fakturerats. Betalplanen är i dag bara text på offertdokumentet (`lib/pdf-generator.ts`, `lib/quote-templates/*`).
- Fakturor totalt i produktion: 11 (10 `standard`, 1 `final`).

## Vad som byggs

### 1. Delfaktura per steg — ny rutt `POST /api/projects/[id]/betalplan-faktura`
- `getAuthenticatedBusiness()` + `export const dynamic = 'force-dynamic'`.
- Indata: `steg_index`. Servern läser `quotes.payment_plan` via `project.quote_id` och tar beloppet därifrån. **Klienten skickar aldrig belopp.**
- Skapar via `createInvoice` med `invoiceType: 'partial'`, `project_id`, `quote_id`, en rad `"<label> — a conto enligt betalplan, <percent> %"` med stegets belopp exkl. moms, plus moms enligt offertens `vat_rate`.
- Idempotens: samma steg får aldrig faktureras två gånger. Spara `payment_plan_step` (ny kolumn på `invoice`, heltal, nullable) och slå upp `(project_id, invoice_type='partial', payment_plan_step)` före insert. Migration `sql/v214_betalplan_faktura.sql`, körs av Claude på Andreas stående tillstånd — **skriv filen först och säg till.**
- Läsfel på offert, betalplan eller befintliga fakturor → 503, aldrig "inget fakturerat ännu".

### 2. Avräkning på slutfakturan — `create-final-invoice` och `byggProjektFakturaUnderlag`
- Befintlig-faktura-spärren avgränsas till `invoice_type = 'final'` (samma ändring som redan begärts i PR #11; gör den där, bygg inte dubbelt).
- Slutfakturan får en rad `"Avgår a conto-fakturerat"` med **minus summan av alla `partial`-fakturor** på projektet (exkl. moms). ROT/RUT-basen räknas på arbetsandelen i offerten, inte på nettot efter avräkning — se punkt 4.
- `invoice-preview` visar samma avräkningsrad så förhandsvisningen och den skapade fakturan stämmer överens.
- Summan av delfakturor + slutfakturans netto får aldrig överstiga offert + godkända ÄTA. Kastar om det inträffar, med felmeddelande på svenska.

### 3. Gränssnitt
- På projektsidan, under fakturering: betalplanens steg som lista med status "Ej fakturerad / Fakturerad (nr X) / Betald". Knapp "Fakturera steg" per ofakturerat steg, i ordning.
- Slutfakturaknappen visar "Avgår a conto: X kr" när delfakturor finns.
- All text på svenska, inga tekniska termer. Mobiloptimerat.

### 4. ROT/RUT på a conto — kontrollera regeln före kod
Skatteverket: avdrag begärs per faktura för **utfört och betalt** arbete. En a conto-faktura kan bära avdrag bara om motsvarande arbete är utfört vid faktureringen. Beslut för V1: **delfakturor bär inget ROT/RUT-avdrag**; hela avdraget ligger på slutfakturan, räknat på offertens arbetsandel. Det är konservativt och aldrig fel gentemot Skatteverket. Skriv det i klartext i gränssnittet vid steg-fakturering på ROT-offert.

### 5. Fortnox och kredit
- `partial` måste mappas i Fortnox-exporten som vanlig faktura (kontrollera `lib/fortnox/*` — inget nytt fält behövs, men typen får inte falla i ett `default`-fall som tyst hoppar över).
- Kreditfaktura på en delfaktura ska nollställa dess bidrag till avräkningen. Verifiera att `invoices/credit` sätter samma `project_id`.

## Facit `tests/betalplansfakturering.spec.ts`
- Samma steg två gånger → en faktura, samma kvitto.
- Belopp kommer från `payment_plan`, aldrig från klienten.
- Slutfaktura med två delfakturor → avräkningsrad med rätt minusbelopp; preview och skapad faktura lika.
- `standard`-faktura på projektet blockerar inte slutfakturan; `final` gör det.
- Delfaktura på ROT-offert bär inget avdrag; slutfakturan bär hela.
- Läsfel → 503, ingen insert.
- Källskanning: ingen `Math.random`-summa, inga hårdkodade belopp, `dynamic = 'force-dynamic'`.
- Koppla in i **både** `package.json` `test:contracts` och `.github/workflows/contracts.yml` (paritetstestet kräver det). Inga backslashar i det vikta blocket.

## Utanför scope
- Delbetalning av en utställd faktura (kunden betalar i omgångar) — ligger i efter-lansering.
- Automatiska påminnelser per steg.
- Betalplan på löpande räkning (finns ingen offertsumma att dela).

## Verifiering
- `npx tsc --noEmit` (6 GB heap), `npm run test:contracts`, en serial `npx next build`.
- Kolumnsnapshot `tests/fixtures/production-schema-columns.json` uppdateras när v214 körts.
- Inloggat prov på demokontot: offert med två steg → acceptera → fakturera steg 1 → fakturera steg 1 igen (samma kvitto) → slutfaktura med avräkning → jämför preview och faktura → kreditera steg 1 och kontrollera att avräkningen följer med.
