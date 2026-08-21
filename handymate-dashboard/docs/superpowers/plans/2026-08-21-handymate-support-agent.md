# Handymate Support-agenten Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lägg till "Support" som en sjunde agent i Handymates befintliga multi-agent-chatt (Matte), så konto-/faktura-/uppsägnings-/klagomålsfrågor om hantverkarens EGEN Handymate-prenumeration eskaleras dit istället för att Matte (som representerar hantverkaren) hanterar dem själv — med en admin-kö för mänsklig uppföljning och en recensionslänk vid nöjt löst ärende.

**Architecture:** Återanvänder den befintliga handoff-/tråd-infrastrukturen (`lib/agent/handoff.ts`, `agent_threads`, `thread_message`) helt oförändrad. Enda nya tabellen är en lätt `support_ticket`-spårningsrad. Två nya, snävt scopade verktyg (`get_account_billing_status`, `escalate_to_handymate_team`) läggs till i det delade verktygsbiblioteket. En ny flik i det befintliga `/admin` är kön; svar därifrån skrivs som vanliga `thread_message`-rader, ingen ny meddelandeväg.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres), Anthropic Claude (Sonnet, redan befintlig integration), Playwright för facit-tester (källskanning, samma mönster som `tests/facit-*.spec.ts`).

**Referens:** `docs/superpowers/specs/2026-08-21-handymate-support-agent-design.md`

---

### Task 1: SQL-migration `support_ticket`

**Files:**
- Create: `sql/v165_support_ticket.sql`

- [ ] **Step 1: Skriv migrationen**

```sql
-- v165: Support-agentens spardningsrad. Konversationen ligger redan i
-- agent_threads/thread_message — den har tabellen ar bara en lattvikts-
-- ko-rad ovanpa, for /admin-vyn och notiser.
--
-- KORS MANUELLT i Supabase SQL Editor.

BEGIN;

CREATE TABLE public.support_ticket (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES public.business_config(business_id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES public.agent_threads(id) ON DELETE CASCADE,
  category TEXT NOT NULL
    CHECK (category IN ('cancellation', 'refund', 'gdpr', 'bug_financial', 'human_requested', 'other')),
  status TEXT NOT NULL DEFAULT 'escalated'
    CHECK (status IN ('escalated', 'in_progress', 'resolved')),
  escalated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  satisfaction TEXT CHECK (satisfaction IN ('positive', 'negative')),
  resolved_by TEXT,

  CONSTRAINT support_ticket_resolved_state CHECK (
    (status = 'resolved' AND resolved_at IS NOT NULL)
    OR (status IN ('escalated', 'in_progress') AND resolved_at IS NULL)
  )
);

CREATE INDEX idx_support_ticket_status ON public.support_ticket (status, escalated_at);
CREATE INDEX idx_support_ticket_business ON public.support_ticket (business_id);

ALTER TABLE public.support_ticket ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.support_ticket FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.support_ticket TO service_role;
CREATE POLICY support_ticket_service_role ON public.support_ticket
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

COMMIT;

-- Verifiera efterat:
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='support_ticket' ORDER BY ordinal_position;
```

- [ ] **Step 2: Meddela att migrationen väntar**

Denna fil körs INTE av dig själv (CLAUDE.md-regel: migrationer körs
manuellt av Andreas, eller av Claude via Supabase MCP efter att Andreas
sagt "kör"). Notera i din slutrapport att `sql/v165_support_ticket.sql`
väntar på körning — resten av planen kan implementeras och testas ändå
(facit-testerna är källskanning, ingen live-DB krävs).

---

### Task 2: Registrera 'support' som AgentId

**Files:**
- Modify: `lib/agent/capabilities.ts`
- Test: `tests/facit-support-agent-capabilities.spec.ts`

- [ ] **Step 1: Skriv det failande facit-testet**

```typescript
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const FILE = fs.readFileSync(
  path.join(__dirname, '..', 'lib/agent/capabilities.ts'),
  'utf8',
)

test.describe('Support som sjunde agent (lib/agent/capabilities.ts)', () => {
  test('AgentId-unionen inkluderar support', () => {
    expect(FILE).toMatch(/export type AgentId = .*'support'/)
  })

  test('AGENT_CAPABILITIES.support finns med handoff_targets begransat till matte', () => {
    const idx = FILE.indexOf('support: {')
    expect(idx).toBeGreaterThan(-1)
    const block = FILE.slice(idx, idx + 700)
    expect(block).toMatch(/handoff_targets:\s*\['matte'\]/)
  })

  test('alla ovriga agenter har support i sin handoff_targets-lista', () => {
    for (const agent of ['lars', 'karin', 'daniel', 'hanna', 'lisa']) {
      const idx = FILE.indexOf(`${agent}: {`)
      expect(idx).toBeGreaterThan(-1)
      const nextAgentIdx = FILE.indexOf('\n\n  ', idx + 10)
      const block = FILE.slice(idx, nextAgentIdx > -1 ? nextAgentIdx : idx + 1200)
      expect(block).toMatch(/handoff_targets:\s*\[[^\]]*'support'/)
    }
  })

  test('matte.out_of_scope namner Handymate-konto/fakturering', () => {
    const idx = FILE.indexOf("matte: {")
    const block = FILE.slice(idx, idx + 1200)
    expect(block).toMatch(/Handymate-konto/)
  })
})
```

- [ ] **Step 2: Kör testet, verifiera att det failar**

Run: `npx playwright test tests/facit-support-agent-capabilities.spec.ts --reporter=list`
Expected: FAIL — `AgentId`-unionen saknar `'support'`, ingen `support: {`-post finns.

- [ ] **Step 3: Implementera ändringen**

I `lib/agent/capabilities.ts`, ändra unionstypen:

```typescript
export type AgentId = 'matte' | 'lars' | 'karin' | 'daniel' | 'hanna' | 'lisa' | 'support'
```

Lägg till `'support'` sist i varje övrig agents `handoff_targets`-array
(t.ex. `lars.handoff_targets: ['matte', 'karin', 'daniel', 'hanna', 'support']`
— gör samma tillägg för karin/daniel/hanna/lisa).

Lägg till en rad i `matte.out_of_scope`:

```typescript
    out_of_scope: [
      'Detaljerad fakturahantering — Karin äger',
      'Offert-utformning och prisförhandling — Daniel äger',
      'Projektledning och bokningsdetaljer — Lars äger',
      'Recensioner och kampanjer — Hanna äger',
      'Frågor om ditt Handymate-konto, fakturering, uppsägning eller klagomål på plattformen — Support äger',
    ],
```

Lägg till en ny post sist i `AGENT_CAPABILITIES`, före den avslutande `}`:

```typescript
  support: {
    id: 'support',
    name: 'Handymate Support',
    domain: 'Handymates egen support — konto, fakturering, uppsägning, klagomål på plattformen.',
    expertise: [
      'Frågor om din Handymate-prenumeration och fakturering',
      'Uppsägning eller nedgradering',
      'Refund-förfrågningar (skapar en begäran, beslutar aldrig själv)',
      'Klagomål och buggar som påverkat dig ekonomiskt',
    ],
    out_of_scope: [
      'Allt som rör DINA kunder/offerter/fakturor — Matte och teamet äger det',
    ],
    handoff_targets: ['matte'],
  },
```

- [ ] **Step 4: Kör testet igen, verifiera att det passerar**

Run: `npx playwright test tests/facit-support-agent-capabilities.spec.ts --reporter=list`
Expected: PASS (alla 4 tester)

- [ ] **Step 5: tsc**

Run: `npx tsc --noEmit`
Expected: inga fel (AgentId-unionen används på flera ställen — om något
call-site inte hanterar det nya värdet uttömmande visar tsc det här)

- [ ] **Step 6: Commit**

```bash
git add lib/agent/capabilities.ts tests/facit-support-agent-capabilities.spec.ts
git commit -m "feat(support): registrera support som sjunde agent i capabilities"
```

---

### Task 3: Lägg till 'support' i handoff_to_agent-verktygets enum

**Files:**
- Modify: `app/api/matte/chat/route.ts:376`
- Test: `tests/facit-support-agent-capabilities.spec.ts` (utökas)

- [ ] **Step 1: Utöka facit-testet**

Lägg till i samma testfil som Task 2:

```typescript
test.describe('handoff_to_agent-verktygets enum inkluderar support', () => {
  const ROUTE = fs.readFileSync(
    path.join(__dirname, '..', 'app/api/matte/chat/route.ts'),
    'utf8',
  )
  test('target_agent-enum listar support', () => {
    const idx = ROUTE.indexOf("enum: ['matte', 'lars', 'karin', 'daniel', 'hanna', 'lisa']")
    expect(idx).toBeGreaterThan(-1)
  })
})
```

- [ ] **Step 2: Kör, verifiera fail**

Run: `npx playwright test tests/facit-support-agent-capabilities.spec.ts -g "handoff_to_agent" --reporter=list`
Expected: FAIL — nuvarande enum är `['matte', 'lars', 'karin', 'daniel', 'hanna', 'lisa', 'support']` (utan support ännu)

- [ ] **Step 3: Implementera**

I `app/api/matte/chat/route.ts`, ändra `handoff_to_agent`-verktygets
`target_agent`-property (rad ~373-377):

```typescript
        target_agent: {
          type: 'string',
          description: 'Vilken agent som ska ta över: matte | lars | karin | daniel | hanna | lisa | support',
          enum: ['matte', 'lars', 'karin', 'daniel', 'hanna', 'lisa', 'support'],
        },
```

- [ ] **Step 4: Kör testet igen**

Run: `npx playwright test tests/facit-support-agent-capabilities.spec.ts --reporter=list`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/matte/chat/route.ts tests/facit-support-agent-capabilities.spec.ts
git commit -m "feat(support): lagg till support i handoff_to_agent-enumet"
```

---

### Task 4: Registrera 'support' i personalities.ts (verktygsscope)

**Files:**
- Modify: `lib/agents/personalities.ts`
- Test: `tests/facit-support-agent-tools.spec.ts`

**VARFÖR DETTA ÄR KRITISKT:** `getAgentTools(agentId)` (rad 293-295 i
`lib/agents/personalities.ts`) returnerar `AGENT_PERSONALITIES[agentId]
?.allowedTools || 'all'`. Om `'support'` INTE läggs till i
`AGENT_PERSONALITIES`, faller uppslaget igenom till `'all'` — Support
skulle få tillgång till VARJE verktyg (skapa fakturor, skicka SMS till
kunder, allt) istället för den avsedda snäva listan. Detta är precis
tvärtom mot designens krav ("noll skrivrätt" utanför sina två egna
verktyg).

- [ ] **Step 1: Skriv det failande facit-testet**

```typescript
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const FILE = fs.readFileSync(
  path.join(__dirname, '..', 'lib/agents/personalities.ts'),
  'utf8',
)

test.describe('Support-agentens verktygsscope (lib/agents/personalities.ts)', () => {
  test('support finns explicit i AGENT_PERSONALITIES (fangar INTE all-fallbacken)', () => {
    expect(FILE).toContain("support: {")
  })

  test('support.allowedTools ar EN ARRAY, aldrig strangen all', () => {
    const idx = FILE.indexOf('support: {')
    expect(idx).toBeGreaterThan(-1)
    const block = FILE.slice(idx, idx + 500)
    expect(block).toMatch(/allowedTools:\s*\[/)
    expect(block).not.toMatch(/allowedTools:\s*'all'/)
  })

  test('support.allowedTools innehaller de tva nya verktygen', () => {
    const idx = FILE.indexOf('support: {')
    const block = FILE.slice(idx, idx + 500)
    expect(block).toMatch(/get_account_billing_status/)
    expect(block).toMatch(/escalate_to_handymate_team/)
  })

  test('support.allowedTools innehaller INTE create_approval_request (se spec: fel ko)', () => {
    const idx = FILE.indexOf('support: {')
    const closeIdx = FILE.indexOf('\n  },', idx)
    const block = FILE.slice(idx, closeIdx)
    expect(block).not.toMatch(/create_approval_request/)
  })

  test('support.triggers ar tom — kan bara nas via handoff i en aktiv chatt', () => {
    const idx = FILE.indexOf('support: {')
    const closeIdx = FILE.indexOf('\n  },', idx)
    const block = FILE.slice(idx, closeIdx)
    expect(block).toMatch(/triggers:\s*\[\]/)
  })
})
```

- [ ] **Step 2: Kör, verifiera fail**

Run: `npx playwright test tests/facit-support-agent-tools.spec.ts --reporter=list`
Expected: FAIL — `support: {` finns inte i filen än.

- [ ] **Step 3: Implementera**

Lägg till en ny post i `AGENT_PERSONALITIES` (`lib/agents/personalities.ts`),
efter `lisa`-posten och före den avslutande `}`:

```typescript
  support: {
    id: 'support',
    name: 'Handymate Support',
    role: 'Handymates egen support',
    systemPromptSuffix: `
Du är Handymate Support. Du representerar HANDYMATE, inte hantverkaren — var alltid transparent om det.
Din roll: kontofrågor, fakturering, uppsägning, refund-förfrågningar, klagomål på plattformen.
Du beslutar ALDRIG själv om refund eller uppsägning — du eskalerar till Handymates team och är ärlig om att en människa tar över.
Skriv alltid på svenska. Var professionell och empatisk, men ljug aldrig om att du är AI eller om vad som kommer hända härnäst.`,
    allowedTools: ['get_account_billing_status', 'escalate_to_handymate_team'],
    // Support nås ENDAST via handoff_to_agent i en aktiv chatt — aldrig
    // via ett autonomt trigger-event (routeToAgent/matchAgentByPrefix
    // läser aldrig denna array eftersom inget event-prefix pekar hit).
    triggers: [],
  },
```

- [ ] **Step 4: Kör testet igen**

Run: `npx playwright test tests/facit-support-agent-tools.spec.ts --reporter=list`
Expected: PASS (alla 5 tester)

- [ ] **Step 5: tsc + commit**

```bash
npx tsc --noEmit
git add lib/agents/personalities.ts tests/facit-support-agent-tools.spec.ts
git commit -m "feat(support): registrera support i personalities.ts med snavt verktygsscope"
```

---

### Task 5: Nytt verktyg `get_account_billing_status`

**Files:**
- Modify: `app/api/agent/trigger/tool-definitions.ts`
- Modify: `app/api/agent/trigger/tool-router.ts`
- Test: `tests/facit-get-account-billing-status.spec.ts`

- [ ] **Step 1: Skriv det failande facit-testet**

```typescript
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const DEFS = fs.readFileSync(
  path.join(__dirname, '..', 'app/api/agent/trigger/tool-definitions.ts'),
  'utf8',
)
const ROUTER = fs.readFileSync(
  path.join(__dirname, '..', 'app/api/agent/trigger/tool-router.ts'),
  'utf8',
)

test.describe('get_account_billing_status', () => {
  test('verktygsschema finns i tool-definitions.ts', () => {
    expect(DEFS).toContain('name: "get_account_billing_status"')
  })

  test('routern har ett case for verktyget', () => {
    expect(ROUTER).toMatch(/case 'get_account_billing_status'/)
  })

  test('implementationen ar rent lasande — ingen .update(/.insert( pa business_config i dess block', () => {
    const idx = ROUTER.indexOf("case 'get_account_billing_status'")
    expect(idx).toBeGreaterThan(-1)
    const nextCaseIdx = ROUTER.indexOf("case '", idx + 10)
    const block = ROUTER.slice(idx, nextCaseIdx > -1 ? nextCaseIdx : idx + 800)
    expect(block).not.toMatch(/business_config['"]\)\s*\n?\s*\.update\(/)
    expect(block).not.toMatch(/business_config['"]\)\s*\n?\s*\.insert\(/)
  })

  test('lases fran business_config.subscription_plan/status/trial_ends_at', () => {
    const idx = ROUTER.indexOf("case 'get_account_billing_status'")
    const block = ROUTER.slice(idx, idx + 800)
    expect(block).toMatch(/subscription_plan/)
    expect(block).toMatch(/subscription_status/)
  })
})
```

- [ ] **Step 2: Kör, verifiera fail**

Run: `npx playwright test tests/facit-get-account-billing-status.spec.ts --reporter=list`
Expected: FAIL — inget av detta finns än.

- [ ] **Step 3: Lägg till verktygsschemat**

I `app/api/agent/trigger/tool-definitions.ts`, lägg till i arrayen
(t.ex. direkt efter `check_fortnox_status`-posten, rad ~482):

```typescript
  {
    name: "get_account_billing_status",
    description: "Hämta hantverkarens EGEN Handymate-prenumeration (plan, status, ev. provperiod). Endast för Support-agenten — rör aldrig hantverkarens KUNDERS fakturor.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
```

- [ ] **Step 4: Lägg till routerns handler**

I `app/api/agent/trigger/tool-router.ts`, lägg till ett nytt `case`
direkt efter `case 'create_approval_request': ...` (rad ~172-174):

```typescript
      case 'get_account_billing_status': {
        const { data, error } = await supabase
          .from('business_config')
          .select('subscription_plan, subscription_status, trial_ends_at')
          .eq('business_id', businessId)
          .single()
        if (error || !data) {
          return { success: false, error: 'Kunde inte läsa kontostatus' }
        }
        return {
          success: true,
          data: {
            plan: data.subscription_plan,
            status: data.subscription_status,
            trial_ends_at: data.trial_ends_at,
          },
        }
      }
```

- [ ] **Step 5: Kör testet igen**

Run: `npx playwright test tests/facit-get-account-billing-status.spec.ts --reporter=list`
Expected: PASS (alla 4 tester)

- [ ] **Step 6: Lägg till i CURATED_TOOL_NAMES (Matte-chattens verktygslista)**

I `app/api/matte/chat/route.ts`, lägg till `'get_account_billing_status'`
i `CURATED_TOOL_NAMES`-arrayen (rad ~299-321) — annars filtreras
verktyget bort av `filterTools()` trots att routern kan hantera det:

```typescript
  'get_project_commercial_readiness',
  'propose_mission_plan', 'confirm_mission',
  // Support-agenten (2026-08-21) — se lib/agent/capabilities.ts 'support'.
  'get_account_billing_status', 'escalate_to_handymate_team',
]
```

(Notera: `escalate_to_handymate_team` läggs till här redan nu — Task 7
bygger själva verktyget, men det är enklare att göra båda tilläggen i
denna lista på en gång än att komma tillbaka hit.)

- [ ] **Step 7: tsc + commit**

```bash
npx tsc --noEmit
git add app/api/agent/trigger/tool-definitions.ts app/api/agent/trigger/tool-router.ts app/api/matte/chat/route.ts tests/facit-get-account-billing-status.spec.ts
git commit -m "feat(support): nytt verktyg get_account_billing_status"
```

---

### Task 6: Notifieringshjälpare `notifyHandymateSupportTeam`

**Files:**
- Create: `lib/notifications/handymate-team-alert.ts`
- Test: `tests/facit-handymate-team-alert.spec.ts`

**Varför en egen, enkel implementation istället för att återanvända
`sendApprovalPush`:** den funktionen är byggd för att pusha till EN
specifik businessens EGNA push-prenumeranter (slår upp deras
subscription via `business_id`). Handymates interna team är inte en
"business" i den bemärkelsen — vi vill nå två fasta telefonnummer,
alltid, oavsett vilken business som eskalerade. Återanvänder istället
samma råa 46elks-anropsmönster som redan finns i `lib/sms-send.ts`
(rad 270-282), men UTAN dess kvot-/opt-out-lager — de skyddar
SLUTKUNDER från oönskade SMS, helt irrelevant för ett internt
driftlarm till era egna två nummer.

- [ ] **Step 1: Skriv det failande facit-testet**

```typescript
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const FILE = fs.readFileSync(
  path.join(__dirname, '..', 'lib/notifications/handymate-team-alert.ts'),
  'utf8',
)

test.describe('notifyHandymateSupportTeam', () => {
  test('exporterar funktionen', () => {
    expect(FILE).toMatch(/export async function notifyHandymateSupportTeam/)
  })

  test('anvander ELKS_API_USER/ELKS_API_PASSWORD, samma env-var som lib/sms-send.ts', () => {
    expect(FILE).toContain('ELKS_API_USER')
    expect(FILE).toContain('ELKS_API_PASSWORD')
  })

  test('POST:ar mot 46elks sms-endpointen direkt, ingen kvotkoll', () => {
    expect(FILE).toContain('https://api.46elks.com/a1/sms')
    expect(FILE).not.toMatch(/checkSmsAllowance|resolveSmsQuotaPlan/)
  })

  test('mottagarna ar en fast, hardkodad lista (v1 — inte en @handymate.se-katalogsokning)', () => {
    expect(FILE).toMatch(/HANDYMATE_SUPPORT_ALERT_PHONES/)
  })

  test('ett fel vid sandning kastar aldrig — fire-and-forget, loggas bara', () => {
    const idx = FILE.indexOf('export async function notifyHandymateSupportTeam')
    const block = FILE.slice(idx, idx + 1500)
    expect(block).toMatch(/catch/)
  })
})
```

- [ ] **Step 2: Kör, verifiera fail**

Run: `npx playwright test tests/facit-handymate-team-alert.spec.ts --reporter=list`
Expected: FAIL — filen finns inte än.

- [ ] **Step 3: Implementera**

```typescript
// lib/notifications/handymate-team-alert.ts
//
// Internt driftlarm till Handymates eget team (INTE en business-scopad
// push/SMS — se docs/superpowers/specs/2026-08-21-handymate-support-agent-design.md).
// Fast, hardkodad mottagarlista for v1 — tva personer, ingen katalogsokning.

const ELKS_API_USER = process.env.ELKS_API_USER
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD

// Kommaseparerad lista med E.164-nummer, t.ex. "+46701234567,+46707654321".
// Satt via Vercel env vars — INGA telefonnummer hardkodas i kallkoden.
const ALERT_PHONES = (process.env.HANDYMATE_SUPPORT_ALERT_PHONES || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

export interface SupportTicketAlert {
  businessName: string
  category: string
  ticketId: string
}

/**
 * Fire-and-forget SMS-larm till Handymates eget team vid en support-
 * eskalering. Skiljer sig medvetet fran sendApprovalPush/sendSmsViaElks:
 * ingen kvotkoll, ingen opt-out, inget business_id att logga mot — det
 * ar INTE ett kundutskick, det ar ett internt driftlarm till era egna
 * tva nummer.
 */
export async function notifyHandymateSupportTeam(alert: SupportTicketAlert): Promise<void> {
  if (!ELKS_API_USER || !ELKS_API_PASSWORD) {
    console.error('[handymate-team-alert] 46elks credentials saknas — larm ej skickat')
    return
  }
  if (ALERT_PHONES.length === 0) {
    console.error('[handymate-team-alert] HANDYMATE_SUPPORT_ALERT_PHONES ej konfigurerad — larm ej skickat')
    return
  }

  const message = `Support-arende (${alert.category}) fran ${alert.businessName}. Se /admin. #${alert.ticketId}`

  await Promise.all(
    ALERT_PHONES.map(async (phone) => {
      try {
        const response = await fetch('https://api.46elks.com/a1/sms', {
          method: 'POST',
          headers: {
            Authorization: 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            from: 'Handymate',
            to: phone,
            message,
          }),
        })
        if (!response.ok) {
          console.error('[handymate-team-alert] 46elks svarade', response.status, 'for', phone)
        }
      } catch (err) {
        console.error('[handymate-team-alert] SMS-sandning misslyckades (non-blocking):', err)
      }
    })
  )
}
```

- [ ] **Step 4: Kör testet igen**

Run: `npx playwright test tests/facit-handymate-team-alert.spec.ts --reporter=list`
Expected: PASS (alla 5 tester)

- [ ] **Step 5: tsc + commit**

```bash
npx tsc --noEmit
git add lib/notifications/handymate-team-alert.ts tests/facit-handymate-team-alert.spec.ts
git commit -m "feat(support): internt SMS-larm till Handymates team vid eskalering"
```

**OBS till dig som kör planen:** notera i slutrapporten att miljövariabeln
`HANDYMATE_SUPPORT_ALERT_PHONES` måste sättas i Vercel innan detta
fungerar skarpt (t.ex. `+46701234567,+46707654321`) — annars loggas
bara felet, inget SMS skickas.

---

### Task 7: Nytt verktyg `escalate_to_handymate_team`

**Files:**
- Modify: `app/api/agent/trigger/tool-definitions.ts`
- Modify: `app/api/agent/trigger/tool-router.ts`
- Test: `tests/facit-escalate-to-handymate-team.spec.ts`

- [ ] **Step 1: Skriv det failande facit-testet**

```typescript
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const DEFS = fs.readFileSync(
  path.join(__dirname, '..', 'app/api/agent/trigger/tool-definitions.ts'),
  'utf8',
)
const ROUTER = fs.readFileSync(
  path.join(__dirname, '..', 'app/api/agent/trigger/tool-router.ts'),
  'utf8',
)

test.describe('escalate_to_handymate_team', () => {
  test('verktygsschema finns med category-enum for alla fem kategorier', () => {
    expect(DEFS).toContain('name: "escalate_to_handymate_team"')
    const idx = DEFS.indexOf('name: "escalate_to_handymate_team"')
    const block = DEFS.slice(idx, idx + 700)
    for (const cat of ['cancellation', 'refund', 'gdpr', 'bug_financial', 'human_requested']) {
      expect(block).toContain(cat)
    }
  })

  test('routern skapar en support_ticket-rad', () => {
    const idx = ROUTER.indexOf("case 'escalate_to_handymate_team'")
    expect(idx).toBeGreaterThan(-1)
    const block = ROUTER.slice(idx, idx + 1200)
    expect(block).toMatch(/\.from\('support_ticket'\)/)
    expect(block).toMatch(/\.insert\(/)
  })

  test('routern anropar notifyHandymateSupportTeam', () => {
    expect(ROUTER).toContain('notifyHandymateSupportTeam')
  })

  test('skapar INGEN pending_approvals-rad (se spec — fel ko for detta)', () => {
    const idx = ROUTER.indexOf("case 'escalate_to_handymate_team'")
    const nextCaseIdx = ROUTER.indexOf("case '", idx + 10)
    const block = ROUTER.slice(idx, nextCaseIdx > -1 ? nextCaseIdx : idx + 1200)
    expect(block).not.toMatch(/pending_approvals/)
  })
})
```

- [ ] **Step 2: Kör, verifiera fail**

Run: `npx playwright test tests/facit-escalate-to-handymate-team.spec.ts --reporter=list`
Expected: FAIL

- [ ] **Step 3: Lägg till verktygsschemat**

I `app/api/agent/trigger/tool-definitions.ts`, direkt efter
`get_account_billing_status`-posten (Task 5):

```typescript
  {
    name: "escalate_to_handymate_team",
    description: "Eskalera ett ärende till Handymates eget team för mänsklig hantering (uppsägning, refund, GDPR-klagomål, bugg med pengapåverkan, eller när hantverkaren uttryckligen ber om en människa). Endast för Support-agenten. Beslutar ALDRIG själv — skapar bara ärendet och larmar teamet.",
    input_schema: {
      type: "object" as const,
      properties: {
        category: {
          type: "string",
          enum: ["cancellation", "refund", "gdpr", "bug_financial", "human_requested", "other"],
          description: "Vilken typ av ärende",
        },
        summary: {
          type: "string",
          description: "Kort sammanfattning av vad hantverkaren vill, för teamet att se direkt i kön",
        },
      },
      required: ["category", "summary"],
    },
  },
```

- [ ] **Step 4: Lägg till routerns handler**

I `app/api/agent/trigger/tool-router.ts`, direkt efter
`get_account_billing_status`-caset (Task 5). Verktyget behöver
`threadId` — kontrollera hur `executeTool`/`executeSharedTool`s
`ToolContext`-parameter redan bär den (samma `toolContext`-objekt som
`app/api/matte/chat/route.ts` bygger och skickar till
`executeSharedTool`, se `lib/agent/agents/shared.ts` `ToolContext`) —
om `threadId` inte redan finns där, lägg till det som ett nytt
optionellt fält på `ToolContext`-interfacet och sätt det från
`thread.id` i `app/api/matte/chat/route.ts` innan `executeSharedTool`
anropas i tool-loopen (samma ställe `businessUserId` redan sätts, rad
~1029):

```typescript
      case 'escalate_to_handymate_team': {
        const { category, summary } = input
        if (!category || !summary) {
          return { success: false, error: 'category och summary krävs' }
        }
        const threadId = (toolContext as any)?.threadId
        if (!threadId) {
          return { success: false, error: 'Ingen aktiv konversationstråd att koppla ärendet till' }
        }
        const { data: biz } = await supabase
          .from('business_config')
          .select('business_name')
          .eq('business_id', businessId)
          .single()

        const ticketId = 'stkt_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8)
        const { error } = await supabase.from('support_ticket').insert({
          id: ticketId,
          business_id: businessId,
          thread_id: threadId,
          category: String(category),
          status: 'escalated',
        })
        if (error) {
          console.error('[escalate_to_handymate_team] insert error:', error)
          return { success: false, error: 'Kunde inte skapa supportärendet' }
        }

        const { notifyHandymateSupportTeam } = await import('@/lib/notifications/handymate-team-alert')
        await notifyHandymateSupportTeam({
          businessName: biz?.business_name || 'Okänt företag',
          category: String(category),
          ticketId,
        })

        return {
          success: true,
          data: { message: 'Ärendet är skapat och Handymates team är notifierat — de återkommer till dig här i chatten.' },
        }
      }
```

- [ ] **Step 5: Kör testet igen**

Run: `npx playwright test tests/facit-escalate-to-handymate-team.spec.ts --reporter=list`
Expected: PASS (alla 4 tester)

- [ ] **Step 6: tsc + commit**

```bash
npx tsc --noEmit
git add app/api/agent/trigger/tool-definitions.ts app/api/agent/trigger/tool-router.ts tests/facit-escalate-to-handymate-team.spec.ts
git commit -m "feat(support): nytt verktyg escalate_to_handymate_team"
```

---

### Task 8: Registrera Support i teamregistret (avatar + byline)

**VIKTIGT — korrigerat efter kodläsning:** en tidigare version av denna
plan antog att `components/MatteChatModal.tsx` alltid renderar Mattes
porträtt och att Support behövde ett särskilt undantag där. Det stämde
INTE — koden vid rad 400-403 innehåller en kommentar som beskriver ett
ÄLDRE läge; sedan Epic 3 (`components/agents/AgentMessage.tsx`) får
VARJE agent redan sitt eget avatar + en byline i tredje person ("Karin
· Ekonom förberedde") på VARJE meddelande, härlett ur EN källa:
`lib/agents/team.ts`s `TEAM`-array. Support behöver bara registreras
DÄR — ingen ändring i `MatteChatModal.tsx` eller `AgentMessage.tsx`.

**Files:**
- Modify: `lib/agents/team.ts`
- Modify: `lib/agents/interaction.ts`
- Test: `tests/facit-support-team-identity.spec.ts`

- [ ] **Step 1: Skriv det failande facit-testet**

```typescript
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const TEAM_FILE = fs.readFileSync(
  path.join(__dirname, '..', 'lib/agents/team.ts'),
  'utf8',
)
const INTERACTION_FILE = fs.readFileSync(
  path.join(__dirname, '..', 'lib/agents/interaction.ts'),
  'utf8',
)

test.describe('Support har en egen identitet i teamregistret', () => {
  test('support finns i TEAM-arrayen med id support', () => {
    expect(TEAM_FILE).toMatch(/id:\s*'support'/)
  })

  test('support-posten har namnet Handymate Support', () => {
    const idx = TEAM_FILE.indexOf("id: 'support'")
    expect(idx).toBeGreaterThan(-1)
    const block = TEAM_FILE.slice(idx, idx + 400)
    expect(block).toMatch(/Handymate Support/)
  })

  test('support finns i SHORT_VERB-kartan (annars faller bylinen tillbaka pa Teamet/noterade)', () => {
    const idx = INTERACTION_FILE.indexOf('const SHORT_VERB')
    expect(idx).toBeGreaterThan(-1)
    const block = INTERACTION_FILE.slice(idx, idx + 300)
    expect(block).toMatch(/support:/)
  })
})
```

- [ ] **Step 2: Kör, verifiera fail**

Run: `npx playwright test tests/facit-support-team-identity.spec.ts --reporter=list`
Expected: FAIL — `support` finns inte i någon av filerna än.

- [ ] **Step 3: Implementera i `lib/agents/team.ts`**

Lägg till en ny post sist i `TEAM`-arrayen (efter `lisa`-raden, rad 34,
innan den avslutande `]`):

```typescript
  { id: 'support', name: 'Handymate Support', role: 'Support', initials: 'HS', color: 'bg-rose-600', dot: '#e11d48', softBg: '#FDE8EC', softText: '#9F1239', greeting: 'Jag hjälper dig med ditt Handymate-konto', description: 'Konto, fakturering, uppsägning och klagomål på plattformen' },
```

(Ingen `avatar`-nyckel — `AgentAvatar` faller redan tillbaka på en
färgad cirkel med initialerna "HS" när `avatar` saknas, samma säkra
väg som varje agent utan laddad bild redan använder. En riktig
avatarbild kan läggas till senare utan kodändring.)

- [ ] **Step 4: Implementera i `lib/agents/interaction.ts`**

Lägg till en rad i `SHORT_VERB`-kartan (rad 79-86):

```typescript
const SHORT_VERB: Record<string, string> = {
  matte: 'sammanställde',
  karin: 'förberedde',
  daniel: 'hittade',
  lars: 'kontrollerade',
  hanna: 'föreslog',
  lisa: 'tog emot',
  support: 'svarade',
}
```

- [ ] **Step 5: Kör testet igen**

Run: `npx playwright test tests/facit-support-team-identity.spec.ts --reporter=list`
Expected: PASS (alla 3 tester)

- [ ] **Step 6: Manuell koll i webbläsaren**

Kör `npm run dev`, öppna Matte-chatten, skriv ett meddelande som borde
trigga en handoff till Support (t.ex. "jag vill säga upp mitt konto"),
och verifiera visuellt att Support-meddelanden får en egen rosa
initial-avatar och bylinen "Handymate Support · Support svarade" —
och att handoff-ögonblicket självt visas dämpat med pil, precis som
andra specialist-handoffs redan gör (`AgentMessage.tsx`s
`ärÖverlämning`-läge, ingen ny kod för det).

- [ ] **Step 7: tsc + commit**

```bash
npx tsc --noEmit
git add lib/agents/team.ts lib/agents/interaction.ts tests/facit-support-team-identity.spec.ts
git commit -m "feat(support): registrera support i teamregistret for eget avatar+byline"
```

---

### Task 9: Admin — supportkö-flik

**Files:**
- Create: `app/admin/components/SupportQueueTab.tsx`
- Create: `app/api/admin/support-tickets/route.ts` (GET — lista ärenden)
- Modify: `app/admin/page.tsx`
- Test: `tests/facit-admin-support-queue.spec.ts`

- [ ] **Step 1: Skriv det failande facit-testet**

```typescript
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

test.describe('Admin supportko', () => {
  test('SupportQueueTab-komponenten finns', () => {
    const p = path.join(__dirname, '..', 'app/admin/components/SupportQueueTab.tsx')
    expect(fs.existsSync(p)).toBe(true)
  })

  test('GET /api/admin/support-tickets kraver isAdmin', () => {
    const route = fs.readFileSync(
      path.join(__dirname, '..', 'app/api/admin/support-tickets/route.ts'),
      'utf8',
    )
    expect(route).toContain('isAdmin')
  })

  test('admin-sidan har en support-flik', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', 'app/admin/page.tsx'), 'utf8')
    expect(page).toMatch(/'support'/)
    expect(page).toContain('SupportQueueTab')
  })
})
```

- [ ] **Step 2: Kör, verifiera fail**

Run: `npx playwright test tests/facit-admin-support-queue.spec.ts --reporter=list`
Expected: FAIL

- [ ] **Step 3: Bygg listnings-API:et**

Läs `app/admin/page.tsx` (offset 1, limit 60) för att se exakt hur
`isAdmin()` importeras och används i en befintlig admin-route (t.ex.
`app/api/admin/metrics/route.ts`) INNAN du skriver denna fil, så
mönstret matchar exakt.

**Verifierad signatur** (`lib/admin-auth.ts:20`):
`isAdmin(request: NextRequest): Promise<{ isAdmin: boolean; userId?: string; email?: string }>`
— returnerar ett OBJEKT, inte en boolean. Läs `.isAdmin`-fältet explicit,
annars är villkoret alltid sant (ett objekt är alltid truthy).

```typescript
// app/api/admin/support-tickets/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { isAdmin } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const admin = await isAdmin(request)
  if (!admin.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('support_ticket')
    .select('id, business_id, thread_id, category, status, escalated_at, resolved_at, satisfaction, business_config:business_id (business_name)')
    .neq('status', 'resolved')
    .order('escalated_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tickets: data || [] })
}
```

- [ ] **Step 4: Bygg fliken**

```tsx
// app/admin/components/SupportQueueTab.tsx
'use client'

import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'

interface SupportTicket {
  id: string
  business_id: string
  thread_id: string
  category: string
  status: string
  escalated_at: string
  business_config?: { business_name?: string } | null
}

const CATEGORY_LABELS: Record<string, string> = {
  cancellation: 'Uppsägning',
  refund: 'Refund',
  gdpr: 'GDPR/juridik',
  bug_financial: 'Bugg (pengapåverkan)',
  human_requested: 'Ville prata med människa',
  other: 'Övrigt',
}

export default function SupportQueueTab() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/support-tickets')
      .then(r => r.json())
      .then(d => setTickets(d.tickets || []))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-gray-400 text-sm">Laddar...</div>
  if (tickets.length === 0) return <div className="text-gray-400 text-sm">Inga öppna supportärenden.</div>

  return (
    <div className="space-y-2">
      {tickets.map(t => (
        <div key={t.id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <span className="font-semibold text-gray-900 text-sm">{t.business_config?.business_name || t.business_id}</span>
              <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full text-gray-600">{CATEGORY_LABELS[t.category] || t.category}</span>
            </div>
            <div className="text-xs text-gray-400 mt-1">Eskalerad {new Date(t.escalated_at).toLocaleString('sv-SE')}</div>
          </div>
          <a href={`/admin/support/${t.id}`} className="text-sm text-primary-700 font-medium hover:underline">Öppna →</a>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Wire in fliken i app/admin/page.tsx**

Ändra `activeTab`-typen (rad 129):

```typescript
  const [activeTab, setActiveTab] = useState<'overview' | 'customers' | 'partners' | 'support'>('overview')
```

Lägg till i tab-listan (rad 415) och label-logiken (rad 420):

```typescript
          {(['overview', 'customers', 'partners', 'support'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === tab ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}>
              {tab === 'overview' ? 'Översikt' : tab === 'customers' ? `Kunder (${customers.length})` : tab === 'partners' ? `Partners (${partners.length})` : 'Support'}
            </button>
          ))}
```

Lägg till renderingsblocket (efter partners-blocket, innan sidans
avslutande taggar):

```tsx
        {activeTab === 'support' && (
          <SupportQueueTab />
        )}
```

Lägg till importen högst upp i filen:

```typescript
import SupportQueueTab from './components/SupportQueueTab'
```

- [ ] **Step 6: Kör testet igen**

Run: `npx playwright test tests/facit-admin-support-queue.spec.ts --reporter=list`
Expected: PASS

- [ ] **Step 7: tsc + build + commit**

```bash
npx tsc --noEmit
npx next build
git add app/admin/components/SupportQueueTab.tsx app/api/admin/support-tickets/route.ts app/admin/page.tsx tests/facit-admin-support-queue.spec.ts
git commit -m "feat(support): supportko-flik i /admin"
```

---

### Task 10: Ärendevy + svar i admin (sluten loop)

**Files:**
- Create: `app/admin/support/[id]/page.tsx`
- Create: `app/api/admin/support-tickets/[id]/reply/route.ts`
- Create: `app/api/admin/support-tickets/[id]/resolve/route.ts`
- Test: `tests/facit-admin-support-reply.spec.ts`

- [ ] **Step 1: Skriv det failande facit-testet**

```typescript
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

test.describe('Admin support-svar — sluten loop till samma chattrad', () => {
  test('reply-rutten anvander saveThreadMessage, ingen Claude-runda', () => {
    const route = fs.readFileSync(
      path.join(__dirname, '..', 'app/api/admin/support-tickets/[id]/reply/route.ts'),
      'utf8',
    )
    expect(route).toContain('saveThreadMessage')
    expect(route).not.toMatch(/callClaude|anthropic\.com\/v1\/messages/)
  })

  test('reply-rutten satter agent till support', () => {
    const route = fs.readFileSync(
      path.join(__dirname, '..', 'app/api/admin/support-tickets/[id]/reply/route.ts'),
      'utf8',
    )
    expect(route).toMatch(/agent:\s*'support'/)
  })

  test('reply-rutten flyttar arendet till in_progress', () => {
    const route = fs.readFileSync(
      path.join(__dirname, '..', 'app/api/admin/support-tickets/[id]/reply/route.ts'),
      'utf8',
    )
    expect(route).toContain("'in_progress'")
  })

  test('resolve-rutten satter resolved_at och resolved_by', () => {
    const route = fs.readFileSync(
      path.join(__dirname, '..', 'app/api/admin/support-tickets/[id]/resolve/route.ts'),
      'utf8',
    )
    expect(route).toContain('resolved_at')
    expect(route).toContain('resolved_by')
  })
})
```

- [ ] **Step 2: Kör, verifiera fail**

Run: `npx playwright test tests/facit-admin-support-reply.spec.ts --reporter=list`
Expected: FAIL

- [ ] **Step 3: Bygg svars-rutten**

```typescript
// app/api/admin/support-tickets/[id]/reply/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { isAdmin } from '@/lib/admin-auth'
import { saveThreadMessage } from '@/lib/agent/thread-messages'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await isAdmin(request)
  if (!admin.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { message } = await request.json()
  if (!message || typeof message !== 'string' || !message.trim()) {
    return NextResponse.json({ error: 'message krävs' }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const { data: ticket, error: fetchErr } = await supabase
    .from('support_ticket')
    .select('id, business_id, thread_id, status')
    .eq('id', params.id)
    .single()
  if (fetchErr || !ticket) {
    return NextResponse.json({ error: 'Ärendet hittades inte' }, { status: 404 })
  }

  await saveThreadMessage({
    threadId: ticket.thread_id,
    businessId: ticket.business_id,
    role: 'assistant',
    agent: 'support',
    content: message.trim(),
  })

  if (ticket.status === 'escalated') {
    await supabase
      .from('support_ticket')
      .update({ status: 'in_progress' })
      .eq('id', ticket.id)
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 4: Bygg lös-rutten**

`isAdmin()`s returvärde bär redan `.email` (`lib/admin-auth.ts:20`,
samma objekt som `.isAdmin`) — ingen separat `getAdminEmail()`-funktion
behövs eller finns.

```typescript
// app/api/admin/support-tickets/[id]/resolve/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { isAdmin } from '@/lib/admin-auth'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await isAdmin(request)
  if (!admin.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()

  const { error } = await supabase
    .from('support_ticket')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: admin.email || 'unknown',
    })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
```

- [ ] **Step 5: Bygg ärendevy-sidan**

```tsx
// app/admin/support/[id]/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface ThreadMsg {
  id: string
  role: 'user' | 'assistant'
  content: string
  agent?: string | null
  created_at: string
}

export default function SupportTicketPage() {
  const params = useParams()
  const ticketId = params.id as string
  const [messages, setMessages] = useState<ThreadMsg[]>([])
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)

  // Återanvänder samma trådladdnings-endpoint Matte-chatten redan har
  // (app/api/matte/threads/route.ts) — kräver thread_id, inte ticket_id.
  // Enklast: hämta ticket-raden först (business_id+thread_id), sedan tråden.
  useEffect(() => {
    fetch(`/api/admin/support-tickets/${ticketId}`)
      .then(r => r.json())
      .then(d => setMessages(d.messages || []))
  }, [ticketId])

  async function sendReply() {
    if (!reply.trim()) return
    setSending(true)
    await fetch(`/api/admin/support-tickets/${ticketId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: reply }),
    })
    setReply('')
    const d = await fetch(`/api/admin/support-tickets/${ticketId}`).then(r => r.json())
    setMessages(d.messages || [])
    setSending(false)
  }

  async function markResolved() {
    await fetch(`/api/admin/support-tickets/${ticketId}/resolve`, { method: 'POST' })
    window.location.href = '/admin'
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <h1 className="text-lg font-bold">Supportärende</h1>
      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {messages.map(m => (
          <div key={m.id} className={`p-3 rounded-xl text-sm ${m.role === 'user' ? 'bg-gray-100' : 'bg-primary-50'}`}>
            <div className="text-xs text-gray-400 mb-1">{m.role === 'user' ? 'Hantverkare' : (m.agent || 'AI')}</div>
            {m.content}
          </div>
        ))}
      </div>
      <textarea value={reply} onChange={e => setReply(e.target.value)} className="w-full border rounded-xl p-3 text-sm" rows={3} placeholder="Skriv ditt svar..." />
      <div className="flex gap-2">
        <button onClick={sendReply} disabled={sending} className="px-4 py-2 bg-primary-700 text-white rounded-xl text-sm font-medium disabled:opacity-40">Skicka svar</button>
        <button onClick={markResolved} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium">Markera löst</button>
      </div>
    </div>
  )
}
```

**Behöver också:** `GET /api/admin/support-tickets/[id]/route.ts` som
returnerar ticket-raden + dess `thread_message`-historik (join på
`thread_id`). Bygg denna som en enkel läsande route i samma mönster som
Task 9 Steg 3, `isAdmin()`-grindad, `select('*').eq('thread_id',
ticket.thread_id).order('created_at')` mot `thread_message`.

- [ ] **Step 6: Kör testet igen**

Run: `npx playwright test tests/facit-admin-support-reply.spec.ts --reporter=list`
Expected: PASS

- [ ] **Step 7: Manuell koll**

`npm run dev`, trigga en eskalering i Matte-chatten, öppna `/admin` →
Support-fliken, öppna ärendet, skriv ett svar, verifiera att det dyker
upp i samma tråd när du öppnar Matte-chatten igen som samma hantverkare.

- [ ] **Step 8: tsc + build + commit**

```bash
npx tsc --noEmit
npx next build
git add app/admin/support app/api/admin/support-tickets tests/facit-admin-support-reply.spec.ts
git commit -m "feat(support): arendevy + svar i admin, sluten loop till chattraden"
```

---

### Task 11: Nöjdhetsfråga + recensionslänk

**Files:**
- Modify: `app/api/matte/chat/route.ts` (eller en ny liten route — se Step 3)
- Test: `tests/facit-support-satisfaction.spec.ts`

- [ ] **Step 1: Skriv det failande facit-testet**

```typescript
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

test.describe('Nojdhetsfraga + recension vid lost supportarende', () => {
  test('en satisfaction-rutt finns som accepterar positive/negative', () => {
    const route = fs.readFileSync(
      path.join(__dirname, '..', 'app/api/admin/support-tickets/[id]/satisfaction/route.ts'),
      'utf8',
    )
    expect(route).toMatch(/positive/)
    expect(route).toMatch(/negative/)
  })

  test('positiv nojdhet returnerar HANDYMATE_GOOGLE_REVIEW_URL, negativ gor det inte', () => {
    const route = fs.readFileSync(
      path.join(__dirname, '..', 'app/api/admin/support-tickets/[id]/satisfaction/route.ts'),
      'utf8',
    )
    expect(route).toContain('HANDYMATE_GOOGLE_REVIEW_URL')
  })
})
```

- [ ] **Step 2: Kör, verifiera fail**

Run: `npx playwright test tests/facit-support-satisfaction.spec.ts --reporter=list`
Expected: FAIL

- [ ] **Step 3: Bygg nöjdhets-rutten**

Enklaste v1: en fristående, publikt (men business-auth-grindad — samma
mönster som andra `app/api/matte/*`-rutter, `getAuthenticatedBusiness`)
endpoint som klienten (Matte-chatten) anropar när hantverkaren klickar
tumme upp/ner på ett löst ärende. UI-triggern för NÄR tumme-frågan visas
(t.ex. nästa gång tråden öppnas efter `resolved_at`) är medvetet
FRIHANDSVAL för implementeraren — bygg den enklast möjliga versionen:
en liten banner i `MatteChatModal.tsx` som visas om det senaste
supportärendet för den öppna tråden har `status='resolved'` och
`satisfaction IS NULL` (hämtat via samma `GET
/api/admin/support-tickets/[id]`-liknande uppslag, fast business-scopat
— skapa en parallell, enklare `GET /api/matte/support-satisfaction-check?
threadId=...` om så behövs).

```typescript
// app/api/admin/support-tickets/[id]/satisfaction/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

const HANDYMATE_GOOGLE_REVIEW_URL = process.env.HANDYMATE_GOOGLE_REVIEW_URL || ''

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { satisfaction } = await request.json()
  if (satisfaction !== 'positive' && satisfaction !== 'negative') {
    return NextResponse.json({ error: 'satisfaction måste vara positive eller negative' }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const { error } = await supabase
    .from('support_ticket')
    .update({ satisfaction })
    .eq('id', params.id)
    .eq('business_id', business.business_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    success: true,
    review_url: satisfaction === 'positive' && HANDYMATE_GOOGLE_REVIEW_URL ? HANDYMATE_GOOGLE_REVIEW_URL : null,
  })
}
```

- [ ] **Step 4: Kör testet igen**

Run: `npx playwright test tests/facit-support-satisfaction.spec.ts --reporter=list`
Expected: PASS

- [ ] **Step 5: tsc + commit**

```bash
npx tsc --noEmit
git add app/api/admin/support-tickets tests/facit-support-satisfaction.spec.ts
git commit -m "feat(support): nojdhetsfraga och recensionslank vid lost arende"
```

**OBS:** `HANDYMATE_GOOGLE_REVIEW_URL` måste sättas i Vercel (Handymates
egen Google-recensionslänk) — annars returneras `review_url: null` och
ingen länk visas (fail-soft, inte en krasch).

---

### Task 12: Full regressionskörning

**Files:** (inga nya — verifiering)

- [ ] **Step 1: Hela facit-sviten för denna feature**

```bash
npx playwright test tests/facit-support-agent-capabilities.spec.ts tests/facit-support-agent-tools.spec.ts tests/facit-get-account-billing-status.spec.ts tests/facit-handymate-team-alert.spec.ts tests/facit-escalate-to-handymate-team.spec.ts tests/facit-support-team-identity.spec.ts tests/facit-admin-support-queue.spec.ts tests/facit-admin-support-reply.spec.ts tests/facit-support-satisfaction.spec.ts --reporter=list
```

Expected: alla PASS.

- [ ] **Step 2: Regressionstest — säkerställ att befintliga agent-/chatt-tester fortfarande är gröna**

```bash
npx playwright test tests/facit-fortnox-einvoice.spec.ts tests/send-invoice-core.spec.ts --reporter=list
```

(Dessa är orelaterade filer, men bra stickprov på att inget delat
verktyg/typ gick sönder. Kör även fulla sviten om tid finns:
`npx playwright test --reporter=list`.)

- [ ] **Step 3: tsc + build**

```bash
npx tsc --noEmit
npx next build
```

Expected: båda rena.

- [ ] **Step 4: Slutrapport**

Skriv en kort sammanfattning i din slutrapport med EXPLICIT lista över
manuella steg som krävs innan detta fungerar skarpt:

1. `sql/v165_support_ticket.sql` måste köras i Supabase.
2. `HANDYMATE_SUPPORT_ALERT_PHONES` måste sättas i Vercel (t.ex.
   `+46701234567,+46707654321`).
3. `HANDYMATE_GOOGLE_REVIEW_URL` måste sättas i Vercel.
4. En manuell end-to-end-genomgång (chatta fram en eskalering, verifiera
   SMS landar, svara i `/admin`, verifiera svaret syns i chatten, markera
   löst, verifiera nöjdhetsfrågan) rekommenderas innan detta räknas som
   skarpttestat — matchar samma disciplin som resten av plattformens
   Fortnox-integrationer.
