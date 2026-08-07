# Designbrief till Claude Design — Jarvis-first

*Skriven 2026-08-06. Klistra in avsnittet "Prompten" nedan i Claude Design.
Resten är underlag för oss, inte för prompten.*

---

## Prompten

> Du har tillgång till Handymate-repot och känner produkten. Jag vill ha en
> **mockup av en genomgripande omdesign** där AI-teamet — inte menyn — är
> plattformens gränssnitt. Vi kallar det **Jarvis-first**.
>
> ### Vad Handymate är
>
> En svensk SaaS för hantverkare. Sex namngivna AI-agenter sköter back-office:
> de tar samtal, skriver offerter, jagar fakturor, planerar dagen. Hantverkaren
> är på ett tak eller i ett kryputrymme med telefonen i handen och ofta
> arbetshandskar på. Han har inte tid att leta i en meny — och han ska inte
> behöva veta vilken agent som gör vad.
>
> Kolla `lib/agents/team.ts`, `components/dashboard/agentPersonas.ts` och
> `app/dashboard/IdagCore.tsx` för teamet och dagens Idag-vy, samt
> `docs/HANDYMATE_DESIGN_SYSTEM.md` för det befintliga systemet.
>
> ### Vad Jarvis-first betyder
>
> Idag: en sidomeny med sexton poster, och agenterna dyker upp som kort och
> banners inuti sidorna. Man navigerar till arbetet.
>
> Jarvis-first: **en enda konversationsyta är hemskärmen.** Agenterna
> rapporterar, föreslår och frågar där. Sidorna finns kvar men blir det man
> öppnar för att gräva, inte det man börjar i. Arbetet kommer till en.
>
> Det avgörande: **det ska inte vara en chatbot.** En textruta som svarar är
> inte en förbättring — det är en sämre meny med extra skrivarbete. Det jag
> vill se är hur en yta ser ut där systemet **har gjort saker** och visar upp
> dem för godkännande, med rik struktur i flödet: en offert som går att läsa
> och godkänna på plats, en faktura som kan skickas med ett tryck, en dag som
> kan bokas om genom att dra i den. Skriva ska vara möjligt, aldrig nödvändigt.
>
> ### Leverera
>
> **1. Desktop (1440px)** — hemskärmen. Visa hur det ser ut när fyra saker
> väntar samtidigt: en offert att godkänna, ett missat samtal som blivit en
> lead, en förfallen faktura, och en schemakrock i morgon. Hur skiljer sig det
> som *kräver ett beslut* från det som bara är *värt att veta*? Hur når man de
> gamla sidorna härifrån utan att menyn tar över igen?
>
> **2. Mobil (390px)** — samma skärm, byggd för en tumme och handskar. 44px
> minsta träffyta. Det här är huvudytan, inte den nedskalade versionen.
>
> **3. Ett djupdyk** — hantverkaren öppnar offertkortet i flödet. Hur mycket
> går att göra utan att lämna hemskärmen, och var går gränsen till den fulla
> offerteditorn?
>
> **4. Agentspråket** — hur en agent syns när den talar. Vi har sex stycken
> med varsin färg, men en yta som visar hela teamet får inte bli en
> färgkarusell. Föreslå en konvention och visa den tillämpad. Vad händer när
> tre agenter rapporterar i följd? Hur ser en agent ut som *frågar* jämfört med
> en som bara *berättar*?
>
> ### Håll fast vid
>
> - **Ljust tema, teal `#0F766E`** som primärfärg. Aldrig mörkt, aldrig lila.
> - **All text på svenska**, och inga tekniska ord: aldrig "agent", "webhook",
>   "token", "prompt" eller "körning" i gränssnittet. Agenterna har namn.
> - **Sparsamhet med signaler.** Amber betyder "titta här" och används bara när
>   det är sant. Blir allt viktigt slutar man läsa allt.
> - **Aldrig påstå något som inte stämmer.** En sak som inte är granskad får
>   inte bära en bock.
>
> ### Två frågor jag vill ha svar på i designen
>
> 1. **Vad händer när ingenting väntar?** En tom hemskärm på en lugn tisdag är
>    designens svåraste läge — den får varken se trasig ut eller hitta på
>    sysslor.
> 2. **Hur ser man vad som redan hänt utan att godkänna igen?** Hantverkaren
>    måste kunna lita på att systemet gjorde rätt när han inte tittade.
>
> Motivera valen. Jag är mer intresserad av *varför* en yta ser ut som den gör
> än av hur många skärmar du hinner med.

---

## Underlag (inte del av prompten)

**Varför nu.** Snabbofferten visade att strukturen kan bära ansvaret för att
inget glöms — sektionsgranskningen frågar utan att någon skriver. Jarvis-first
är samma tanke skalad till hela plattformen.

**Risken.** Att det blir en chatbot. Därför är den formuleringen den hårdaste
meningen i prompten. Konversation som *layout* är poängen; konversation som
*inmatningsmetod* är ett steg bakåt för någon med handskar på.

**Vad vi redan vet fungerar.** Godkännandekorten. Hantverkaren läser, trycker
en gång, och det blir gjort. Det är Jarvis-first i miniatyr — hela designen är
egentligen frågan om den formen bär en hel plattform.

**Kända problem designen bör lösa:**

- Agentkällan finns i fyra kopior (`lib/agents/team.ts`,
  `components/dashboard/agentPersonas.ts`, samt inlinade kopior i
  `approvals/page.tsx` och `MorningBriefWidget.tsx`) med olika färgvärden, och
  Lisa saknas helt i morgonbriefen.
- Designsystemets regel "max två accentfärger per vy" är oförenlig med en yta
  som visar hela teamet. Konventionen vi följer i praktiken är att teal är
  chrome och per-agent-färg bara sitter på avataren — den behöver skrivas ned
  och prövas.
- Sidomenyn har sexton poster. En Jarvis-first-hemskärm måste ge en väg till
  dem utan att återuppfinna menyn.
