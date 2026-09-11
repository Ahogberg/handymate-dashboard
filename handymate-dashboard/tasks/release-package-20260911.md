# Releasepaket — Block 6 "Sammanhängande release"

> Uppfyller block 6 i `tasks/launch-completion-20260909.md`: exakta SHA, migrationer,
> flaggor, miljö, EAS-profil, testbevis, gemensamma roll-/tenant-/kedjeprov, samt lista
> över återstående kundprov och externa blockerare före releasebeslut.
>
> Sammanställt 2026-09-11 av Claude Opus 5 i en container utan produktionsåtkomst.
> Allt under "Verifierat här" kördes i den här sessionen. Allt under "Enligt dokument"
> är avläst, inte kontrollerat. Skillnaden är avsiktlig — blanda inte ihop dem.

---

## 0. Releasebeslut — sammanfattning

**Rekommendation: lansera inte hela produkten 14 september. Webben kan vara redo. iOS-appen kan det inte.**

Den bindande begränsningen är varken kod eller Stripe. Den är Apples granskningstid:

> `handymate-mobile/tasks/eas-build-2026-05-12.md`:
> *"[ ] Skicka in till granskning senast onsdag 9 sept (1–3 dagars granskning, lansering 14 sept)"*

Den rutan är **obockad** och deadlinen passerade för två dagar sedan. Produktionsbygge 12
finns hos EAS, men ingen inlämning till granskning är dokumenterad. Med 1–3 dagars
granskning efter en inlämning som ännu inte skett är 14 september inte nåbart för iOS.

Det avgör en fråga som ingen annan kan svara på: **ingår appen i lanseringen den 14:e?**

- Om **nej** → webben kan gå, och de tre punkterna i avsnitt 9 är det som återstår.
- Om **ja** → flytta datumet, eller lansera webben först och appen när Apple släppt den.

---

## 1. Exakta SHA

| Komponent | Repo | Branch | SHA | Datum | Verifierat |
|---|---|---|---|---|---|
| Backend/dashboard | `Ahogberg/handymate-dashboard` | main | `f7d921587dc71c7859b31163caadef1d590c58ba` | 2026-09-11 20:31 +0200 | ✅ här |
| Mobil | `Ahogberg/handymate-mobile` | main | `4ec114c18d22c1458232b4c98534884feeb7ce1d` | 2026-09-07 16:01 UTC | ✅ här |
| Landningssida | `Ahogberg/handymate-landing` | main | `973e46d4323f73d802d1338648bddeb04d1fc4ff` | 2026-09-11 02:12 +0200 | ✅ här |

Mobilens HEAD är en **dokumentationscommit**. Koden i den motsvarar `853f617`, som är
källan för produktionsbygge 12. Mobilkoden är alltså fyra dagar gammal och har inte
rört sig sedan bygget.

### 1.1 Mobilen och backend är inte på samma release

Sju draft-PR:er ligger öppna på `handymate-mobile` och **ingen är mergad**:

| PR | Titel | HEAD |
|---|---|---|
| #8 | fix: distinguish read receipts from decisions on mobile cards | `4f8414a0` |
| #7 | Bevara rapportutkast över stängning och omstart | `4a425215` |
| #6 | Telefonfynd: tydlig kö, rättvisande ekonomi och direkt rapportknapp | `cc8fd5c4` |
| #5 | Mobilens omdesign: samlad överblick, separat ja och tydlig kvittens | `d797ccb1` |
| #4 | Återuppta rapporten i mobilen och förbered sammanhängande iOS-test | `81cceaa3` |
| #3 | Draft: fullständig granskning före godkännande i mobilen | `4c54e842` |
| #2 | Dölj mobilens marginalkort utan ekonomibehörighet och rätta svensk text | `e3f5b44a` |

Backendens checkpoint 2026-09-10 refererar `Mobil PR7 ... 4a4252157e...` som den
samordnade mobilstaten. **PR7 ligger på en draft-branch, inte på main, och ingår inte i
bygge 12.** Den mobila rapportkontinuiteten som `WORK_REPORT_CONTINUITY_ENABLED` gäller
finns alltså inte i något byggt artefakt.

Detta är block 6:s kärnfråga och svaret är: nej, de är inte samordnade.

---

## 2. Migrationer

| Spår | Antal | Anmärkning |
|---|---|---|
| `supabase/migrations/` (CLI) | 8 | Nyare spåret, från 2026-09-08 |
| `sql/v*.sql` (manuellt körda) | 404 | Äldre spåret, körs för hand mot produktion |

### 2.1 CLI-migrationer i ordning

```
20260908165615_durable_quote_followup.sql
20260908183002_report_continuity.sql
20260909195907_invoice_acceptance_integrity.sql
20260909213732_portal_durable_intake.sql
20260909220236_gmail_sync_start.sql
20260910073644_storefront_durable_intake.sql
20260910130000_demo_reset_uuid_cast.sql
20260910130100_demo_konto_lasa_upp_dashboard.sql
```

### 2.2 Känd status

- `20260910073644_storefront_durable_intake.sql` — dokumenterad som **"förberedd, INTE applicerad"** (PR36-texten). Databaskontrakt krävs före samordnad server/klient-release: gamla klienter utan `Idempotency-Key` får 428 och måste ladda om.
- `v229_demo_reset` — commitmeddelandet anger **körd mot produktion 2026-09-11**, verifierad efteråt.
- `v2_portal_durable_intake` och `v2_gmail_sync_start` — körda **endast mot testprojektet** `eoodwyfxrdjmlqaealhj`, inte produktion.

**⚠️ Repot innehåller ingen migrationslogg.** Det finns ingen fil som säger vilka av de
404 `sql/v*.sql` som är körda mot produktion. Den kunskapen finns bara i commitmeddelanden
och i huvudet på den som körde dem. **Detta måste fyllas i manuellt före release** — det
är den enskilt största luckan i det här paketet, och den går inte att stänga härifrån.

---

## 3. Flaggor

### 3.1 Funktionsflaggor (env)

| Flagga | Var | Effekt om osatt |
|---|---|---|
| `DURABLE_QUOTE_FOLLOWUP_ENABLED` | `lib/followup/service.ts` | Beständig offertuppföljning av |
| `WORK_REPORT_CONTINUITY_ENABLED` | `lib/matte/report-session.ts` | Rapportkontinuitet av (kräver mobil-PR7, se 1.1) |
| `NEXT_PUBLIC_SETUP_STUDIO_ENABLED` | `app/onboarding/page.tsx` | Setup Studio visas inte; `?studio=1` räcker inte |
| `HEMSIDA_FORSLAG_ENABLED` | `app/api/cron/hemsida-forslag/route.ts` | Cron svarar `paused` (avsiktligt, beslut 2026-09-08) |
| `CALL_RETENTION_ENABLED` | `lib/voice/retention.ts` | Ingen gallring av samtal |

### 3.2 Flaggor som aldrig får vara satta i produktion

| Flagga | Konsekvens om satt |
|---|---|
| `ELKS_SKIP_SIGNATURE` | 46elks webhook-signatur verifieras inte — förfalskade inkommande samtal/SMS accepteras |
| `DISABLE_SMS_NIGHT_BLOCK` | Nattspärren 21–08 kringgås; SMS kan gå ut mitt i natten |
| `USE_MOCK_SUPPLIERS` | Leverantörsdata är påhittad |

**Kontrollera dessa tre explicit i Vercels produktionsmiljö före release.** De är utvecklingsflaggor med skarp effekt.

### 3.3 Miljövariabler

63 serverside `process.env`-referenser och 9 `NEXT_PUBLIC_*`. Fullständig lista genereras med:

```sh
grep -rhoE "process\.env\.[A-Z0-9_]+" --include=*.ts --include=*.tsx app lib | sed 's/process\.env\.//' | sort -u
```

Kritiska för lansering: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_LEADS_*_PRICE_ID`
(byts till prod 2026-09-12), `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`,
`ELKS_*`, `RESEND_API_KEY`, `FORTNOX_CLIENT_*`, `GOOGLE_CLIENT_*`, `VAPID_*`.

### 3.4 Cron

51 schemalagda jobb i `vercel.json`. **`/api/cron/push-morgon` är listad två gånger**
(`10 5 * * *` och `10 6 * * *`). Avgör om det är avsiktligt (två vågor) eller en dubblett
— en dubblerad morgonpush är kundsynlig.

---

## 4. EAS-profil

```
appVersionSource: remote        autoIncrement: true (production)
APP_ENV: production             SENTRY_DISABLE_AUTO_UPLOAD: "true"
```

**Produktionsbygge 12** (enligt `handymate-mobile/tasks/eas-build-2026-05-12.md`):

| | |
|---|---|
| Build ID | `97edde95-ac9a-4a47-97fb-1ea09564d071` |
| Version / bygge | 1.0.0 (12) |
| Källkod | `853f617` (main) |
| ASC App ID | 6769730756 |
| Nästa byggnummer | 13 |

### 4.1 Två fynd i EAS-konfigurationen

1. **`ascAppId` saknas i `eas.json`** trots att ASC App ID 6769730756 är dokumenterat. `eas submit --platform ios` behöver det.
2. **`SENTRY_DISABLE_AUTO_UPLOAD: "true"` i produktionsprofilen.** Inga källkartor laddas upp — kraschrapporter från skarpa användare blir minifierade och i praktiken oläsbara. Det är fel inställning att lansera på.

### 4.2 Android

`submit.production.android` står på `track: "internal"`, `releaseStatus: "draft"`. Det är
inte en publik utrullningskonfiguration. `tasks/eas-build-2026-05-12.md` säger dessutom
*"Android: skip:as i v1 — fokus iOS-launch"*, och Android-bygget är inte kört.

### 4.3 Motstridiga dokument

`handymate-mobile/LAUNCH-GUIDE.md` har en checklista där **alla 12 punkter står som ❌**,
inklusive "Byt app-ikon" och "Skapa App Store Connect-app". Men `tasks/eas-build-2026-05-12.md`
visar att ASC-appen finns och bygget är kört, och ikonerna i `assets/` är 1024×1024 och
~186 kB — alltså inte Expos default.

**LAUNCH-GUIDE.md är sannolikt föråldrad.** Den måste stämmas av mot verkligheten innan
någon använder den som lanseringschecklista, annars görs klara steg om — eller värre,
antas kvarvarande steg vara klara.

---

## 5. Testbevis

### 5.1 Verifierat här, på backend-SHA `f7d9215`

| Svit | Resultat | Exit |
|---|---|---|
| `npm run test:contracts` | **1917 passerade**, 1 befintlig skip, + `node --test` 17/17 | 0 |
| `npm run test:six-outcomes` | **15 delsviter gröna**, 325 PASS-rader | 0 |
| Riktad roll-/tenant-/lanseringsgrind (10 filer) | **156 passerade** | 0 |

Delsviterna i `test:six-outcomes`:

```
42  helper/I-O-gränsfall            17  SQL-intake (isolerad PGlite)
35  intake service + HTTP           45  Fortnox-avstämning
15  faktura/accept SQL              20  faktura/accept service + route
18  portal route/submission         30  Gmail polling/processor
12  storefront                      22  agent-trigger-svar
10  onboarding route                15  onboarding seeding
 8  onboarding transition/retry      6  första offertens persistens
27  uppföljningsomgångar
```

Riktad roll-/tenant-körning omfattade `permission-contract`, `facit-tenant-sweep`,
`rollgranser-r1-r4`, `agent-tool-boundaries`, `schema-contract`, `facit-route-auth-inventory`,
`kortgrindar-per-behorighet`, `cron-auth`, `launch-preflight`, `facit-launch-promise-truth`.

**Alla dessa är browserlösa kontraktsprov med mockade providers och isolerad databas.
Inget av dem är ett liveprov, ett inloggat klickprov eller ett kundprov.**

### 5.2 CI på samma SHA

Fem Actions gröna på `f7d9215`: Kontraktsgrind (run 626), Jobbtyper och offertstandarder (489),
Onboardingens tipskort (492), Sammanhang mellan kundunderlag/offert/dagsavslut (495),
Första nyttan på mobil och desktop (496).

### 5.3 Hemlighetskontroll av det publika repot

`Ahogberg/handymate-dashboard` är **publikt**. Skannat efter riktiga nycklar i spårade filer:

- Inga Stripe-, Supabase- eller Anthropic-nycklar. Träffarna i `docs/PRODUCTION_SETUP.md`, `tasks/b8-live-vaxling.md` och `.env.*.example` är platshållare (`sk_live_…`, tom `SUPABASE_SERVICE_ROLE_KEY=`).
- Inga committade `.env`-filer; `.gitignore` täcker dem.
- **Mindre fynd:** `lib/agents/team.ts` innehåller fem signerade Supabase Storage-URL:er för agenternas avatarer med `exp` år 2053. De ger bara läsning av fem PNG-filer, men är i praktiken permanenta publika länkar. Ofarligt om bucketen ändå är publik — åtgärda om den inte är det.

---

## 6. Återstående kundprov

Ingen av de tre huvudresorna är slutgodkänd. Per checkpoint 2026-09-10: *"Inget av detta är slutgodkänt."*

| # | Resa | Vad som krävs |
|---|---|---|
| 1 | Ny Matte-onboarding → första användbara resultat | Aktuell Studio-preview med byggflaggan, tomt testföretag, företagsdata/mejlanslutning hela vägen till ett verkligt sparat offertutkast |
| 2 | Förfrågan → offert → uppföljning → kundbeslut → projekt | Per-offert-uppföljning, godkännande/stopp vid kundbeslut, projektkvittens |
| 3 | Rapport → ÄTA → fakturaunderlag → ekonomisystem | Samordnat mobil→backend med samma kontrollerade belopp, plus separat providerprov |

**Blockerat av inloggning.** Checkpoint 2026-09-10: *"preview visar Log in to Vercel. Ny
läsande navigation till app.handymate.se/dashboard omdirigerar till Handymates Logga in."*
Hela kolumnen "kundgodkänd" står still tills någon loggar in och kör resorna. Ingen kod
löser det.

Följ `docs/runbooks/TVAKONTOSBEVIS_ONBOARDING.md`: samma build, separata tomma testföretag, verifierad flagga.

---

## 7. Externa blockerare

| Blockerare | Sedan | Påverkan på lanseringslöftet |
|---|---|---|
| **Apple-granskning** | Deadline 9 sept passerad | Avgör om 14 sept är möjligt för iOS. Se avsnitt 0. |
| **Fortnox-licens** | 2026-05-30 | OAuth nekar scopes. Ingen kund är kopplad. `efter-lansering.md` p.6: *"Utan bevis är kopplingen ett löfte utan täckning."* |
| **Gmail i onboarding** | — | `lib/google-calendar.ts` begär bara kalender-scopes och skriver Gmail-flaggorna till false. Löftet *"vi läser kundkonversationerna direkt efter onboarding"* kan inte lämnas. |
| **Microsoft** | — | Kräver egen verifierad appregistrering och samtycke. |
| **Storefront-migrationen** | 2026-09-10 | Förberedd, inte applicerad. Kräver samordnad server/klient-release. |

De fyra sista är inte kodfel. De är **löftesfel** om de står kvar i lanseringsmaterialet.
Det är en textändring, men den måste göras medvetet.

---

## 8. Öppna kvalitetsluckor i koden

Dokumenterade, inte lösta:

- **Uppföljningen är bara delvis täckt.** Fixen gäller legacy-cronens normala agentuppföljning. V3-regelmotorn, autonoma förfallonudgar, historiska kort och schemalagd `agent_followup` har egna vägar (`journey-1-2-batch-20260910.md`).
- **Gmail-historik 404** stoppar med krav på återläsning; ingen användarstyrd backfill är byggd. Första importen täcker inkorgen från dygnet före startpunkten, inte hela inkorgen eller Skickat.
- **Första offertens POST** har inget beständigt klientnyckelkontrakt vid förlorad kvittens — kalla inte den delen dublettsäker.
- **`project_type` är fortfarande en prognosheuristik**; explicit avtalsmodell och full blandfakturering är inte lösta.

---

## 9. Att göra före releasebeslut

Ordnat efter vad som blockerar mest.

1. **Svara på frågan i avsnitt 0:** ingår iOS-appen i lanseringen den 14:e?
2. **Logga in och kör de tre resorna** i avsnitt 6 mot aktuell build med tomma testföretag. Detta är den enda spärren som blockerar allt annat.
3. **Fyll i migrationsstatus** (avsnitt 2.2) — vilka `sql/v*.sql` är körda mot produktion? Applicera storefront-migrationen samordnat med klientreleasen.
4. **Kontrollera de tre riskflaggorna** i Vercels produktionsmiljö (avsnitt 3.2).
5. **Rätta EAS före nästa bygge:** lägg in `ascAppId`, ta bort `SENTRY_DISABLE_AUTO_UPLOAD` ur produktionsprofilen (avsnitt 4.1).
6. **Bestäm mobilens releaseinnehåll:** ska PR #2–#8 med i bygge 13, eller lanseras bygge 12 som det är? (avsnitt 1.1)
7. **Stäm av `LAUNCH-GUIDE.md`** mot verkligheten (avsnitt 4.3).
8. **Avgör push-morgon-dubbletten** (avsnitt 3.4).
9. **Justera lanseringslöftena** om Fortnox och Gmail (avsnitt 7).

Punkt 1 och 2 är beslut respektive handpåläggning. Punkt 3–8 är en halvdag.

---

## 10. Vad det här paketet inte täcker

Sammanställt utan produktionsåtkomst. Följande är inte kontrollerat och måste verifieras av någon med åtkomst:

- Faktiska miljövariabler i Vercel produktion.
- Faktisk migrationsstatus i produktionsdatabasen.
- Vercels aktuella deployment-status och domänkonfiguration.
- Om produktionsbygge 12 är inlämnat till Apple-granskning.
- TestFlight-testare, ASC-listing, skärmbilder, Data Safety-formulär.
- Om `demo@handymate.se` fungerar för App Review.
- Om `handymate.se/privacy`, `/terms` och `/support` är publicerade (stores kräver live-URL:er).
