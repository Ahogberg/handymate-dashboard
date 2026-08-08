# CODEX — Epic 4: Demo Reset Hardening

Din egen audit (Matte Orchestration & Demo Story Audit, 2026-08-08, avsnitt
15/21/22) identifierade bristerna. Du äger `sql/`- och demo-lanen. Bygg exakt
Epic 4 enligt din egen spec, med följande preciseringar och gränser.

## Uppgiften

Gör demo-resetten atomisk, komplett, auditerad och rollgrindad — utan att
ändra dess innehåll eller `DEMO_BUSINESS_ID`-grinden.

### 1. Rollgrind (P1: "alla autentiserade i tenanten kan anropa")

`app/api/admin/demo-reset/route.ts` kräver i dag bara inloggning + rätt
tenant. Lägg owner/admin-grinden med det BEFINTLIGA mönstret — samma som
`/api/observations` och `/api/moments`:

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) → 403

Env-grinden (`DEMO_BUSINESS_ID` exakt match, 403 annars) behålls orörd.

### 2. Transaktion (SECURITY DEFINER RPC)

Ny migration: `sql/v<N>_demo_reset_transaction.sql` (ta nästa lediga nummer —
kontrollera högsta befintliga i sql/ först). Skapa en RPC som:

- tar EN parameter: `p_business_id TEXT`
- **hårdvaliderar första raden i funktionskroppen** att företaget är
  demo-flaggat — lägg en `is_demo_tenant BOOLEAN NOT NULL DEFAULT false`-
  kolumn på business_config i samma migration, sätt den för demokontot, och
  RAISE EXCEPTION om flaggan inte är true. RPC:n får ALDRIG lita på att
  anroparen redan gatat.
- raderar enligt ett EXPLICIT tabellmanifest i beroendeordning. Utgå från
  dagens deletelista i `lib/demo/seed-demo-account.ts` och LÄGG TILL det din
  audit fann saknas: `agent_threads`, `thread_message`, `agent_handoffs`,
  `agent_messages`, `agent_memories`, `business_knowledge`, `notification`,
  `time_entry`, `project_material`, `project_change`, `project_log`,
  `project_photos`, `schedule_entry`. Verifiera varje tabellnamn mot sql/
  innan du skriver — ett felstavat namn ska faila migrationen, inte tyst
  hoppa över.
- allt i en transaktion: ett fel rullar tillbaka ALLT, gammalt state består.
- skriver en rad i en ny smal audittabell `demo_reset_audit`
  (id, business_id, actor_user_id, started_at, finished_at, ok, error_text,
  reset_version) — skapas i samma migration. Inga kunddata i auditraden.

Migrationen körs MANUELLT i Supabase SQL Editor (CLAUDE.md-regeln) — skriv
den, kör den aldrig programmatiskt.

### 3. Seedning fortsatt i TypeScript

Flytta INTE seedlogiken till SQL. `resetDemoAccount` anropar RPC:n för
raderingen, seedar sedan som i dag — men **läser nu varje inserts error**
(dagens inserts efter approvalSeeds kollar inte alla). Ett insert-fel →
returnera `{ error }` och skriv `ok=false` i auditraden. Halvseedat läge ska
synas, aldrig döljas.

### 4. Entity-manifest (grunden för Epic 5)

`resetDemoAccount` returnerar redan en summary. Utöka med ett manifest:
stabila semantiska nycklar → nyskapade id:n, t.ex.
`{ stale_quote: quotes.mikael_quote.quote_id, margin_project: annaProject.project_id, overdue_invoice: kristinaInvoice.invoice_id, ata_missed: <appr-id>, ... }`.
Persistera det i `business_preferences` under nyckeln `demo_manifest`
(source: 'user') så demo-sidan och kommande storyläge kan läsa det. Inga nya
tabeller för detta.

### 5. Klient-städning

Demo-sidan (`/dashboard/demo`) rensar efter lyckad reset:
`localStorage`-nyckeln `hm_moments_seen` och eventuella story-nycklar, samt
startar utan aktiv Matte-tråd. (Sedd-mekaniken beskrivs i
`components/moments/MomentsProvider.tsx`.)

## Rör INTE

- `app/api/matte/chat/route.ts`, `app/api/agent/trigger/**`, `lib/agent/**`,
  `lib/matte/**` — Claude bygger Epic 1 (Orchestration Safety Contract) där
  parallellt just nu
- `lib/moments/**`, `components/moments/**`, `components/Jobbkompisen.tsx`,
  `components/MatteChatModal.tsx`
- Seedinnehållet (kunder, belopp, datum) — bara radering/audit/manifest ändras
- `business_users`/`business_config`-innehåll utöver `is_demo_tenant`-kolumnen

## Tester (browserlösa, --no-deps, samma mönster som tests/moments.spec.ts)

- reset utan owner/admin → 403; utan DEMO_BUSINESS_ID → 403; production
  tenant med manipulerad body → 403
- RPC-filen validerar is_demo_tenant före första DELETE
- manifestet innehåller alla story-nycklar och pekar på existerande id-format
- varje tabell i RPC-manifestet finns i sql/ (facit som parsar migrationen
  mot CREATE TABLE-facit, samma teknik som tests/column-contract.spec.ts)

## Verifiering

`npx tsc --noEmit` rent, `npx next build` grön, hela facitsviten grön.
Migrationen levereras som fil + en rad i PR-texten om att den ska köras
manuellt före nästa demo.
