# UI/UX-audit — Jarvis-riktningen (2026-07-23)

Kört som 3 parallella Explore-agenter (kommando→utförande, kö+upptäckbarhet,
navigation+mobil). Andreas godkände auditen; besluten längst ned.

## Kärnverdikt
**Inte ett Jarvis-bygg-problem — ett Jarvis-monterings-problem.** Delarna finns
byggda men är fragmenterade, felkopplade och de bästa ligger döda/oanslutna.

## Fynd (kondenserat, fil:rad i agent-transkripten)

**1. Riktiga Matte är oåtkomlig.** Den kraftfulla motorn `/api/matte/chat`
(utför på riktigt via delade tool-routern) har ingen knapp — öppnas bara auto
på /dashboard/agent om man chattat <6h. Globala bubblan alla ser ("Jobbkompisen",
`/api/ai-copilot`) är en ANNAN, svagare motor som bara föreslår + har en egen
sämre faktura/offert-logik i `/api/jobbuddy/actions` med SLUMPADE fakturanummer
(`invoice_number = Math.random()`). **Regression jag införde:** när "Prata med
Matte"-modulen städades bort 2026-07 litade jag på en kodkommentar ("Matte nås
via globala widgeten") som var FALSK — globala widgeten är Jobbkompisen, inte
matte/chat. Jag tog bort den enda upptäckbara ingången till riktiga Matte.

**2. Kommando→utförande oförutsägbart + ogatat.** Samma mening ger 3 utfall
(direkt-skickat i MatteChatModal / trasigt kort som 404:ar i Jobbkompisen /
"kommer snart"-toast på orphan-röstsidan). Chat-vägen sätter hårdkodat
`triggerSource:'user'` → externa utskick går ALLTID direkt, ingen förhandsvisning,
ingen gate. Motsäger "du sitter kvar vid ratten".

**3. Bästa bitarna döda:** per-agent-morgonbrief (`lib/matte/morning-brief.ts`)
byggd men `MorningBriefWidget` monteras aldrig; rik autonomi-styrning
(`AutonomySettings`, facit+risk) bakom flagga som aldrig sätts; kön i 3
renderingar (2 live + död `PendingApprovalsBlock`); 2 konkurrerande morgon-nycklar
(`morning_brief_latest` vs `morning_report_latest`); orphan-röstsida
`/dashboard/assistant` (ingen menylänk, utför inget).

**Det som redan är RÄTT:** IdagCore ≈70 % av en briefing-framdörr (inverterad
hierarki, namngivet team, bevisband, kö-först, 5s ångra, agent-attribution).
Mobilappen (handymate-mobile, separat repo) har redan `MatteDockBar` → riktiga
Matte. Navigations-last dock tung: 13 top-level, ~23 löv, ~14 ERP-formulär.

## Beslut (Andreas 2026-07-23)
1. **Chattmotorn:** JA — en motor, riktiga Matte. Globala bubblan → `/api/matte/chat`,
   ai-copilot/jobbuddy-motorn pensioneras.
2. **Tempo:** säker konsolidering NU; stora IA-omdesignen efter pilotens feedback.
3. **Framdörren:** mobil-först (fältet + docken finns redan där); dashboarden = backoffice.

## Faser
- **Fas 0 (BYGG NU) — En Matte, nåbar, säker** (spec nedan).
- Fas 1+ (EFTER PILOT, MOBIL-FÖRST): förena framdörr+kö+brief, montera
  morgonbriefen, konsolidera köns 3 renderingar, IA-bantning, Jarvis-docken
  i mobilappen. Byggs INTE nu.

---

## Fas 0 — SPEC (säker konsolidering, dashboard-repo)

Princip: fixa trasig/farlig plumbing + gör riktiga Matte synlig och säker.
INGEN framdörr-omdesign (det är mobil-först/efter-pilot). Behåll bubblans
visuella skal — byt hjärnan + lägg säkerhetsräcket.

1. **Globala bubblans CHAT-flik → `/api/matte/chat`** (riktiga multi-agent-Matte)
   istället för `/api/ai-copilot`. Behåll bubbelskalet. Placeholder "Fråga Matte
   något…" → "Be Matte göra något…".
2. **Säkerhetsräcke (kommando med koppel) — OBLIGATORISKT med #1.** Nytt
   request-param `require_confirm_external` (default FALSE → mobilappen, som
   anropar matte/chat utan paramen, är OPÅVERKAD). Dashboard-bubblan sätter TRUE.
   När TRUE: om modellen anropar ett EXTERNT utskicksverktyg (`send_sms`,
   `send_email`, skicka-faktura/offert) EXEKVERAS INTE — routen returnerar en
   strukturerad "väntar på bekräftelse" (verktyg + mänsklig sammanfattning +
   args). Klienten renderar ett bekräftelsekort ("Skicka SMS till Anna: '…' —
   [Skicka] [Avbryt]"); vid [Skicka] återanropas matte/chat med bekräftelse så
   just den åtgärden körs. Interna verktyg (sök/hämta/skapa UTKAST) körs direkt.
   Gräns: bekräfta endast det som LÄMNAR huset (SMS/mail + skicka faktura/offert);
   skapa offert/faktura som utkast = internt, ingen bekräftelse.
3. **Upptäckbarhet:** återinför exempel-KOMMANDON i bubblans tom-state
   ("Skicka påminnelse till kunder med sena fakturor", "Boka platsbesök hos …",
   "Följ upp offerten till …") + ett par frågor. Kopplade till riktiga Matte.
4. **Pensionera farliga dubbletter:** neutralisera `jobbuddy/actions`
   create_invoice/create_quote (Math.random-fakturanummer FÅR inte kunna skapas
   — routa genom riktiga tool-routern eller ta bort de action-typerna). Sluta
   anropa `/api/ai-copilot` chat-läge från bubblan (märk deprecated; rör inte
   delad kod som röst/foto-flikarna behöver). Röst/foto-flikarnas INPUT
   (transkribering/foto-analys) får vara kvar, men resulterande ÅTGÄRDER måste
   gå via säkerhetsräcket/riktiga tool-routern, aldrig den slump-fakturalogiken.
5. **Orphan-städ (lågprio, valfritt i samma svep):** ta bort döda/oåtkomliga
   `/dashboard/assistant` + `/api/assistant/command`; döda widget-filer
   (`PendingApprovalsBlock`, `TeamObservationsCard`, `AICopilot`) om det inte
   sväller diffen.

**EJ i Fas 0 (deferred, mobil-först/efter-pilot):** framdörr-förening, montera
MorningBriefWidget, konsolidera köns 3 renderingar, morgon-nyckel-dedup,
IA/nav-bantning, mobilappens Jarvis-dock.

**Verifiering:** tsc (memory-kommandot) 0 fel + ren build. Manuellt: öppna
bubblan på valfri sida → riktiga Matte → externt kommando → bekräftelsekort →
Skicka → skickas + toast; internt kommando → körs utan bekräftelse; INGEN väg
skapar faktura med slumpnummer. Cross-repo: mobilappen (matte/chat utan
paramen) oförändrad.
