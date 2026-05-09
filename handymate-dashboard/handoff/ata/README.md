# Handoff: ÄTA — pixel-mockuper

Mockup-filer från Claude Design 2026-05-09. Sex artboards (4 mobile + 2 desktop) som visualiserar ÄTA-flödet enligt TD-21.

## Filer i denna katalog

- [screens.jsx](screens.jsx) — React-komponenter för alla sex skärmar. Pure-render, ingen runtime-state. Använder helper-globals från `design-canvas.jsx` + `ios-frame.jsx` (ligger i mobile-repot, ej här).

> Mojibake i svenska tecken är ett känt artefakt från upload-konvertering. Filen är funktionellt OK — text är i string-literals, inte identifiers. Rensa vid sweep om relevant.

## Sex skärmar

### Mobile (iOS, 402×874)

| ID | Titel | Syfte |
|---|---|---|
| `m-booking` | Jobbdetalj med ÄTA-sektion | Visar hur ÄTA syns på en aktiv booking — list-rad per ÄTA, status-pill, expand för items, FAB för "+ Tilläggsarbete" |
| `m-create` | Skapa-ÄTA bottom sheet | Form med typ-segment (Tillägg/Ändring/Avgående), rader med name/quantity/unit/price, autosave-indikator, total-card |
| `m-send` | Skicka för signering | Bekräftelse-sheet med kanal-val (SMS aktiv, Email "kommer snart"), recipient + förhandsvisning av SMS-text |
| `m-project` | Projekt-detalj (minimal) | Stack-metaforen — original-offert + ÄTA staplade, total uppdateras dynamiskt |

### Desktop (1180px)

| ID | Titel | Syfte |
|---|---|---|
| `d-project` | Projekt-sida med stack-totalsumma | Hero med beräknad total + breakdown per ÄTA. Lista av tilläggsarbeten med expand/collapse. Inline "+ Nytt tilläggsarbete" |
| `d-invoice` | Faktura-förhandsgranskning · två sektioner | Faktura med två tydliga blocks: "Enligt offert" (låst) + "Tilläggsarbeten" (signerade ÄTA). Sidebar med varning om ej signerade utkast saknas i fakturan |

## Designval värda att lyfta

**Stack-metaforen** är genomgående — original-offert ligger som låst grundsten, signerade ÄTA staplas på, dynamisk totalsumma uppdateras. Visuellt återanvändbar både mobile (skärm 4) och desktop (skärm 5 + 6).

**Status-färger:**
- `draft` (grå) — utkast hos hantverkaren, inte skickat
- `sent` (blå) — skickat, väntar på kund
- `signed` (teal) — signerat, klar för fakturering
- `declined` (röd) — kund avvisade, line-through på rubrik
- `invoiced` (lila) — finns på faktura
- `pending` (amber) — *ej använd i mockuparna*, finns för framtida ev. mellantillstånd

**Type-badges:**
- Tillägg (grön +) — höjer total
- Ändring (amber ↻) — modifierar existerande, kan vara ±
- Avgående (röd −) — sänker total

**Faktura-warning** (skärm 6 sidebar) — om ÄTA är `draft` när faktura skapas, varnar UI:n att den missas. Tre val: skicka för signering först, hoppa över, eller redigera fakturan manuellt. Backend-implementationen behöver matcha.

## Backend-implications

Mockuparna avslöjar inga schema-ändringar utöver vad som finns idag:

- ✅ `project_change.items JSONB` räcker för rad-baserade items (mockup använder `name`, `description?`, `quantity`, `unit`, `unit_price`)
- ✅ `project_change.status` täcker alla 6 statusar i mockupen (audit 2026-05-09)
- ⚠️ **Kanal-val för send:** Mockup visar SMS aktiv + Email "kommer snart". Backend `/api/ata/[id]/send` har `method: 'sms' | 'email'` men email är TODO i koden. Mobile bör default till SMS.
- ⚠️ **Faktura-flöde:** Skärm 6 antyder att signed ÄTA + projekt-completion ska generera faktura med tydlig sektionering. Audit av `lib/projects/auto-invoice-on-complete.ts` behövs för att verifiera att signerade `project_change` rader inkluderas under egen sektion.
- ❌ **Item-foton stöds inte** — mockuparna visar inga foton, så inget gap här. Om foton behövs i framtid: TD-22 separat.

## Referens

- Design-doc: [tasks/booking-type-implementation.md](../../tasks/booking-type-implementation.md) (besläktad design för booking-flöde)
- Tech-debt: [tasks/tech-debt.md](../../tasks/tech-debt.md) — TD-21 dokumenterar scope för mobile-UI-implementation
- Schema-audit utförd 2026-05-09 — se chathistorik för full audit-resultat (items-shape, status-värden, send-route body)
