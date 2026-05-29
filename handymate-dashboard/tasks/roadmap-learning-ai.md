# Roadmap: AI som lär känna företaget

## Vision
Efter 30 dagars användning känner Handymate hantverkarens företag. Det vet vilka kunder som blir ÄTAs, vilka offerter som signeras snabbt, vilka projekttyper som lönar sig. Det skickar inte generiska påminnelser — det skickar rätt påminnelse till rätt kund i rätt ton.

Detta är inte en feature. Det är vad som gör Handymate omöjlig att lämna efter sex månader — och vad ingen konkurrent (Easoft, BuddyPro, WOOS) kan kopiera över en kväll.

## Vad vi REDAN har (grunden)
- Koherent datamodell (Etapp 1-5): offert→deal→projekt→faktura spårbart över hela livscykeln
- Ärlig ekonomi-modell (compute-economics med 30%-tröskel)
- Sex agent-personligheter med hypotes-drivna prompter
- Approval-data med typed actions (godkänd/avvisad = träningsdata)
- Memory-system (importance-based, finns men outnyttjat)
- Knowledge_base + lead_sources + customer-historik
- Helpers som garanterar epistemic hygien (deriveMarginalState, strip-prices, verify-ownership)

## Vad som SAKNAS (gapet att fylla)
1. Pattern-extraction från historik
2. Per-business personalisering av prompter
3. Feedback loops från approve/reject
4. "Lärdomar"-presentation i UI
5. Cross-data-korrelation (offert+projekt+marginal+kund)

## Faser (efter pilot rullar)

### Fas 1 — Pattern-extraction v0 (4-6 veckor efter pilot-start)
Förutsättning: 4-6 veckors Bee-användning har genererat data.
Bygg:
- Tabell `business_patterns` (per business)
- Dagligt cron-pass som beräknar och uppdaterar:
  - Genomsnittlig deal-livscykel (lead → vunnen)
  - Approve-rate per agent (Karin/Daniel/Lisa)
  - Marginal-distribution per projekttyp
  - SMS-svarstid per kund-segment
  - Kund-återköpsfrekvens
- INGEN intelligenta beslut än — bara strukturerad statistik
- Princip: epistemic hygien — minimum-sample-thresholds (motsvarande 30%-completeness-tröskel för marginal)

Estimat: 1-2 veckor fokuserat arbete

### Fas 2 — Personaliserade prompter (vinter 2026)
Förutsättning: Fas 1 har data + 8-12 veckors approve/reject-historik.
Bygg:
- Karin/Daniel/Lisa läser business_patterns + approval-historik
- SMS-formuleringar matchar business-specifik ton (extraherad från Christoffers approved SMS:s)
- Timing-justering: skicka när BRF-leads typiskt svarar (extraherat från historik), inte generisk dag 5
- "Lärdomar"-vyn där hantverkaren SER vad systemet förstått ("47 offerter analyserade — så här ser ditt mönster ut")

Estimat: 3-4 veckor fokuserat arbete

### Fas 2.5 — Matte-guidad onboarding (parallellt med Fas 2, vinter 2026)

#### Varför
Onboarding är dag noll av "AI som lär känna företaget". Första interaktionen ska vara konversation med Matte, inte formulär. Sätter tonen, etablerar teamet, börjar lärandet med relation.

#### Designprinciper
1. **Hybrid, inte ren konversation:** konversation för det icke-uppenbara (vision, ton, arbetssätt), strukturerad input för det uppenbara (org-nummer, adress).
2. **Split-screen:** Matte-dialog (60%) + ackumulerande "ditt företag tar form"-panel (40%).
3. **Faser med andning:** Vem ni är → Vad ni gör → Hur ni jobbar → Verktyg → Presentation av teamet.
4. **Magiskt ögonblick i Fas 5:** Matte introducerar Karin/Daniel/Lars/Lisa med insikter redan baserade på registrerad data.
5. **Ärlighet i ackumulering:** visuellt skilja "bekräftat" från "tolkat" från "lär mig över tid" (epistemic hierarki, som MarginalCard).
6. **"Hoppa till formulär"-utgång:** alltid tillgänglig för pragmatiska användare.

#### Tekniska krav
- Streaming från LLM (Matte ska "skriva" från första tecken)
- Edge-case: korrigeringar mid-konversation (klick på höger-panel för att rätta)
- Tolknings-validering ("Så ni är... — stämmer det?")
- Latens-mitigering: förcachning av sannolika nästa frågor
- State-management: konversation kan pausas + återupptas

#### Designsprint (kan börja innan kod-bygge)
- Claude Design: skissa fem nyckel-skärmar (en per fas)
- Definiera Matte:s visuella identitet
- Animations-narrativ för ackumulering
- Tempo + andning mellan faser

#### Vad detta INTE är
- ❌ Generisk AI-chatbot för support
- ❌ Linjär formulärsersättning ("samma fält i chatformat")
- ❌ "AI prata med användaren"-feature isolerad från resten
- Det ÄR: första kapitlet i hantverkarens relation med systemet, arkitektoniskt ihopkopplat med pattern-extraction och personaliserade prompter (Fas 1+2).

#### Beroenden
- KRÄVS: Fas 1 (pattern-extraction) klar — annars är insikterna i Fas 5 ("jag ser att ni gör BRF-jobb") tomma löften
- IDEALT: Fas 2 (personaliserade prompter) parallellt — Matte:s introduktion av teamet blir starkare om de FAKTISKT är personaliserade vid det laget
- INTE blockerande för pilot-launch (Bee Service skippar onboarding och konfigureras manuellt)

#### Estimat
- Design-sprint: 1-2 veckor (kan starta vinter 2026 oberoende)
- Kod-bygge: 3-4 veckor fokuserat arbete
- Total: ~5-6 veckor från start till första pilotkund som onboardar via Matte

### Fas 3 — Proaktiva insikter (vår 2027)
Förutsättning: Fas 2 fungerar + 6 månaders historik.
Bygg:
- Lars: "Detta projekt liknar Andersson 2026 där du tappade 20% — kolla material-budgeten"
- Hanna: "Andersson brukar boka något i mars — föreslår SMS imorgon"
- Matte: "Du har inte fakturerat Andersson på 3 veckor — förra gången drog det ut till 6 veckors jakt"
- Cross-data-korrelation: "Du tjänar 18% bättre på villor än BRF — men säger ja till BRF för snabbt"

Estimat: 4-6 veckor fokuserat arbete

## Designprinciper (måste hållas under alla faser)

1. **Epistemic hygien:** Lärande AI som lär sig från fel data lär sig fel saker. Tröskeln för "vi vet nog för att uttala oss" måste vara lika seriös som 30%-completeness för marginal. "Vi har sett 47 offerter" får inte säga slutsatser om 47 om datan är skev.

2. **Mänsklig grind kvar:** Proaktiva insikter ska föreslå, inte exekvera. Approval-mönstret från Tråd 1:s typed actions är rätt — AI agerar, människa godkänner.

3. **Synliggör vad systemet vet:** "Lärdomar"-vyn är hur värdet blir kännbart. Tyst smart räcker inte — användaren måste SE att systemet förstår.

4. **Per-business isolation:** Bee:s mönster ska inte påverka andra businesses prompter. Lärandet är per-konto.

## Vad detta INTE är

- Inte LLM fine-tuning (för dyrt, för långsamt, ohanterbart)
- Inte rule-engine (för stelt, fångar inte nyans)
- Inte vector-search-magi (overkill för use case)
- Det ÄR: strukturerad pattern-extraction + dynamisk prompt-kontext

## Konkurrent-asymmetri

- Easoft: passiv databas. Kan bygga features men inte retroaktivt bli en lärande plattform utan att bygga om allt.
- BuddyPro: feature-fokuserad enligt audit, ej rörelse mot lärande.
- WOOS: shell, irrelevant.

Konsolideringen gjorde lärandet möjligt. Pattern-extraction gör det verkligt. Switching cost efter 6 månader gör det permanent.

## Bee Service som första lärande-pilot

Bee blir inte bara första pilotkund — de blir första instansen där Handymate "lär sig" ett företag. Värdefullt för:
- Validera att lärandet ger värde (Christoffer säger "wow, det visste den")
- Generera fallstudie för sälj till andra (5+ piloter)
- Bygga moat på Bee specifikt (omöjligt för dem att byta efter 6 mån)

## Vad jag inte vet säkert (testa mot Bee)

- "Lärande AI" är min hypotes om hero-feature. Bee:s riktiga reaktioner är data. När Christoffer säger "wow" — notera VAD som triggade. Justera roadmap efter verkligheten.
- Frågor till Christoffer aktivt: "Vilken funktion får dig att tänka 'det här hade jag inte i Easoft'?" "Vad använder du mest utan att tänka på det?"
