# Partnerpaketet — komplett innehållsförteckning

_Version 1.0, 2026-08-19. Det här är hela paketet en ny partner får efter
signerat avtal. Internt: allt material i mappen är skrivet mot
`tasks/capability-inventory.md` och `tasks/sales-arsenal.md` — uppdateras
något där måste det speglas här. Partnern improviserar aldrig bortom paketet._

## Vad paketet innehåller

| # | Dokument | Vad det är | När partnern använder det |
|---|---|---|---|
| — | `partner-paket.md` | Grunddokumentet: P-kod, provision, demokonto, regler | Läses först, vid onboarding |
| 1 | `01-vad-ar-handymate.md` | Enkelt förklarat — vad systemet är och gör, för en lekman | Läses innan första säljsamtalet; kan även skickas till prospekt |
| 2 | `02-funktionsguide.md` | Alla funktioner, förklarade utan teknikspråk | Uppslagsverk — när prospektet frågar "kan det…?" |
| 3 | `03-motorerna-enkelt-forklarat.md` | AI-teamet och de intelligenta motorerna — hur det faktiskt funkar | När prospektet (eller partnern själv) vill förstå "AI-delen" |
| 4 | `04-saljmanus.md` | Manus: kallt samtal, bokning, mötet, avslut, uppföljning | Före och under varje säljaktivitet |
| 5 | `05-pitchpunkter.md` | De starkaste argumenten, rankade + hisspitch 30 sek / 2 min | Memoreras — det här är ammunitionen |
| 6 | `06-invandningar-och-faq.md` | Utökad invändningshantering + vanliga frågor med svar | Efter varje demo; innan svåra möten |
| — | `partneravtal-utkast.md` | Avtalet (internt utkast — jurist-granskas innan användning) | Signeras före aktivering |

**Word-versioner:** varje dokument finns även som `.docx` i `word/`-mappen
(färdiga att skicka/skriva ut). De genereras från markdown-filerna med
`node scripts/partner-paket-till-word.js` — kör om skriptet efter varje
ändring i denna mapp så versionerna hålls i synk. Markdown är alltid
originalet; redigera aldrig direkt i Word-filerna.

**Utanför denna mapp men del av paketet:**

- Pitch-decken — delas separat (mobilanpassad, 8 min + demo)
- Demo-manuset — `tasks/demo-manus.md` (15-minutersdemon, två varianter)
- Demokontot — uppgifter delas separat; återställs på `/dashboard/demo`
- Jämförelsesidan — handymate.se/jamfor
- Agentsidorna — handymate.se/ai-team
- ROT-kalkylatorn — handymate.se/rot-kalkylator

## Läsordning för en ny partner

1. `partner-paket.md` — särskilt avsnitt 4, "Vad du ALDRIG får säga"
2. `01-vad-ar-handymate.md` — förstå produkten som kunden ska förstå den
3. `03-motorerna-enkelt-forklarat.md` — förstå varför den är svår att kopiera
4. `05-pitchpunkter.md` — lär dig de sex replikerna utantill
5. `04-saljmanus.md` + demo-manuset — öva demon i demokontot minst två gånger
6. `06-invandningar-och-faq.md` — läs igen efter din första riktiga demo
7. `02-funktionsguide.md` — bläddras vid behov, ingen pluggar den

## Den enda regeln som är viktigare än allt annat

Handymates position bygger på att vi aldrig överlovar. Varje dokument i
paketet är granskat mot vad som faktiskt är byggt och i drift. Säg aldrig
något om produkten som inte står i paketet eller som du inte själv sett i
demokontot. Osäker? Svara: _"Bra fråga — jag kollar med Handymate och
återkommer idag."_ Det svaret har aldrig kostat en affär. Ett överlöfte
har det.
