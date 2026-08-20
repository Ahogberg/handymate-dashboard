# Partner-tillägg — paketering (2026-08-20)

> Underlag till partneravtalsförhandlingen. Kompletterar den tidigare
> motförslags-linjen (kärnprovision 20-30% år 1, 10% därefter, inget
> ägarskap/kontroll av kärnprodukten). Detta dokument definierar VAD
> partnern kan tjäna 50% på utan att det urholkar Handymates moat.

## Principen — vad avgör kärna vs. tillägg

Testet är inte "kan vi ta betalt extra för det". Testet är:

> **Skulle en vanlig betalande kund känna sig lurad eller ofullständigt
> betjänad utan den här funktionen?**

Om ja → kärna, ingår alltid, ingen partnerandel på den. Om nej, och
funktionen dessutom har minst en av dessa fem egenskaper, är den ett
legitimt tillägg:

1. **Annan kostnadsmotor** — skalar med förbrukning, inte platt inkluderad.
2. **Kräver extern reglerad partner** (t.ex. licensierad långivare).
3. **Tjänar bara en delmängd kunder**, inte alla.
4. **Bär mänsklig arbetskraft** med egen lönekostnad, inte bara mjukvara.
5. **Annan risk-/ansvarsklass** än den dagliga operativa mjukvaran.

Lisa, Matte, Mission Control, Business Twin, projektöverlämning och
ekonomi klarar inget av dessa fem testen — de förblir kärna, aldrig
partnerandel på dem.

## Avfärdat: Managed Autonomous Office

Ursprunglig idé: partnerns folk sitter i godkännandekön och
kvalitetssäkrar agenternas förslag åt kunden, mot en retainer.

**Varför det föll:**
- Fyra-ögon-modellen (agent föreslår, människa godkänner) är redan
  kärna, gratis, och en del av grundlöftet. Att sälja "vi ser till att
  AI:n inte gör fel" som tillägg antyder att grundprodukten inte går
  att lita på utan att betala extra.
- Godkännandekön innehåller till stor del beslut som kräver lokal
  kunskap om just den firman (är den här ÄTA:n förväntad av den här
  kunden, är relationen känslig) — varken Handymate eller partnern har
  den kontexten. Det de KAN göra pålitligt (mönsterigenkänning: orimliga
  belopp, felräknad moms, fel kund) är en svagare, mindre säljbar
  kundberättelse.
- Slutsats: svag och otydlig värdeberättelse för slutkunden. Skrotas
  som avtalspunkt.

## Aktivt tillägg 1 — Kom igång-paketet (engångs)

Motsvarar Codex "Startklar Handymate". Redo att erbjuda omedelbart —
kräver inget nytt bygge, bara scope, prissättning och en
certifieringsprocess för partnerns folk.

**Omfattning:**
- Import av kunder och produkter.
- Konfiguration av företagets arbetssätt.
- Agentinställningar.
- Fortnox- och telefonikonfiguration.
- Utbildning av personal.
- Första uppdraget / första skarpa arbetsflödet.

**Modell:** engångsavgift, partnern levererar, partnern tar 50% av
avgiften. Handymate behåller hela abonnemangsintäkten. Kräver ingen
extra vikt i avtalet mot vad Codex redan formulerade.

## Aktivt tillägg 2 — Digital annonsering (partnerlevererad, ingen Handymate-andel)

**Kundberättelse:** en hantverkare som behöver fler leads. Att sköta
Google/Meta-annonsering är en helt annan disciplin än det agentteamet
gör — passerar avgränsningstestet tydligt (delmängd av kunder, annan
kompetens, ingen produktöverlappning).

**Beslut (2026-08-20):** Handymate tar INGEN andel av den här
intäkten. Partnern säljer och levererar annonseringen som sin egen
tjänst, fakturerar kunden direkt. Handymate är bara mottagaren av de
leads som annonseringen genererar — redan befintlig infrastruktur
(lead-intake, SMS-kampanjer, Snabboffert) tar hand om dem utan
ändringar. Ingen 50/50-fördelning här eftersom Handymate inte är part
i den transaktionen.

**Varför detta är rätt:** partnern får en fullt trovärdig, obegränsad
intäktsmöjlighet som inte kräver att Handymate rör produkten eller
tar en risk-/ansvarsposition i annonseringen. Stärker snarare
partnerns motivation att sälja in hela paketet utan att komplicera
avtalet med en fördelningsformel för pengar som aldrig passerar
Handymates bok.

## Framtida option — Outbound via agenter (villkorad, inte aktiv)

`leads_outbound` finns redan flaggad i produkten
(`components/Sidebar.tsx`, `launchGate: 'leads_outbound'`) men är
uttryckligen INTE klar än. Ska inte skrivas in som en aktiv avtalspunkt
idag — det vore att lova bort en funktion som inte finns.

**Föreslagen avtalsskrivning:** en villkorad framtidsrad, t.ex.
"Om Handymate lanserar agentdriven outbound-prospektering
(`leads_outbound`) omfattas den av samma 50%-modell som övriga
partnerlevererade tillägg, enligt separat överenskommelse vid
lanseringstillfället." Ingen procentsats eller omfattning låses förrän
funktionen faktiskt finns att sälja.

## Sammanfattning — vad som går till partnern

| Del | Modell | Status |
|---|---|---|
| Kärnabonnemang (Firman/Storfirman) | 20-30% år 1, 10% därefter | Redan beslutat, oförändrat |
| Kom igång-paketet | 50% av tjänsteavgiften | Redo att erbjuda nu |
| Digital annonsering | 0% till Handymate — partnerns egen intäkt | Redo att erbjuda nu |
| Tillväxtrådgivning / migrering / förstalinjesupport | Upp till 50% när partnern medverkar i leveransen | Enligt tidigare Codex-linje, oförändrat |
| Managed Autonomous Office | — | Avfärdat |
| Outbound via agenter | 50%-modell, villkorad | Framtida option, ej aktiv |
| Framtida produktlager (multi-company, Verified, finansiering, Network) | Produkt för produkt, separat överenskommelse | Ej aktuellt nu |
