# Tenant-svepet — rutterna utanför standardgrinden

_2026-09-01, nattpass. Granskning + fix i samma pass. Facit:
`tests/facit-route-auth-inventory.spec.ts` (inventeringen som beslut) och
`tests/facit-tenant-sweep.spec.ts` (fixarna)._

## Omfattning

554 API-rutter under `app/api`. 449 anropar `getAuthenticatedBusiness`.
De 120 övriga inventerades maskinellt efter grindsignal och de 38 utan
igenkänd grind granskades rad för rad i tre parallella granskningar
(portalen, publika token-rutter, webhooks/formulär/OAuth). Dessutom
sveptes alla 554 efter två felmönster: `=== \`Bearer ${process.env.X}\``
(blir "Bearer undefined" utan env) och reservhemligheter i källkod.

**Tillägg 2026-09-03:** inventeringen omfattar nu 565 rutter, varav 131
ligger utanför standardgrinden. Den nya raden är
`/api/admin/support-operations`, som är `isAdmin(request)`-grindad och
endast läser de befintliga driftkällorna till plattformens Support & drift-vy.

## Fynd och åtgärd

| # | Rutt | Allvar | Fynd | Åtgärd |
|---|---|---|---|---|
| 1 | `reminders` | **Kritisk** | `CRON_SECRET \|\| 'handymate-cron-secret'` — hårdkodad reservhemlighet. Rutten läser bokningar över alla företag och skickar riktiga SMS. | `verifyCronSecret` (fail-closed). |
| 2 | `google/callback` | **Hög** | OAuth-state var osignerad base64-JSON. Förfalskad state band angriparens Google-konto till offrets Gmail-sändning, eller gav angriparens företag offrets Google-token. | HMAC-signerad state (`lib/google/oauth-state.ts`, 10 min TTL) + callbacken kräver session som matchar state. `refresh_token` nollas inte längre vid re-consent. |
| 3 | `cron/karin-deadlines` | Hög | `!== \`Bearer ${CRON_SECRET}\`` → öppen utan env. Läser business_config för alla företag. | `verifyCronSecret`. |
| 4 | `invoices/auto-generate`, `morning-brief` | Hög | Samma "Bearer undefined"-mönster på cron-grenen (alla företag). | `verifyCronSecret`. |
| 5 | `webhooks/google-calendar` | Medel | Bara kanal-id (delas med Google, syns i loggar) — valfri kunde tvinga fram full kalendersynk per företag. | Hemligt kanaltoken (HMAC av kanal-id, `lib/google/channel-token.ts`) registreras och krävs. Legacykanaler (≤6 dagar) accepteras bara på resource-id. |
| 6 | `quotes/track` | Medel | `quote_id` ensamt (Math.random, syns i dashboard-URL:er) flippade status sent→opened och skrev händelser i offertens tenant. | `t=sign_token` krävs för varje skrivning. Alla tre pixelgeneratorer skickar med det. Visningstid klampas. `force-dynamic`. |
| 7 | `portal/[token]/messages` POST | Medel | Varje POST = tråd-rad + kort + push, inget tak. | Fail-closed tak 20/15 min per kund. |
| 8 | `quotes/public/[token]` `question`/`request_booking` | Medel | Före status-guarderna, skapar kort + push, inget tak. | Fail-closed tak 10/h per offertlänk. |
| 9 | `lead-portal/[code]` | Medel | GET: hela historiken med PII till varje kodbärare. POST: obegränsad, ägar-SMS per anrop. | GET 180 dagar/200 rader + business-filter. POST 30/h per källa. |
| 10 | `public/book/[slug]` | Medel | Två SMS per anrop utan tak; felformat datum → 500. | 5/h per IP, datum/tid-regex. |
| 11 | `ata/sign/[token]` | Medel | Läs-sedan-skriv: två samtidiga POST gav dubbla kort/pushar. | Villkorad UPDATE + radräkning (409 för förloraren), sign och decline. |
| 12 | `field-reports/[id]/sign` | Medel | `reject` saknade guard — repeterbart SMS till hantverkaren med fri text. | `rejected` avvisas; namn/kommentar längdbegränsade. |
| 13 | `invite/[token]/accept` | Medel | `null` utgångsdatum = evig inbjudan till fullt personalkonto. | Saknat datum = utgånget. |
| 14 | `lib/rate-limit-db.ts` | Medel | Limitern **failade öppet** vid RPC-fel — exakt när angriparen kan bränna budget. | `checkPublicRateLimitDb` (fail-closed) för alla publika skrivvägar: widget/chat, storefront/contact+track, leads/intake, referral-lead, partners/register+validate, portal messages, lead-portal, public/book, quotes/public. |
| 15 | `voice/greeting` | Låg | Ingen 46elks-signatur, svarade på GET — nummer→företag-uppslag för vem som helst. | `verifyElksSignature`, GET bara med `ELKS_SKIP_SIGNATURE`. |
| 16 | `swish-qr` | Låg | Godtyckligt nummer/belopp → betal-QR från Handymates domän (fakturabedrägeri). | Strikt format på nummer, belopp ≤ 150 000, meddelande utan styrtecken. |
| 17 | `storefront/track`, `partners/register` | Låg | Inget tak. | IP-tak 60/h resp. 5/h. |
| 18 | `email/inbound` | Låg | Alla DB-fel föll tillbaka på pilot-tenanten. | Bara saknat schema (v106) faller tillbaka; annat fel avvisar. |
| 19 | `auth/register` | Låg | `business_id` ur `Math.random()`. | `crypto.randomBytes`, samma format. |
| 20 | portalen (4 queries) | Låg | `customer_message`/mark-read och projektbarn utan `business_id`-filter (ofarligt så länge id:n är globalt unika). | `business_id` tillagt på customer_message-frågorna. Projektbarnen kvar på ägd `project_id`-lista. |

## Avsiktligt INTE ändrat (beslut för Andreas)

- **`lib/quotes/public-dto.ts` exponerar `customer.portal_token` i offertsvaret.** Offertsidan använder det för att skicka kunden in i portalen. En vidarebefordrad offertlänk ger därmed hela portalen (alla fakturor, dokument, meddelanden) för samma kund. Inte cross-tenant, men en scope-eskalering. Att gata den (t.ex. bara efter accepterad offert) ändrar demoflödet — beslutet är ditt.
- **`admin/partners/[id]/approve` är en muterande GET** med HMAC-token i URL:en. Mejlskannrar som följer länken godkänner partnern. Konvertering till POST kräver ändrad mejllänk.
- **Portaltoken har ingen utgång** och återaktiveras när en ny länk skapas. Produktbeslut.
- **`widget/chat`**: `session_id` väljs av klienten (kringgår 20-meddelandetaket per samtal, men 500/dag per företag och IP-taket står kvar, nu fail-closed).

## Verifiering

- `npx tsc --noEmit`: 0 fel
- 27 sviter som låser berörda filer + de två nya faciten: 208 gröna
- Ett facit på main var rött redan före passet (`cogs-matare`: tredje
  `bokforMatteUsage`-grenen tillkom i efb8d69) — uppdaterat till 3.
- `next build`: se rapporten i chatten

## Tillägg 2026-09-03 — lanseringsprovets infrastruktur

`app/api/admin/launch-preflight` tillkom: en adminspärrad förkravssond som
läser saldo, domän- och tokenstatus hos leverantörerna inför ett bevisprotokoll
(`docs/launch/evidence/README.md`).

Ingen tenant-kontext, avsiktligt — den svarar på om *plattformen* är redo att
provas, inte på något om ett enskilt företag. Grindad med `isAdmin` som övriga
`admin/*`. Läsande enbart: den skickar aldrig SMS eller mejl.

Ruttinventeringen: **577 rutter, 143 utanför standardgrinden** (räknat
2026-09-03, `tests/facit-route-auth-inventory.spec.ts`).

Sonden finns för att `evaluateLaunchEnvironment` bara kontrollerar att
miljövariabler är satta. Mätt samma dag mot prod: `ELKS_API_USER: ✅ Set`
samtidigt som 46elks svarade *"Not enough credits on your account"* — hela
Grind B blockerad medan env-checken rapporterade grönt.

## Tillägg 2026-09-05 — kundförberedelse

Två nya vägar utanför direkt standardgrind (148 totalt):
- `customer-preparation`: `preparationOwner` anropar getAuthenticatedBusiness
  och getCurrentUser för exakt företag; endast aktiv owner/admin, ingen
  impersonation. Alla läsningar/skrivningar business-scopas.
- `preparation/[token]`: separat slump-UUID för en förfrågan, 30 dagars
  giltighet och återkallelse. Publikt GET lämnar endast mall, kontext, datum
  och status. POST har DB-rate-limit, strömmande storlekstak och villkorad
  statusövergång. Bilder lagras privat och signeras bara åt behörig ägare.

Dessa kontrakt exekveras i `tests/customer-preparation/contract.test.mjs`.

### Lars kundunderlagskontroll — 2026-09-05
POST /api/customer-preparation/review: getAuthenticatedBusiness + aktiv owner/admin, ingen impersonation. Serverladdat underlag med business_id; projekt måste matcha både business_id och customer_id. Privata bilder hämtas endast under företagets och underlagets sökväg. V213 utökar den service-only-tabell som infördes i V212; ingen ny publik databasåtkomst. Driftprovet och migrationens utförande återstår enligt tasks/lars-preparation-review.md.
