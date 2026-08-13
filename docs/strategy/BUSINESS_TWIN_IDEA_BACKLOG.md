# Business Twin — Potential Product Ideas

Status: idea backlog, not committed roadmap.

These ideas are intended to extend and connect the Business Twin vision. They should be evaluated against current code, customer evidence, launch priorities and architecture principles before implementation.

---

## 1. Next Best Action Engine

### Thesis

Handymate should not show a pile of alerts. It should decide which few actions create the largest value for the company right now.

Potential internal dimensions:

- financial impact
- urgency
- confidence
- customer risk
- operational risk
- effort
- reversibility
- autonomy permission

Example:

Instead of four unrelated notifications, Matte says:

> Gör detta först. Kunden på Storgatan bad om tilläggsarbete igår och teamet är på väg dit igen 08:00. Lös ÄTA:t innan arbetet börjar.

### Why it matters

Turns Handymate from notification software into operational prioritization.

### Guardrails

- use existing approval rail
- preserve known / estimated / possible semantics
- do not hide important high-risk events merely because another action scores higher
- avoid opaque AI ranking without explanation

---

## 2. One Decision → Whole Company

### Thesis

One real-world decision should propagate safely through all affected parts of the business instead of requiring repeated manual updates.

Example voice input:

> Matte, kunden godkände spotlightsen. Vi gör dem på torsdag.

Potential proposal:

- mark ÄTA approved
- update project value
- update quote/project economics
- schedule work Thursday
- update margin forecast
- store customer commitment
- include work in future invoice basis

Then one explicit review:

> Godkänn allt

### Why it matters

This is one of the strongest expressions of the Business Twin: a single business event changes the company's state coherently.

### Guardrails

- never silently fan out financial or customer-facing actions
- each downstream action must remain traceable
- partial failure must be visible
- idempotent execution required

---

## 3. Owner-by-Exception / “Matte, run the company”

### Thesis

As earned autonomy grows, the owner should spend less time operating software and more time handling only decisions that actually need a human.

Example morning summary:

> Sedan igår har teamet gjort 14 saker.
>
> Karin följde upp 3 fakturor.
> Daniel följde upp 2 offerter.
> Lars flyttade ett återbesök efter sjukfrånvaro.
> Matte skapade 6 uppgifter från möten.
> 2 saker väntar på dig.

### Product principle

> Handymate should reduce how much Handymate needs to be used.

### Why it matters

This is a deeper differentiation than “AI inside SaaS”. The software runs around the owner instead of requiring constant input.

---

## 4. Business Simulation / “Vad händer om?”

### Thesis

Once the Business Twin has sufficient operational and financial truth, the owner can ask scenario questions.

Examples:

- Har vi råd att anställa en snickare till i oktober?
- Kan vi ta det här jobbet utan att spräcka november?
- Vad händer med kassaflödet om två stora kunder betalar 15 dagar sent?
- Vad händer om vi tappar en montör i två veckor?

Potential inputs:

- pipeline
- historical win rate
- accepted quotes
- booked projects
- labor capacity
- labor cost
- cash flow
- receivables
- project margin
- expected payment dates

### Why it matters

Moves Handymate from operational administration toward management decision support.

### Guardrails

- scenario, not prophecy
- explicit assumptions
- confidence/range where appropriate
- never present simulated outcomes as known future facts

---

## 5. AI Leadership Meeting

### Thesis

Every Monday, the owner can have a five-minute management meeting with the digital team.

Example:

**Matte** — summary and priorities.

**Karin** — margins, invoices, cash and financial exceptions.

**Lars** — schedule, project risk and capacity.

**Daniel** — leads, quotes and opportunities.

Matte closes with:

> Jag har satt ihop tre beslut. Tar vi dem nu?

The owner makes a few decisions and the team handles the rest.

### Why it matters

Creates a repeatable operating ritual and a powerful demo surface without inventing new underlying systems.

### Guardrails

- use existing data and agents
- no theatrical invented insights
- prioritize decisions, not verbose reporting

---

## 6. Company Pulse / Firmapuls

### Thesis

Compress Business Twin state into a simple owner-level view.

Potential areas:

- pengar
- projekt
- kunder
- kapacitet
- administration

Example:

> Firmapuls 82 — firman mår bra
>
> Projekt −8 sedan förra veckan

Then:

> Varför?

And:

> Vad krävs för 90?

Handymate might answer:

> Tre saker. Jag kan lösa två själv.

### Why it matters

Makes complex operations legible in seconds on mobile.

### Guardrails

- avoid vanity scoring
- score must be explainable and actionable
- do not ship until the underlying data is sufficiently trustworthy

---

## 7. Autonomous Recovery

### Thesis

Turn Margin Guardian / Revenue Recovery into a complete auditable recovery chain.

Potential lifecycle:

`Detected → Verified → Recovered action → Accepted → Delivered → Invoiced → Paid`

Example:

- Meeting Intelligence detects possible extra scope
- owner confirms it is outside original scope
- Daniel creates ÄTA
- customer accepts
- Lars sees delivery
- Karin includes it in invoice
- Fortnox confirms payment
- Value Ledger shows verified outcome

### Why it matters

This proves economic value rather than merely identifying opportunities.

### Desired end state

> 14 600 kr skyddat av Handymate

Only when the full chain actually supports that claim.

---

## 8. Firm-specific Operating Model

### Thesis

Project Debrief + Playbook should evolve into a company-specific operating model based on confirmed outcomes and patterns.

Potential learned patterns:

- demolition in older bathrooms is consistently underestimated
- one employee is faster on a specific job class
- certain quote structures have higher acceptance
- Monday starts correlate with fewer delays
- the company normally needs a specific material waste factor
- specific customers have stable communication preferences

### Crucial distinction

Handymate should not only show insights. Confirmed patterns should improve the next action.

Examples:

> Jag har lagt 10 extra rivningstimmar eftersom era senaste 7 liknande projekt gått över där.

> Jag föreslår Johan eftersom liknande jobb historiskt gått snabbare med honom.

### Why it matters

This is potentially one of Handymate's strongest long-term proprietary data moats.

### Guardrails

- sufficient sample sizes
- explicit owner confirmation for hard playbook rules
- causal humility: correlation is not automatically a rule
- protect employee privacy and avoid simplistic performance scoring

---

## 9. Owner Absence Mode

### Thesis

The owner can intentionally step away and define an exception policy.

Example:

> Jag är borta till måndag.

Matte responds with a proposed operating envelope:

- contact owner only for customer risk above threshold
- financial decisions above defined amount
- project delays beyond threshold
- safety/personnel issues
- everything else handled within granted autonomy and summarized later

Return summary:

> Medan du var borta
>
> 17 actions hanterades
> 4 offerter följdes upp
> 3 kundfrågor dirigerades
> 2 fakturor betalades
> 1 ÄTA väntar på ditt beslut

### Emotional product value

The promise is bigger than administration:

> möjligheten att släppa firman ur huvudet ibland.

### Potential hero message

> Ta fredag ledigt. Handymate håller koll på firman.

### Guardrails

- only after Earned Autonomy is proven
- explicit temporary policy scope
- high-risk actions always remain outside autonomy
- clear audit trail and instant revoke

---

## 10. Business State / Project Reality model

### Thesis

The current lifecycle should eventually evolve into a richer, derived operational state rather than relying on simple manual statuses.

Potential state dimensions:

- commercial state
- delivery state
- schedule state
- expectation state
- margin state
- invoicing readiness
- customer risk
- next owner decision

This can become the foundation for:

- Next Best Action
- Expectation Drift
- Margin Guardian
- capacity planning
- simulations
- Owner Absence Mode

### Architecture warning

Do not prematurely create a giant generic “Business State Platform”. Prefer derived state from existing canonical sources and add primitives only when multiple proven consumers require them.

---

## 11. Company Goals

### Thesis

The owner sets a small number of explicit numeric goals — revenue target,
target margin %, invoice-within-N-days, quote response time — and Handymate
becomes goal-aware rather than only reactive.

### Current state (verified 2026-08-13)

Only `business_config.margin_target_percent` exists today, and it is
display/input-only — `lib/projects/margin-guardian.ts` never reads it, nor
does any other agent logic. No revenue, invoicing-speed, or quote-response
goal field exists at all.

### Why it matters

Without an explicit target, "the margin is 21%" is just a fact. With one,
Handymate can say "you're at 21%, you set 28%" — the difference between
reporting and operating toward something.

### Guardrails

- Two separate scopes, do not conflate them:
  1. **Cheap, ungated**: capture one or more goal numbers at onboarding,
     show progress against them (e.g. in the owner report). Buildable now.
  2. **Deeper, gated**: goal-aware reasoning against HISTORICAL job-type
     patterns (e.g. "this job type has run 21-23% three times") requires
     the same `project_lesson` data as idea #7 — currently 0 rows in
     production. Do not attempt this half until that data exists.
- A goal is a target, never silently treated as a promise made to a
  customer.

---

## 12. "Lär Handymate" — teach a business rule

### Thesis

The owner states a business rule in natural language ("we don't want
kitchen jobs under 80,000kr anymore") and it becomes a structured rule
that actually shapes future agent behavior (Daniel's quoting, Karin's
warnings, etc.), not just a stored note.

### Current state (verified 2026-08-13)

`business_knowledge` is written ONLY passively, by each agent's own
scheduled observation prompts (`lib/agents/*/observation-prompt.ts`) —
there is no path for the owner to explicitly dictate a rule. More
importantly, the three places that read `business_knowledge` today
(`app/api/moments/route.ts`, `app/api/observations/route.ts`, a dedup
check) are display-only. Nothing in the quote engine, pricing, or any
agent's warning logic applies a `business_knowledge` row to a decision.

### Why the sequencing matters

Building the input (a "teach Handymate" voice/chat affordance) before the
consumer (agents that actually read and apply a saved rule) would ship an
input with no effect — the owner would be told "I'll remember that" and
nothing downstream would change. That is the exact class of dishonest,
unverifiable claim this codebase's own honesty principle exists to
prevent (compare: Margin Guardian's conservative floor, `decision_record`'s
deliberate PII-hash, `ProjectCloseoutModal`'s "no screen rather than a
guessed number").

### Guardrails

- Build the rule engine + at least ONE real consumer (e.g. the quote
  engine actually filtering/warning on a saved rule) FIRST.
- The natural-language capture affordance comes LAST, only once a rule
  can be shown to actually change a real decision.
- Never ship the input half alone.

---

## Suggested sequencing

These are not a committed roadmap, but a plausible dependency order is:

1. Business State / better derived reality
2. Next Best Action Engine
3. One Decision → Whole Company
4. Autonomous Recovery
5. Firm-specific Operating Model
6. AI Leadership Meeting / Company Pulse
7. Owner-by-Exception
8. Business Simulation
9. Owner Absence Mode

Several presentation ideas can be built earlier if they reuse truthful existing primitives.

---

## Strategic test for every idea

Before implementation ask:

1. Does this improve Handymate's understanding of the company?
2. Does it improve Handymate's ability to safely act on that understanding?
3. Does it visibly pay the customer back?
4. Can it reuse existing primitives instead of creating another platform?
5. Can the outcome be verified?

If the answer is mostly no, it is probably not Business Twin work.
