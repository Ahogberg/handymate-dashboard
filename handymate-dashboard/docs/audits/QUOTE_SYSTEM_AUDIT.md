# Handymate Quote System Audit

Read-only repository audit performed 2026-08-07. The codebase is treated as the source of truth. No product code, UI component, schema, migration, or roadmap file was changed.

## 1. Executive Summary

### Direct answers

| Question | Verdict | Evidence in the current repository |
|---|---|---|
| A. Is there ONE canonical quote builder today? | **PARTIALLY** | Create and edit share the document canvas, item components, calculation hook and preview panel, but `app/dashboard/quotes/new/page.tsx` and `app/dashboard/quotes/[id]/edit/page.tsx` are separate, large state/save orchestrators. There is no single builder state model, context loader or write service. |
| B. Does every create/edit entry point use it? | **NO** | Navigation uses Snabboffert, customer/deal/query-param entry skips it, duplicate/version creates first and then opens the separate editor, and several agent/automation routes insert directly into `quotes` using legacy or header-only shapes. |
| C. Which paths are divergent? | **See inventory below** | Customer/deal/lead context, duplicate/version, Matte, Jobbkompisen/agent tools, suggestion approval, automated deal flow, and the still-callable voice endpoint all differ materially. There is no supported project-to-base-quote creation path; the approval-based “ÄTA quote” is only textually linked. |
| D. Is quote input quality sufficiently protected? | **NO** | Snabboffert enables “Bygg utkast” for any non-empty string. There is no trade selection, structured intake, critical-field test or clarification pass. The server generator accepts any image/text/voice input and immediately generates a commercial draft. |
| E. Recommended starting UX | **Guided Quote Start** | Company-trade-aware work chips, 3–5 adaptive high-information questions, optional text/voice/photos/customer, then a deterministic completeness check and at most 1–3 AI clarification questions before generation. |
| F. Free text, guided questions, AI conversation, or hybrid? | **HYBRID** | Fixed/adaptive choices produce predictable structured data at mobile speed; optional free text/voice preserves flexibility; AI is best used only for extraction and missing-context clarification, not as an open-ended wizard. |

### Bottom line

Handymate has a strong **shared quote document surface**, not yet a canonical quote system. The newest Snabboffert experience is a good low-friction shell and should be evolved, not replaced. Its current single-text-box gate, however, optimizes time-to-generation rather than quote quality. At the same time, correctness defects are more urgent than guided intake:

1. Leaving the edit page calls `navigator.sendBeacon('/api/quotes', ...)`. A beacon is a `POST`, while that endpoint's `POST` branch creates a new quote and ignores the supplied `quote_id`. Editing and then leaving can therefore create a duplicate draft.
2. A saved hidden line is not mapped into edit state. The next autosave writes `is_hidden: false`, exposing a line the tradesperson explicitly hid from the customer.
3. Sent and accepted quotes remain editable through the normal editor; `PUT /api/quotes` has no lifecycle guard, and customer/PDF views read live mutable rows. There is no complete accepted snapshot or content hash.
4. The public quote response spreads the service-role `quotes` row into JSON and only removes a few properties. Internal metadata can leak. It also automatically selects `after` photos from other projects without checking any consent/publication flag.
5. Public option signing recalculates totals without the annual ROT/RUT cap used by canonical create/update, does not persist green-tech totals, and updates option rows and the quote in separate non-transactional statements.

These are P0/P1 integrity issues. Claude should fix them before canonicalization or the new start UX. Otherwise a more consistent entry flow simply sends more traffic through unsafe state transitions.

### Five highest-priority fixes

1. **Stop edit-page duplicate creation and preserve all item fields.** Remove/replace the POST beacon, preserve `is_hidden`, preserve exact `valid_until`, surface autosave failures, and add regression tests.
2. **Make sent/accepted commercial content immutable.** Draft edits can update in place; sent/accepted changes must create a new version. Persist a complete accepted snapshot or immutable version reference.
3. **Harden the public boundary and signing transaction.** Return an explicit public DTO, disable unconsented reference photos, validate/limit signature input, perform conditional single-winner acceptance, and make option/totals/signature changes atomic.
4. **Create one tenant-validated quote write path.** Validate customer/deal/lead ownership, use one pricing calculation and item shape, then route agent/approval/deal-flow creation through it.
5. **Add Guided Quote Start V1 plus a completeness gate.** Use the existing Snabboffert and document builder; do not build a new editor or generic form engine.

### What Claude should implement first

Exact order:

1. edit unload/autosave/hidden-row/validity correctness;
2. public payload and automatic reference-photo privacy stopgap;
3. accepted/sent immutability and accepted snapshot;
4. public signing transaction and deduction parity;
5. tenant-scoped canonical quote writer and migration of direct writers;
6. canonical context loader and create/edit/version orchestration;
7. Guided Quote Start V1;
8. completeness/clarification gate;
9. mobile, parity and end-to-end acceptance tests.

## 2. Current Quote Architecture

### Repository evidence reviewed

The audit read `CLAUDE.md`, `README.md`, `ARCHITECTURE.md`, quote/product task documents including `tasks/offert-masterplan.md`, `tasks/design-brief-snabboffert.md`, `tasks/quote-audit-fixplan.md` and `tasks/quote-ai-fix.md`, and recent quote commits including `5136dc69` (Snabboffert), `731ff222` (cold-start routing), `36ea83b2` (design), `875b496f` (AI/product bank/approval persistence), `43957504` (document-first editing), `142520c4` (preferences/text preservation), `a8d463c6` (receipt fixes), and `98a4268e` (quotes/agents). No `AGENTS.md` exists in the repository.

The strategy/task documents correctly describe the intended document-first direction, but several “complete” claims apply only to shared presentation components, not to state, persistence, lifecycle or every entry path.

### Runtime architecture map

| Layer | Current implementation | Assessment |
|---|---|---|
| Create route | `/dashboard/quotes/new` → `app/dashboard/quotes/new/page.tsx` | Feature-rich, roughly 100k+ source bytes, owns customer/context loading, AI, templates, items, totals, preview, save and Snabboffert modes in local React state. |
| Edit route | `/dashboard/quotes/[id]/edit` → separate `page.tsx` | Separate large orchestrator with its own load mapping, payload builder and 5-second autosave. It is not the same builder controller as create. |
| Detail/room | `/dashboard/quotes/[id]` | Send, duplicate, version, internal accept, project/invoice creation, PDF, public-link and tracking UI. |
| Shared document | `components/quotes/document/QuoteDocument.tsx` | Strongest canonical primitive. Used for Modern live editing and public rendering through shared template data. |
| Shared preview | `app/dashboard/quotes/_shared/QuotePreviewPanel.tsx` and `components/quotes/TemplatePreviewFrame.tsx` | Used by create and edit. Modern live canvas is shared; final design is server-rendered. |
| Shared item editing | `QuoteItemsSection`, `ItemRow`, `RowEditSheet`, `AddRowSheet`, `useQuoteItems`, product lookup helpers | Substantial reuse. This is component reuse, not a unified quote state model. |
| Shared calculations | `lib/quote-calculations.ts`, `useQuoteCalculations` | Canonical structured-item calculation for principal create/edit and server-side option recomputation. Several legacy writers bypass it. |
| Main quote API | `app/api/quotes/route.ts` | Authenticated GET/POST/PUT/DELETE. Supports both structured `quote_items` and legacy `quotes.items`, duplicate/version special branches, direct service-role writes and deal side effects. |
| AI generator | `/api/quotes/ai-generate` → `lib/ai-quote-generator.ts` | One main generation engine used by Snabboffert and approval previews, but not all persistence paths. No intake/completeness phase. |
| Document render | `buildQuoteTemplateData`, `QuoteDocument`, Premium/Friendly string renderers | Modern document data is substantially shared across editor/public/PDF. Chromium PDF uses the same templates; jsPDF remains a divergent fallback. |
| Customer acceptance | `/api/quotes/public/[token]`, `/api/portal`, `/api/quotes/accept` | Three mutation paths. Public signing and portal acceptance use `finalizeAcceptedQuote`; internal acceptance still duplicates the chain. Events also differ. |
| Programmatic creation | agent tool router, Matte, suggestions, approval execution, deal-flow, voice | Mixed. Some call the canonical POST route; several directly insert legacy/header-only rows. |

### Data model actually in use

| Store | Purpose and important fields | Writers/readers | Current concern |
|---|---|---|---|
| `quotes` | Header, tenant/customer/deal/lead links, title/description/status, legacy `items`, totals, ROT/RUT, validity, content/display fields, attachments, AI metadata, version/signature/tracking fields | Main API plus multiple direct writers; list/detail/public/PDF/agents/projects/invoices | Free-text status; old/new field generations coexist; no complete signed snapshot; repo does not contain a complete authoritative base table definition. |
| `quote_items` | Structured rows: item type, group, price/quantity, eligibility, options, product snapshot/split, visibility, order | Main API and agent tool router; builders/public/PDF/economics | Intended canonical row store, but legacy writers skip it. Original SQL shown in repo does not include visible RLS policies. |
| `quote_templates` | Reusable defaults and standard content | Template selector/API, AI route | AI prompt lists template names/categories but does not actually include `default_items`, despite fetching them. |
| `quote_standard_texts` | Default introduction/conclusion/exclusions/ÄTA/payment text | Builder APIs | Several old fields remain but are intentionally hidden from newer UI; model remains broad. |
| `products` | General product bank with selling prices/components | AI and builder | Correct current general price source. |
| `price_lists_v2` / items | Customer/segment-specific rates, markup, callout and items | AI resolver and customer prefill | Good tenant-scoped resolver, but full-editor text generation omits `customerId`. |
| `quote_tracking_events` | Open/close tracking | Public tracking and detail event log | Useful actual history, but sends only overwrite `sent_at`; not a full quote audit trail. |
| `deal` / `lead` | Source and pipeline relationship | Entry context, main POST side effects, acceptance | Lead query handling is broken; standalone auto-link can choose the newest open deal without explicit user intent. |
| `pending_approvals` | Four-eyes send, AI drafts, fallback project creation | Send/acceptance/agents | Some approval paths use canonical POST, while older suggestion writers do not. |

### Canonical primitives that already exist

- `QuoteDocument` and `buildQuoteTemplateData` are the right presentation foundation.
- `calculateQuoteTotals` is the right structured pricing foundation.
- `generatedQuoteToQuoteItems` is the correct conversion primitive for AI/approval drafts.
- `finalizeAcceptedQuote` is the right idea for converging post-acceptance side effects, but internal acceptance has not adopted it.
- `OPEN_QUOTE_STATUSES`, `WON_QUOTE_STATUSES` and `LOST_QUOTE_STATUSES` improve read-filter consistency, but the UI and all mutation sites do not consistently use them.

What is missing is not another quote canvas. It is a canonical **quote command/write layer**, an entry-context loader, lifecycle immutability and an explicit public DTO.

## 3. Entry Point Inventory

### User-facing routes and triggers

| Entry point | Route / trigger | Component rendered | State initialization/context | Save/edit path | New or divergent? | Risk |
|---|---|---|---|---|---|---|
| Main navigation / quote list | `/dashboard/quotes/new` | New-page orchestrator → `QuickIntake` on cold start | Empty local state; business defaults/customers fetched | POST `/api/quotes`, then detail | Newest path | Good low-friction shell; accepts any non-empty text. |
| Help shortcut | `/dashboard/quotes/new` | Same as above | Empty | Same | Canonical UI path | Low. |
| Customer detail, two buttons | `?customerId=...` | Full new editor, **not** QuickIntake | Customer selected; later prefill personal/property/address/payment data | POST `/api/quotes` | Divergent start | A customer ID alone is treated as sufficient job context, so guided scope capture is skipped. |
| Pipeline DealModal | `?customerId=...&deal_id=...` or deal only | Full new editor | Async deal title/description/job type; customer; all customer documents when both IDs supplied | POST main API | Divergent start | Silent lookup failure; broad document attachment; no generation unless user invokes AI manually. |
| Pipeline DealCard | `?customer_id=...&title=...&deal_id=...` | Full new editor | Query title wins; deal fills empty fields | POST main API | Divergent start | Same editor, different initialization timing. |
| Lead query contract | `?lead_id=...` | Full new editor | Code assigns `lead_id` to `dealIdFromQuery`, calls the **deal** API, and saves it as `deal_id` | POST main API | Broken/latent | No current direct UI link was found, but any caller using this supported-looking parameter produces an invalid relationship. |
| Transcript deep link | `?transcript=...` | Full new editor with AI helper opened | Transcript copied into state; not automatically generated | POST main API | Divergent start | Skips Snabboffert and structured review. |
| Title/description prefill | query params | Full new editor | Direct field prefill | POST main API | Divergent start | No canonical context contract or server validation. |
| Edit existing | `/dashboard/quotes/[id]/edit` | Separate edit orchestrator | GET `/api/quotes?quoteId`; local mapping | PUT `/api/quotes`, autosave | Shared components, divergent controller | Beacon duplicate, hidden-row loss, validity shift, accepted quote mutation. |
| Resume draft | detail/customer list → `/edit` | Same edit orchestrator | Database load | PUT | Divergent from new | No Snabboffert intake/review or AI start; attachments not editable. |
| Duplicate quote | Detail overflow → POST `{duplicate_from}` → `/edit` | Duplicate API branch, then edit orchestrator | Copies subset of source header/items | Special POST then PUT | Divergent | Item-copy error ignored; style/terms/reservations/attachments omitted. |
| New version | Detail overflow → POST `{duplicate_from, create_version}` → `/edit` | Same as duplicate | Family/version number calculated by read-then-increment | Special POST then PUT | Divergent | Race-prone version number; new version loses deal/lead and commercial context. |
| Project detail | Existing quote links only | Quote detail/spec | Reads `project.quote_id` | None for new base quote | No create entry | Correctly avoids inventing another base quote, but no explicit supplementary-quote route. |
| Approval queue quote draft | `/api/approvals/[id]` execution | No builder until created quote is opened | AI preview converted through `generatedQuoteToQuoteItems` | Calls canonical POST | Best programmatic path | Should become the pattern for all agents. |
| Jobbkompisen action | `/api/jobbuddy/actions` → tool router | Redirects created quote to `/edit` | Agent payload | Direct database insert in tool router | Legacy writer | Different totals/fields; lacks canonical header metadata. |
| Matte chat | `create_quote_draft` tool | Redirects to `/edit` | Customer ID + title only | Direct header insert | Legacy writer | No number, token, rows, pricing or typed validation. |
| AI inbox / suggestion approval | `/api/suggestions/approve` | Created result is linked from UI | Suggestion/action data | Direct insert | Legacy writer | Header-only or legacy totals; bypasses canonical row and pricing logic. |
| `lib/approve-actions.ts` suggestion/auto-approve | agent approval | Quote later opened normally | AI-generated legacy data | Direct insert | Legacy writer | Reads outdated concepts and writes legacy total/VAT field names; likely schema-dependent. |
| Automated deal flow | `lib/e2e-deal-flow.ts` | No builder during creation | Deal description + AI | Direct legacy insert | Legacy writer | `total` is written ex-VAT while separate legacy fields carry VAT; no `quote_items`, token or number. |
| Voice execute endpoint | `/api/voice/execute` | No client caller found | Voice action payload | Direct header insert | Legacy/still callable | Should be proved unused and retired or routed canonically. |
| Demo/debug seed | demo/debug APIs | N/A | Test data | Direct insert | Non-production support | Keep isolated and explicitly marked; never use as product path evidence. |

### Structural conclusion

The same **visual editor** is not reached everywhere, and the same **persistence logic** is not used everywhere. The safest current programmatic pattern is the approval executor: generate a preview, convert to structured rows, call the canonical authenticated POST, then let the user open the normal quote room/editor.

## 4. Canonical Quote Builder Assessment

### Verdict: PARTIALLY

There is no single canonical `QuoteBuilder` in the product sense.

| Concern | Current source of truth | Canonical? |
|---|---|---|
| Customer-facing document | `QuoteDocument` + template data | Mostly yes for Modern; Premium/Friendly remain static renderers. |
| Item shape | `QuoteItem` / `quote_items` | Intended yes, actual no because legacy writers persist `quotes.items` or no rows. |
| Calculation | `calculateQuoteTotals` | Yes in principal flows; no across all creation and public-sign cap handling. |
| Create state | new-page local state | No shared controller. |
| Edit state | edit-page local state | Separate controller and mapper. |
| Context | ad hoc query params and effects | No. |
| Save/update | `/api/quotes` | Principal API, but bypassed by several live routes. |
| Preview | shared preview panel/server HTML | Mostly yes. |
| AI generation | `/api/quotes/ai-generate` | Main generator, but callers send different context and persistence differs. |
| Accepted contract | mutable `quotes` + `quote_items`; `signed_options` only partial snapshot | No. |

### What should be preserved

- Keep the existing new quote document and Snabboffert.
- Keep `QuoteDocument`, `QuotePreviewPanel`, item sheets/hooks and calculation engine.
- Keep a different **page shell** for create vs detail if useful. Canonicalization does not require one giant component.

### Smallest canonical architecture

1. `QuoteBuilderContext`: mode (`CREATE | EDIT | DUPLICATE | VERSION`), tenant-validated IDs, and optional initial scope.
2. A pure `loadQuoteBuilderInitialState(context)` mapper.
3. One `QuoteDraftState`/payload serializer shared by create and edit.
4. One server-side `createQuoteDraft`/`updateQuoteDraft` command using structured rows and shared calculations.
5. Lifecycle guards around that command.

This is consolidation of existing behavior, not a new workflow engine.

## 5. Create vs Edit Consistency

| Capability | New quote | Edit quote | Finding |
|---|---|---|---|
| Snabboffert intake | Yes on cold start | No | Acceptable for an existing draft, but it means “same builder everywhere” is false. |
| AI generation | Text/photo/QuickIntake | No equivalent start flow found | Material parity gap. |
| Customer-specific AI pricing | Quick/photo sends `customerId` | N/A; full-editor text generation on new also omits it | Caller-dependent result. |
| Shared document canvas | Yes | Yes | Strong convergence. |
| Shared item edit/sheets | Yes | Yes | Strong convergence. |
| Full left-side tools/layout | Canvas-first on new | Older form-first ordering; source comment acknowledges no E2b assistant/main-view parity | Mobile and cognitive-order divergence. |
| Attachments | Add/upload and persist | Existing attachments not loaded into editable state and no equivalent UI | Cannot manage the same data in edit. |
| Hidden rows | Created/persisted | `is_hidden` omitted during load mapping | **Data/truth defect:** autosave makes hidden rows public. |
| Validity | Relative `valid_days` on create | Exact date converted to nearest 14/30/60/90, then PUT writes today + days | **Correctness defect:** editing extends/changes validity. |
| Save | Explicit save/send; no draft recovery | 5-second autosave + unload beacon | Opposite failure modes: create can lose work; edit can create duplicates. |
| Concurrent editing | N/A until saved | No revision/CAS | Last writer wins across tabs/users. |
| Status lifecycle | Creates draft | Loads any status | Accepted/sent content can be overwritten. |
| AI/source metadata | Persisted on create | Mostly not editable but preserved if omitted | Reasonable, but no unified serializer. |
| Error feedback | Toasts | Autosave status only; unload errors impossible to show | Business-critical persistence can fail silently. |

### Save/autosave diagnosis

The edit page stores a PUT-shaped payload in `formDataRef`, then on `beforeunload` sends it using `sendBeacon('/api/quotes', payload)`. Browsers issue a `POST`; the API POST branch does not look for `quote_id` as an update discriminator. It creates a new ID/number and draft. This is not a theoretical API mismatch—it is the literal method/route combination in the mounted edit component.

The new page has no autosave or local draft recovery and no unsaved-change prompt. A refresh can lose the entire quote. Photos/documents may already have been uploaded to a public storage URL under a drafts path, leaving orphan objects when the quote is abandoned.

### Required create/edit invariant

The serializer and item mapper must round-trip every customer-visible and price-affecting field. A test should load a maximal persisted quote, serialize it without edits, and assert semantic equality—including `is_hidden`, options, splits, display settings, terms, reservations, attachments, validity and links.

## 6. Customer / Deal / Project / Lead Flows

### From customer

What works:

- Customer ID is passed from both customer-detail buttons.
- The customer is selected, and separate effects can prefill address/personnummer/property/payment context.
- The main structured POST is used.

What fails:

- `customerId` counts as `hasQuoteStartSignal`, so the product skips QuickIntake even though it knows **who**, not **what work**.
- The ID is trusted client-side and the quote POST does not first prove `customer.business_id === authenticated business_id`.
- The first screen becomes the full editor with no scoped work description.

### From deal

What works:

- Deal API lookup is tenant-scoped.
- Title, description, customer and job type are carried when available.
- The saved quote links back through `deal_id`; deal value and `quote_id` are updated best-effort.

Gaps:

- Context load failure is silent and the user can save an orphaned/mislinked quote.
- When both deal and customer are supplied, `fetchDealDocuments(customerId)` attaches **all customer documents**, not deal-specific documents. This can put unrelated files into the quote.
- The path skips Guided Start and does not automatically convert deal scope into structured intake or AI draft.
- If no explicit deal is supplied, the POST may automatically attach a standalone quote to the customer's newest open deal without a quote. With multiple open deals, that is an assumption rather than a verified user choice.

### From lead

No mounted UI link to `?lead_id=` was found, but the new page explicitly accepts the parameter. Its implementation is wrong:

- `lead_id` is folded into `dealIdFromQuery`;
- the client calls `/api/pipeline/deals/{lead_id}`;
- save sends the value in `deal_id`;
- the separate `lead_id` field supported by POST is never used by the page.

This path should be considered broken until a real tenant-scoped lead context loader exists.

### From project

No user-facing route creating a new base quote from a project was found. Project detail correctly links to its existing quote/specification. That is preferable to casually creating a second base quote after delivery has begun.

The approval action `create_ata_draft` does create a normal quote through the main API, but `quotes` has no `project_id`; the only relationship is text such as “ÄTA för project…”. It does not create `project_change`. This is not a reliable supplementary-quote/ÄTA flow and should not be presented as one.

Recommendation: keep base quote creation out of project V1. Use the existing `project_change`/ÄTA domain for supplementary work. If a supplementary quote document is later needed, link it explicitly to the change, not via title text.

### Duplicate and version

Good resets:

- status becomes draft;
- new validity and quote number are generated;
- signature/acceptance timestamps are not copied;
- creator becomes current user.

Unsafe omissions:

- item insertion result is ignored; success can return a header with no structured rows;
- `template_style`, `terms_text`, `reservations_snapshot` and attachments are not copied;
- version creation loses deal/lead association, so acceptance/pipeline behavior can detach from the original commercial case;
- version number uses read-highest-then-increment without a unique database invariant;
- customer, personnummer, property and tax assumptions are copied. This is correct for a version, but risky for an ordinary duplicate if the user intends to switch customer and does not re-review them.

## 7. Quote Data & Pricing Consistency

### Persisted quote surface

The current builder supports:

- header/customer/title/description/status/validity;
- structured item rows, headings, text, subtotals, discounts and options;
- labor/material split, costs, article/product references and component snapshots;
- VAT, discount and ROT/RUT flags/totals;
- green-tech types in the TypeScript calculation model;
- exclusions, ÄTA/payment/other terms, payment plan, references and address;
- display/detail settings and template style;
- personnummer/property designation;
- attachments/images;
- AI source/confidence/template metadata;
- deal/lead links, versions, signature and tracking metadata.

The existence of a type or UI field does not prove round-trip persistence. Current gaps:

1. Green-tech totals are calculated in `calculateQuoteTotals`, but no repository migration persists `gron_base`, `gron_deduction` or `gron_customer_pays`; code comments explicitly call persistence a later phase. Saved/customer totals can therefore disagree with the unsaved canvas.
2. Edit loses `is_hidden` and exact validity.
3. Duplicate/version omits newer terms/style/reservation/attachment fields.
4. Some programmatic writers create only a header, while others write legacy `items` and legacy VAT/total columns.

### Pricing paths

| Path | Calculation | Verdict |
|---|---|---|
| New/edit structured builder | `calculateQuoteTotals` + server recomputation + annual cap | Best current path. |
| Public option preview | Shared public calculation helpers | Good display basis. |
| Public option signing | `calculateQuoteTotals`, but no annual cap and no green persistence | Incorrect parity. |
| Main API legacy `items` | Separate inline arithmetic and old fixed deduction caps | Legacy divergence. |
| Agent tool router | Separate arithmetic and tax handling | Divergent. |
| `e2e-deal-flow` | Writes `total = subtotal` and separate legacy VAT fields | Customer-facing total ambiguity. |
| `approve-actions` | Legacy JSON rows and `total`/`vat`/`total_with_vat` conventions | Divergent and schema-sensitive. |
| Header-only Matte/suggestion/voice | No authoritative row calculation | Not a commercially complete quote. |

### ROT/RUT correctness

Canonical POST/PUT improves safety by applying the customer's recorded annual cap. Public signing does not call the same cap helper when options change. A customer can therefore sign a total recalculated with a larger deduction than the remaining annual allowance used when the draft was saved. This is a customer-trust and later invoice-surprise risk.

The public signing update also maps only ROT/RUT into `customer_pays`; green deduction is omitted. The code can show a green deduction in live unsaved/selection data while the persisted signed amount excludes it.

### Status lifecycle

Repository constants describe `draft`, `sent`, `opened`, `accepted`, `signed`, `declined`, `expired`, with `pending_approval` as a work status. Actual UI is not fully aligned:

- quote list filters only `accepted`, not `signed`;
- status badge helpers do not label `signed` or `pending_approval` semantically;
- accepted-rate calculations exclude `signed` and `expired`;
- API accepts arbitrary status strings in POST/PUT because the database status is free text;
- internal and public paths emit different semantic event names (`quote_accepted` vs `quote_signed`).

Recommendation: keep the small static registry already present, extend it to transition validation and UI labels, and avoid a workflow engine.

### Data invariants that must hold

- `quote.business_id === linked customer/deal/lead business_id`.
- Every `quote_item.business_id === quote.business_id` and `quote_item.quote_id` references that quote.
- A structured quote's stored totals equal server recomputation from its current structured rows and discount/VAT.
- Hidden rows survive load/save unchanged and never appear in public JSON or HTML.
- A sent/accepted version's customer-visible content cannot change in place.
- The signed snapshot/hash, selected options, signed totals and signature refer to the same content version.
- An accepted quote cannot revert to draft through ordinary update.
- A version family has unique `(root_quote_id, version_number)`.
- A deal links to at most one current active quote version; a quote links only to the intended deal.
- Public preview/PDF/customer view use the persisted/signed version, not mutable draft state.
- ROT/RUT customer payment uses the same annual-cap inputs at save, sign and invoice conversion.

### Quote numbering and transactional consistency

`generateQuoteNumber` counts current-year rows and adds one. Concurrent creates can receive the same visible number unless production has an unobserved unique constraint. Duplicate version number allocation has the same race pattern.

Create uses compensating delete if item insert fails, which is better than keeping a corrupt header. Update inserts new rows, deletes old rows, then updates the header. A final header update failure leaves new rows with old header totals. These operations need a database transaction/RPC or an equivalent atomic command, not more client retry logic.

## 8. AI Quote Generation Audit

### Actual input

`/api/quotes/ai-generate` accepts:

- primary image and up to four additional images;
- `voiceTranscript`;
- `textDescription`;
- optional `customerId`.

The generator also receives:

- business branch/industry;
- default hourly rate;
- up to 100 active products, favorites first;
- customer/segment-specific price list when `customerId` is supplied;
- up to five quote template names/categories;
- simple similar-quote price statistics.

It does **not** reliably receive:

- structured trade/job type;
- customer/project location and access context;
- room/building dimensions;
- condition/preparation/demolition;
- finish/material level and who supplies material;
- service area, general callout/minimum charges/markup unless a customer price list supplies them;
- deal/customer history beyond fields manually included in text;
- real project outcomes or Offer-to-Reality actuals.

### Caller inconsistency

QuickIntake and photo generation pass `customerId`, enabling customer price lists. `generateFromText` in the full new editor sends only text plus optional image and omits the currently selected customer. The same user, customer and description can therefore receive different pricing context depending on which AI button they use.

### Historical reuse is weak evidence

`findSimilarQuotes`:

- includes `draft` as well as sent/accepted quotes;
- scans only 50 recent rows;
- uses keyword substring overlap;
- reads legacy `quotes.items`, not current structured row history;
- uses quote price, not job outcome, margin or actual hours/materials.

Unreviewed drafts can influence “historical” price guidance. This is not yet Company Model or Offer-to-Reality learning.

### Template context is fetched but not used as advertised

The route fetches `default_items`, but `buildPriceContext` lists only template name/category. The model cannot actually reuse those typical rows. Either include a small safe structured subset or stop claiming templates are line-item context.

### Generation behavior

The model is instructed to produce a complete commercial structure immediately: job description, items, assumptions, exclusions and options. There is no `unknowns[]`, critical missing-field response or “ask before generating” branch. Confidence is returned after generation, but low confidence does not block or redirect.

The photo prompt instructs the model to estimate dimensions from proportions/reference points. For unscaled photos this can manufacture precision. Estimated dimensions should be explicitly marked assumptions and should trigger confirmation before pricing.

### Positive findings

- Unknown product prices are set to zero with “PRIS SAKNAS” rather than hallucinated.
- Product handles support deterministic matching and component/labor snapshots.
- Extra image failures are fail-soft.
- Snabboffert preserves user text on generation failure.
- The generated-to-structured-row conversion is reusable and tested.

### Recommendation

Split AI work into two explicit stages:

1. **Extract intent and identify critical unknowns.** No prices yet.
2. **Generate a quote only after critical context is satisfied or explicitly accepted as an assumption.**

Do not add another persisted AI model in V1. A typed request/response object in application state is enough.

## 9. Current Start Experience

### What the user sees

On a true cold start, `QuickIntake` shows:

- headline: **“Berätta om jobbet”**;
- helper copy explaining that the user can write or speak and review before sending;
- one large textarea with a good example;
- voice recording/transcription;
- up to five photos;
- optional customer dropdown;
- CTA: **“Bygg utkast”**;
- secondary exits to template or full editor.

This is visually simple and mobile-minded. Voice is editable, failures preserve input, and the user is not forced to create/select a customer before describing work.

### Why it is not yet a quality-protected start

`canBuild = value.trim().length > 0`. There is no minimum semantic information. The textarea example teaches one good prompt, but the product does not check whether the actual prompt resembles it.

Contextual paths bypass the screen whenever any `transcript`, deal, lead, customer or title parameter exists. The code comment says those signals mean “we already know what the quote is about”; that is false for `customerId` and often false for a title.

After five completed quick quotes, the generated draft skips the section-by-section review and lands directly in overview. Review remains available, but weak input plus an increasingly bypassed review compounds risk.

### Five-second test

- **Cold-start plumber:** YES, they understand they should describe the work and can speak instead of type.
- **Can they know what information is required?** NO. The product offers only an example from another job type.
- **Customer-detail entry:** PARTIALLY. They see a large full editor, not a focused “what are we quoting?” step.
- **Large customer list on mobile:** PARTIALLY. A native unsearchable select does not scale and offers no quick “new customer” capture.

## 10. Input Quality Failure Modes

| Poor input | Current likely behavior | Missing critical context | Improved intake questions | Sufficient structured input example |
|---|---|---|---|---|
| `måla kök` | Immediate detailed AI draft from branch/rate/product context | surfaces, approximate area, preparation, material responsibility, occupied/empty | What surfaces? Size band? Preparation? Material included? | Interior painting; walls + ceiling; 18 m² floor area; normal filling/sanding; contractor supplies material. |
| `bygga altan` | Model invents dimensions/foundation/material assumptions | length/width/height, ground/foundation, existing demolition, decking material, railing/stairs | Dimensions? Ground/existing structure? Material level? Demolition? Railing/stairs? | 5×4 m deck, 0.6 m high, new ground screws, pressure-treated wood, remove 8 m² old deck, railing on two sides. |
| `fixa badrum` | High-risk complete renovation may be inferred | room size, full/partial, demolition, plumbing relocation, waterproofing/fixtures/finish | Size? Full or partial? Relocate plumbing? Fixtures included? Finish level? | 5 m² full renovation, full demolition, toilet and shower remain in place, standard fixtures included, mid-range tile. |
| `dra el` | Generic labor/material rows | new/existing installation, number/type of points, concealed/surface, access, product level | What installation? Number of points? Existing/new? Concealed? Access? | Add 8 recessed outlets and 4 ceiling points in renovated ground floor; existing central; walls open; standard white products. |
| `byta kran` | One replacement line with assumed product/access | kitchen/bath, supplied fixture, shutoff/access, disposal, connection condition | Which fixture? Who supplies it? Existing shutoff works? Access? | Replace kitchen mixer; customer-supplied unit; working shutoff valves; open cabinet access; remove old mixer. |

Other systemic failure modes:

- A selected customer does not guarantee customer-specific pricing in every AI caller.
- A draft with zero-price rows can still be saved and, with customer/description, can proceed toward send.
- “Confidence” is shown after the quote exists rather than used to improve the input first.
- Generated assumptions are easy to mistake for known facts.
- Historical draft prices can reinforce previous weak generations.
- Photo-derived dimensions can appear more certain than the evidence supports.

## 11. Recommended Guided Quote Start

### Recommended first screen

**Headline:** `Vad ska ni göra?`

**Helper:** `Välj det som passar och svara på några snabba frågor. Du kan också prata in eller skriva resten.`

**Step 1 — work type chips**

Show 5–8 company-relevant choices first, based on configured trade/profile, plus `Annat`:

`Måla` · `Bygga/snickra` · `El` · `VVS` · `Badrum` · `Kök` · `Tak/fasad` · `Annat`

Do not show every trade to every business. A plumber should see VVS/fixture/bathroom/service choices first.

**Step 2 — 3–5 adaptive questions on the same surface**

For painting, for example:

1. `Vad ska målas?` — walls / ceiling / joinery / cabinets.
2. `Var?` — kitchen / room / exterior / other.
3. `Ungefär hur stort?` — bands plus “vet ej”.
4. `Hur mycket förarbete?` — little / normal / much / unknown.
5. `Ska material ingå?` — yes / no / customer supplies.

Use tap chips, multi-select and numeric/range only where appropriate. Keep all answers editable.

**Step 3 — optional context**

- `Något mer vi bör veta?` free text;
- voice button;
- photos;
- customer (optional), preselected when entering from customer/deal;
- compact context banner: `Offert för Anna Andersson · Ärende #1042`.

**CTA:** `Bygg offertutkast`

If critical context is missing, do not show a percentage. Replace helper text with a plain prompt such as `Välj ungefärlig storlek eller “Vet ej” så kan vi göra rimliga antaganden.`

### Behavior by entry point

- Navigation: empty guided start.
- Customer: customer preselected, same guided start.
- Deal/lead: extract work type and prefill answers/free text from existing scope; show what was inferred and let user confirm.
- Duplicate/version/edit: open the existing canonical builder directly; guided start is not repeated.
- Agent proposal: open a generated draft in the same builder with source/context banner and unresolved assumptions highlighted.

### When the user enters the full builder

After intent passes the completeness gate, generate using the existing AI endpoint/refactored two-stage flow and land in the current Snabboffert review/document experience. Do not introduce a second quote editor.

### V1 discipline

V1 should contain:

1. work type;
2. three dynamic questions, with up to two conditional questions;
3. optional text/voice/photos/customer;
4. local completeness rules;
5. at most one clarification turn for unresolved critical facts;
6. existing draft generation and review.

Out of scope for V1: generic form builder, database-administered intake templates, photo measurements, voice-only autonomous sending, historical recommendations, automated upsells and Offer-to-Reality learning.

## 12. Adaptive Question Model

### Recommended implementation shape

Use a small code/config-driven TypeScript registry, versioned in the repository:

```text
trade/job type
  id
  labels
  applicable business trades
  questions[]
    key
    prompt
    type: single | multi | number | range | yes_no
    choices
    critical?
    showWhen?
```

Do not build a generic persisted form engine. Product needs a curated high-information intake, not arbitrary forms.

### High-value V1 questions

| Trade | Questions with highest information gain |
|---|---|
| Painting | surfaces; interior/exterior/room; size band; preparation level; material responsibility |
| Carpentry/construction | what is built; dimensions; existing structure/ground; demolition; material level; railing/stairs only when relevant |
| Electrical | installation type; number of points; new/existing installation; concealed/surface/access; product level |
| Plumbing | fixture/work type; replacement/new; existing shutoff/connection; accessibility; who supplies fixture/material |
| Bathroom | size; full/partial renovation; demolition; plumbing relocation; fixture/material level |

### Information-gain rule

Every question must affect at least one of:

- scope rows;
- labor quantity;
- material quantity/level;
- exclusions/assumptions;
- certification/subcontractor need;
- price confidence.

If an answer does not change the quote, do not ask it at start.

### Structured Quote Intent

Use a lightweight in-memory object:

```text
trade, job_type, scope[], location,
quantity/size, condition/preparation,
materials_included, demolition, access,
finish_level, unknowns[], user_notes,
source entity IDs
```

Do not persist it as a new table in V1. Store the original user text as today and include the normalized intent in generation telemetry/decision records only if an existing safe JSON metadata field is appropriate. Decide persistence after observing whether users revisit/correct the intake.

## 13. Clarification / Completeness Gate

### Recommended gate

The gate should return one of three internal states:

- `GOOD_TO_GENERATE`
- `MISSING_CRITICAL_CONTEXT`
- `LOW_CONFIDENCE_ASSUMPTIONS`

It should be deterministic for known guided answers. AI may extract answers from free text, but code should decide whether required keys are satisfied.

### Flow

```text
Guided answers + optional text/voice/photos
  → extract/normalize Quote Intent
  → deterministic required-field check
  → if critical values missing: ask targeted question(s)
  → if only non-critical unknowns remain: show explicit assumptions
  → generate structured draft
  → user reviews existing document
```

### AI clarification constraints

- Ask a maximum of 1–3 concise questions in one turn.
- Prefer tap answers generated from the known trade template.
- Never ask again for data already supplied.
- “Vet ej” is a valid answer; it becomes a visible assumption/risk, not an infinite loop.
- Do not generate quantities from unscaled photos without confirmation.
- If AI clarification fails, fall back to the deterministic questions with all input preserved.

### Separate pre-send quality gate

Generation completeness is not enough. Before send, require:

- customer and customer contact method;
- non-empty title/scope;
- at least one billable row or an explicit zero-price confirmation;
- no unresolved zero-price AI rows unless explicitly accepted;
- valid payment plan;
- internally consistent totals;
- tax-deduction identity/property fields where required by current product rules;
- final design successfully rendered at least once, or a clear warning.

Draft save should remain permissive. Sending should be strict and truthful.

## 14. Mobile UX

### Current strengths

- Cold-start Snabboffert is full-screen, focused and uses large controls.
- Voice transcription is editable.
- Photo intake is accessible.
- The document preview is now mounted on mobile instead of hidden.
- Row editing and product insertion use mobile sheets and 44px-scale controls.
- The review bar provides readable section summaries because A4-scaled body text is too small.
- Safe-area padding and dynamic review-bar height are handled.

### Current weaknesses

- The main quality input is still a six-row text box; mobile typing burden remains.
- The customer picker is a native full-list select with no search/recent/new-customer action.
- Customer/deal entry skips the best mobile start and lands in the full editor.
- Edit remains form-first; its own source comment acknowledges the canvas is reachable but not the primary top surface.
- A4 document text is about 5px at phone width; review summaries help, but precise text inspection still requires zoom/fullscreen.
- New quote state has no refresh/navigation recovery, particularly risky in mobile browsers that suspend/reload tabs.

### Highest-ROI mobile changes

1. Replace initial typing with adaptive tap chips and optional voice.
2. Keep the same guided start for customer/deal entry.
3. Add searchable recent-customer selection and “lägg till senare”.
4. Add local/session draft recovery before more visual redesign.
5. Test one-handed completion at 360–390px, keyboard open, slow network and interrupted app/tab lifecycle.

## 15. Preview / Send / Acceptance

### Preview and document parity

Strong findings:

- `preview-html`, PDF and public view use `buildQuoteTemplateData` and template selection.
- Modern uses the shared React document engine.
- Public response strips structured internal cost fields and hidden rows from the structured item payload.
- Server recomputes selected option totals instead of trusting the browser.
- Preview uses no-store and debounced/aborted requests.

Remaining divergence:

- Premium/Friendly are static HTML renderers; live option selection does not update the entire document the same way as Modern.
- PDF falls back to a separate jsPDF renderer when Chromium fails; the fallback cannot guarantee full field/style parity.
- Preview customer lookup uses bare `customer_id` without tenant filter.
- Public GET spreads the raw `quotes` row before adding the safe structured fields. Removing `business_id` and `quote_items` is not an allowlist. Fields such as raw source/notes, signature/IP and future internal columns can become public automatically.
- The public response includes `customer.portal_token` specifically to redirect to the whole portal. That is an intentional capability expansion, but it means any quote link grants the wider customer portal; the product/security model should explicitly document and test that decision.

### Send

The send route:

- authenticates and checks permission;
- rate-limits SMS/email;
- supports four-eyes approval;
- creates/generates portal/sign links;
- reports total delivery failure;
- returns a warning if delivery succeeded but status update failed;
- triggers pipeline, communication and automation best-effort.

Gaps:

- Send does not validate that the quote is a complete, correctly priced draft.
- Customer lookup is by bare ID after quote ownership; a poisoned cross-tenant customer link can expose/contact the wrong customer.
- Delivery and status/audit are not one durable outbox transaction. A provider success followed by status failure requires manual reconciliation.
- Downstream failures are server logs only.
- `sent_at` is overwritten, so resend history is not preserved as a first-class event.
- Four-eyes adds `pending_approval`, but quote list badges/filters do not explain it.

### Acceptance paths

| Path | Status write | Concurrency guard | Finalization | Events | Verdict |
|---|---|---|---|---|---|
| Public `/quote/[sign_token]` | accepted + signature/options/totals | No conditional status update; two sign requests can race | `finalizeAcceptedQuote` | primarily `quote_signed` | Richest path, but non-atomic and race-prone. |
| Portal `accept_quote` | conditional update from open statuses | Yes, update returns rows | `finalizeAcceptedQuote` | `quote_signed` | Best single-winner status guard, but no signature snapshot. |
| Internal `/api/quotes/accept` | fetch status then unconditional update | Race window | Duplicated custom chain; calls `createProjectFromQuote` but ignores a returned `{success:false}` | `quote_accepted` | Divergent; project failure can remain invisible. |

### Acceptance correctness defects

- Public option rows are updated one by one; errors are ignored. Quote update is separate. Partial selections can persist if the quote update fails.
- Public acceptance has no conditional `status IN (sent, opened)` update, so concurrent requests can run downstream effects more than once.
- Signature payload has no explicit size/type limit in route code.
- Only `signed_options` is snapshotted; title, terms, rows, prices, deductions and attachments are not frozen.
- Normal edit remains available after acceptance, and public/PDF reads the modified live row.
- Internal acceptance does not use the shared finalizer despite its stated purpose.
- Event names differ, so automation depending on `quote_accepted` can miss a public/portal win and automation depending on `quote_signed` can miss an internal win.

## 16. Data Integrity & Security

### Tenant and authorization findings

Positive:

- Principal quote APIs authenticate and scope quote rows by `business_id`.
- Deal context API is tenant-scoped.
- Customer-specific price-list resolver scopes customer/list by business.
- Public access uses high-entropy capability tokens.
- Public structured rows remove cost/component internals and hidden rows.

Material gaps:

1. Main POST/PUT accept `customer_id`, `deal_id` and `lead_id` without proving every linked entity belongs to the authenticated tenant before the quote is written. Side-effect updates are scoped, but the quote relationship itself may already be poisoned.
2. Several customer lookups in quote GET/send/preview/public are by bare ID. They assume stored relationships are valid rather than enforcing the invariant.
3. Direct agent/automation writers use service-role access and do not share one authorization/validation boundary.
4. Repository SQL shows `quote_items` creation but no visible `ENABLE ROW LEVEL SECURITY`/policies for `quotes` or `quote_items`. The repository is not an authoritative production schema snapshot, so actual RLS status is **unverified**, not proved absent. This must be checked in Supabase before relying on browser-side reads/storage.
5. New/edit pages directly read `business_config` through the browser Supabase client. Correct RLS is therefore a runtime requirement.
6. Quote attachments/photos are uploaded from the browser to `customer-documents` and exposed with `getPublicUrl`. Storage policies and public-bucket intent must be verified; abandoned drafts can leave public orphan objects.

### Public data minimization

The public GET starts from `select('*')` and returns `{...quote}`. This is unsafe-by-default: every future internal column becomes public unless manually removed. Use an explicit `PublicQuoteDTO` allowlist assembled from sanitized template data and the few fields required by signing UI.

### Reference-photo privacy

`getReferencePhotos` automatically selects up to three latest `project_photos` with `type='after'` from any project in the business and publishes URL/caption in a new customer's quote. It checks business and photo type, but no consent, publication approval, customer anonymity or sensitive-location flag exists in the query.

This can disclose another customer's home, project or caption. Disable the feature until a positive `approved_for_marketing/public_reference` signal and an owner review workflow exist. Do not infer consent from “project completed” or “after photo”.

### Integrity invariants for tests

1. Edit load → immediate save is a semantic no-op.
2. Leaving edit never creates a row.
3. Cross-tenant customer/deal/lead IDs return 400/404 and write nothing.
4. Sent/accepted quote PUT returns 409 unless creating a version.
5. Public JSON contains no internal metadata, cost, raw transcript, staff-only note, portal capability beyond explicitly intended navigation, signature data or IP.
6. Public acceptance has one winner; retries return the existing accepted result and do not duplicate side effects.
7. Signed totals equal the accepted snapshot and invoice/project handoff basis.
8. Duplicate/version either copies all contract content or explicitly resets it by policy.
9. Every direct/agent-created quote has number, token, creator/source, structured rows and server-computed totals—or is explicitly a `quote_request`, not a quote.

### Performance and state findings

- Quote list API selects `*` for all quotes and then all customers in a second query; signatures, legacy item JSON and other large columns may be overfetched.
- New/edit fetch full customer lists for selectors. This will not scale to large customer bases and slows mobile start.
- New and edit duplicate many fetches/state transforms, increasing regression probability more than raw runtime cost.
- Server HTML preview on every debounced change is reasonably controlled by 600ms debounce/abort, but it is still a render endpoint and should be measured.
- Raw fetch rather than a query cache means “stuck preview” is less likely to be React Query invalidation; the larger state risk is multiple local models and stale async initialization.
- Edit has no revision/CAS; concurrent tabs/users overwrite each other.

### Error-state truthfulness

- New quote save errors show a toast; new unsaved work is still lost on refresh.
- Quick AI failure returns to intake with text preserved: good.
- Edit autosave only changes a small status; unload save cannot report failure.
- Quote detail delete does not check `response.ok` before navigating away; it can imply success after server rejection.
- Save-as-template does not check `response.ok` before showing “Mall sparad”.
- Deal lookup/document attachment errors silently degrade.
- Downstream send/acceptance automations mostly log failures. Public finalizer creates a visible manual-project approval on project failure; internal acceptance does not reliably do so.

## 17. Prioritized P0–P3 Findings

### P0 — correctness, privacy, contract or data-loss risk

| ID | Finding / impact | Evidence | Recommended fix | Domains | Complexity |
|---|---|---|---|---|---|
| Q-P0-1 | Edit unload can create duplicate drafts. | `beforeunload` uses POST beacon to `/api/quotes`; POST creates. | Remove beacon immediately; add dedicated idempotent draft update only if proven necessary; browser regression test. | edit page, quote API | S |
| Q-P0-2 | Hidden customer rows become visible after edit/autosave. | edit load mapper omits `is_hidden`; PUT defaults false. | Round-trip field; maximal-quote no-op test. | edit mapper, item types/tests | S |
| Q-P0-3 | Accepted/sent contract is mutable and no full signed snapshot exists. | edit link always shown; PUT lacks lifecycle guard; public/PDF read live rows. | Guard updates, require version, persist accepted snapshot/hash. | lifecycle, DB, editor, public/PDF | L |
| Q-P0-4 | Other customers' project photos can be automatically published without consent. | `getReferencePhotos` queries any `after` photo; no approval flag. | Disable now; later require explicit marketing approval and safe caption. | public quote, project photos/privacy | S now / M later |
| Q-P0-5 | Public quote JSON is unsafe-by-default. | Public GET `select('*')` and spreads quote row. | Explicit DTO allowlist and leak tests. | public API/types/tests | M |
| Q-P0-6 | Public option signing can persist wrong tax deduction/customer payment and partial state. | No annual-cap helper/green mapping; option updates loop separately from quote. | One transactional server command using canonical cap/calculation. | public sign, calc, DB | M–L |
| Q-P0-7 | Cross-tenant entity relationships are not validated before service-role writes. | POST/PUT accept foreign IDs; later side effects scope only some updates. | Validate all links first; add DB composite/trigger invariants where feasible. | quote command, customer/deal/lead, schema | M |

### P1 — major flow/reliability defects

| ID | Finding / impact | Evidence | Recommended fix | Domains | Complexity |
|---|---|---|---|---|---|
| Q-P1-1 | No one canonical builder controller/write path. | Separate new/edit state and many direct writers. | Shared initial-state/serializer + canonical server command. | builder/API/agents | L |
| Q-P1-2 | Lead context is misclassified as deal context. | `deal_id || lead_id`, deal API lookup, save as deal ID. | Typed context loader; distinct IDs. | new page, context APIs | S–M |
| Q-P1-3 | Editing silently changes validity. | Exact dates bucketed, autosave sets today + days. | Preserve exact `valid_until`; only change on explicit user action/version policy. | edit/API | S |
| Q-P1-4 | Input quality is unprotected. | CTA requires one character; generator immediately drafts. | Guided Start + completeness/clarification gate. | Snabboffert/AI | M |
| Q-P1-5 | Internal/public/portal acceptance still diverges. | Internal path does not use finalizer and emits different event. | Conditional transition + one finalizer/event contract. | accept/portal/public/events | M |
| Q-P1-6 | Duplicate/version can succeed without rows and loses contract fields/links. | item insert error ignored; omissions in duplicate payload. | Transactional clone policy with separate duplicate/version rules. | quote API/versioning | M |
| Q-P1-7 | New unsaved quote can be lost. | No autosave/local recovery/navigation warning. | Session/local draft recovery or early idempotent server draft creation. | new builder | M |
| Q-P1-8 | Programmatic quotes use incompatible totals/rows/header metadata. | direct writers in tool-router, Matte, suggestions, approve-actions, deal-flow, voice. | Route all through canonical command; model “request” separately from quote. | agents/automation | M–L |
| Q-P1-9 | Quote number/version allocation is race-prone. | count+1 and max+1 without observed invariant. | Tenant/year sequence or transactional allocator + unique constraint. | DB/API | M |
| Q-P1-10 | Main update is not fully atomic and has no revision control. | items replaced before header update; no `updated_at` condition. | Transaction/RPC + revision/CAS response. | API/DB/editor | M–L |
| Q-P1-11 | Status UI and filters disagree with the documented status registry. | signed/pending approval omitted from filters/badges. | Central labels/groups and transition validators. | status lib/list/detail/API | S–M |

### P2 — high-value UX/quality improvements

| ID | Finding / impact | Evidence | Recommended fix | Complexity |
|---|---|---|---|---|
| Q-P2-1 | Customer entry skips scope intake. | customer ID counts as full start signal. | Same Guided Start with customer preselected. | S after intake exists |
| Q-P2-2 | Full-editor text AI omits customer pricing context. | request body lacks selected customer. | Shared AI request builder. | S |
| Q-P2-3 | Deal path can attach unrelated customer documents. | loads documents by customer, not deal/selection. | Show selectable deal-scoped documents; default none. | M |
| Q-P2-4 | Similar-quote data includes drafts and ignores structured rows/outcomes. | naive matcher. | Restrict to accepted, later add actual outcomes. | S–M |
| Q-P2-5 | Fetched template default rows are not included in AI context. | only names/categories rendered. | Include bounded structured exemplars or remove fetch. | S |
| Q-P2-6 | Mobile customer selection and edit ordering are weak. | unsearchable select; edit canvas last. | Search/recent selector; move main document higher. | M |
| Q-P2-7 | Send lacks an explicit quality gate. | customer/description checks only; empty/zero rows possible. | Pre-send validation with explicit override for zero price. | M |
| Q-P2-8 | Quote list/detail overfetch and weak error truthfulness. | list `select('*')`; unchecked delete/template responses. | Narrow DTOs and check responses. | S–M |
| Q-P2-9 | Premium/Friendly and jsPDF fallback are not full parity. | static render/fallback paths. | Contract tests and operational alert when fallback used. | M |

### P3 — later enhancements

- Voice-first guided answers after V1 instrumentation.
- Photo-assisted classification, but no unconfirmed dimensions.
- Historical “similar accepted quote” shortcuts once structured data is clean.
- Site checklist and trade-specific advanced packs.
- Offer-to-Reality recommendations only after quote ↔ project actuals are trustworthy.
- Smart upsells and option recommendations after win/loss/outcome data quality improves.
- Collaborative real-time editing only after revision/CAS and lifecycle immutability.

## 18. Recommended Target Quote Flow

```text
ENTRY POINT
  navigation | customer | deal | lead | agent proposal | duplicate/version/edit
       ↓
TENANT-VALIDATED CONTEXT LOADER
  mode + customer/deal/lead/source version + initial scope
       ↓
CREATE only: GUIDED QUOTE START
  3–5 adaptive answers + optional text/voice/photos
       ↓
QUOTE INTENT + COMPLETENESS GATE
  ask max 1–3 missing clarifications; preserve “vet ej” as assumptions
       ↓
CANONICAL AI DRAFT GENERATOR
  company/customer pricing + structured items; no guessed missing prices
       ↓
ONE QUOTE DRAFT STATE / SERIALIZER
       ↓
EXISTING CANONICAL DOCUMENT BUILDER
  same rows, totals, terms, preview for create/edit/version
       ↓
SERVER COMMAND
  tenant validation → shared calculation/cap → atomic header/items write
       ↓
PRE-SEND QUALITY GATE
       ↓
SEND + DURABLE DELIVERY/AUDIT EVENT
       ↓
CONDITIONAL SINGLE-WINNER ACCEPTANCE
  freeze accepted snapshot + signature/options/totals atomically
       ↓
ONE FINALIZATION CHAIN
  deal won + project handoff + customer confirmation + visible retry/failure
```

### Canonical entry-context contract

```text
mode: CREATE | EDIT | DUPLICATE | VERSION
quoteId?
customerId?
dealId?
leadId?
sourceQuoteId?
initialScope?
source: navigation | customer | deal | lead | agent | quote
```

Every ID must be server-resolved under authenticated `business_id`. Query params may carry identifiers, but never authoritative entity data.

### What not to build

- No second quote builder.
- No generic form/workflow engine.
- No quote-specific event platform.
- No persisted `quote_intent` table in V1.
- No project-to-new-base-quote shortcut; use explicit ÄTA/change semantics.
- No Offer-to-Reality recommendation loop until quote versions and project actuals are reliable.

## 19. Claude Implementation Plan

### Epic 1 — Emergency edit round-trip safety

**Problem:** Edit unload can create duplicate drafts; hidden rows and validity are corrupted; autosave has no revision protection.

**Goal:** Loading and leaving/saving a draft is lossless and never creates another quote.

**Exact scope:**

- remove the POST `sendBeacon` path;
- preserve `is_hidden` and every structured item field in load/serialize;
- preserve exact `valid_until` rather than deriving a duration bucket;
- check and surface autosave responses;
- add a dirty-state/retry behavior appropriate for browser close;
- add maximal persisted quote round-trip tests.

**Out of scope:** builder redesign, accepted snapshot, guided intake.

**Dependencies:** none.

**Likely files/domains:** edit page, quote payload mapper/API, quote item types, browser/API tests.

**Schema change / migration:** no for immediate fix. Add revision column only in Epic 4 if chosen.

**Tests:** no duplicate POST on unload; hidden row remains hidden; exact validity unchanged; option/split/terms round-trip; failed autosave visible.

**Acceptance criteria:** open a maximal draft, make no changes, leave/reopen: row count and semantic payload unchanged, no new quote row, no validity movement.

**Risk:** low–medium; autosave behavior is business-critical.

**Suggested order:** 1.

**Can run in parallel?** No; stabilize this before shared-state extraction.

### Epic 2 — Public privacy boundary stopgap

**Problem:** Public JSON is raw-row based and reference photos publish without a consent gate.

**Goal:** A quote link exposes only intentional customer-facing data.

**Exact scope:**

- replace `{...quote}` with explicit `PublicQuoteDTO`;
- remove signature IP/data, raw transcript, internal notes/metadata and any unnecessary IDs/capabilities;
- disable automatic reference photos immediately;
- add public payload snapshot/leak tests;
- document whether a quote token intentionally grants the entire portal.

**Out of scope:** designing a marketing-consent system.

**Dependencies:** none.

**Likely files/domains:** public quote route/types/page, reference-photo helper/tests.

**Schema change / migration:** no for stopgap.

**Tests:** forbidden field allowlist; hidden/cost data absent; reference photos null without explicit future approval.

**Acceptance criteria:** public response contains only fields consumed by the page; no unrelated project photo is returned.

**Risk:** medium; client currently consumes `portal_token` for redirect, so replace with an explicit safe navigation field/redirect.

**Suggested order:** 2; can start alongside Epic 1 with cross-review.

**Can run in parallel?** Yes, with Epic 1.

### Epic 3 — Sent/accepted immutability and accepted snapshot

**Problem:** The accepted commercial contract is mutable and later project/invoice reads can observe changed rows.

**Goal:** The exact customer-visible accepted version is immutable and traceable.

**Exact scope:**

- reject ordinary PUT for sent/opened/accepted/signed/declined/expired;
- change edit action to “create new version” for non-drafts;
- define separate clone policy for duplicate vs version;
- persist accepted version reference plus complete snapshot or immutable row/document hash;
- ensure PDF/public/project handoff reads accepted content;
- retain existing draft editing.

**Out of scope:** full document management system or generic audit ledger.

**Dependencies:** Epic 1.

**Likely files/domains:** quote API, edit/detail UI, version clone, public/PDF, project quote-context.

**Schema change / migration:** yes, likely snapshot/version/hash fields and a unique family/version invariant. Historical accepted quotes need a one-time interpretation/backfill policy.

**Tests:** lifecycle transition matrix; accepted PUT 409; version carries intended contract fields/deal; accepted public/PDF stable after draft/version changes.

**Acceptance criteria:** once accepted, the exact rows/terms/totals shown at acceptance cannot change; revisions create a distinct draft version.

**Risk:** high; touches legal/commercial truth and old records.

**Suggested order:** 3.

**Can run in parallel?** Design can overlap Epic 2; implementation should follow Epic 1.

### Epic 4 — Atomic acceptance and deduction parity

**Problem:** Public option/signature/totals writes can partially succeed and use different deduction logic; acceptance paths race/diverge.

**Goal:** One idempotent, single-winner acceptance command produces one coherent signed result.

**Exact scope:**

- transactional/RPC update of selected options, canonical recomputation, annual cap, signed totals, snapshot and signature;
- conditional transition from open status;
- request size/type validation for signature;
- idempotent retry response;
- route public, portal and internal acceptance through one transition/finalizer contract;
- emit stable semantic events consistently;
- check `createProjectFromQuote` result and surface retry/approval.

**Out of scope:** new workflow/event platform.

**Dependencies:** Epic 3 snapshot design.

**Likely files/domains:** public/portal/internal accept routes, calculation/cap helper, finalizer, DB function, automation event tests.

**Schema change / migration:** likely database function; possibly acceptance idempotency/event key.

**Tests:** concurrent accept; option validation; annual cap; green-tech handling policy; failed item/quote write rollback; exactly-once finalization key.

**Acceptance criteria:** two concurrent accepts yield one transition and one coherent signed snapshot; all paths produce equivalent downstream state.

**Risk:** high.

**Suggested order:** 4.

**Can run in parallel?** Calculation tests can run parallel with Epic 3; final integration cannot.

### Epic 5 — Tenant-validated canonical quote command

**Problem:** Main and direct writers can associate cross-tenant IDs and compute incompatible quote shapes.

**Goal:** Every production-created quote uses structured rows, shared calculations and validated context.

**Exact scope:**

- typed create/update command with request validation;
- resolve customer/deal/lead under authenticated business before write;
- atomic header/items write;
- canonical number allocation;
- canonical source/creator/token/default fields;
- require programmatic callers to provide structured rows or create a separate approval/request, not a false quote.

**Out of scope:** builder UI and generic command bus.

**Dependencies:** lifecycle policy from Epic 3; calculations from Epic 4 where relevant.

**Likely files/domains:** quote API/service, DB function, tenant relation helpers, number/version allocation.

**Schema change / migration:** recommended unique quote number/version constraints and possibly tenant relationship enforcement; validate production data before adding.

**Tests:** cross-tenant IDs, structured totals, transaction rollback, number concurrency, source/creator fields.

**Acceptance criteria:** no product writer inserts directly into `quotes`; invalid tenant links write nothing.

**Risk:** high but high leverage.

**Suggested order:** 5.

**Can run in parallel?** Command implementation and writer inventory can overlap; cutover sequentially.

### Epic 6 — Migrate agent/automation quote writers

**Problem:** Tool-router, Matte, suggestions, approve-actions, deal-flow and voice create structurally different records.

**Goal:** Programmatic quote drafts are indistinguishable from UI-created drafts in data integrity and editability.

**Exact scope:**

- migrate each live caller to Epic 5 command;
- use `generatedQuoteToQuoteItems` for AI results;
- convert header-only “create quote” to a `quote_request` approval when scope/prices are insufficient;
- prove voice endpoint usage, retire it if unused;
- isolate demo/debug writers;
- add contract tests per source.

**Out of scope:** changing agent product behavior beyond quote creation correctness.

**Dependencies:** Epic 5.

**Likely files/domains:** tool router, Matte, suggestions, approve-actions, deal-flow, voice, approvals/jobbuddy.

**Schema change / migration:** no additional schema expected.

**Tests:** every source creates number/token/structured rows/totals/context; no direct inserts by source search/architecture test.

**Acceptance criteria:** repository production paths have one quote writer; agent results open in the same editor without repair.

**Risk:** medium–high due to broad call sites.

**Suggested order:** 6.

**Can run in parallel?** Individual caller migrations can run in parallel after command API freezes; cross-review required.

### Epic 7 — Unified builder context and state serializer

**Problem:** Entry query parsing, initialization and create/edit serialization are duplicated and inconsistent.

**Goal:** Context changes initial data, not editor business logic.

**Exact scope:**

- implement typed context mode and distinct customer/deal/lead/source IDs;
- tenant-scoped context loader;
- shared initial-state mapper and serializer;
- share AI request builder so selected customer is always included;
- fix deal documents to explicit/deal-scoped selection;
- preserve current page shells and document components.

**Out of scope:** new canvas, routing redesign, project base-quote path.

**Dependencies:** Epic 5 command and Epic 1 round-trip tests.

**Likely files/domains:** new/edit pages, shared quote builder module, pipeline/customer context APIs.

**Schema change / migration:** no.

**Tests:** matrix for navigation/customer/deal/lead/edit/duplicate/version; same serialized quote for equivalent state.

**Acceptance criteria:** every create/edit entry mounts the same state/serializer and differs only by validated initial context/mode.

**Risk:** medium–high; large component extraction, so use small reviewable slices.

**Suggested order:** 7.

**Can run in parallel?** Context loader and serializer tests can proceed separately, but page cutover should be sequential.

### Epic 8 — Guided Quote Start V1

**Problem:** one vague phrase immediately generates a commercially weak quote.

**Goal:** Capture the minimum high-information context in under one minute on mobile.

**Exact scope:**

- curated TypeScript templates for painting, carpentry, electrical, plumbing and bathroom;
- company-trade-aware work chips;
- three core plus up to two conditional questions;
- optional text/voice/photos/customer;
- prefill from validated customer/deal/lead context;
- feed normalized intent into existing generator and Snabboffert review.

**Out of scope:** generic form builder, DB admin UI, V2 photo/voice intelligence.

**Dependencies:** Epic 7.

**Likely files/domains:** QuickIntake/start components, quote-intake config/types, new builder context.

**Schema change / migration:** no.

**Tests:** config/question conditions, keyboard/tap accessibility, five poor-prompt scenarios, context prefill.

**Acceptance criteria:** all five example prompts require/collect the missing critical context before draft generation; flow uses 3–5 answers.

**Risk:** medium; question quality requires product/trade review.

**Suggested order:** 8.

**Can run in parallel?** Trade question content can be reviewed while Epic 7 is implemented.

### Epic 9 — Completeness, clarification and pre-send gate

**Problem:** confidence is passive and incomplete/zero-price drafts can progress toward send.

**Goal:** Make missing context and pricing explicit without creating a long wizard.

**Exact scope:**

- deterministic completeness states per intake template;
- extraction of guided/free-text answers into lightweight intent;
- max 1–3 AI clarification questions for unresolved critical fields;
- explicit assumptions/unknowns in review;
- pre-send validation for rows/prices/customer/totals/payment plan/tax fields;
- preserve override only where commercially safe and audited.

**Out of scope:** autonomous sending or persisted generic decision engine.

**Dependencies:** Epic 8 and canonical AI request from Epic 7.

**Likely files/domains:** intake, AI request/response schema, review header, send modal/API validation.

**Schema change / migration:** no for V1.

**Tests:** completeness fixtures, “vet ej”, AI failure fallback, zero-price send block, assumptions rendered.

**Acceptance criteria:** `måla kök` never directly becomes a sendable quote; sufficient structured input generates in one pass.

**Risk:** medium.

**Suggested order:** 9.

**Can run in parallel?** Pure completeness rules can start alongside Epic 8.

### Epic 10 — End-to-end quote contract suite and operational visibility

**Problem:** current tests cover calculations/rendering well but not mounted create/edit/acceptance contracts.

**Goal:** Prevent recurrence across every entry and customer-facing representation.

**Exact scope:**

- browser tests for all entry contexts;
- create/edit no-op round-trip;
- builder/preview/PDF/public semantic totals and terms parity;
- mobile 360/390px workflows;
- send partial-failure and acceptance retry tests;
- logging/visible recovery for downstream project failure;
- narrow list/detail DTO performance checks.

**Out of scope:** broad visual redesign.

**Dependencies:** Epics 1–9; add tests incrementally with each epic.

**Likely files/domains:** Playwright tests, API contract fixtures, monitoring/logging.

**Schema change / migration:** no.

**Tests:** this epic is the test/observability layer.

**Acceptance criteria:** CI proves every create/edit path uses canonical state/write, customer representations match, and acceptance is idempotent.

**Risk:** low–medium.

**Suggested order:** continuous, final hardening at 10.

**Can run in parallel?** Yes; each epic should add its own slice, with a final cross-review.

## 20. Final Verdict

### Mandatory conclusions

**A. Is there ONE canonical quote builder today? — PARTIALLY.**

There is one increasingly canonical document/item presentation foundation, but not one builder state, context, save/update or lifecycle implementation.

**B. Does every create/edit entry point use it? — NO.**

Customer/deal/query entry changes the start experience; edit is a separate orchestrator; duplicate/version is a special API branch; several agents and automations directly insert legacy/header-only quotes.

**C. Divergent/legacy paths:**

- customer and deal context bypass Snabboffert;
- `lead_id` is incorrectly treated as `deal_id`;
- duplicate/new version create before edit and omit fields;
- edit uses a different state/save/autosave model;
- Jobbkompisen/agent tool router;
- Matte `create_quote_draft`;
- suggestion approval and `approve-actions`;
- automated deal-flow generation;
- still-callable voice execute route;
- text-only ÄTA approval quote without a real project-change link.

**D. Is quote input quality sufficiently protected? — NO.**

Any non-empty phrase passes. No critical-context or price-completeness gate exists before generation, and send validation is too permissive.

**E. Recommended starting UX:**

Use the existing Snabboffert shell with trade-aware chips, 3–5 adaptive questions, optional text/voice/photos/customer, then a deterministic completeness check and at most one short clarification turn. Enter the existing document review after generation.

**F. Recommended interaction model — HYBRID.**

Guided questions maximize information per tap; optional free text/voice covers edge cases; AI extracts and clarifies only missing context. Pure free text is under-specified, a large wizard is too slow, and open-ended AI conversation is less predictable and higher-latency.

**G. Five most important fixes:**

1. edit unload/round-trip safety;
2. sent/accepted immutability and snapshot;
3. public DTO/reference-photo privacy;
4. atomic signing with deduction parity;
5. tenant-validated canonical writer, followed by migrating all direct writers.

Guided Start is the first product UX epic immediately after those integrity foundations.

**H. What Claude should implement first:**

Start with Epic 1 as a small urgent patch with regression tests. In parallel, apply Epic 2's public privacy stopgap. Then do lifecycle snapshot and atomic acceptance before extracting the shared command/context. Only after all live writers converge should Claude add Guided Quote Start and completeness, because those features will multiply quote volume and must land on a trustworthy foundation.

### Factual uncertainties that materially affect the plan

1. The repository does not contain an authoritative production schema/RLS export. Actual policies, constraints and legacy columns must be inspected in Supabase before designing migrations.
2. Production data counts are unknown: percentage of quotes with only legacy `items`, only header data, missing tokens/numbers, `signed` status, or accepted quotes later edited. These determine backfill/cutover scope.
3. It is unclear whether `/api/voice/execute` is called outside this repository. Logs must prove it unused before removal.
4. The intended security contract for a quote link versus the full customer portal is not documented. Current code intentionally redirects by returning `portal_token`; confirm whether that wider access is desired.
5. There is no recorded consent/publication model for project photos. Until verified externally, automatic quote reference photos should be considered unsafe.
6. Trade-specific guided questions require validation with Swedish 5–30-person trade businesses; the technical V1 can be config-driven, but question content is a product/domain decision.

### Overall judgment

The newest quote work has materially improved the visible product: the document is now the center, create/edit share important components, server calculation is stronger, mobile editing is more credible, and the customer representation is closer to parity. The remaining risk is architectural **underneath** that surface. Handymate should not replace the new quote view. It should finish canonicalizing its state, commands and legal lifecycle, then place Guided Quote Start in front of it.

That sequence maximizes quote quality and conversion without trading away contract integrity, tenant safety or customer trust.
