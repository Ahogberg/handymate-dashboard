# Demovideon för Googles OAuth-verifiering

Ha den här öppen på telefonen eller en andra skärm medan du spelar in.

## Innan du trycker på inspelning

- [ ] **Ändra `Application home page` i Google Cloud Console** → `https://handymate.se`
      (står nu på `app.handymate.se`, som är en ren inloggningssida — Googles krav
      säger uttryckligen *"not just a login page"*, så det underkänns annars)
- [ ] Klistra in scope-motiveringen i fältet "How will the scopes be used?" (finns nedan)
- [ ] Stäng alla flikar utom de två du behöver: Handymate och Google Kalender
- [ ] Logga in på `app.handymate.se` i förväg — inloggningen ska inte vara med i filmen
- [ ] Öppna Google Kalender i flik 2, redan inloggad
- [ ] Starta OBS (eller `Win + G`) — **hela skärmen**, inte ett fönster

## De fyra som fäller ansökan om de saknas

1. **Adressfältet synligt** när medgivandeskärmen visas — client ID ska gå att läsa
2. **Språket på medgivandeskärmen = English** (växla längst ner till vänster **innan** du filmar)
3. **Varje scope demonstrerat i faktisk användning** — inte bara nämnt
4. **YouTube, olistad** — länken klistras in i ansökan

---

## Manus (~3 min)

### 0:00 · Hemsidan
`handymate.se`. Adressfältet synligt. Scrolla lugnt så funktionsbeskrivningarna syns.
*Detta är också ditt hemsida-bevis: Google ska se att sidan beskriver produkten.*

### 0:20 · Appen
Växla till `app.handymate.se` (redan inloggad). Visa att det står **Nordström El AB**
och att logotypen matchar det du angett under Branding.

### 0:40 · Starta kopplingen
Inställningar → Integrationer. Google Calendar står **"Ej kopplad"**. Klicka koppla.
**Klicka långsamt.**

### 0:50 · Medgivandeskärmen — viktigaste bilden i filmen
- Låt den ligga **stilla minst 5 sekunder**
- Adressfältet med client ID måste synas
- Språket ska stå på **English**
- Alla tre scopes syns i listan
- Godkänn

### 1:10 · `calendar.readonly` — del 1
Kalenderväljaren visas. Det är `calendarList.list()`.
Säg/texta: *"Here the user picks which of their own calendars to connect."*

### 1:25 · `calendar.readonly` — del 2
Gå till **Schema**. Bokningarna syns: Karin Lindqvist (elcentral), Mikael Bergström
(laddbox), BRF Ekbacken (elbesiktning). Det är `events.list()`.

### 1:45 · `calendar.events` — det starkaste beviset
Skapa en ny bokning i Handymate. **Växla sedan till Google Kalender-fliken och visa
att händelsen dök upp där.**
Det visar skrivrättigheten i faktisk användning — hela motiveringen för scopet.

### 2:15 · `userinfo.email`
Visa var den kopplade e-postadressen syns i Handymate.

### 2:25 · Frånkopplingen *(frivillig, men stark)*
Koppla bort i Inställningar → växla till `myaccount.google.com/permissions` →
visa att **Handymate inte längre står listad**.
Det bevisar att åtkomsten upphör i båda ändar, precis som integritetspolicyn lovar.

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

Varje påstående i texten är sant och verifierat mot koden:
`calendarList.list()`, `events.list()`, `events.insert/patch/delete` i
`lib/google-calendar.ts`, och återkallningen i `app/api/google/disconnect/route.ts`.

---

## Vad som förberetts åt dig (2026-09-04)

Kontot `biz_al7pjuu5smi` (`andreashogberg93@gmail.com`):

| Ändring | Från | Till |
|---|---|---|
| Firmanamn | `Test` | `Nordström El AB` |
| Ort | tom | `Sollentuna` |
| Specialiteter | tom | Elinstallation, Laddboxar, Elbesiktning |

Tre kunder tillagda: **Karin Lindqvist**, **Mikael Bergström**, **BRF Ekbacken**
(id:n med prefix `cust_film_`).

Fem bokningar från och med i morgon (id:n med prefix `book_film_`) — alla
befintliga bokningar var passerade sedan 27 juli, så kalendern hade varit tom.

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

- [ ] Ladda upp till YouTube, **Visibility: Unlisted**
- [ ] Klistra in länken i ansökan
- [ ] Räkna med **10 arbetsdagar** för sensitive scope-granskning

**Lägg inte till Gmail-scopes innan ansökan är godkänd.** Restricted scopes
kräver en årlig säkerhetsgranskning (CASA) och tar ungefär sex veckor i stället
för tio dagar.
