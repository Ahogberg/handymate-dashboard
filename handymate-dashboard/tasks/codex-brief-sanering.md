# Brief till Codex — sanering och stängning

*Skriven 2026-08-07. Ge hela filen till Codex.*

---

## Vad du ska göra

Rensa död kod och stäng öppna trådar i Handymate. **Du ska inte bygga nya funktioner.**
Uppdraget är att göra kodbasen mindre, inte större.

Allt nedan är verifierat att finnas. Arbeta uppifrån och ned, en punkt per commit.

---

## Vad du INTE får röra

En annan agent arbetar parallellt i de här filerna just nu. Rör du dem blir det merge-arbete
åt någon annan, inte hjälp.

```
lib/karin/**
components/karin/**
components/jarvis/**
components/agents/**
app/dashboard/karin/**
app/dashboard/hem/**
app/api/karin/**
app/api/business-config/company-profile/**
app/dashboard/settings/bolagsprofil/**
app/onboarding/**
components/Sidebar.tsx
components/dashboard/IdagCore.tsx
```

Behöver en av dina uppgifter röra en av dem: **hoppa över uppgiften och skriv varför i din
rapport.** Fråga inte om lov, gå vidare till nästa.

---

## Uppgifterna

### 1. Två omonterade komponenter

Båda kompilerar, ingen renderar dem.

- **`components/dashboard/MorningBriefWidget.tsx`** — enda referenserna är kommentarer i
  `app/dashboard/page.tsx:122,400` och `components/TeamActivityStrip.tsx:111`. Innehållet
  flyttade in i `TeamActivityStrip` i "dashboard-städpaketet del D".
- **`components/dashboard/EarnedAutonomyPanel.tsx`** — enda träffarna är planfiler i `tasks/`.

Ta bort båda filerna. Uppdatera kommentarerna som hänvisar till dem så de inte pekar på något
som inte finns. Verifiera med `grep -rn "MorningBriefWidget\|EarnedAutonomyPanel" --include=*.tsx --include=*.ts .`
att inget återstår utom i `tasks/`.

### 2. `case_record` — trolig död kvarleva

Tabellen finns i prod utan migrationsfil. Den har **en** referens i koden och ingenting som
skapar eller läser rader. Utred: finns någon skrivväg alls? Om inte, ta bort referensen och
posten ur `MANUAL_TABLES` i `tests/schema-contract.spec.ts`.

**Ta inte bort tabellen i databasen** — migrationer körs manuellt av ägaren. Skriv i stället
en rad i din rapport om att den kan droppas.

### 3. `human_followup_queue` — skrivs men läses aldrig

Tre ställen skriver till den, inget läser. Antingen är det en tyst läcka (något som skulle
hanterats men aldrig blir det) eller ren död vikt.

**Utred först, ta inte bort direkt.** Rapportera vilka tre ställen som skriver och vad de tror
händer sedan. Det här är den enda uppgiften där svaret kan bli "det här är en bugg, inte död
kod" — och då är fyndet mer värt än städningen.

### 4. `/api/dashboard/today` — bara refererad från ett test

Enda referensen är `tests/comprehensive.spec.ts:87`. Rutten används inte av Idag-vyn.

Den har dessutom ett troligt fel: `app/api/dashboard/today/route.ts:75-76` selectar
`id, title, customer_name, scheduled_date` från `booking`, men primärnyckeln heter
`booking_id` och övriga rutter använder `notes` + join mot `customer`.

Antingen fungerar rutten inte alls, eller så finns kolumnerna och resten av kodbasen har fel.
**Utred vilket.** Om rutten är trasig och oanvänd: ta bort den och testet som pekar på den.

### 5. Två cron-rutter som aldrig körs

`app/api/cron/expire-approvals/` och `app/api/cron/sync-phone-webhooks/` finns som routes men
saknas i `vercel.json`. De körs alltså aldrig.

**Utred vilket som är rätt:** ska de köras (lägg till i `vercel.json`) eller är de döda (ta
bort)? `expire-approvals` låter som något som faktiskt behövs — utgångna godkännanden som
aldrig stängs blir en växande kö. Rapportera din bedömning, ändra inte `vercel.json` utan att
säga varför.

### 6. Två Fortnox-rutträd

Dokumenterad teknisk skuld. `lib/fortnox.ts:10-14` säger det själv:

> "callback ligger under /api/integrations/fortnox/* (nya route-stacket med förstärkt
> audit-loggning), inte /api/fortnox/* (gamla). Settings-sidan anropar fortfarande
> /api/fortnox/connect […] TD att konsolidera båda route-trees."

Konsolidera till `/api/integrations/fortnox/*`. Peka om anroparna. Behåll audit-loggningen —
den finns bara i det nya trädet.

**Notera:** Fortnox är licensblockerat och integrationen är aldrig verifierad mot ett riktigt
kundkonto (`tasks/fortnox-license-blocker.md`). Det här är städning, inte funktion — bryt
ingenting i tron att du förbättrar flödet.

### 7. Facit för otestade rena funktioner

Leta i `lib/` efter exporterade rena funktioner utan test i `tests/`. Skriv facit för dem.

Prioritera i den här ordningen: pengar, datum, behörighet, allt annat. En funktion som räknar
kronor eller avgör vem som får se något är värd ett test; en formaterare är det sällan.

Följ tonen i `tests/quote-preview-summary.spec.ts` eller `tests/karin-obligations.spec.ts`:
testnamnen ska säga vad som står på spel, inte vilken funktion som anropas.

---

## Husets regler — gäller utan undantag

Läs `CLAUDE.md` först. Det viktigaste:

- **SQL-migrationer är `.sql`-filer i `sql/`**, namngivna `vNN_namn.sql`, som körs **manuellt**
  i Supabase SQL Editor. Kör aldrig en migration programmatiskt. Nästa lediga nummer är v96.
- **All UI-text på svenska.** Inga tekniska ord som "agent", "webhook", "token", "payload"
  synliga för slutanvändaren.
- **Ljust tema, teal `#0F766E`.** Aldrig mörkt, aldrig lila.
- **UTF-8 med riktiga å, ä, ö.** Aldrig `å`. Redigera aldrig projektfiler via PowerShell —
  `Get-Content`/`Set-Content` förstör svenska tecken.
- **Kontrollera att tabeller och kolumner finns** i `sql/` innan du skriver en query.
  PostgREST 400:ar hela frågan om en uppräknad kolumn saknas.

---

## Verifiering — så här vet du att du är klar

Efter **varje** uppgift:

```
npx tsc --noEmit
npx next build
npx playwright test --no-deps --reporter=line
```

**Läs felsammanfattningen, inte slutet av utdatan.** Playwright skriver en lista över körda
tester sist, och det är lätt att tro att allt är grönt när felen står ovanför. Gör så här:

```
npx playwright test --no-deps --reporter=line 2>&1 | grep -E "^\s+[0-9]+ (passed|failed)"
```

Det ska stå `passed` och ingen rad med `failed`. Just nu är siffran ungefär 2620.

**Ignorera** fel med `ENOENT: playwright/.auth/user.json` — de testerna kräver en igångsatt
dev-server och en inloggad session, och räknas inte.

Kör dessutom `npx playwright test tests/schema-contract.spec.ts --no-deps` efter uppgift 2 och
3 — den validerar tabellnamn mot `sql/`-facit.

---

## Hur du rapporterar

En commit per uppgift, med ett meddelande som säger **varför**, inte bara vad. Avsluta med:

```
Co-Authored-By: ChatGPT Codex <noreply@openai.com>
```

Skriv sedan en kort rapport med:

1. Vad du tog bort och vad som bevisar att det var dött.
2. Vad du **inte** tog bort, och varför — särskilt uppgift 3 och 5, där svaret kan vara att det
   är en bugg och inte död kod.
3. Vad du hoppade över för att det låg i de spärrade filerna.

**Det som är mest värt i det här uppdraget är inte raderna du tar bort — det är de ställen där
du upptäcker att något är trasigt i stället för dött.** Rapportera dem tydligt.
