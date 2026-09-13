# Financial Kernel — Swedish ledger domain review (Claude track D)

> Status: Proposal record, 2026-09-13. Input to C1b, C9, C10, C13, C14 and to the first
> conversation with the accounting consultant (R0). Orchestration §4 track D.
> **Nothing in this document is an accounting decision.** Every account number, threshold and
> VAT treatment below is a proposal that a named accounting consultant confirms, corrects or
> rejects (blueprint §15 preamble, §36.6). The point of writing it now is that the consultant's
> first hour is spent on real cases from Handymate's segment, not on textbook questions
> (roadmap §13.1). Reference data: Odoo core `l10n_se` 18.0 (LGPL-3), read on 2026-09-13; BAS
> account names quoted from it. The golden paths in
> `handymate-dashboard/tests/financial-kernel/golden-paths.ts` use exactly the proposals here.

## 0. How to read this

Each section: what the rule is as far as a model can tell, what the code does today, the
proposal, and the numbered question **Q** the consultant must answer. §12 collects all Qs.
"Confirmed" appears nowhere in this document on purpose.

## 1. Chart of accounts and mapping strategy

**Proposal.** The SE country pack ships a *minimal* BAS subset that the posting rules
actually use (about 30 accounts, §11 list), plus the customer's ability to import their own
chart via SIE `#KONTO` (C4b) so that a business migrating from Fortnox keeps its numbers. Odoo
core's 282-account template is the cross-check for names and types, not the source.

Account-selection rules the posting engine needs from day one:

| Purpose | Proposal | Odoo core name | Notes |
|---|---|---|---|
| Customer receivable | 1510 | Kundfordringar | reconcilable |
| Skatteverket ROT/RUT receivable | **1513** | Kundfordringar – delad faktura | Exactly the tax-authority component of FK.1. Its existence in BAS confirms the two-component model is standard practice. |
| PSP clearing (card, Swish via provider) | 1580 | Fordringar för kontokort och kuponger | provider money not yet in bank |
| Skattekonto | 1630 | Avräkning för skatter och avgifter | VAT settlement, ROT payouts if paid via skattekonto (Q3) |
| Bank | 1930 | Företagskonto | one per bank account |
| Customer overpayment / prepayment | 2420 | Förskott från kunder | not in Odoo core; BAS standard |
| Supplier payable | 2440 | Leverantörsskulder | reconcilable |
| Output VAT 25/12/6 domestic | 2611 / 2621 / 2631 | Utgående moms … inom Sverige | Odoo posts sales tax here |
| Output VAT reverse charge (purchase side) 25/12/6 | 2614 / 2624 / 2634 | Utgående moms omvänd skattskyldighet | |
| Input VAT | 2641 | Debiterad ingående moms | |
| Input VAT reverse charge domestic | 2647 | Ingående moms omvänd skattskyldighet … i Sverige | |
| VAT settlement | 2650 | Redovisningskonto för moms | |
| Sales 25/12/6 | 3001 / 3002 / 3003 | Försäljning inom Sverige … | |
| Sales, construction reverse charge | **3231** | Försäljning inom byggsektorn, omvänd skattskyldighet | |
| Rounding | 3740 | Öres- och kronutjämning | blueprint §5 |
| Dunning fee income | 3591 (?) | *not in Odoo core* | **Q6** |
| Interest income on receivables | 8313 (?) | *not in Odoo core* (8314 is "skattefria ränteintäkter") | **Q6** |
| Purchases, materials | 4010 | *not in Odoo core* | |
| Purchases, construction reverse charge 25 | 4425 | *Odoo core has only 4426/4427* | |
| Bank / PSP fees | 6570 (?) | *not in Odoo core* | **Q8** |
| Bad debt, confirmed / expected | 6351 / 6352 | *not in Odoo core* | **Q9** |

**Q1.** Is the minimal-subset-plus-import strategy acceptable, or must the pack ship the full
BAS 2026 chart for the customer's chosen K-regelverk? **Q2.** BAS's terms for embedding the
chart in software were not readable from the research environment; who at BAS confirms them?

## 2. VAT

### 2.1 Standard domestic sale

Base → ruta 05, tax → ruta 10/11/12, credit 2611/2621/2631. Credit notes negate both (Odoo's
`refund` repartition lines do exactly that: `-se_05`, `-se_10`). Uncontroversial; no Q.

### 2.2 Reverse-charge construction VAT (omvänd skattskyldighet för byggtjänster)

**Sale side.** No output VAT. Base → **ruta 41** "Försäljning när köparen är skattskyldig i
Sverige". Revenue 3231. The invoice document must carry the reference ("Omvänd
betalningsskyldighet") and the buyer's VAT number. **Odoo core has no sale-side tax template
for this** — its `l10n_se` covers the purchase side only (`purchase_construction_services_tax_*`).
That is a gap in the reference, not in the law, and it means the sale-side rule is ours to write
and the consultant's to confirm.

**Purchase side** (a Handymate business buying from a subcontractor). Odoo's rule, which is the
proposal: base → ruta 24, output VAT 2614 with `-100 %` factor (i.e. credited) → ruta 30, input
VAT 2647 → ruta 48; expense 4425/4426/4427. Net VAT zero when fully deductible.

**Determination.** The regime is a property of the *buyer* (taxable person who sells
construction services other than temporarily) and of the *service* (construction service), not
of the seller. So the invoice domain needs `vat_regime` on the invoice **and** a dated,
evidenced `construction_buyer_status` on the counterparty (blueprint §36.3). Today no such
concept exists in the repository (blueprint §15.1); `vat_rate` defaults to 25.

**Q3.** In practice, how does a trades company establish and document the buyer's status, what
evidence is kept, and what happens when the seller gets it wrong (who owes the VAT)?
**Q4.** Mixed invoices — a construction service plus material sold to a construction buyer:
is the whole invoice reverse charge, or line by line? (This decides whether `vat_regime` is
per invoice or per line.) **Q5.** Which services in Handymate's job types are "byggtjänster"
under the rule and which are not (e.g. cleaning after construction, landscaping)?

### 2.3 ROT/RUT and VAT

The deduction is computed on labour **including VAT** (`lib/rot-rut.ts`, verified against
Skatteverket 2026-07-30) and reduces what the customer pays; it does not change the invoice's
VAT. So: full output VAT is posted at issue; the receivable is split 1510 / 1513; no VAT effect
at either settlement. The golden path 34 encodes this. Under **cash basis** (§3) the VAT is
posted at payment — **Q10:** at the customer's payment, at Skatteverket's, or proportionally?

### 2.4 Dunning fees and interest

Reminder fees and default interest are outside the scope of VAT (no VAT, not in the return's
base boxes). `lib/invoices/fortnox-rows.ts` already sends them with `vat_rate 0` after a bug
where they were posted at 25 %. The proposal in golden path 39: fee → 3591-class income,
interest → 8313-class income, neither in the VAT return. **Q6** covers the accounts; **Q7:**
is interest booked when charged on the reminder, or accrued over the overdue period (§26 period
boundaries)?

### 2.5 PSP fees

If the provider is established in another EU country (typical), its fee is a purchase of
services from the EU: base → ruta 21, output VAT 2614 → ruta 30, input VAT 2645/2647 → ruta 48,
expense 6570-class. If the provider is Swedish, the fee may be a VAT-exempt financial service or
a 25 % service depending on the product. Golden path 2 books the fee on 6570 without VAT and
flags it. **Q8:** confirm the treatment for the chosen provider once P0 (merchant of record) is
decided; the merchant-of-record model also decides *whose* fee it is.

### 2.6 Bad debt

A confirmed customer loss allows the seller to reduce output VAT. Under accrual the write-off
is 6351 against 1510 with the VAT part reversed from 2611; under cash basis nothing was posted
yet, so the "write-off" is a non-event in the ledger but a `receivable_adjusted{write_off}` in
the kernel. **Q9:** the accounts, and what evidence Skatteverket requires for "konstaterad"
(bankruptcy, failed collection, age?) — this decides what the kernel must record before it lets
a user write off.

## 3. Accounting method: faktureringsmetoden vs kontantmetoden

Below a net-sales threshold a company may use kontantmetoden (bokslutsmetoden): sales and
purchases are booked on payment, unpaid documents at fiscal year end. Blueprint §15.2 makes it a
per-business setting that changes *which event posts revenue and VAT*; the kernel's Pay,
receivable and projection layers are identical (golden path 33 asserts this by comparing its
event sequence with golden path 1's).

Proposal for the year-end booking under cash basis: at fiscal-year end, every open receivable
component posts 1510/1513 against revenue and output VAT with `effective_date` = last day of
the year (journal type `year_end_receivables`), and the payment in the new year posts bank
against 1510 only — i.e. the same accrual posting, deferred. A business switching method at a
year boundary (golden path 38, not yet written) therefore needs no reversal, only a different
trigger from the switch date.

**Q11:** the current threshold and the rule when a business crosses it mid-year. **Q12:** is
the year-end booking done per document (our proposal) or as one aggregate voucher per account,
and does the consultant expect to see the per-document detail in SIE? **Q13:** on switching
cash → accrual at year end, are documents issued before the switch but paid after it posted at
the switch date or at payment?

## 4. Credit notes, corrections and reversals

- A credit note is a new invoice with its own number in the **same series** (§36.1), not a
  `KF-` series outside the counter as `app/api/invoices/credit/route.ts` does today (call-site
  map, tier 2 #7). It posts the mirror of the original and adjusts the receivable
  (`receivable_adjusted{credit}`); it never allocates, so it never fires `payment_received`
  (golden path 10).
- Partial credit: same, with the partial amounts; the original invoice keeps its number and
  status until fully credited.
- Credit after payment: the credit creates a customer balance (2420) or a refund
  (`payment_refunded`), never a negative receivable.
- Correction of a wrong posting: reversal voucher referencing the original, then a new correct
  voucher. Never an edit. Reversal in a locked period is refused; the reversal is dated in the
  first open period with a note.

**Q14:** when the customer has already paid and a credit is issued, is a refund mandatory or is
carrying a customer balance (2420) acceptable, and for how long?

## 5. Fiscal years, periods, voucher series

Proposal: fiscal year per business (may be broken); periods = calendar months; lock per period
with three tiers (as Odoo does: users, journal entries, tax return); voucher numbers per
**series and fiscal year**, allocated in the posting RPC, gapless. Series proposal: `F` customer
invoices and credits, `L` supplier invoices, `B` bank/payments, `M` manual, `IB` opening balance,
`YE` year-end. A failed posting must not consume a number (the number is taken inside the same
transaction as the insert).

**Q15:** does the consultant want one series `A` (common in small companies) or per-source
series, and does the choice affect SIE import into their own tools? **Q16:** who is allowed to
unlock a period, and what must the audit record contain?

## 6. Rounding policy (C1b)

Proposal: a difference with |diff| < 1,00 SEK between an allocated payment and the receivable
is posted to 3740 and the receivable is settled (golden path 36); anything larger stays open
(golden path 37). Overpayment above policy is a customer balance (2420), never 3740 (golden
path 7). No comparison tolerance exists in kernel code; the policy is a posting rule.

**Q17:** the threshold (1,00? 0,99? 0,50?), whether it is symmetric, and whether 3740 is right
for both directions.

## 7. Source documents and provenance

Every voucher references its source event (`source_event_id`) and the posting rule id and
version; every source event references the document (invoice id, supplier invoice id, bank
transaction id). AI involvement and approval provenance ride on the event's `actor` and on the
approval id in the payload (blueprint §14, §36.2). Invoice PDFs, supplier invoice images and
receipts must remain retrievable for the retention period, which outlives the subscription
(track G; the C2 `RESTRICT` FK and `BEHALLS` classification are the first two bricks).

**Q18:** what does the consultant expect to *see* for one voucher when reviewing (the list in
roadmap §13.1 to the auditor).

## 8. SIE

- **Export** (C10): SIE 4 with `#KONTO`, `#SRU`, `#IB`, `#UB`, `#RES`, `#VER`/`#TRANS`, and
  `#DIM`/`#OBJEKT` for project (dimension 6 is customary for project) so the customer's
  consultant can see per-project results. SRU codes come from BAS (Q2 covers the terms).
- **Import** (C4b): opening balances from the previous system's SIE (`#IB`), chart via
  `#KONTO`; never verifications from before cut-over (blueprint §18.4).
- Encoding CP437 on read, and on write for SIE 4 (the consumers expect it); SIE 5 XML later.

**Q19:** which SIE type the consultant's tool imports best (SIE 4 with transactions vs. SIE 1/2
balances only), and whether project dimensions are wanted.

## 9. Opening balances and cut-over (C4b, D4)

Cut-over at a fiscal-year boundary per business: `IB` journal from SIE; every period before
cut-over locked; open receivables at cut-over become `receivable_created{source: opening_balance}`
so that later payments allocate against them without re-recognising revenue (golden path 35).

**Q20:** for a business whose previous year is not yet closed by their accountant at cut-over,
what is the acceptable practice (provisional IB then adjustment voucher)?

## 10. Receivables lifecycle (C14)

| Stage | Kernel | Ledger proposal | Q |
|---|---|---|---|
| Reminder fee | `receivable_adjusted{dunning_fee}` | 1510 / 3591-class | Q6 |
| Interest | `receivable_adjusted{interest}` | 1510 / 8313-class | Q6, Q7 |
| Collection agency | receivable stays ours; agency remits net | bank + agency fee expense / 1510 | **Q21:** account for the agency fee, and whether the fee carries VAT |
| Write-off | `receivable_adjusted{write_off}` | 6351 / 1510, VAT reversal | Q9 |
| Factoring | `receivable_adjusted{ownership_transfer, owner_after: factor}` | bank + factoring fee / 1510 | **Q22:** with or without recourse changes whether 1510 is derecognised; what is common in trades factoring |
| Skatteverket pays less than requested (ROT) | today: no kernel expression (golden path 19 finding) | 1513 → 1510 reclassification, then either new customer invoice or write-off | **Q23:** the practice when Skatteverket rejects part of a ROT claim: re-invoice the customer, or absorb? |

**FK.1 finding from track C:** `receivable_adjusted.reason` has no value for moving an amount
between components (tax_authority → customer). Proposed addition in C4: `reclassification`
with `from_component`/`to_component`. Requires the ARCHITECTURE.md table to change first.

## 11. Minimal SE account set the posting rules need (proposal)

1510, 1513, 1580, 1630, 1930, 2420, 2440, 2611, 2614, 2621, 2624, 2631, 2634, 2641, 2645, 2647,
2650, 3001, 3002, 3003, 3231, 3591(?), 3740, 4010, 4425, 4426, 4427, 6351, 6352, 6570(?),
8313(?). Twenty-nine confirmed-by-nobody numbers. The three with (?) are the ones the model is
least sure of.

## 12. Questions for the accounting consultant — all of them

1. Minimal chart subset + customer import, or full BAS 2026 per K-regelverk?
2. BAS terms for embedding the chart and SRU codes in software.
3. Reverse charge: how buyer status is established and evidenced in practice; who owes VAT when wrong.
4. Reverse charge on mixed invoices: whole invoice or per line?
5. Which Handymate job types are "byggtjänster".
6. Accounts for reminder fee and default interest.
7. Interest: booked when charged, or accrued.
8. PSP fee VAT treatment for the chosen provider; whose fee under the P0 model.
9. Bad-debt accounts and the evidence required for a "konstaterad" loss.
10. Cash basis + ROT: when is VAT posted — customer payment, Skatteverket payment, proportionally?
11. Cash-basis threshold and mid-year crossing.
12. Year-end booking under cash basis: per document or aggregate; SIE expectations.
13. Method switch at year end: documents straddling the switch.
14. Credit after payment: refund mandatory or customer balance acceptable.
15. Voucher series: one `A` or per source.
16. Period unlock: who, and what the audit record must contain.
17. Rounding threshold and account, both directions.
18. What the auditor wants to see for one voucher.
19. Preferred SIE type and dimensions.
20. Cut-over when the prior year is not yet closed.
21. Collection agency fee: account and VAT.
22. Factoring with/without recourse: derecognition.
23. Skatteverket pays less than the ROT claim: practice.

Plus the single artefact that beats every question above: **a SIE 4 export of one pilot
customer's last closed year** (roadmap §13.1).

## 13. Amendment log

| Date | Change | Source |
|---|---|---|
| 2026-09-13 | Created. | Track D, with Odoo core `l10n_se` as reference data |
