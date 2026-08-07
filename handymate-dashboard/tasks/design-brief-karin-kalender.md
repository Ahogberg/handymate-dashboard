# Designbrief till Claude Design — Karins bolagskalender

*Skriven 2026-08-07. Klistra in avsnittet "Prompten" i Claude Design.
Resten är underlag för oss.*

---

## Prompten

> Du har tillgång till Handymate-repot. Jag vill ha en **omdesign av Karins
> bolagskalender** — en ny yta som redan är byggd och fungerar, men aldrig
> designad.
>
> ### Vad den är
>
> Karin är teamets ekonom. Bolagskalendern räknar fram företagets svenska
> myndighetsdatum ur dess profil: momsdeklaration, arbetsgivardeklaration,
> preliminärskatt, inkomstdeklaration, årsredovisning, årsstämma. Sex regler,
> och varje datum kan förklara varför det ser ut som det gör.
>
> Ytan finns i `app/dashboard/karin/page.tsx`. Logiken i `lib/karin/`. Den ser
> bara ägaren och administratören — en montör ska inte se moms och bokslut i
> förbifarten.
>
> **Läs `docs/HANDYMATE_DESIGN_SYSTEM.md` först**, särskilt avsnitt 4b om
> agentytor. Och titta på `components/agents/AgentDecisionCard.tsx` och
> `components/jarvis/JarvisHome.tsx` — kalendern ska tala samma språk som
> hemskärmen, inte uppfinna ett eget.
>
> ### Den bärande principen
>
> **En felaktig deadline är värre än ingen deadline.** Skatteverkets
> förseningsavgift är 625 kr — men skadan är att en hantverkare som litat på
> Karin en gång slutar lita på henne för allt annat.
>
> Därför bär varje datum en förklaring ("du redovisar moms per kvartal, och
> momsen ska in senast den 12:e i andra månaden efter perioden"), en källa till
> myndighetens egen sida, och en **säkerhetsgrad**. Designen ska bära det, inte
> gömma det.
>
> ### Fyra frågor jag vill ha svar på
>
> **1. Hur ser ett datum ut som Karin inte är säker på?**
>
> Det här är den intressantaste. Tre av sex regler har lägre säkerhet:
> preliminärskatten beror på ett besked vi inte har, inkomstdeklarationen på om
> man lämnar digitalt eller på papper, årsstämman är en yttersta gräns snarare
> än ett datum. Där ska Karin säga *stäm av med din redovisningsbyrå* i stället
> för att gissa snyggt.
>
> Just nu är det en grå ruta med en mening. Men det är **den enda platsen i hela
> produkten där en agent säger "jag vet inte säkert"** — och det förtjänar en
> egen form. Hur ser osäkerhet ut utan att se ut som ett fel?
>
> **2. Hur skiljs förfallet från om tre dagar från om två månader?**
>
> Alla tre står i samma lista. Amber används i dag bara på det förfallna, enligt
> husregeln att amber betyder att pengar eller tid går förlorade om ingen tittar.
> Räcker det, eller behöver närheten i tid en egen visuell bärare?
>
> **3. Vad ska stå när profilen är ofullständig?**
>
> Kalendern kan bara räkna det den vet. Saknas momsperioden finns ingen
> momsdeklaration — och en tom kalender som betyder "vi vet inte" får **aldrig**
> se ut som en som betyder "allt är lugnt". Just nu ber sidan om uppgifterna i
> ett amber-kantat kort. Är det rätt ton, eller är det för alarmerande för något
> som bara är ofyllt?
>
> **4. Tolv datum på en telefon.**
>
> Månadslistan är byggd men aldrig sedd på 390 px. Hantverkaren står på ett tak
> med handskar. 44 px minsta träffyta.
>
> ### Leverera
>
> **1. Kalendersidan, desktop (1440 px)** — hela vyn: hälsning, "kräver din
> uppmärksamhet", kommande 90 dagar per månad. Visa den i två lägen: ett med
> tre saker som brådskar, och ett lugnt där nästa datum ligger sex veckor bort.
>
> **2. Samma sida på mobil (390 px).**
>
> **3. Ett osäkerhetskort** — svaret på fråga 1, i sitt sammanhang.
>
> **4. Det ofullständiga läget** — svaret på fråga 3.
>
> **5. En liten sak: granska widgeten.** `components/karin/KarinCalendarWidget.tsx`
> sitter i högerspalten på `/dashboard/hem` och är byggd som mockupens
> gräv-kort ("Dagens plan") med andra data. Den behöver inte ritas om — men
> jag har lagt till en högerställd nedräkning ("14 dgr", "försenad" i amber)
> som inte finns i originalkortet. Säg om den bär eller stör.
>
> ### Håll fast vid
>
> - **Ljust tema, teal `#0F766E`.** Aldrig mörkt, aldrig lila.
> - **Färgen bor i avataren.** Karins blå (`#2563eb`) sitter på avatarcirkeln
>   och ingen annanstans — inte på kortram, bakgrund eller knapp.
> - **All text på svenska**, inga tekniska ord. Karin har ett namn.
> - **Amber bara när det är sant.** Blir allt gult slutar man läsa gult.
> - **Karin är beslutsstöd, inte skatterådgivning.** Det ska synas i tonen utan
>   att bli en ansvarsfriskrivning som skyms bort längst ned.
>
> ### En sak den inte får bli
>
> En kalender. Google har redan en. Det här är en ekonom som går igenom bolaget
> och lyfter det ägaren behöver agera på — *vad, när, varför, och vad som händer
> om jag missar det.* Prioritera det framför fler rutor och fler månader.
>
> Motivera valen. Jag är mer intresserad av varför en yta ser ut som den gör än
> av hur många skärmar du hinner med.

---

## Underlag (inte del av prompten)

**Varför nu och inte tidigare.** Samma ordning som Snabbofferten och
Jarvis-vyn: mekanik först, design ovanpå en fungerande yta. Sidan räknar
riktiga datum ur riktig data — Design ritar mot något som lever, inte mot en
skiss.

**Vad som redan är avgjort och inte ska omprövas:**

- Ägare **eller** admin, inte strikt ägare. Admin är ofta den som sköter
  böckerna.
- 90 dagar på sidan, 30 i widgeten. Widgeten svarar på en enda fråga — vad
  ligger närmast.
- Bara förfallet och brådskande (≤3 dagar) lyfts till "kräver din
  uppmärksamhet". Att lyfta allt inom en månad gör sektionen till en andra
  kalender.
- Belopp visas inte. V1 vet inte hur mycket moms som ska betalas, och `0 kr`
  hade påstått att det är gratis.

**Det jag är osäker på i min egen lösning** (och alltså gärna vill bli
motsagd om):

- Widgeten **renderar ingenting alls** när profilen är ofullständig. Tyst
  hellre än osann — men kanske borde den i stället be om uppgifterna, eftersom
  hemskärmen är där folk faktiskt är.
- Nedräkningen i widgeten. Se punkt 5 i prompten.
- "Markera hanterad" är den enda handlingen på ett kort. Räcker det, eller
  saknas "påminn mig igen om en vecka"?
