# Financial Kernel — Call-site map of today's payment and invoice truth (Claude track B)

> Status: Analysis record, 2026-09-13, against `origin/main` at `800544c`. Input to the C4 and
> C5 briefs (orchestration §4 track B). Paths are relative to `handymate-dashboard/`; line
> numbers are as of that commit and will drift. Method: an exhaustive grep sweep (58 tool calls)
> followed by manual verification of every Tier 1 and Tier 2 finding at the cited lines.
> Owner of the conclusions: Andreas. Nothing here changes an architecture rule.

## 0. The one-paragraph answer

`lib/invoices/apply-payment.ts` is genuinely the shared payment core its header claims to be:
all four intended payment sources (manual mark-paid, the status PATCH, the customer's
"I have paid" confirmation via approval, the Fortnox 2h sync) go through it and through the
pure decision in `payment-decision.ts`, and every post-payment effect lives inside it, gated on
`to_paid` / `to_customer_paid`. That is the good news and it is why the C5 facade is feasible.
The bad news is in five places that write **paid or money state around it**: an agent action
that sets `status='paid'` raw, the invoice list's own "Markera betald" button which uses a
generic `PUT` that never computes `paid_amount`, a user-authored automation action that can set
any invoice status, the supplier-invoice side which has no core at all, and the reminder path
which rewrites `total` after issue. Two of those are customer-reachable bugs today.

## 1. The core and its callers

| Site | Source passed | Notes |
|---|---|---|
| `app/api/invoices/[id]/mark-paid/route.ts:38` | `manual` | permission `create_invoices`, records the user |
| `app/api/invoices/[id]/status/route.ts:82` | `status_patch` | only when `status === 'paid'`; **then sends the thank-you SMS and review request in the route itself** (`:107-160`), the one place that effect lives outside the core |
| `app/api/approvals/[id]/route.ts:1287` | `customer_confirmed` | approval `confirm_payment`, created by the portal's claim-paid route which never touches the invoice |
| `lib/fortnox/sync-payments.ts:126,142` | `fortnox` | class `paid` and `customer_paid` from `classify-payment.ts`; amount from Fortnox `Total`/`Balance` or `getCustomerShare` |

Inside the core (`apply-payment.ts`): one `SELECT`, `decidePaymentOutcome`, one `UPDATE` of
`paid_amount/status/paid_at/settled_at/paid_via/manual_paid_*`, then effects: pipeline → won,
project AI `invoice_paid`, `bumpProjectStage('invoice_settled')`, smart communication,
`fireEvent('payment_received')`, portal notification. Under an approval the customer messages
become separate approval cards instead.

Decision helpers: `decidePaymentOutcome` is also used read-only by the approval preview
(`lib/approvals/payment-review.ts:39`). `getCustomerShare` is used by the core, the Fortnox
classifier, the sync and the ROT request gate (`lib/skv/validate-rot-request.ts:111`).
`getTaxReductionShare` has no production caller.

## 2. Paths that bypass the core — ordered by what they break

**Tier 1 — paid state written without the decision (money-truth bypass, verified)**

| # | Site | What happens | Who |
|---|---|---|---|
| 1 | `lib/matte/action-executor.ts:107-115` `mark_invoice_paid` | `status='paid', paid_at=now()` raw. No `paid_amount`, no `settled_at`, no `paid_via`, no effects. A ROT invoice jumps straight to `paid` with Skatteverket's share unaccounted. | agent (Matte) |
| 2 | `app/api/invoices/route.ts:441-450` `PUT /api/invoices` | allow-list accepts `status`; `status:'paid'` sets `paid_at` only. **The invoice list's "Markera betald" button uses exactly this** (`app/dashboard/invoices/page.tsx:121-127`). No `paid_amount`, never `customer_paid`, no `payment_received`. The same route also rewrites `total`, `subtotal`, `vat_amount`, `rot_rut_deduction`, `customer_pays`. | user, daily |
| 3 | `lib/automation-engine.ts:544-560` `update_status` | table map includes `invoice`; a user-authored rule can set `status` to any string including `paid`. | automation rule |
| 4 | `lib/fortnox/sync-payments.ts:232` `syncSupplierInvoicePayments` and `app/api/supplier-invoices/route.ts:160-177` `PATCH` | supplier `status='paid'`, `paid_at`, and money fields written directly; no decision, no event, no effects. The AP side has no core. | cron, user |

**Tier 2 — invoice money fields mutated outside any payment path**

| # | Site | What happens |
|---|---|---|
| 5 | `lib/invoice-reminder-send.ts:250-262` | rewrites `items`, `total`, `customer_pays` with reminder fee and penalty interest **after issue**. Under the kernel this is `receivable_adjusted{reason: dunning_fee|interest}`, never a mutation of the issued document (parent §37, C14; `fortnox-rows.ts` records that these were once posted wrong). |
| 6 | `app/api/invoices/[id]/reminder/route.ts:186` | a second, parallel reminder path writing `reminder_fee`, `penalty_interest`, `status='overdue'`. Two implementations of one rule. |
| 7 | `app/api/invoices/credit/route.ts:131-171` | credit note created through `createInvoice` with its own `KF-` series (`numberOverride`, bypassing `next_invoice_number`); original set to `status='credited'` only for full credits. Partial credit leaves the original untouched. **No code path reverses a payment**; crediting is the only undo. |

**Tier 3 — lifecycle transitions outside the core** (`sent`, `overdue`, `cancelled`,
`DELETE` of drafts): `send-invoice.ts:472,543`, `auto-generate/route.ts:331`,
`[id]/status/route.ts:69`, `sync-payments.ts:251,262`, `cron/check-overdue/route.ts:78`
(bulk by id list, no tenant predicate — safe today because ids are global, but it is the only
tenant-less invoice write in the tree), `invoices/route.ts:523`.

**Tier 4 — identity and accounting fields**: `sync-to-fortnox.ts:413` **overwrites
`invoice_number` with Fortnox's document number** and sets `ocr_number`,
`rot_application_status='submitted'`; `reconcile-fortnox.ts:78` relinks Fortnox ids;
`rot-payment/generate/route.ts:150` and `import-decision/route.ts:76` write ROT request and
decision fields — and **Skatteverket's actual payout decision never reaches `paid_amount` or
`settled_at`**; that settlement arrives only via the Fortnox sync classifying `Balance ≤ 0`.
`automation-engine.ts:731-739` can push a payment to Fortnox `/invoicepayments` through a
`@deprecated` helper lacking scope, with no local write.

**Tier 5 — creation outside `createInvoice`**: `app/api/agent/trigger/tool-router.ts:1036`
(agent inserts invoices with its own number bump at `:1049`, bypassing
`create_invoice_with_sources` and the source claim); Fortnox import
(`integrations/fortnox/import/invoices/route.ts:113`); demo/debug seeds writing `status='paid'`.

## 3. Readers that disagree about what "paid" means

`isCustomerSettled` (`paid` or `customer_paid`) is the intended predicate and is used by the
value ledger, cash radar, missions, Karin, project economics and the portal. These still
hardcode `status === 'paid'` and therefore make a `customer_paid` ROT invoice invisible as
revenue: `lib/matte/monthly-review.ts:105`, `lib/value/recovered-revenue.ts:451`,
`lib/value/revenue-recovery-case.ts:258,382`, `lib/customer-ltv.ts:34,54`,
`lib/agents/lars/observation-prompt.ts:452`, `lib/communication-ai.ts:400`,
`lib/seasonality/analyzer.ts:29`, `lib/jobbpass/jobbpass.ts:321`,
`lib/invoices/evidence-manifest.ts:455`, `app/api/onboarding/instant-value/route.ts:65`,
`app/api/automation/value/route.ts:82`, `app/api/dashboard/team-activity/route.ts:113`,
`app/api/customers/[id]/timeline/route.ts:493`.

One of these is not cosmetic: `lib/rot-rut-limits.ts:67` counts the customer's used ROT/RUT
space from `status in ('sent','paid','overdue')`, so a `customer_paid` invoice's deduction is
**not counted against the annual cap** and a later invoice can exceed it.

This is the projection problem the kernel exists to end (parent §18.1): today there are at
least two definitions of "paid" in production, and `paid_amount` is `NULL` on every invoice
that went through Tier 1 bypass #2.

## 4. What C4 and C5 must therefore do

1. **Facade first, then close the side doors.** C5 evolves `applyInvoicePayment` into the
   facade (`legacy caller → facade → payment_settled → payment_allocated → receivable_settled →
   invoice projection → legacy bridge`). But the facade is only a facade if bypasses #1–#3 are
   routed through it in the same package: `mark_invoice_paid` calls the core; `PUT /api/invoices`
   rejects `status` transitions to `paid`/`customer_paid` (the list button calls `mark-paid`);
   `update_status` removes `invoice` from its table map or delegates. These three are also
   bugs today and can be fixed before C4 without touching the kernel — see §5.
2. **Supplier side gets its own minimal core in C4**, not C9: `supplier_invoice_approved →
   payable_created`, and both `PATCH status=paid` and the Fortnox supplier sync become
   `payment_initiated{direction: outbound}` + `payment_settled` + `payable_settled`. Otherwise
   C9's AP posting has nothing true to post from.
3. **Reminder fees and interest are `receivable_adjusted`**, never a rewrite of `total`.
   C14 owns the accounting treatment; C4 must make the receivable able to carry them so the
   two reminder paths can be collapsed onto one that emits the event.
4. **Fortnox's overwrite of `invoice_number` must stop before `invoice_issued` exists**: the
   event carries the number, and a number that changes after issue breaks §36.1 and every
   idempotency key derived from it. C4 keeps the Fortnox document number in its own column only.
5. **Skatteverket's payout decision is a `payment_settled{provider:'skatteverket'}`**
   allocated to the tax-authority receivable component; the ROT decision import
   (`import-decision/route.ts`) is the natural producer. Today the Fortnox sync is the only
   thing that settles that component, which is the S1 blindness in another costume.
6. **`paid_amount` cannot be trusted as history** (parent §18.4 already says so); the map
   confirms why: every Tier 1 bypass leaves it `NULL` or stale. Cut-over via C4b, no replay.
7. **Golden path 34** (`payment_received` never on tax-authority settlement) is already
   encoded in the core's `customerJustSettled` guard; the facade must keep the guard exactly,
   and the thank-you SMS that lives in `[id]/status/route.ts:107-160` must move into the
   bridge or it will be the second thank-you.

## 5. Fix now, independent of the kernel (launch-blocker audit material)

> **Status 2026-09-13:** all four fixed in PR #53, locked by
> `tests/betalsanning-sidodorrar.spec.ts` in `test:contracts`. A fifth item followed from #2:
> invoices marked paid through the old PUT path carry `paid_amount = NULL`; the idempotent
> backfill `sql/v237_backfill_paid_amount.sql` fills them (applied to production 2026-09-14;
> verified 0 paid/customer_paid invoices with `paid_amount IS NULL` afterwards).

These are correctness bugs in production behaviour and belong to the pre-launch audit that
orchestration §2 prioritises, not to a kernel package. Each is small and local.

| Fix | Where | Why now |
|---|---|---|
| Route Matte's `mark_invoice_paid` through `applyInvoicePayment(source:'manual')` with the agent as actor | `lib/matte/action-executor.ts:107` | An agent can today mark a ROT invoice fully paid with nothing recorded |
| Make the invoice list's "Markera betald" call `POST /api/invoices/[id]/mark-paid` and make `PUT /api/invoices` refuse `status` values `paid`/`customer_paid` | `app/dashboard/invoices/page.tsx:121`, `app/api/invoices/route.ts:441` | The most-used paid button skips `paid_amount`, `customer_paid` and every automation |
| Count `customer_paid` in the ROT/RUT annual-cap query | `lib/rot-rut-limits.ts:67` | Cap can be exceeded for ROT customers who have paid their share |
| Remove `invoice` from the `update_status` table map, or delegate `paid` to the core | `lib/automation-engine.ts:547` | A rule can set paid state with no decision |

## 6. Amendment log

| Date | Change | Source |
|---|---|---|
| 2026-09-13 | Created. | Track B sweep + manual verification |
