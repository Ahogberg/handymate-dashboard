# Demovideon för Googles OAuth-verifiering

Ha den här öppen på telefonen eller en andra skärm medan du spelar in.
**Filmen behöver vara ~90 sekunder.** Inloggningen ska inte vara med.

---

## Innan du trycker rec

- [ ] **Ändra `Application home page` i Google Cloud Console** → `https://handymate.se`
      (står nu på `app.handymate.se`, som är en ren inloggningssida — Googles krav
      säger uttryckligen *"not just a login page"*, så det underkänns annars)
- [ ] Klistra in scope-motiveringen i "How will the scopes be used?" (finns längst ner)
- [ ] **Logga in på `app.handymate.se`** — inloggningen ska inte filmas
- [ ] Öppna **Google Kalender i flik 2**, redan inloggad
- [ ] Stäng alla andra flikar
- [ ] Starta OBS (eller `Win + G`) — **hela skärmen**, inte ett enskilt fönster

## De fyra som fäller ansökan

1. **Adressfältet synligt** när medgivandeskärmen visas — client ID ska gå att läsa
2. **Medgivandeskärmen på engelska** — lägg till `&hl=en` sist i URL:en och tryck enter
3. **Varje scope demonstrerat i faktisk användning** — inte bara nämnt
4. **YouTube, olistad**

---

## Manus — 90 sekunder

Tiderna är ungefärliga. Klicka långsammare än det känns naturligt.

### 0:00 — Appen (10 s)
Handymate öppen och inloggad. Låt **Nordström El AB** synas i sidomenyn ett ögonblick.
*Google ska se att det är samma app som i ansökan, med samma namn och logotyp.*

### 0:10 — Starta kopplingen (10 s)
Inställningar → Integrationer. Google Calendar står **"Ej kopplad"**. Klicka koppla.

### 0:20 — Medgivandeskärmen (15 s) · **viktigaste bilden i filmen**
- Klicka i adressfältet, lägg till **`&hl=en`** sist, enter
- Låt skärmen ligga **stilla 5–8 sekunder**
- Adressfältet med client ID måste synas hela tiden
- Alla tre behörigheter syns i listan
- Godkänn

### 0:35 — Kalenderväljaren (10 s) · `calendar.readonly`
Listan över dina egna kalendrar visas. Välj en.

> **Textremsa:** `User selects which of their own calendars to connect (calendar.readonly)`

### 0:45 — Schema (15 s) · `calendar.readonly`
Gå till **Schema**. Bokningarna syns: Karin Lindqvist (elcentral), Mikael Bergström
(laddbox), BRF Ekbacken (elbesiktning).

> **Textremsa:** `Existing calendar events shown alongside jobs in Handymate (calendar.readonly)`

### 1:00 — Skapa bokning, växla till Google (25 s) · `calendar.events`
Skapa en ny bokning i Handymate. **Växla till Google Kalender-fliken och visa att
händelsen dök upp där.**
*Det starkaste beviset i hela filmen — skrivrättigheten i faktisk användning.*

> **Textremsa:** `Booking created in Handymate appears in the user's Google Calendar (calendar.events)`

### 1:25 — E-postadressen (5 s) · `userinfo.email`
Visa var den kopplade e-postadressen syns i Handymate.

> **Textremsa:** `Connected Google account email shown to the user (userinfo.email)`

---

## Textningen

Fyra remsor, en per scope. **Engelska** — granskaren ska kunna matcha varje scope i
ansökan mot en bild i filmen utan att gissa.

| Vid | Text |
|---|---|
| 0:35 | `User selects which of their own calendars to connect (calendar.readonly)` |
| 0:45 | `Existing calendar events shown alongside jobs in Handymate (calendar.readonly)` |
| 1:00 | `Booking created in Handymate appears in the user's Google Calendar (calendar.events)` |
| 1:25 | `Connected Google account email shown to the user (userinfo.email)` |

Lägg dem som text i bild (inte som undertextfil) så de syns oavsett hur granskaren
spelar upp filmen. Låt varje remsa ligga kvar hela momentet.

Textning är **inget formellt krav** — men ansökningar bounce:ar på att granskaren
inte hittar ett scope i filmen, och en omgång kostar dagar.

---

## Frivilligt, om du vill ha en starkare film

**Hemsidan först (20 s).** Börja på `handymate.se`, scrolla så funktionsbeskrivningarna
syns. Google granskar sajten separat ändå, men det skadar inte.

**Frånkopplingen sist (20 s).** Koppla bort i Inställningar → växla till
`myaccount.google.com/permissions` → visa att **Handymate inte längre står listad**.
Bevisar att åtkomsten upphör i båda ändar, precis som integritetspolicyn lovar.

> **Textremsa:** `Disconnecting in Handymate also revokes access with Google`

---

## Scope-motivering — klistra in i "How will the scopes be used?"

```
Handymate is a business administration platform for Swedish tradespeople
(electricians, plumbers, carpenters). Users connect their own Google Calendar
to manage job bookings.

calendar.readonly: we call calendarList.list so the user can choose which of
their own calendars to connect, and events.list to display existing bookings
next to their jobs in Handymate. Without this scope we cannot show the user
their calendars to pick from.

calendar.events: users create, reschedule and cancel job bookings inside
Handymate. We call events.insert, events.patch and events.delete to keep the
user's Google Calendar in sync. A read-only scope is not sufficient, because
writing bookings is the core purpose of the integration.

Calendar data is used solely to provide this feature. It is never sold, never
used for advertising or profiling, and never used to train AI models. It is
deleted when the user disconnects, and access is revoked with Google at the
same time.
```

Varje påstående är verifierat mot koden: `calendarList.list()`, `events.list()`,
`events.insert/patch/delete` i `lib/google-calendar.ts`, och återkallningen i
`app/api/google/disconnect/route.ts`.

---

## Bra att veta

**Du kan filma om hur många gånger du vill.** `prompt: 'consent'` är satt i
`lib/google-calendar.ts:42`, så medgivandeskärmen visas alltid — även efter att du
redan godkänt. Ingen omställning behövs mellan tagningar.

**Seedningen är beständig.** Kunder och bokningar ligger kvar tills du raderar dem.

---

## Vad som förberetts åt dig (2026-09-04)

Kontot `biz_al7pjuu5smi` (`andreashogberg93@gmail.com`):

| Ändring | Från | Till |
|---|---|---|
| Firmanamn | `Test` | `Nordström El AB` |
| Ort | tom | `Sollentuna` |
| Specialiteter | tomma | Elinstallation, Laddboxar, Elbesiktning |

Tre kunder: **Karin Lindqvist**, **Mikael Bergström**, **BRF Ekbacken** (`cust_film_*`).
Fem bokningar från 5 september och en vecka fram (`book_film_*`) — alla befintliga
bokningar var passerade sedan 27 juli, så kalendern hade varit tom mitt i filmen.

Verifierat i gränssnittet: startsidan, Schema och Kunder visar den nya datan;
integrationssidan säger "Google Calendar — Ej kopplad".

### Ångra efteråt

```sql
delete from booking  where business_id='biz_al7pjuu5smi' and booking_id  like 'book_film_%';
delete from customer where business_id='biz_al7pjuu5smi' and customer_id like 'cust_film_%';
update business_config set business_name='Test', service_area='""'::jsonb,
       specialties='[]'::jsonb where business_id='biz_al7pjuu5smi';
```

## Efter inspelningen

- [ ] YouTube, **Visibility: Unlisted**
- [ ] Länken in i ansökan
- [ ] Räkna med **10 arbetsdagar** för sensitive scope-granskning

**Lägg inte till Gmail-scopes innan ansökan är godkänd.** Restricted scopes kräver
en årlig säkerhetsgranskning (CASA) och tar ungefär sex veckor i stället för tio
dagar.
