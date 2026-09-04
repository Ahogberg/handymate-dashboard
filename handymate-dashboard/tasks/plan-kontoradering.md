# Kontoradering i appen — Apple 5.1.1(v) och Google Play

**Beslut Andreas 2026-09-04:** ägaren raderar hela firman. Inloggningar och persondata raderas. Fakturaunderlag behålls 7 år enligt bokföringslagen och det ska stå i klartext före bekräftelsen. Anställda kan bara radera sin egen inloggning, aldrig firman.

Apple kräver detta sedan juni 2022 för alla appar med inloggning, och det måste gå att göra **inne i appen** — inte via ett mejlformulär. Google Play kräver samma sak plus en publik raderingslänk i Play Console. Utan detta blir appen avvisad direkt.

## Verifierade fakta (information_schema, 2026-09-04 — gissa inte vidare)

- **`invoice` har `ON DELETE CASCADE` mot `business_config`.** Att radera business_config-raden skulle alltså radera fakturorna — precis det bokföringslagen förbjuder. Hård radering av raden är därför utesluten.
- **26 tabeller har `NO ACTION`** (`customer`, `quotes`, `booking`, `leads`, `agent_runs`, `call`, `conversations`, `transcript`, `sms_conversation` m.fl.). En `delete from business_config` misslyckas idag med FK-fel. Ännu ett skäl att inte gå den vägen.
- **~70 tabeller med `business_id` bär personfält** (namn, telefon, e-post, adress, meddelandetext, transkript). En handskriven raderingslista över dem blir fel — därför facit-testet nedan.
- `business_config` har inget `deleted_at` idag.
- Inloggningen (`app/api/auth/route.ts`, POST login ~rad 295–340) slår upp `business_config` via `user_id`, annars via `business_users`. Den kontrollerar inte om kontot är raderat.
- `getServerSupabase().auth.admin.deleteUser(...)` används redan i `app/api/auth/register/route.ts:100` (rollback) — samma väg återanvänds.

## Design: mjuk radering av firman, hård radering av inloggningar och persondata

Poängen: när `business_config`-raden ligger kvar fyras **ingen** cascade, så vi styr exakt vad som försvinner. Fakturorna blir kvar knutna till en död firma ingen kan logga in i.

### 1. Migration `sql/v211_kontoradering.sql` (skapas, körs INTE förrän Andreas säger kör)
```
alter table business_config add column if not exists deleted_at timestamptz;
alter table business_config add column if not exists deleted_by text;
create index if not exists idx_business_config_deleted on business_config(deleted_at) where deleted_at is not null;
```
Inga defaults, inga destruktiva satser.

### 2. `POST /api/account/delete` (ny rutt)
- `getAuthenticatedBusiness()`. **Bara ägaren** (`business_config.user_id === user.id`) får radera firman. En anställd som anropar den får 403 med texten att bara ägaren kan avsluta firman.
- Kroppen måste innehålla `bekraftelse` som **exakt matchar `business_config.business_name`** (server jämför, inte klienten). Fel namn → 400. Det är spärren mot ett tryck av misstag.
- Ordning, allt fail-loud (kastar den mitt i får inget påstås vara klart):
  1. Läs firman. Redan `deleted_at` → 409 "Kontot är redan avslutat".
  2. Avsluta Stripe-prenumerationen om `stripe_subscription_id` finns (använd befintlig Stripe-klient; hitta den, skriv ingen ny).
  3. **Persondata bort** — se listan i `lib/account/radera.ts` nedan.
  4. **Inloggningar bort**: för varje rad i `business_users` med `user_id`, plus `business_config.user_id`, kör `auth.admin.deleteUser`. Detta är det Apple menar med raderat konto.
  5. `business_users`-raderna raderas.
  6. Uppdatera `business_config`: `deleted_at = now()`, `deleted_by`, `subscription_status = 'deleted'`, `agents_globally_paused = true`, `assigned_phone_number = null`, och nolla ägarens personfält (`contact_name`, `contact_email`, `phone_number`) — men behåll `business_name` och `org_number`, de behövs för att fakturorna ska gå att härleda.
  7. Svara med vad som faktiskt raderades (antal per område) — aldrig ett påstående utan täckning.

### 3. `lib/account/radera.ts` — listan, och skyddet mot att den blir omodern
- `export const RADERAS: string[]` — tabeller som töms på `business_id`. Utgå från de ~70 med personfält, minus behållna.
- `export const BEHALLS: string[]` — `invoice`, `invoice_line`/motsvarande (verifiera namnet), `supplier_invoices`, `business_config`, plus allt annat som är räkenskapsinformation. Motivering i kommentar per tabell.
- `export const IRRELEVANT: string[]` — tabeller med `business_id` utan persondata som varken raderas eller behöver behållas (mallar, priser, inställningar). De får försvinna eller ligga kvar, men de ska vara **uttryckligen klassade**.
- Radera i beroendeordning; fånga fel per tabell och samla dem, kasta i slutet om något misslyckades. En tabell som inte finns i den här miljön ska hoppas över tyst (`arSchemaSaknas`-mönstret), inte stoppa raderingen.

### 4. Inloggningen ska neka ett raderat konto
`app/api/auth/route.ts`: lägg `deleted_at` i båda selectarna och neka med "Kontot är avslutat" om det är satt. Bältet och hängslena — inloggningarna är redan borta, men ett konto som återuppstår för att någon skapar en ny auth-användare med samma e-post får inte hitta firman.

### 5. Facit `tests/kontoradering.spec.ts`
- Rutten kräver ägare; en anställd får 403.
- Bekräftelsen jämförs mot `business_name` **på servern**.
- Ordningen: Stripe → persondata → auth-användare → business_users → business_config. Ingen `auth.admin.deleteUser` före persondataraderingen.
- `invoice` finns i `BEHALLS` och förekommer aldrig i `RADERAS`.
- **Fullständighetsvakten:** varje tabellnamn som nämns i `sql/*.sql` med en `business_id`-kolumn måste finnas i exakt en av `RADERAS`/`BEHALLS`/`IRRELEVANT`. En ny tabell som ingen klassat gör testet rött. Det är det som gör listan hållbar — samma mönster som kolumnvakten i repot.
- Inloggningen läser `deleted_at`.
- Källskanningar strippar kommentarer före matchning.

### 6. Mobilen (`/home/user/handymate-mobile`, gren `claude/next-dev-steps-launch-b4xqwu`)
- `app/(tabs)/profile.tsx`: sektionen "Kontot" längst ned med **Radera konto** i rött, samt en länk till integritetspolicyn (`https://handymate.se/integritet` — publicerad, kontrollerad) som Apple också kräver i appen.
- Ägare ser "Radera firman", anställd ser "Radera min inloggning" (använd befintliga behörighetsflaggorna i `lib/api.ts`, som redan är fail-closed).
- Två steg: först en skärm som i klartext säger vad som raderas och vad som behålls i sju år och varför, sedan ett fält där firmanamnet ska skrivas. Knappen är låst tills namnet stämmer.
- Efter svar: logga ut och skicka användaren till inloggningen.
- Test i `__tests__/` i husets stil: knappen finns, den är låst tills namnet matchar, och anställda ser inte firmaraderingen.

## Utanför scope
- Anställdas "radera min inloggning" mot servern (V1: ägarens flöde är det Apple granskar). Klassa som eget pass om det inte hinns med — men **texten i appen får då inte lova det**.
- Automatisk gallring av fakturorna efter 7 år (egen cron senare).

## Verifiering
- `npx tsc --noEmit`, `npm run test:contracts`, en serial `npx next build`.
- `npm test` i mobilrepot.
- Migrationen körs först när Andreas säger kör, och verifieras med en SELECT direkt efteråt.
- **Testa aldrig raderingen mot ett riktigt konto.** Det gamla skalet `biz_6wunctak49` ("Bee Service AB (GAMMALT – använd ej)") är enda rimliga målet, och först efter att Andreas godkänt det uttryckligen.
