# Grön teknik-avdrag — spec för beslut (2026-07-12)

_Sprint E. Beslutsunderlag för Andreas — INGET byggt än. Skattefakta verifierade
mot Skatteverket (research 2026-07-12). Kodreferenser mot faktisk kodbas._

## Varför

El-segmentet (laddbox, solceller, batteri) kan inte offereras korrekt idag —
grön teknik-avdraget saknas helt i motorn. Konkurrenslägget: nordiska incumbents
har det inte som AI-yta; det är den billigaste moat-vinsten eftersom ROT-motorn
finns att bygga vidare på. MEN grön teknik är INTE "bara nya parametrar i
ROT-motorn" — basen skiljer sig fundamentalt (se nedan), därav denna spec.

## Skattefakta (Skatteverket, 2026 — verifierat)

| Kategori | Sats 2026 | Bas |
|---|---|---|
| Solceller (nätanslutet) | **15 %** | arbete **+** material |
| Lagring egenproducerad el (batteri) | **50 %** | arbete + material |
| Laddningspunkt elfordon (laddbox) | **50 %** | arbete + material |

- **Solceller sänktes 20 % → 15 %** för slutbetalning efter 2025-06-30. Batteri
  + laddbox oförändrat 50 %.
- **BASEN = arbete + material** (hela installationskostnaden på installatörens
  faktura). Detta är kärnskillnaden mot ROT (arbete-bara). Undantag: köper
  kunden materialet separat räknas bara arbetet.
- **Årstak: 50 000 kr/person/år**, SEPARAT från ROT/RUT-taket (en person kan
  använda både ROT 50k och grön teknik 50k samma år). Två ägare i samma
  bostad → 100 000 kr.
- **Fakturamodellen**, samma form som ROT: kund betalar faktura minus avdrag,
  installatören begär utbetalning från Skatteverket.
- **MEN separat e-tjänst/blankett**: "Begäran om utbetalning – Installation av
  grön teknik" (**SKV 4557**) via e-tjänsten "Grön teknik – företag" — INTE
  samma XML som ROT. Ombud via SKV 4863.
- **Ömsesidigt uteslutande med ROT per rad** — samma krona kan inte ge både ROT
  och grön teknik. Dela jobb i separata rader (ex. takbyte = ROT, solpaneler =
  grön teknik).
- Kräver: privatperson som äger bostaden (småhus/bostadsrätt/ägarlägenhet),
  personnummer + fastighetsbeteckning/BRF-org.nr, installatör med F-skatt,
  inlämnat elektroniskt senast 31 jan året efter betalning.

## Så ser ROT-motorn ut idag (att bygga på)

- Rad-nivå: `rot_rut_type` (dropdown 'rot'/'rut'/null) i `lib/types/quote.ts`.
  **TEXT-kolumn UTAN CHECK-constraint** (`sql/v10_quote_improvements.sql`) →
  nya värden kräver INGEN migration på radnivå.
- Beräkning: `lib/quote-calculations.ts` — bas = `labor_amount ?? lineTotal`
  (arbete-bara), `rotDeduction = min(rotWorkCost × 0.30, 50000)`.
- Årstak: `lib/rot-rut-limits.ts` — `ROT_MAX_PER_YEAR = 50_000`, `getUsedDeductions`.
- Persistens på quotes: `rot_work_cost`, `rot_deduction`, `rot_customer_pays`,
  `rot_enabled` (`sql/quote_overhaul.sql`).
- Skatteverket-inlämning ROT: `lib/skv/*` + `app/dashboard/invoices/rot-payment/`
  (XML v6). Grön teknik behöver EGEN motsvarighet (SKV 4557, annat format).

## Designförslag

**Rad-nivå:** utöka `RotRutType`-unionen med tre värden:
`'gron_solceller' | 'gron_lagring' | 'gron_laddpunkt'` (tre, inte ett — olika
satser). Dropdown i offert-editorn får en "Grön teknik"-grupp. Ingen
radmigration (TEXT utan constraint).

**Beräkning** (`lib/quote-calculations.ts`): ny gren där bas = **hela
radtotalen** (INTE labor_amount) × kategorisats, ackumuleras separat från
rotWorkCost. Satser i en konstant-map. Eget tak `min(gronBas × sats, 50000)`.
Mutual exclusion är gratis — en rad har ETT `rot_rut_type`-värde.

**Årstak** (`lib/rot-rut-limits.ts`): `GRON_TEKNIK_MAX_PER_YEAR = 50_000`, egen
`getUsedDeductions`-spårning separat från ROT/RUT.

**Beslut A — persistens:** (1) parallella `gron_*`-kolumner på quotes (som ROT,
kräver migration `sql/v72`), eller (2) compute-on-read i Fas 1 (ingen migration).
→ **Rekommendation: (2) i Fas 1** — motorn räknar rätt och kunden ser rätt
avdrag utan migration; lägg kolumner först när Skatteverket-inlämningen byggs.

**Beslut B — solcellssats-datum:** 15 % gäller slutbetalning efter 2025-06-30.
Alla nya installationer 2026 = 15 %. Enkelt: hårdkoda 15 % (ingen historik
behövs för en ny produkt). → **Rekommendation: hårdkoda 2026-satserna**, med
konstant-map så de är lätta att uppdatera.

## Scope

**Fas 1 (bygg nu efter godkänt):** rad-typ + beräkning + visning på offert/
faktura/portal (kund ser korrekt grön teknik-avdrag och "att betala"). Kund-PDF
+ signering ärver ROT-mönstret. Verifiering: facit-test à la `tests/rot-split.spec.ts`.

**Fas 2 (senare, egen sprint):** Skatteverket-utbetalning (SKV 4557,
e-tjänsten "Grön teknik – företag") — separat format från ROT-XML, egen modul
`lib/skv/gron-teknik-*`. Fortnox-kunder: kolla om Fortnox redan hanterar grön
teknik (som med ROT) → exkludera i så fall, undvik dubbelrapportering.

## Öppna beslut för Andreas
1. Persistens Fas 1: compute-on-read (rek.) eller `gron_*`-kolumner direkt?
2. Bekräfta satserna: solceller 15 %, batteri 50 %, laddbox 50 % (2026).
3. Fas 2-inlämning nu eller senare? (Rek. senare — Fas 1 ger kundvärdet direkt;
   inlämningen är lågfrekvent admin som kan skötas manuellt i e-tjänsten först.)
4. Default-typ: ska laddbox/batteri-artiklar i produktbanken auto-föreslå grön
   teknik (som är bättre än ROT för dessa)? (Rek. ja — Daniel/produktbank vet
   artikeltyp.)

## Verifiering (när byggt)
`npx tsc --noEmit` 0 fel, `npx next build` rent, facit-test för de tre
kategorierna (bas=arbete+material, tak 50k, mutual exclusion mot ROT),
verifiering mot riktig offert i portalen.
