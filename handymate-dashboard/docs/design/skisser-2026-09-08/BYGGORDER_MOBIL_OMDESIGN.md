# Byggorder — mobilens omdesign (bygge 14)

Spec: `mobil-omdesign.dc.html` i den här mappen. Beslut Andreas 2026-09-08.
Gäller **mobilappen** (`Ahogberg/handymate-mobile`). Webbappen rörs inte i
det här passet.

## Varför nu

App Store-datumet driver inte de första kunderna. De kommer från
Christophers telefonsamtal, registrerar sig på webben och installerar appen
efter att de blivit kunder. Därför är det värt att skjuta appen några dagar
för en app som imponerar. Bygge 13 lämnas ändå in med manuell frisläppning
för att flusha ut avslagsrisken hos Apple innan bygge 14.

## Ordning

1. **1a — startsidan i tre lägen.** Ny kund (tomt, ärligt), aktiv arbetsdag,
   lugn dag. Rubriken "N saker behöver dig, resten sköter vi" finns redan.
2. **1d — granska, godkänn, resultat.** Tre steg, aldrig ett. Samma mönster
   som massutskicksgrinden (`lib/approvals/massutskick.ts` i dashboarden,
   svarar 428 med underlag).
3. **1c — jobbets översikt.** Samma ord och samma status som startsidan.
4. **1e — återupptagning.** Halvfärdig rapport, svag uppkoppling, osäker
   sparstatus.
5. **1f — gemensamma komponenter.** Status, nästa steg, beslut, kvittens.
6. **1b — överlämningen.** Sist, eftersom steg 3 hänger på primitiven.

## Utanför omfattningen

Duken märker två saker `NY FUNKTION`. Ingen av dem byggs i det här passet.

- **"Fredag 12 sep · 09:00"** i 1b steg 3. Kräver den schemalagda åtgärden
  som byggs parallellt. Detta är sekvens, inte avslag: den ritas in så snart
  primitiven landat och granskats, och blir då ett litet tillägg i en yta
  som redan är omdesignad. Skälet att inte vänta in den är att de två
  arbetena annars låser varandra.

  Tills primitiven finns: **inga veckodagar och inga klockslag i agenttext.**
  Skriv "Planerat" eller "Bevakar" utan tid. Det här är en regel, inte en
  rekommendation; mönstret har återkommit fyra gånger i skisser.
- **"Ge teamet ett uppdrag"** som tredje ruta i tomläget. Ersätts av
  **"Koppla telefonen"** (beslut Andreas 2026-09-08). Skälet: Mission Control
  har noll rader i produktion, ingen firma har någonsin skapat ett uppdrag,
  och en ny kunds första minut ska inte satsas på det mest oprövade i
  produkten. Lisa är kärnlöftet och telefonkopplingen är det som faktiskt
  får teamet att börja leverera. Flödet finns: `Step4PhoneNumber` och
  kanalhälsan (`lib/onboarding/channel-health.ts`).

  Tomlägets tre rutor blir alltså: lägg till din första kund, koppla
  kalendern, koppla telefonen. Rutorna försvinner när kunden är igång, så de
  behöver inte täcka allt teamet kan göra.

  Mission Control får fortfarande ingen ny menyplats och inget nytt flöde.

Ingen ny backend i det här passet. Saknas ett fält ritas inte elementet.

## Villkor

- **Inget till main utan grön kontraktsgrind och läst diff.** Gäller båda
  repona.
- **Prova på riktig telefon, inte simulator.** Startsidan och jobbvyn, med
  rollprovskontot, i mobilnät.
- **Behåll de fem skiljelinjerna** ur 1f i varje text: förberett är inte
  skickat, planerat är inte utfört, sparat är inte bekräftat, bekräftat
  resultat är inte en uppskattning.
- **Inga aktivitetsräknare, ingen sparad tid, inga intäktslöften** på
  startsidan. Resultat visas bara med kvittens.
