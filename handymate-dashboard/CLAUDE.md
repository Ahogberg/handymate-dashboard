# CLAUDE.md — Handymate Project Instructions

Detta dokument läses automatiskt av Claude Code vid sessionsstart. Följ alltid dessa regler.

## Workflow Orchestration

### 1. Plan Node Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- Write plan to tasks/todo.md with checkable items before starting
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop

- After ANY correction from the user: update tasks/lessons.md with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review tasks/lessons.md at the start of each session

### 4. Verification Before Done

- Never mark a task complete without proving it works
- Run `npx tsc --noEmit` — noll TypeScript-fel
- Run `npx next build` — ren build
- Ask yourself: "Would a staff engineer approve this?"
- Demonstrate correctness before marking done

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing issues without being told how

---

## Task Management

1. **Plan First**: Write plan to tasks/todo.md with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to tasks/todo.md
6. **Capture Lessons**: Update tasks/lessons.md after any correction

---

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

---

## Handymate-specifikt — Kritiska regler

### Databas

- `businesses` i spec/dokumentation = `business_config` i faktiska databasen — alltid
- `business_users` tabellen finns och används för användarrelationer
- SQL-migrationer körs manuellt i Supabase SQL Editor — skapa alltid en `.sql`-fil i `sql/`-mappen, kör aldrig migrationer programmatiskt
- Namnge migrationsfiler: `sql/v2_<feature>.sql`, ex. `sql/v2_pending_approvals.sql`
- Kontrollera alltid att tabeller och kolumner faktiskt finns innan du skriver queries mot dem

### Auth & Middleware

- Middleware har ingen auth-blockering — auth sker per route via `getAuthenticatedBusiness()`
- Alla nya API-rutter måste anropa `getAuthenticatedBusiness()` — hoppa aldrig över detta
- Inget middleware-undantag behövs för nya routes

### Agent-systemet

- 22 befintliga agent-tools i `lib/tool-definitions.ts` + `lib/tool-router.ts`
- Agent system prompt: `app/api/agent/trigger/system-prompt.ts`
- Nya tools läggs till i båda filerna — definitions + router case
- Kontrollera alltid befintliga tools innan du skapar nya för att undvika dubbletter

### UI & språk

- All UI-text på svenska — inga engelska termer synliga för slutanvändaren
- Inga tekniska termer som "agent run", "webhook", "token", "payload" i UI
- Svenska termer: "Godkänn" (approve), "Avvisa" (reject), "Inställningar" (settings), "Kunder" (customers), "Jobb" (projects/jobs)
- Tema: ljust, teal (`#0F766E`) som primärfärg — aldrig mörkt tema eller lila/fuchsia
- Komponenter skall vara mobiloptimerade — hantverkare använder telefon på bygget

### PWA & Push

- `theme_color` i manifest.json: `#0F766E` — inte mörkt
- `background_color`: `#ffffff`
- Push-notis skall alltid triggas när en ny high-risk pending_approval skapas
- iOS kräver PWA-installation innan push fungerar — visa alltid iOS-specifik instruktion

### Onboarding

- Onboarding har 10 steg (completed = steg 10) efter V2
- Befintliga kunder med `onboarding_step >= 8` skall migreras till 10
- Steg 8: preferensinsamling (5 frågor med knappalternativ, alla frivilliga)
- Steg 9: PWA-installation guide

### Tech stack

- **Frontend**: Next.js 14 (App Router), Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **AI**: Anthropic Claude (Haiku för enkel klassificering, Sonnet för agent)
- **Telefoni/SMS**: 46elks
- **Deploy**: Vercel — app.handymate.se
- **Sidebar**: `components/Sidebar.tsx` med `NavItem[]` array

---

## Verifiering — acceptanskrav innan modul markeras klar

- `npx tsc --noEmit` — noll fel
- `npx next build` — ren build
- Alla nya Supabase-queries testade mot faktisk databas
- Nya API-rutter returnerar korrekt svar (inte 401/500)
- UI renderar utan tomma sidor eller kraschade komponenter

---

## Kända fallgropar (lessons learned)

- **Unicode-escapes**: Spara alltid filer med UTF-8. Använd riktiga svenska tecken (å, ä, ö) — aldrig `\u00e5`, `\u00e4`, `\u00f6` i JSX/TSX
- **Onboarding steg-index**: Kontrollera alltid att switch-case eller array-index för onboarding-steg mappar till rätt komponent efter ändringar i antalet steg
- **Middleware-antaganden**: Läs `middleware.ts` innan du antar att något behöver undantas — auth sker per route här, inte i middleware
- **Tomma sidor utan fel**: Beror nästan alltid på (1) undefined data som mappas, (2) misslyckad DB-query som swäljs tyst, eller (3) fel steg-index. Börja alltid med att kontrollera dessa tre.
- **Supabase Realtime cleanup**: Unsubscribe alltid i `useEffect` cleanup-funktion för att undvika subscription-läckor
- **Stripe webhooks**: Webhook-signaturen måste valideras med raw body — använd aldrig JSON-parsed body för signaturvalidering
- **Vercel cron**: Hobby-planen tillåter max en körning per dag (`0 X * * *`). Uttryck som `*/15 * * * *` eller `0 * * * *` blockerar hela deployen — validera alltid cron-schema mot Hobby-plangränser innan commit
- **React state race conditions**: När flera `setState`-anrop beror på varandra, kalla dem alltid synkront i samma render (innan första `await`) — aldrig efter en await om de ska renderas tillsammans
- **Vercel deploy-blockering**: Om auto-deploy slutar fungera, kontrollera alltid `vercel.json` för ogiltiga cron-uttryck som tyst blockerar deployment-pipelinen
