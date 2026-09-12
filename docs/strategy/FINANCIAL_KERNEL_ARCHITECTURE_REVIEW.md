# Handymate Financial Kernel — Adversarial Architecture Review

> Status: Permanent review record / historical rationale
> Date: 2026-09-11
> Reviewed documents: `docs/HANDYMATE_ACCOUNTING_ROADMAP.md`, `docs/strategy/FINANCIAL_KERNEL_ARCHITECTURE.md`, `docs/strategy/FINANCIAL_KERNEL_DEVELOPMENT_ORCHESTRATION.md`
> Code examined: `handymate-dashboard/lib/invoices/{apply-payment,payment-decision,customer-share,create-invoice,fortnox-rows}.ts`, `handymate-dashboard/lib/fortnox/sync-payments.ts`, `handymate-dashboard/ARCHITECTURE.md`

## 0. How to use this document

**Implementation agents do not need to read this document to do the right thing.**

Every accepted finding below has been written into the canonical documents as a normative
requirement. This file exists to preserve *why* those requirements exist, so a future session
can tell the difference between a deliberate constraint and an accidental one — and so a
finding is not silently reversed by someone who never saw the reasoning.

If this document and a canonical document disagree, the canonical document wins and this one
is stale. Fix it.

Traceability: each finding carries a **Folded into** line naming the section that now carries
the binding rule.

---

## 1. Verdict

The architecture is sound and unusually mature for a pre-build document. The domain boundaries,
the event model, the idempotency discipline, the Money rules and the Fortnox shadow strategy are
all correct, and most teams building this would not have written them down in advance.

Three parts are genuinely load-bearing and should be protected from erosion:

- **§31 "What not to do"** — the failure modes it forbids are the ones that actually kill
  financial systems.
- **§35 Platform & Product Integration Contract** — it prevents the classic failure of building
  a second finance product beside the product that already knows why the economic event exists.
- **Orchestration §1 / §8** — "parallel reasoning, serialized ownership of financial truth" is
  the right rule for multi-agent work on money.

The weaknesses are not structural. They are, in order of severity: **missing Swedish domain
coverage**, **a schedule that prices code time but not counterparty time**, and **three concrete
collisions with how the existing code behaves today**.

---

## 2. Findings

### F1 — Reverse-charge construction VAT is absent (severity: BLOCKER for SE pack)

Neither the roadmap's SE pack scope (§10) nor the architecture's country pack scope (§15)
mentions omvänd skattskyldighet för byggtjänster. Verified in code: no occurrence of
`omvänd`, `reverse_charge` or equivalent anywhere in the repository, and `create-invoice.ts:207`
defaults `vat_rate` to 25 with no concept of a VAT regime per invoice or per counterparty.

For a trades company invoicing another construction company this is not an edge case — it is a
large share of B2B invoice volume, and it changes the posting fundamentally: no output VAT on the
sale, the obligation moves to the buyer, and both sides need separate accounts and separate VAT
return boxes. A Swedish ledger for this segment that cannot express it is not usable for the
segment.

It also has a product consequence beyond accounting: whether reverse charge applies depends on a
property of the *buyer* (a construction company that sells construction services other than
temporarily), which means the CRM must be able to carry and evidence that fact.

**Status:** accepted.
**Folded into:** `FINANCIAL_KERNEL_ARCHITECTURE.md` §15.1, §31, §36.3; orchestration Package C9, Claude G.

### F2 — Cash-basis accounting (kontantmetoden) is not modelled (severity: BLOCKER for SE pack)

The entire posting model in §14 assumes accrual basis: `invoice_issued` immediately creates an
accounts-receivable posting. Swedish companies with net sales normally below 3 MSEK may use
kontantmetoden, where purchases and sales are booked on payment and only unpaid documents at
the fiscal year end are booked as receivables/payables.

That describes the *default* configuration of Handymate's core customer — a two-to-five person
trades company — not an exception. A ledger that can only do accrual will be wrong for most
pilot candidates on day one, and the error will not be a rounding difference; it will be the
period in which revenue and VAT land.

**Status:** accepted.
**Folded into:** `FINANCIAL_KERNEL_ARCHITECTURE.md` §15.2, §31, §36.4; orchestration Package C9, Claude G.

### F3 — The schedule prices code time, not counterparty time (severity: HIGH)

Weeks 1–3 for a ledger foundation is a plausible *coding* estimate. Weeks 10–14 to a
production-quality beta is not a plausible *delivery* estimate, because the critical path is not
owned by the engineering team:

- PSP onboarding: KYC, commercial terms, and the merchant-of-record decision.
- Bank transaction access: either a PSD2/AIS licence or a contract with a licensed aggregator.
- A named accounting consultant and auditor who will actually review the posting rules.

These are months of counterparty lead time. The documents acknowledge this in one sentence
("planning estimates, not launch commitments") but the sprint structure still assumes code
cadence. The mitigation is not a longer estimate; it is starting the commercial and regulatory
tracks as first-class parallel workstreams with their own owner, before Sprint 0.

**Status:** accepted.
**Folded into:** `FINANCIAL_KERNEL_ARCHITECTURE.md` §28 (Sprint −1); orchestration §2, §10.

### F4 — The merchant-of-record decision is sequenced too late (severity: HIGH)

Orchestration Package D1 says "select provider/partner separately from domain architecture".
Architecturally that is correct — the adapter boundary should not care. Strategically it is
backwards, because merchant-of-record vs. platform vs. marketplace-payout decides:

- who legally holds customer money and for how long;
- who owns the receivable at each moment, and therefore what the clearing account means;
- who carries chargeback and refund liability;
- the VAT and invoicing treatment of Handymate's own fee.

Those are ledger semantics, not adapter details. The decision belongs before the first posting
rule is written, even though the *implementation* stays behind the adapter boundary.

**Status:** accepted.
**Folded into:** `FINANCIAL_KERNEL_ARCHITECTURE.md` §28 (Sprint −1), §38.1; orchestration Package P0.

### F5 — `TOLERANCE_KR = 1` cannot survive into an exact ledger (severity: HIGH)

`lib/invoices/payment-decision.ts` carries a documented ±1 kr tolerance against öresavrundning
between Handymate and Fortnox. It is a reasonable pragmatic choice in the current aggregate
model. It is incompatible with an exact-Money ledger: a silent tolerance produces a general
ledger that is a krona out with no posting that explains it, and the difference compounds across
partial payments.

The replacement is not a smaller tolerance. A difference within policy must become an explicit
modelled rounding posting; a difference outside policy must become a reconciliation exception.

This is a **breaking semantic change** to an existing, tested behaviour, and §18 of the
architecture did not mention it.

**Status:** accepted.
**Folded into:** `FINANCIAL_KERNEL_ARCHITECTURE.md` §5 (rounding rules), §18.3, §31; orchestration Package C1b, merge gate §9.

### F6 — Historical data has no entry path into the ledger (severity: HIGH)

The receivable-component model is right going forward, but no document says what happens to
invoices that were paid before the kernel existed. `paid_amount` is an aggregate; there is no
stored composition to reconstruct.

In practice nobody replays a company's history into a new ledger. They take an opening balance
(ingående balans) at a fiscal-year boundary, normally via SIE import from the outgoing system,
and run the new ledger forward from there. That is a real design decision with schema
consequences (opening-balance journal, a first locked period, a documented cut-over date) and it
is currently one bullet ("migration/backfill risks") inside one reviewer's brief.

**Status:** accepted.
**Folded into:** `FINANCIAL_KERNEL_ARCHITECTURE.md` §18.4, §30; orchestration Package C4b.

### F7 — Shadow Accounting initially compares Fortnox against itself (severity: MEDIUM)

Today Fortnox is the source of truth for payments and syncs *into* Handymate on a 2h cron —
stated explicitly in the header comment of `lib/invoices/apply-payment.ts` and implemented in
`lib/fortnox/sync-payments.ts`, which calls `applyInvoicePayment()` with `source: 'fortnox'`.

So in the first shadow phase, Handymate's payment state is *derived from* Fortnox. Comparing the
two proves the sync works; it cannot detect a divergence in payment truth, because there is only
one truth and Handymate is downstream of it. Divergence only becomes meaningful after the
direction is reversed for a business.

This does not invalidate shadow mode — it is still the best idea in the documents — but the
phase where it is structurally blind must be named, or the team will read green comparisons as
evidence of correctness they do not carry.

**Status:** accepted.
**Folded into:** `FINANCIAL_KERNEL_ARCHITECTURE.md` §20.1; orchestration Packages C6 and C12.

### F8 — Swedish statutory requirements are described generically (severity: MEDIUM)

The documents say "audit trail", "system documentation", "archiving", "sequential voucher
numbering". Bokföringslagen is specific about several of these, and "generic" is how a team
discovers a hard requirement during a pilot instead of during design: unbroken voucher
identification, seven-year retention of räkenskapsinformation counted from the end of the
calendar year in which the fiscal year ended, system documentation and processing history as
a named obligation, and the requirement that the information can be presented in readable form.

These are cheap to design for and expensive to retrofit.

**Status:** accepted.
**Folded into:** `FINANCIAL_KERNEL_ARCHITECTURE.md` §36; orchestration Claude G.

### F9 — SIE4 export is scheduled too late (severity: MEDIUM)

Both documents place SIE export before "broad migration". It should come much earlier, for two
independent reasons. It is the customer's exit guarantee, which is the cheapest possible answer
to the reasonable objection "what happens to my books if Handymate disappears". And it is the
format in which an external accounting consultant or auditor will want to inspect the ledger
during the pilot — which is exactly when the team most needs their review.

It is also the natural companion to F6: the same format that carries the opening balance in
carries the books out.

**Status:** accepted.
**Folded into:** `FINANCIAL_KERNEL_ARCHITECTURE.md` §15.4, §30; orchestration Package C10.

### F10 — The receivables lifecycle stops at settlement (severity: MEDIUM)

Reminders appear as an automation concern, and `lib/invoices/fortnox-rows.ts` shows that
påminnelseavgift and dröjsmålsränta already exist as invoice rows with `vat_rate 0`. But no
document defines their accounting treatment, and several adjacent realities of the segment are
absent entirely: debt collection handoff, and invoice factoring/fakturaköp, which is common in
trades and changes who owns the receivable.

**Status:** accepted, scoped as "must be modelled before the ledger is canonical", not before beta.
**Folded into:** `FINANCIAL_KERNEL_ARCHITECTURE.md` §37.

### F11 — VAT reporting stops short of filing (severity: LOW)

Both documents specify "VAT report support" and "VAT reporting primitives" but never the
momsdeklaration itself. Producing correct numbers and filing a return are different products,
and the customer's perception of "Handymate replaced Fortnox" is anchored on the second one.
Worth an explicit decision rather than an implicit omission.

**Status:** accepted as a scope decision to be made, not a requirement.
**Folded into:** `FINANCIAL_KERNEL_ARCHITECTURE.md` §15.3, §38.3.

### F12 — `payment_received` bridge semantics are subtler than the documents admit (severity: MEDIUM)

Architecture §7 says existing `payment_received` "must not be silently redefined", which is
right, but understates the specific trap. Today `applyInvoicePayment()` fires the post-payment
effects on `to_paid` **and** `to_customer_paid`, and deliberately **not** on `settled` — so the
customer does not get a second thank-you SMS when Skatteverket pays out. That rule is documented
only in a comment in `apply-payment.ts` and encoded in `decidePaymentOutcome()`.

Under the receivable-component model, the natural implementation fires on receivable settlement,
which would produce exactly the double message the current code avoids. This needs to be a named
regression test, not an instruction to be careful.

**Status:** accepted.
**Folded into:** `FINANCIAL_KERNEL_ARCHITECTURE.md` §18.5, §23 (golden path 34); orchestration Package C5.

### F13 — The two documents disagree on priority (severity: LOW, but corrosive)

Roadmap §16 says accounting should not automatically be the first large initiative after launch
and that PMF comes first. Orchestration §10 says the highest-reasoning capacity available now
should go to Financial Kernel reviews. Both are defensible, and they are not actually in
conflict, but nothing says so — which means each document can be cited to justify the opposite
sequencing decision.

The resolution: **specification and review now** (no production risk, no customer exposure,
and it is the work that is hardest to parallelize later); **implementation after PMF evidence**.

**Status:** accepted.
**Folded into:** orchestration §2; `STRATEGY_INDEX.md` decision log.

### F14 — The event-contract rule has no enforcement (severity: LOW, cheap to fix)

Architecture §1.6 and orchestration Package C0 both require `ARCHITECTURE.md` to be updated
with canonical event names before those events are coded. The repository already enforces
comparable contracts in CI (`tests/schema-contract.spec.ts`, `tests/dead-code-paths.spec.ts`),
and `ARCHITECTURE.md` §4 already carries a real event table.

A rule that depends on three parallel agents remembering it is the rule that erodes first. It
should be a test.

**Status:** accepted as a requirement; implementation not part of this documentation change.
**Folded into:** orchestration §9 (merge gates), Package C0.

### F15 — The moat claim is slightly oversold (severity: LOW, strategic)

Roadmap §18 argues the moat is the closed loop from operations to realized margin. That is
true and it is the right thesis. But the asymmetry is smaller than the section implies:
Fortnox and Visma can acquire or build an operational layer faster than Handymate can build a
compliant ledger plus regulated payment rails. The defensible window is real but finite.

That is an argument for exactly the sequencing in F13 — own the *contracts* now so nothing is
ever blocked on architecture, and build ledger depth when there are customers for whom it is a
retention lever rather than a brochure item.

**Status:** noted; no document change required beyond the sequencing already folded in.

---

## 3. Open decisions handed back to the owner

These are commercial or strategic judgements, not domain facts. They are recorded in
`FINANCIAL_KERNEL_ARCHITECTURE.md` §38 so that implementation agents encounter them without
reading this file. **Agents must not resolve them by choosing the convenient answer.**

| # | Decision | Review recommendation |
|---|---|---|
| D1 | Merchant-of-record model for Handymate Pay | Decide before the first posting rule; it is a ledger semantic, not an adapter detail |
| D2 | Sprint order: Pay before Ledger, or Ledger before Pay | Recommend swapping — see below |
| D3 | Does Handymate file the momsdeklaration, or only produce it? | Decide explicitly; do not let it default to "only produce" by omission |
| D4 | Which fiscal-year boundary is the cut-over for pilot customers? | Drives F6; needed before the first pilot is selected |

### On D2 — the recommendation, and why it is not folded in as a decision

The sprint plan runs Pay (Sprint 2) before Ledger (Sprint 3). The review recommends the
opposite order for this business:

- Ledger has no regulated counterparty, no KYC, no customer money at risk, and a failure is
  a wrong number in a report rather than a wrong movement of cash.
- Ledger delivers the moat directly — true realized margin per project — which is the thing
  the operational data makes uniquely possible.
- Pay has the longest external lead time and the largest blast radius, so it benefits most
  from running as a commercial procurement track in parallel rather than as a coding sprint
  in sequence.

This changes the committed plan and has commercial consequences the review cannot see
(a Pay launch may be worth more to pricing, positioning or a funding conversation than a
correct ledger). It is therefore recorded as an open decision rather than applied.

---

## 4. What was deliberately not changed

- The domain ownership table (§3), the event envelope (§7) and the provider adapter boundary
  (§11) were reviewed and found correct. No changes proposed.
- §35 was reviewed against the failure mode it exists to prevent and needs no strengthening.
- The three-document split was questioned and kept: the architecture is a contract, the
  orchestration is an execution protocol, and they have different audiences and change rates.

---

## 5. Amendment log

| Date | Change |
|---|---|
| 2026-09-11 | Initial review. F1–F15 raised; F1–F14 accepted and folded into the canonical documents; D1–D4 returned to the owner. |
