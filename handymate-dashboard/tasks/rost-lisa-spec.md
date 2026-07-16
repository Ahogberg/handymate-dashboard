# Röst-Lisa — design-spec (Våg 4.1, 2026-07-15)

_Upplåst: lanseringssprinten funktionellt stängd (A-test godkänt; B7 kvar).
Detta är DESIGNDOKUMENTET — inget byggs förrän Andreas godkänt och
prioriterat mot pilotens feedback. Underlag: konkurrensresearchen 2026-07-11
(minne competitive-landscape-2026-07), ServiceTitan Max-analysen, praktiker-
sentimentet, kapacitets-primitiven (levererad 2026-07-15) och TD-52-gatingen._

## Positionering — varför nu och varför vi vinner

Skaala säljer AI-telefonsvar till hantverkare för 299 kr/mån; Svaria,
AI-Reception m.fl. ligger i samma kluster; Jobber tar $29/mån i USA. **Rösten
i sig är commodity.** Vår Röst-Lisa säljs aldrig som "AI som svarar i telefon"
— den säljs som **ingången till loopen**: Skaala kan ta samtalet, men kan inte
boka mot verklig kapacitet, skicka offerten, dra ROT-avdraget eller jaga
fakturan. Bara den som äger hela back-officen kan det.

## Designprinciper (låsta av research + sentiment)

1. **Eskalering-först, aldrig "AI svarar allt".** Målet är att boka de
   rutinmässiga 70–90 % och SÖMLÖST lämna över resten till hantverkaren
   (befintlig vidarekoppling). ServiceTitans mått: 90 % kapacitetsjusterad
   bokningsgrad. Ett misslyckat AI-samtal som fångas snyggt är OK; ett
   frustrerande AI-samtal som tappar kunden är produktens död.
2. **Ärlig AI-disclosure + snabb människo-väg.** Sentimentet är entydigt:
   äldre kunder lägger på för robotröster. Lisa presenterar sig ärligt
   ("Hej, du pratar med Lisa, [Företagets] assistent"), erbjuder människa
   tidigt vid tvekan, och akutord ("vattenläcka", "strömlöst", "akut")
   eskalerar OMEDELBART till vidarekoppling — aldrig bokningsdialog.
3. **Bokar mot kapacitets-primitiven i realtid.** `getWeekCapacity` +
   bokningstak = Lisa föreslår bara tider som faktiskt finns och respekterar
   akutreserven. Utan detta är röstbokat = överbokat (STs dokumenterade
   fallgrop). Levererad 2026-07-15 — förutsättningen är på plats.
4. **TD-52-linjen gäller rösten också.** Samtalet är kundinitierat →
   Lisas SVAR i samtalet är konversation (user-klass). Men EFFEKTERNA
   (bokning skapas, SMS-bekräftelse, offertlöfte) går genom samma
   spårbarhet: bokning skapas som riktig booking + kvitteras i Klart
   idag; allt Lisa lovar i samtalet syns för hantverkaren efteråt
   (transkript + strukturerad sammanfattning på ärendet).
5. **Svenska först, dialekt-tålig.** Svensk premium-TTS + STT som klarar
   dialekt och bakgrundsbuller (byggarbetsplats-verklighet).

## Kundresan (huvudflödet)

Inkommande samtal → (befintlig) ring-först-hantverkaren-logik om så
konfigurerat → obesvarat/utanför arbetstid → **Lisa svarar**:
1. Ärlig hälsning + "vad kan jag hjälpa till med?"
2. Intent: bokning / prisfråga / pågående ärende / akut / övrigt.
   - **Akut** → omedelbar vidarekoppling + SMS till hantverkaren.
   - **Bokning**: fånga namn/telefon/adress/ärende → föreslå 2–3 tider ur
     kapacitets-primitiven ("Vi har tid torsdag förmiddag eller fredag
     eftermiddag") → bekräfta → skapa booking + SMS-bekräftelse till kund
     + notis till hantverkaren.
   - **Prisfråga**: kunskapsbasens prisindikationer (finns:
     knowledge_base.services) — aldrig bindande pris, erbjud offert →
     lead + ev. offertutkast i kön (Daniel).
   - **Pågående ärende**: identifiera kund via nummer → läge från
     CRM ("din faktura skickades igår") — läskvitto, aldrig ändringar.
   - **Osäker/övrigt** → ta meddelande (dagens röstbrevlåde-flöde) +
     Tier 0-SMS. Fallbacken ÄR dagens beteende — Lisa kan aldrig bli
     sämre än nuläget.
3. Efter samtal: transkript + strukturerad sammanfattning (intent, utfall,
   åtaganden) på kundkortet + i Klart idag.

## Teknikval (förslag — Andreas beslutar)

- **Röstplattform:** Tier 1 = Vapi (parkerad plan) ELLER OpenAI Realtime /
  Retell (RETELL_AGENT_ID finns redan i Vercel-env sedan tidigare experiment
  — utred vad som testades). Utvärderingskriterier: svensk TTS-kvalitet,
  STT-dialekttålighet, latens (<800 ms turn-around), per-minut-pris,
  46elks-SIP-kompatibilitet.
- **Telefoni:** behåll 46elks (nummer + routing finns) — koppla samtalet
  till röstplattformen via SIP/websocket-ström.
- **Verktyg för Lisa i samtalet:** begränsad verktygslåda (INTE hela
  tool-routern): läs kapacitet, skapa bokning, läs kundläge, ta meddelande,
  eskalera. Minsta möjliga yta = minsta möjliga felyta.

## KPI:er (mäts från dag 1)

- **Kapacitetsjusterad bokningsgrad** (huvudmåttet, STs definition)
- Eskaleringsgrad + orsak (för tuning, inte för att minimera blint)
- Kund lade på mitt i AI-dialog (sentiment-larmet)
- Tid till människa vid akut
- Hantverkarens korrigeringar av Lisa-bokningar (kvalitetsproxy)

## Prissättning (förslag)

Hybrid enligt Max-lärdomen: bas-abonnemanget inkluderar N samtal/mån,
därefter per-samtal — konsumtion = ersatt arbete. Positionera mot Skaala:
"deras röst svarar, vår röst BOKAR mot din riktiga kalender och äger hela
efterarbetet". Premium-tier, inte 299 kr-race.

## Byggfaser (när godkänd)

- **Fas 0 (utredning, ~dagar):** plattformsval-spike — svensk TTS/STT-test
  med riktiga dialektinspelningar + 46elks-koppling + Retell-experimentets
  läge. GO/NO-GO-underlag.
- **Fas 1 (MVP):** utanför-arbetstid-läget enbart (lägst risk, högst
  saknat värde — natten/helgen är där samtal tappas idag). Bokning +
  meddelande + akut-eskalering. Pilot hos Christoffer.
- **Fas 2:** kontorstid-overflow (ring-först, Lisa tar det obesvarade),
  prisfrågor ur kunskapsbasen, pågående-ärende-läge.
- **Fas 3:** förtjänad autonomi för röstbokningar (samma trappa som SMS).

## Öppna beslut för Andreas
1. Plattformsspike (Fas 0) — köra nu eller efter B7/EAS?
2. Retell-experimentet: vad finns/fanns? (env-nyckel existerar)
3. Prissättningsmodellen ovan OK som hypotes?
4. Fas 1-scope OK (enbart utanför arbetstid)?
