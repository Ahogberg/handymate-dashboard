# Gyllene vägen — en vandring genom hela kedjan

**Tid:** 45–60 minuter. **Bäst:** telefonen i handen för steg 1–5, datorn för resten.

Det här är inte ett användartest. Christoffer-testet mäter hur det *känns*; det
här mäter om det är *sant*.

Vi ändrade tolv saker i dag. Flera av dem hade varit trasiga i månader utan att
någon märkte det — intäktssvepet hade aldrig skapat ett kort, kundens portal
visade tomma sektioner, och auto-fakturan sa "skickad" om fakturor som aldrig
lämnat huset. Facit är gröna, men facit läser källkod. **Den här vandringen är
det enda som visar att det verkar i verkligheten.**

**Skicka allt till dig själv, aldrig till en riktig kund.** Skapa en testkund med
din egen mejl och ditt eget nummer.

Kör `sql/verify-state-gyllene-vagen.sql` först och klistra tillbaka svaret — då
vet vi vilket läge databasen är i innan du börjar klicka.

---

## 1. Skapa offerten

Telefonen. **Ny offert** → du landar i *"Berätta om jobbet"*. Prata in ett jobb,
lägg till ett foto, välj din testkund, tryck **Bygg utkast**.

**Ska ha hänt:** ett utkast med rader och priser, inte en tom mall.

> Fick offerten ett synligt offertnummer? Saknas det har den skapats någon
> annanstans än där vi tror.

## 2. Skicka den

Skicka till dig själv. Öppna mejlet **och** SMS:et.

**Ska ha hänt:** båda kommer fram, och länken går att öppna.

> Står det någonstans i appen att den är skickad *innan* du sett den i din inkorg?

## 3. Acceptera via länken — och titta i nätverksfliken

Öppna signeringslänken i webbläsaren på datorn. **Innan** du signerar: högerklick
→ *Granska* → fliken **Nätverk** → ladda om sidan → klicka på anropet som hämtar
offerten → **Svar**.

**Ska INTE finnas där:** `sign_token`, `signature_data`, `signed_by_ip`,
`personnummer`, `fastighetsbeteckning`, `source_transcript`.

Det var en läcka vi lagade i dag — hela offertraden skickades ut till vem som
helst med länken. Ser du något av fälten är fixen inte live.

Signera sedan.

> Vilka fält såg du i svaret?

## 4. Försök ändra den accepterade offerten

Gå tillbaka till offerten i appen och försök redigera priset eller en rad.

**Ska ha hänt:** ett tydligt svenskt meddelande om att innehållet är låst och att
du skapar en ny version i stället.

Det här är dagens enda kundvända yta för innehållslåset. Går det att spara är
låset inte live — och då kan en signerad offert fortfarande skrivas om under
kundens signatur.

> Vad stod det exakt? Förstod du vad du skulle göra i stället?

## 5. Projektet

Gå till Projekt.

**Ska ha hänt:** **exakt ett** projekt, med rätt kund och koppling till offerten.

Auditen hittade tre olika projektskapare som kör i olika ordning beroende på hur
offerten accepterades. Två projekt här betyder att de trampar på varandra.

> Ett eller flera? Rätt kund? Syns offerten på projektet?

## 6. Arbeta på det

Lägg en tidrapport och ett material. Skriv en rad i byggdagboken. Boka in ett
besök framåt i tiden.

Öppna sedan **kundens portal** (länken kunden får).

**Ska ha hänt:** portalen visar nästa besök och den senaste dagboksanteckningen.

Båda var tomma före i dag — frågorna bad om kolumner som inte fanns, och felet
swaljdes tyst. Är de tomma nu är den fixen inte live.

> Syns nästa besök? Syns dagboksraden?

## 7. Markera projektet klart — dagens tyngsta steg

**Ska ha hänt:**

- fakturan skapas som **utkast**, inte som skickad
- du får ett **kort i godkännande-kön** om att granska den
- SMS:et till dig säger att fakturan är skapad, **inte** att den skickats

Får du ett SMS om att fakturan gått iväg till kunden är N3 fel, och då jagar
hantverkare betalning för fakturor kunden aldrig fått. Det var precis felet vi
lagade: sändningen anropade en rutt som kräver inloggning, misslyckades varje
gång, och ingen märkte det eftersom svaret kastades bort.

> Vad står det på fakturan? Vad sa SMS:et? Kom kortet?

## 8. Skicka fakturan från gränssnittet

Öppna fakturan, granska, skicka.

**Ska ha hänt:** den kommer fram till din inkorg, och först **efter** det står
den som skickad.

> Kom den fram? När bytte statusen?

## 9. Markera betald

**Ska ha hänt:** projektets ekonomi följer med — intäkten syns på projektet.

> Stämmer siffrorna mot vad du fakturerade?

## 10. Kolla godkännande-kön

Öppna kön och titta igenom korten som ligger där.

**Ska ha hänt:** varje kort går antingen att godkänna med en tydlig följd, eller
säger att det behöver granskas. **Inget kort ska svara "Godkänt utan specifik
åtgärd".**

Den texten kom från en gren som gissade sig fram — och som i vissa fall skickade
ett riktigt SMS till kunden för korttyper ingen byggt en hanterare för.

> Fanns det kort du inte förstod? Något som såg ut att göra ingenting?

## 11. Karins bolagskalender

Öppna kalendern. Kvittera en deadline. Ladda om sidan.

**Ska ha hänt:** kvitteringen sitter kvar, det står vem som gjorde den, och det
finns en **Ångra**-knapp.

**Ska INTE ha hänt:** att posten försvinner helt, eller att något påstår att
deklarationen är inlämnad.

> Gick det att ångra? Stod det någonstans att något var "klart" eller "inlämnat"?

## 12. Inställningarna på telefon

Telefonen igen. Öppna Inställningar.

**Ska ha hänt:** sex områden. Borra dig ner till **Offerter & fakturor** och
vidare till en enskild inställning.

Före i dag filtrerade mobilmenyn bort varje post som ledde till en egen sida —
hela offertkonfigurationen var oåtkomlig på telefon, liksom Bolagsprofilen som
kalendern räknar sina datum ur.

> Nådde du allt med tummen? Var det tydligt vad som öppnades på plats och vad
> som ledde vidare?

---

## Vad du ska titta efter som inte är ett eget steg

**Tomma listor som borde ha innehåll.** Det har varit dagens genomgående fel: en
fråga bad om en kolumn som inte fanns, felet swaljdes, och resultatet blev en tom
lista som såg ut som "inget att visa". Ser du en tom sektion — fråga dig om den
borde vara tom.

**Allt som påstår att något skickats.** Varje gång appen säger *skickad*,
*levererad* eller *klart* — kontrollera att det stämmer. Det var mönstret bakom
tre av dagens fixar.

**Siffror som är för runda.** Ett belopp som är exakt 0 kr, en procent på jämnt
100, en lista med exakt fem poster. Ofta betyder det att ett fallback-värde
slagit till i stället för riktig data.

**Något som blev sämre.** Vi failar nu stängt på okända korttyper och låser
accepterade offerter. Om något du brukade kunna göra plötsligt vägrar — säg till.
Det är i så fall vi som dragit gränsen på fel ställe.

---

## När du är klar

Skriv svaren löpande, även korta. Ett *"steg 7 sa skickad"* är mer värt än en
snygg rapport.

Fynden skrivs in i `docs/council/ACTIVE_ROADMAP.md` under pilotgrinden och avgör
om Revenue Recovery V1 får starta — eller om något i NOW-vågen måste tas om.
