# Handoff — Projektdetaljvyn (omtag)

_Från Claude Design 2026-07-31. Canvas: `Projektvy.html` i Design-projektet
(frames #frame-a–#frame-d mobil, #frame-desk-1/2 desktop). Denna fil +
`copy.projektvy.sv.json` + `DESIGN-NOTES.md` är source of truth för layout,
copy och färger. Mobil (390 px) designas först; desktop är en utökning._

> **Rip and rebuild per sektion.** Patcha inte gamla sektioner — bygg om
> enligt canvasen.

## Ny informationsarkitektur — 16 flikar blir 6

| Ny flik | Ersätter (TabKey) |
|---|---|
| Översikt | `overview` |
| Ekonomi & offert | `economy`, `quote_spec`, `material`, `leverantorer` |
| ÄTA | `changes` |
| Planering | `milestones`, `tasks`, `schedule`, `arbetsorder` |
| Tid & team | `time`, `team` |
| Dokumentation | `checklists`, `field_reports`, `log`, `documents` |

- Desktop: horisontella flikar (höger kolumn). Mobil: samma sex grupper som accordion.
- `canvas` (Rityta) förblir dold, nås via URL-bookmark (TD-75, oförändrat).
- Deep-länkar `?tab=X` mappas: gamla nycklar → ny flik + ankare.

## Sidstruktur

**Mobil (uppifrån):** appbar → titel + chips → statuskort "Hur ligger vi till?"
(fas-stepper + ekonomistaplar + prognosrad) → "Att göra" (primärknapp,
godkänn-kort, åtgärdsrader) → accordion (sex grupper).

**Desktop:** tvåkolumn `400px | 1fr`. Vänsterkolumnen ÄR mobilvyn (samma
komponenter, samma ordning). Höger: flikar + paneler. Primärknappen dubbleras
i sidhuvudet — samma åtgärd, aldrig två olika primärer.

## Primär åtgärd per läge (EN teal knapp)

| Läge | Primärknapp |
|---|---|
| Nystartat (planering, inget nedlagt) | `Boka första besök` |
| Pågående | `Rapportera tid` |
| Klart + ofakturerat | `Godkänn & skicka` (slutfakturan) |
| Nedlagt > offererat | `Skapa ÄTA` |

Allt annat: `btn-secondary` (vit) eller textlänk.

## Komponentåterbruk

- **Godkänn-korten:** samma approvals-API som Idag-vyn, filtrerat på
  `project_id`. INGEN egen godkännande-logik.
  Tagg "Skickas efter ditt OK" på allt utgående.
  _(Implementationsnot efter kodverifiering: någon delad ApprovalCard-fil
  finns inte — korten ligger inline i IdagCore.tsx. Fas 1 extraherar
  persona-kartan till delad modul och bygger projektfiltrerat block mot
  samma endpoints som IdagCore anropar.)_
- **Persona-färger** (IdagCore.tsx AGENT_INFO): Daniel `#d97706`,
  Karin `#2563eb`, Lars `#059669`, Hanna `#9333ea`, Lisa `#0ea5e9`, Matte `#0f766e`.
  Enda tillåtna icke-teal-accenterna.
- **Fas-stepper:** `ProjectStageStrip` omstylad enligt canvasen.
- **Ekonomistaplarna** ersätter `EkonomiPulsCard`s fyra KPI:er — samma
  `/api/projects/[id]/profitability`-payload; `deriveMarginalState()` styr
  prognosraden (en sanning, två presentationer).

## Färger & typografi

- Alla `bg-sky-600` / `text-sky-600` / `ring-sky-500` i `[id]/page.tsx`
  ersätts med `primary-700`-teal (8 förekomster, rad ~3522–5877).
- Semantik: grönt = klart/betalt, amber = väntar/saknas, rött = kräver åtgärd.
- Kort: vitt, border `#E2E8F0`, `rounded-xl`, skugga endast hover/fokus.
- Tryckytor ≥ 44 px; primärknapp 52 px på mobil.

## Ekonomi — räkneregler (buggen får inte återinföras)

- ROT = 30 % av arbetskostnad **inklusive moms**, max 50 000 kr/person.
- Exempeldata: offert 185 000 kr inkl moms, varav arbete 120 000 kr →
  ROT 36 000 kr → kunden betalar 149 000 kr.
- Tusentalsavgränsning alltid: "185 000 kr", aldrig "185000".
  Använd `Intl.NumberFormat('sv-SE')` (finns i `lib/format-price.ts`).

## Ägar-gating (Handymate-regel, gäller utöver canvasen)

Ekonomisektionen (staplar, ROT-rad, prognos, Ekonomi & offert-fliken,
marginal) visas ENDAST för ägaren — anställda/PM/kalkylator ser aldrig
marginal eller interna kostnader. Layouten ska tåla att sektionen utelämnas.

## Copy (exakt)

Se `copy.projektvy.sv.json` i denna mapp. Nyckelprinciper: knappar säger vad
som händer ("Godkänn & skicka", inte "OK"); tomma lägen förklarar vad som
kommer hända ("När teamet förbereder något för projektet dyker det upp här").
