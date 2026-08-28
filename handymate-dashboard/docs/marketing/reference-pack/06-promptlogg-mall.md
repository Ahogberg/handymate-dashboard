# 06 · Promptlogg — mall

Handbokens §5 kräver en promptlogg per produktion. Kopiera mallen till `docs/marketing/promptlogs/HM_<FILM>_<NAMN>_PROMPTLOG_V<NN>.md` (t.ex. `HM_F06_OFFERT_PROMPTLOG_V03.md`).

```markdown
# HM_F06_OFFERT — promptlogg V03

Film: F06 · Offerten som höll på att kallna
Master: HM_F06_OFFERT_MASTER-NOTEXT_V03_9x16_2026-09-01.mp4
Hooks: A (sex dagar) · B (vem följer upp) · C (Daniels kort)
Sanningsgrind godkänd av: Andreas Högberg, 2026-09-01
Produktbevis inspelat från: demokonto <business_id>, inspelningsläge `tests/filming/f06-offert.spec.ts`, körning 2026-09-01 08:14

## Genereringar

| # | Scen (handbokens shotlist-nr) | Modell | Referenser | Prompt (kort) | Seed | Resultat | Syntetiskt? | Beslut |
|---|---|---|---|---|---|---|---|---|
| 1 | Shot 5 — hantverkare installerar köksskåp | Higgsfield <modell/version> | worksite-morning-source.png | "Photorealistic Swedish renovation worksite insert …" | 48213 | 6 s, händer ok, skärm vänd bort | Ja, helt | ✅ behåll |
| 2 | Shot 5 — samma | samma | samma | samma | 48214 | fingerfel vänster hand | Ja | ❌ kassera (negativ lista 1) |
| 3 | Matte nivå 2 — dörröppning | Higgsfield <modell> | matte.png + worksite | "Use the supplied Handymate portrait of Matte …" | 9911 | identitet ok, hoodie ok | Ja | ✅ behåll, märk "AI-genererad visualisering" |

## Klipp som är syntetiska i mastern
- 00:00–00:04 shot 5 (generering #1)
- 00:12–00:15 Matte (generering #3) — märkt i bild

## Klipp som är riktiga
- 00:04–00:12 produktbevis (skärminspelning, demokonto)
- 00:15–00:17 slutkort (post)

## Rättigheter
- VO: <namn>, avtal <datum>
- Musik: <källa/licens>
- Statist: — (inga riktiga personer i syntetiska klipp)

## Avvikelser mot produktionskortet
- Ingen / eller: "Shot 3 ersatt med …, motivering …"
```

Fältet **Syntetiskt?** och listan över syntetiska klipp är det som gör märkningen i bild kontrollerbar i efterhand. Loggen är inte klar förrän någon står som godkännare av sanningsgrinden.
