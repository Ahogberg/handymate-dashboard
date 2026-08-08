# CODEX — Epic 5: Demo Story & Presenter Mode

**STARTA FÖRST NÄR EPIC 4 ÄR MERGAD** — storyn pekar på reset-manifestet.
Din audit (avsnitt 13/14/16/22) är specen; det här preciserar den mot koden.

## Uppgiften

En repeterbar sexstegsberättelse ovanpå riktiga komponenter, plus en
presentatörsrad som bara presentatören ser.

### 1. Storykonfigen — typad TS, ingen databas

Ny fil `lib/demo/story.ts` med din auditens `DemoStep`-form. Sex steg enligt
auditens rekommenderade berättelse (Matte-brief → Daniel intäkt → Lars
marginal → Karin pengar hem → live Matte → recap). Varje stegs `entityKey`
pekar på reset-manifestet (`business_preferences` nyckel `demo_manifest`,
Epic 4). `targetRoute` är RIKTIGA produktionsroutes
(`/dashboard/quotes/<id>` etc, id ur manifestet).

**Beloppsregeln är absolut:** talking points innehåller ALDRIG hårdkodade
belopp. Skriv "offerten värd {amount}" och låt presenterpanelen läsa beloppet
ur samma endpoint som ytan visar (`/api/dashboard/pengar`, offert-API:t).
Manus och data kan aldrig divergera om manuset inte bär siffror.

### 2. Presenterpanelen

Ny `components/demo/PresenterBar.tsx`, monterad i dashboard-layouten MEN:

- renderas ENDAST när `business.business_id === NEXT_PUBLIC_DEMO_BUSINESS_ID`
  (exponera env-värdet via en publik variabel som bara är satt i demomiljön)
  OCH användaren är owner/admin
- state (aktuellt steg) i `sessionStorage` — ingen server-sync i V1, enligt
  din egen audit
- [Föregående] [Steg 2/6 + talking point] [Nästa] [Återställ]
- Nästa/Föregående NAVIGERAR (router.push till targetRoute) — skapar eller
  slutför aldrig affärshändelser
- Återställ anropar befintliga demo-reset-API:t och nollställer sessionStorage
- Prospektets vy är orörd produktion — panelen är en smal rad överst, inga
  demo-specialversioner av sidor

### 3. Live Matte-steget (steg 5)

Enligt auditens "minsta realistiska live-steg": panelen navigerar till
manifest-objektet, presentatören ställer frågan själv i Jobbkompisen.
INGEN förskriven AI-text, ingen mock. Om Matte inte hittar objektet är
fallbacken att öppna objektvyn via targetRoute — panelen visar den knappen
alltid. Bygg ingenting i chatten för detta steg — Claude äger chattrouten
(Epic 1–2 pågår där).

### 4. Recap-steget (steg 6)

Läser `/api/dashboard/pengar` + `/api/dashboard/weekly-value?days=30` och
visar kategorisummorna med samma separation som ytorna (identifierad
potential ≠ bekräftat). Dubbelräkna aldrig: recapen SUMMERAR INTE de två
talen till en siffra.

## Rör INTE

- `app/api/matte/chat/route.ts`, `lib/agent/**`, `lib/matte/**`,
  `components/Jobbkompisen.tsx`, `components/MatteChatModal.tsx` (Claudes lane)
- `lib/moments/**`-logiken (läs gärna, ändra inte)
- Seedinnehållet — storyn anpassar sig till datan, aldrig tvärtom

## Tester

- storykonfigen: sex steg, varje entityKey finns i manifest-typen, varje
  targetRoute matchar en existerande route-mapp under app/dashboard/
- inga siffror i talking points (regex-facit: talking points får inte matcha
  /\d{3,}\s*kr/)
- PresenterBar renderar null utan demo-tenant och utan owner/admin
- recapen blandar aldrig potential och bekräftat i en summa (källäsande facit)
