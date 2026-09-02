# Granskningspaket ROT/RUT — vad det är och hur du använder det

Det här är ett paket för att få de 159 jobbtyperna i `docs/bransch/*.md`
faktagranskade av någon utanför Handymate — utan att den personen behöver läsa
tio interna researchfiler. Syfte: gå från en vecka av eget grävande till ett
möte eller mejl på ungefär två timmar.

## Filerna i den här mappen

1. **`GRANSKNINGSPAKET_ROT_2026-09-02.md`** — skicka den här. 44 självbärande
   frågor (grupperade per bransch, med tvärgående frågor samlade separat) plus
   en bilaga med de 86 rader som redan har ordagrant stöd och alltså inte
   behöver frågas om.
2. **`MEKANISK_KONTROLL_2026-09-02.md`** — intern kvalitetskontroll. Visar att
   varje "klar" rad (ROT/RUT/grön teknik utan `*`) faktiskt har ett citat som
   håller, och listar de fyra rader som inte höll måttet och därför flyttades
   in i frågepaketet. Behöver inte skickas externt, men bra att ha om
   konsulten frågar "hur vet ni att resten stämmer?"
3. **`README.md`** — den här filen.

## Hur du använder paketet

**Skicka `GRANSKNINGSPAKET_ROT_2026-09-02.md` till rätt mottagare per
frågetyp** — alla 44 frågor behöver inte gå till samma ställe:

- **Skatteverkets upplysningstjänst** (telefon eller deras kontaktformulär för
  företag) — för de principiella ROT/RUT-frågorna: vad en formulering
  faktiskt omfattar, gränsdragningar mellan boendeformer, om en jobbtyp är
  utredd alls. Det gäller de flesta av frågorna i Del A och Del B.
- **En skatte-/redovisningskonsult** — för gränsfall som kräver en bedömning
  snarare än ett SKV-citat (t.ex. F1 om jour/service, F9 om var gränsen för
  "omfattande renovering" går, F42-F43 om totalentreprenad och
  projektledningstid). Konsulten kan också bekräfta rimlighet i sådant
  Skatteverket inte svarar på direkt.
- **En branschorganisation** (Måleriföretagen, Installatörsföretagen, Säker
  Vatten, TMF, Plåt & Ventföretagen m.fl. — se källtabellen i respektive
  branschfil) — för rena yrkesfrågor som inte är skattefrågor: vad en
  hantverkare själv kallar ett jobb, om en term är rätt använd i branschen,
  vilken auktorisation som krävs. Inte huvudsyftet med det här paketet, men
  relevant om ett svar kräver "är detta ens hur branschen jobbar?"

Du behöver inte vänta på alla 44 svar innan du börjar. Skicka frågorna
gruppvis om det är enklare — varje fråga står för sig själv och anger exakt
vilka rader (bransch + radnummer + jobbtyp) den avgör.

## Hur svaren förs tillbaka in i branschfilerna

1. När ett svar kommer in — kryssat i dokumentet, ett mejl, eller ett samtal —
   skriv in det direkt i motsvarande rad i rätt `docs/bransch/<fil>.md`: byt
   `ROT*` eller `?` till det bekräftade `ROT`, `RUT`, `GT` eller `Nej`, och
   ersätt anmärkningstexten med källan till svaret (t.ex. "Bekräftat av
   Skatteverkets upplysningstjänst 2026-09-XX, se granskning/svar-el.md" eller
   ett ärendenummer).
2. För en tvärgående fråga (Del A i paketet) — uppdatera **alla** rader den
   avgör, i alla berörda branschfiler, inte bara en.
3. När samtliga rader i en branschfil har ett svar (antingen från den ursprungliga
   researchen eftersom de redan hade ordagrant stöd, eller från det här
   paketet), ändra filens statusrad överst från **"OGRANSKAD"** till
   **"GRANSKAD"** och datera ändringen.
4. Uppdatera sammanställningstabellen i `docs/bransch/README.md` (kolumnerna
   ROT/RUT/ROT\*/Nej/?) så den speglar de nya, bekräftade statusarna.

## Regeln: inget publiceras förrän raden har ett svar

Ingen jobbtyp eller ROT-status från de här branschfilerna får seedas till ett
kundkonto, visas i onboardingen, eller användas av agenten för att föreslå ett
avdrag **förrän den specifika raden har gått igenom antingen (a) den
ursprungliga ordagranna granskningen (86 rader i Bilaga 1) eller (b) ett svar
från det här paketet, infört i branschfilen enligt ovan.** En rad som fortfarande
är märkt `ROT*` eller `?` i en branschfil är inte klar för produktion, oavsett
hur säker den ser ut. Det är samma regel som redan står överst i varje
branschfil ("Status: OGRANSKAD ... Inget i den här filen seedas till konton
förrän statusen är ändrad till GRANSKAD") — det här paketet är bara vägen dit.
