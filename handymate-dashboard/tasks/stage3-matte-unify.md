# Stage 3 — Ena Matte: EN motor + EN historik (webb + mobil)

**Mål:** webben och mobilen delar samma konversationsmotor (`/api/matte/chat`,
Väg B) och samma lager (`agent_threads` + `thread_message`). Väg A (conversations
→ agent/trigger → `matte_messages`) avvecklas. **Ren start** — ingen historik-
migrering (≈inga kunder), tabeller droppas EJ (bevaras för säkerhet).

## Varför detta är säkert nu
- Drift/säkerhet redan löst (Batch A + Stage 1): båda klienterna går mot de
  delade 24 verktygen, båda har auth. Detta är ren grund-städning, ej brådska.
- Konsumenter av `matte_*` är inneslutna: 3 endpoints + `MatteChatModal.tsx` +
  auto-öppning i `agent/page.tsx:1069`. Inget annat rör tabellerna.

## Nuläge (verifierat mot kod)
- **Webb** (`MatteChatModal`): full list-UX (titel/preview/count/`delegated_to`)
  via `GET/POST/DELETE /api/matte/conversations[/[id][/messages]]`. Skickar bara
  `{content}`; servern (Väg A) genererar titel = första user-msg slice(0,60)
  ([messages/route.ts:139]) och returnerar `{assistant_message}`.
- **Mobil** (Stage 2): `/api/matte/chat`, skickar `threadId`, renderar `messages[]`
  + agent-etiketter. Ingen list-UX (en rullande chatt).
- **`agent_threads`**: id, business_id, customer_id, project_id, current_agent_id,
  context_summary, handoff_count, last_message_at, created_at. **Saknar** title/
  preview/count.
- **`thread_message`**: id, thread_id, business_id, role, agent, content,
  is_handoff_announcement, metadata, created_at. Har allt vi behöver.
- **`getOrCreateThread`**: återanvänder SENASTE tråden per business (eller per
  customer) — skapar EJ distinkta nya trådar. `chat/route.ts` skapar INGEN tråd
  för allmän chatt utan customer/project/threadId/bilder ("engångsmode").

## Beslut (låsta)
1. **Härled** title/preview/count från `thread_message` i list-endpointen →
   ingen schema-migrering. Titel = första user-meddelandet (slice 60).
2. **`chat/route.ts` ska ALLTID ha en tråd**: om ingen `threadId` och ingen
   customer/project → skapa en NY tråd (inte återanvänd). Säkerställer att varje
   allmän chatt persisteras + dyker upp i listan. Gynnar även mobilen.
3. Behåll handoff/bilder/summering (finns redan i Väg B).

## Öppet beslut (behöver Andreas)
- **Vilka trådar visas i webbens lista?**
  (a) Endast "allmänna" chattar (`customer_id IS NULL`) → ren chat-historik, men
      mobilens kund-kopplade trådar syns inte på webben.
  (b) ALLA trådar med ≥1 user-meddelande → äkta gemensam historik (mobil + webb),
      men kund-/röst-auto-trådar kan dyka upp i listan.
  *Rek: (b) med filter på "har minst ett user-meddelande" — det matchar "gemensam
  historik"-målet och utesluter rena automations-/röst-trådar utan dialog.*

## Implementationsplan

### Backend
- [ ] `lib/agent/handoff.ts`: lägg `forceNew?: boolean` på `getOrCreateThread`
      (eller ny `createThread`). När chat saknar threadId + customer/project →
      skapa ny tråd. Befintligt beteende oförändrat när customer/project finns.
- [ ] `app/api/matte/chat/route.ts`: när ingen tråd-kontext → skapa ny tråd
      (forceNew). Returnera alltid `thread_id`. (Mobil: första msg utan threadId
      → ny tråd; därefter skickas threadId → samma tråd. Verifiera regress.)
- [ ] **Ny** `GET /api/matte/threads` — lista trådar för business (auth +
      business_id-scope). Per tråd: id, härledd title, härledd last_preview,
      message_count, last_message_at. Filter per öppet beslut ovan. Sortera
      last_message_at DESC.
- [ ] **Ny** `GET /api/matte/threads/[id]` — ladda trådens meddelanden (role,
      agent, content, is_handoff_announcement, created_at). Auth + ownership-check
      (thread.business_id === auth).
- [ ] **Ny** `DELETE /api/matte/threads/[id]` — radera tråd (cascade tar messages).
      Auth + ownership.
- [ ] Markera Väg A-endpoints (`conversations*`) `@deprecated` i kommentar. Radera
      EJ (bakåtkompat tills webben är verifierad). Tabeller droppas EJ.

### Frontend (webb `MatteChatModal.tsx`)
- [ ] `fetchConversations` → `GET /api/matte/threads`.
- [ ] `loadConversation(id)` → `GET /api/matte/threads/[id]`; rendera `messages[]`
      med per-meddelande agent-etikett (ersätter `delegated_to`-blocket).
- [ ] "Ny": rensa activeId/messages (ingen API-call); tråd skapas vid första send.
- [ ] `sendMessage` → `POST /api/matte/chat` med `{ messages:[{role:'user',content}],
      context:{ threadId: activeId } }`. Servern laddar trådhistorik själv.
      Svar: `{reply, messages[], thread_id, current_agent, action}`. Append
      `messages[]` med agent-etikett. Sätt `activeId = thread_id`.
- [ ] `deleteConv` → `DELETE /api/matte/threads/[id]`.
- [ ] Behåll handoff-indikator: rendera per-meddelande `agent` (via `getAgentById`)
      + ev. särskild stil för `is_handoff_announcement`.
- [ ] `Conversation`/`ChatMessage`-typerna uppdateras till trådformen.

### Annat
- [ ] `agent/page.tsx:1069` auto-öppning → `GET /api/matte/threads`
      (använd `threads[0].last_message_at` + `message_count > 0`).

### Verifiering (acceptanskrav)
- [ ] `npx tsc --noEmit` 0 fel · `npx next build` ren.
- [ ] Manuell webb-smoke: ny chatt → svar; fråga som triggar handoff → agent-
      etikett syns; ladda om modal → tråd i listan m. titel/preview; växla trådar;
      radera tråd.
- [ ] Mobil-regress (contract oförändrat: chat returnerar reply/messages/thread_id;
      "ny chatt" = clearMessages nollar threadId → ny tråd). Device-test separat.
- [ ] Inga andra `matte_*`-konsumenter kvar (endast modal + agent/page, båda fixade).

## Risker
- R1 trådskapande-ändring bryter mobilflöde → mobil sänder threadId (Stage 2);
  verifiera "ny chatt"-nollning. R2 list-scope (öppet beslut). R3 titel-härledning
  hoppar över handoff-announcement → ta första *user*-msg. R4 ren start: gammal
  webb-historik blir otillgänglig i UI men bevaras i DB. R5 deploy = push to main
  (auto). Backend först, sen frontend i samma commit (annars trasig mellanlanding).

## Utanför scope
Droppa `matte_*`-tabeller (senare), historik-migrering, mobil-UI (Stage 2 klar).
