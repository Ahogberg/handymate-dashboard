# Launch Promise Gauntlet — skarpt lanseringsbevis

**Datum:** 2026-08-27  
**Miljö:** `https://app.handymate.se` + körande Supabase-produktion  
**Scope:** kärnresor som piloter använder, tvåtenant-isolering och felvägar  
**Avgränsat:** Fortnox, Stripe live, Google-verifiering, 46elks-saldo och externa utskick

Detta dokument är ett körprotokoll, inte en konkurrerande lanseringschecklista. Den auktoritativa lanseringschecklistan ägs separat.

## Slutsats

Kärnresan är **SKARPT GODKÄND**. Den slutliga fulla körningen passerade på 44,7 sekunder mot `app.handymate.se`, inklusive mobilrendering, reload, feltenantförsök och verifierad cleanup. Gauntleten hittade först en verklig produktionsavvikelse i projektuppladdningen som inte syntes i repots SQL-facit: den körande `project_document`-tabellen kräver fortfarande legacykolumnerna `order_id` och `file_url`. Skrivvägen dual-writar nu legacy- och kanoniska kolumner med samma värden; privata storage-sökvägar signeras fortfarande först vid läsning.

## Verifierad resa

Launch-harnessen autentiserar ett riktigt owner-konto genom `/api/auth`, använder ett andra disponibelt företag som angripande tenant och går genom:

1. Kund skapas och återläses.
2. Främmande kund nekas före deal- och projektskrivning.
3. Deal skapas med bevarad kundrelation.
4. PDF laddas upp på dealen, listas och streamas inline.
5. Tom fil nekas utan att skapa en extra dokumentrad.
6. Främmande deals dokumentrutter är otillgängliga.
7. Projekt skapas från deal med kundrelation och ansvarig person bevarade.
8. PDF laddas upp på projektet, listas och streamas inline.
9. Tid registreras mot projektet och återläses med rätt projekt/kund.
10. Tid mot främmande projekt nekas.
11. Projektvyn öppnas vid 390 × 844, kraschar inte, har ingen horisontell overflow och data består efter reload.
12. Främmande projekt kan inte läsas/raderas genom service-role-rutterna.
13. Alla exakta fixtures och storage-objekt raderas; cleanup verifierar därefter noll kvarvarande kärnrader.

Inga externa SMS, mejl, fakturor, betalningar eller Fortnox-anrop skapas av denna harness.

## Bevisresultat

| Bevis | Resultat |
|---|---:|
| Riktig tvåtenant RLS-matris | 51 passerade, 2 katalogkontroller hoppades över utan direkt PostgreSQL-URL |
| Golden Path, produktion | 19 av 19 stationer passerade |
| Fil-, relation-, tids- och kolumnkontrakt | 108 av 108 passerade |
| Projektuppladdning + storage-signering efter fix | 47 av 47 passerade |
| TypeScript | `tsc --noEmit` exit 0 |
| Next-produktionsbygge | exit 0 |
| Launch Promise Gauntlet, slutlig skarpkörning | **1 av 1 full resa passerade (44,7 s)** |

De två hoppade katalogkontrollerna gäller direkt kontroll av `pg_proc.prosecdef` och grants. De hade tidigare verifierats separat mot den körande databasen: `is_business_member` är `SECURITY DEFINER`, ägare `postgres`, och tabellgrants följer v96-låsningen. CRUD-isoleringen ovan gick genom riktiga authenticated-sessioner och riktiga rader.

## Fynd och åtgärd

### P0 — projektfiler såg ut att laddas upp men metadata avvisades

Första skarpkörningen nådde den riktiga projektuppladdningen och fick:

`null value in column "order_id" of relation "project_document" violates not-null constraint`

Efter första dual-writen avslöjade nästa körning även:

`null value in column "file_url" of relation "project_document" violates not-null constraint`

Produktions-OpenAPI bekräftade därefter hela kontraktet:

- Required: `id`, `business_id`, `order_id`, `name`, `file_url`
- Kanoniska tillägg finns: `project_id`, `file_path`, `mime_type`

Åtgärden är en kompatibilitets-dual-write:

- `order_id = project_id`
- `file_url = file_path` (privat storage-path, inte publik eller signerad URL)

Det löser pilotens faktiska fel utan migration, utan att flytta storage-säkerhetsgränsen och utan att gissa bort legacydata.

### P1 — dashboardens flexskal gav horisontell mobilscroll

När hela API-resan passerade nådde gauntleten projektsidan i en 390 × 844-viewport och mätte 441 px dokumentbredd. DOM-diagnostiken pekade på dashboardens `<main class="flex-1 md:ml-64">`: som flexbarn hade huvudytan implicit `min-width: auto`, så ett brett projektbarn fick hela skalet att växa utanför viewporten.

Åtgärden är den globala flexbox-gränsen `min-w-0` på dashboardens huvudområde. Den gör att innehållet får krympa inom viewporten och skyddar alla dashboardvyer, inte bara projektsidan. Ett separat källfacit kräver nu både `flex-1` och `min-w-0`, medan skarpharnessen mäter verklig `body.scrollWidth` och listar de element som sticker ut vid en framtida regression.

Efter skalfixen sjönk bredden från 441 till 420 px och diagnostiken isolerade den återstående lokala orsaken: Byggdagbokens rubrik och “Ny dagbokspost” var låsta på samma rad. Headern staplas nu på mobil och övergår till horisontell layout från `sm`; åtgärdsgruppen får wrap. Även detta har ett separat källfacit.

## Permanenta regressionsskydd

- `tests/e2e-launch-promise/launch-promise.spec.ts` — destruktiv men exakt städande tvåtenantresa; körs bara explicit.
- `launch-promise` i `playwright.config.ts` — isolerat projekt, utanför standardsviten.
- `tests/file-attachments.spec.ts` — kräver dual-write av live-schemafält.
- `tests/storage-signing.spec.ts` — kräver privat path i både legacy- och kanonisk kolumn och förbjuder signerad URL i insert-payload.
- Golden Path väntar upp till 45 sekunder på kanonisk projektstängning, i linje med ruttens 30-sekunders serverkontrakt, och granskar därefter det verkliga HTTP- och DB-utfallet.

## Levererade commits

- `6df8983b` — första live-schemafixen för `order_id`.
- `bd8dabe8` — återanvändbar Launch Promise-harness och Golden Path-timeout.
- `7e377e14` + `ff78bd88` — `file_url`-dual-write, därefter exakt avstämd mot produktionens OpenAPI-kontrakt.
- `561a1fe1` — global `min-w-0`-gräns för dashboardens mobila flexskal.
- `4579c248` — härdad fixture-återställning och diagnostiskt mobilfacit.
- `0b69efbe` — Byggdagbokens mobilheader staplas och åtgärder får wrap.

## Kvar före lanseringsbeslut

Denna körning bevisar inte externa leverantörer. Följande ska fortsatt stå som separata go/no-go-punkter:

- 46elks-saldo och ett skarpt men kontrollerat SMS-prov.
- Fortnox-checklistan och skarp synk/sändning med Christoffer.
- Stripe live och webhook/fakturering i live-läge.
- Google-verifiering.
- Fysisk iPhone/PWA-kontroll för kamera, filväljare och safe-area; 390 px browserviewport är ett starkt layoutprov men inte ett enhetsbevis.
