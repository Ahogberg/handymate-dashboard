# AI som får agera måste också kunna bevisa vad den har gjort

**Omslag:** `article/article-04-ai-som-kan-bevisa.png`

**Inlinebild 1:** Efter “Tre gränser”: använd `future/future-05-control.png`.

**Inlinebild 2:** Efter “Ett kvitto, inte applåder”: använd en verklig
produktbild av ett godkännandekort eller värdekvitto.

**Delningsfråga:** Vad skulle en AI behöva visa för att du skulle lita på den?

---

## AI som får agera måste också kunna bevisa vad den har gjort

Det finns ett enkelt sätt att få en AI-produkt att verka imponerande i en demo:

Låt den prata självsäkert.

“Klart.”

“Kunden är kontaktad.”

“Jag har säkrat intäkten.”

Problemet är att en välformulerad mening inte är ett bevis på att något
faktiskt har hänt.

Ju mer AI får göra i ett företag, desto mindre räcker det att den låter klok.
Den måste kunna visa sitt arbete.

### Kortversionen

- Modellens egen berättelse får aldrig vara facit.
- Högriskhandlingar behöver tydliga mandat och godkännanden.
- Resultat ska härledas ur verkliga systemutfall, inte ur AI:ns självbild.

## Från assistent till aktör

En AI som sammanfattar text kan göra fel utan att direkt påverka omvärlden.

En AI som skickar ett kundmeddelande, uppdaterar ett projekt, skapar en faktura
eller förbereder ett ekonomiskt beslut befinner sig i en annan kategori.

Nu finns minst fyra frågor:

1. Fick den göra handlingen?
2. Använde den rätt kund, projekt och företag?
3. Lyckades handlingen tekniskt?
4. Blev resultatet det som användaren fick höra?

Det räcker inte att svara ja på den första och hoppas på resten.

## Tre gränser som måste vara synliga

Vi tror på en enkel uppdelning.

**Informationsnivån:** AI får läsa och förklara. “Den här fakturan är
förfallen.”

**Förslagsnivån:** AI får förbereda en handling. “Karin föreslår den här
påminnelsen.”

**Utförandenivån:** Handlingen genomförs först när rätt mandat finns. Det kan
vara ett uttryckligt godkännande eller en tydlig regel som företagaren själv
har valt.

Olika handlingar behöver olika gränser. Att visa en projektsammanfattning är
inte samma sak som att skicka ett SMS. Att föreslå en faktura är inte samma sak
som att bokföra eller skicka den.

Ett bra system gör den skillnaden begriplig utan att användaren behöver läsa en
säkerhetsmanual.

## “Klart” är ett tekniskt påstående

När en AI använder ett verktyg finns två potentiella berättelser.

Den första är modellens text: “Jag skickade meddelandet.”

Den andra är verktygets utfall: leverantören avvisade anropet, mottagaren
saknade ett giltigt nummer eller databasen returnerade ett fel.

Det är alltid det andra som ska styra statusen.

Om verktyget misslyckades ska användaren få veta det, även om modellen själv
tror att allt gick bra. Om två av tre steg lyckades ska systemet redovisa
delresultatet, inte summera hela ärendet som klart.

Det är en liten teknisk detalj med stor mänsklig konsekvens. Företagaren fattar
nästa beslut utifrån det systemet säger.

## Ett kvitto, inte applåder

Efter en utförd handling behöver användaren inte en segeranimation. Hen behöver
ett kvitto.

Ett bra handlingskvitto svarar på:

- Vad gjordes?
- Av vem eller vilken specialist?
- För vilken kund eller vilket projekt?
- När hände det?
- Vilket faktiskt utfall finns?
- Behöver människan göra något nu?

Om ett ekonomiskt värde visas måste även värdets klass vara tydlig.

“Identifierad potential” är inte “bekräftat betalt”. En offertsumma är inte en
intäkt. En påminnelse är inte orsaken till en betalning bara för att betalningen
kom senare.

Det här kan låta försiktigt. Jag tror att det i längden är det mest offensiva
man kan bygga.

Förtroende skapar användning. Användning skapar bättre underlag. Bättre
underlag gör teamet mer hjälpsamt. Men den loopen fungerar bara om systemet
aldrig tar genvägen via ett påhittat resultat.

## AI måste få säga “jag vet inte”

En annan viktig egenskap är förmågan att avstå.

Om två kunder heter Andersson ska AI:n inte välja en. Om en projektändring
saknar kundgodkännande ska den inte anta att kunden accepterat. Om ett
kapacitetsmål saknar timunderlag ska den inte räkna om kronor till timmar med
en gissad timtaxa.

Ett professionellt system visar tvetydigheten och ber om precis den uppgift som
saknas.

“Jag tror att du menar Badrum — Andersson, Storgatan 14. Är det rätt?”

Den frågan kan kännas mindre magisk än ett omedelbart svar. Men den skyddar
kundrelationen och företagets data.

## Det här är konkurrensfördelen

Många kan koppla en språkmodell till ett API.

Det svåra är att bygga gränsen mellan språk och verklighet: behörigheter,
tenant-isolering, godkännanden, verktygsutfall, bevis och ärlig
resultatredovisning.

Det är den gränsen vi lägger mycket av arbetet på i Handymate.

Våra agenter ska gärna vara drivna. De ska upptäcka, föreslå, samordna och
hjälpa företaget framåt. Men de får aldrig påstå mer än resultaten kan bevisa.

Framtidens AI-team kommer inte vinna för att det pratar mest självsäkert.

Det kommer vinna för att människor vågar lita på det.

**Vad skulle en AI behöva visa för att du skulle låta den utföra arbete i ditt
företag?**
