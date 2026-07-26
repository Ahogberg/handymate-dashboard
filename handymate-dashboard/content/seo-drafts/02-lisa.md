---
typ: agent-artikel
målsökord: missat samtal hantverkare, svara i telefon hantverksföretag, tappade kunder telefon
status: UTKAST — ej godkänd
---

# Lisa — den som ser till att inga samtal går förlorade

## Problemet

Ett missat samtal är sällan bara ett missat samtal. Det är en kund som ringer
nästa firma i sökresultatet medan du står med händerna i en väggkonstruktion.

De flesta hantverkare vet inte ens hur många de missar. Telefonen visar bara
att någon ringde — inte vad det skulle ha blivit för jobb.

## Vad Lisa gör

Lisa är teamets kundservice. Hon tar hand om det som händer runt telefonen:

- **Kopplar samtalet vidare** till ditt nummer, så du kan svara som vanligt när
  du har möjlighet.
- **Tar emot ett meddelande** om du inte kan svara — och skriver ut det i text,
  så du kan läsa i stället för att lyssna på ett röstmeddelande med maskiner
  igång i bakgrunden.
- **Ser till att kunden får ett SMS** när ett samtal gått förlorat, så att
  personen vet att du sett det och återkommer — i stället för att gå vidare
  till någon annan.

Ärendet hamnar sedan där du har koll på det, med anteckningar, i stället för
som en rad i samtalsloggen du glömmer titta på.

## Vad Lisa INTE gör

**Lisa pratar inte med dina kunder.** Det finns leverantörer som säljer
AI-röster som svarar i luren och låtsas vara en människa. Vi gör inte det, och
vi tänker inte påstå att vi gör det. Lisa hanterar kopplingen, meddelandet och
SMS:et — själva samtalet är fortfarande ditt.

Vi tycker det är rätt ordning. En kund som ringer en hantverkare vill prata med
en hantverkare.

## Varför det spelar roll

Ett SMS inom någon minut efter ett missat samtal är skillnaden mellan "de hörde
mig" och "de struntade i mig". Det är en av de billigaste sakerna en firma kan
göra för att sluta läcka jobb — och en av de som oftast inte blir av, eftersom
den kräver att någon sitter beredd hela dagen.

Det är precis den sortens uppgift ett AI-team är till för.

---

## Källkontroll

| Påstående | Stöd | Bedömning |
|---|---|---|
| Kopplar samtal till din telefon | Lisa routing **LIVE**, 46elks **LIVE** | OK i nutid |
| Röstmeddelande + transkribering | Inventering §1 Lisa; Whisper **BYGGT** | OK funktionellt, ingen kvalitetsutfästelse |
| Missat samtal → SMS till kund | Tier 0 **BYGGT**; står i "kan lovas utan att ljuga" | OK — funktionellt, ingen drift-historik |
| Ärendet sparas med anteckningar | CRM/lead-hantering i tillåten palett | OK |
| "Lisa pratar inte" (uttalat negativt) | Pratande röstagent = **SPEC** | OK — och stärker trovärdigheten |
| "inom någon minut" | Formulerat som allmän princip om snabba svar, INTE som mätt löfte om vår svarstid | Gränsfall — se flagga |

**⚠ FLAGGA TILL ANDREAS:** meningen *"Ett SMS inom någon minut efter ett missat
samtal…"* är skriven som ett allmänt resonemang, inte som ett löfte om vår
leveranstid. Vill du vara extra försiktig: byt till "Ett snabbt SMS efter ett
missat samtal…". Pitch-materialet använder "30 sekunder" — men det är
demo-språk, inte mätt drift-data, och bör inte permanent-indexeras.

**Medvetet utelämnat:** allt om röst-AI, bokning via telefon, svarstidsgarantier.
