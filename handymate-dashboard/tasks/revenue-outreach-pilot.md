# Revenue first-contact pilot

Base: main c32968a17ff0f3f9b6ca572fc8f83fbd4d0430f5.

## Scope

Three message angles, two CTAs, source-backed deterministic first-contact draft,
durable variant/source note, existing draft review and manual-copy flow. No sends,
provider purchases, contact imports or production mutations in this increment.
Revenue v2 is already merged; production schema inspection still shows only v1.

## Reuse and invariants

- Existing requireRevenue + server-verified manager/seller ownership.
- Existing revenue_v2_command transaction, activities, drafts and reply cancellation.
- New service-only SECURITY INVOKER wrapper locks request then account, checks current
  ownership, identified/uncontacted state, suppression and optimistic version.
- The wrapper creates an internal note + draft atomically and preserves next action.
- A repeated request cannot create another draft; changed input is rejected. A reply,
  pause, reassignment or stale version must not revive the old first-contact request.
- Source provenance is saved separately from customer text. No invented observations,
  exact savings or customer outcomes. Prepared is not contacted or sent.

## Validation

- `npm run test:revenue-v2`: passed, including 16 SQL scenarios, 19 existing
  handler/PostgreSQL checks and new outreach scenarios.
- `node tests/revenue/outreach.cjs`: passed after additional email suppression and
  reassignment coverage. Six variants, missing/unsafe/old/future sources, persistent
  drafts, duplicate requests, changed input, stale versions, preserved contact clock
  and next action, approval, reply cancellation and direct RPC ownership/grants.
- `npm run test:revenue-v2-ui`: passed. Real React + Next handlers + PGlite; first
  draft creation and reload, existing case/onboarding/approval/reply/import journey,
  375/1280px. New first-contact screenshots visually reviewed.
- `NODE_OPTIONS=--max-old-space-size=8192 node node_modules/typescript/bin/tsc --noEmit`: exit 0.
- `npm run build`: exit 0. Existing routes emit missing-environment and dynamic-rendering messages during static generation; this is not live configuration proof.
- Read-only production schema query confirms v2 migration has not been applied.

## Activation / remaining work

1. Revenue v2 migration and identity/live acceptance per tasks/revenue-os-v2.md.
2. Apply sql/v2_revenue_outreach.sql in isolated preview database and verify grants.
3. Authenticated manager and two-seller preview: prepare, reload, approve, record reply,
   retry old request, verify ownership and suppression; no external messages required.
4. Review/merge and coordinated production migration/deployment separately.

Local UI fixture exercises real React, Next handlers and PGlite PostgreSQL; it does
not prove deployed Supabase auth, provider delivery or two concurrent DB sessions.

Strategy and later volume/attribution slices: docs/strategy/HANDYMATE_REVENUE_OS.md §24.

## Publication checkpoint

GitHub push was rejected by automatic approval review: external disclosure/remote
mutation requires explicit user approval. No workaround attempted; no PR, merge,
production migration or deployment performed. Local code and tests are committed.

Prepared PR title: Revenue OS: källbelagda förstakontaktsutkast med budskap och CTA.
Target: main. Head: codex/revenue-outreach-pilot. Keep draft until deployed acceptance.
