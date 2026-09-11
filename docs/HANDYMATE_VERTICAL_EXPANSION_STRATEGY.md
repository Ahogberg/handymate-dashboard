# Handymate — Vertical Expansion Strategy

> Strategic companion to `HANDYMATE_ACCOUNTING_ROADMAP.md`
>
> Core question: **Which recurring expenses and workflows do Handymate customers currently give to other vendors even though Handymate already owns, or can naturally own, the underlying operational data?**

## 1. Strategic direction

Handymate should evolve from an AI administration product into the **operating system for the trades**.

Expansion should not be driven by random feature accumulation. A new vertical is attractive when it:

1. Uses data/workflows Handymate already owns.
2. Removes another vendor or manual process from the customer's stack.
3. Improves the core Handymate experience.
4. Raises ARPU and/or creates a new transaction-based revenue stream.
5. Raises retention/LTV through genuine product utility rather than artificial lock-in.
6. Creates proprietary data that improves other Handymate modules.
7. Can later be localized internationally.

The long-term flywheel:

```text
Demand / Leads
  -> CRM + AI sales
  -> Quote
  -> Project
  -> Workforce + Time
  -> Procurement / Materials
  -> Invoice
  -> Payments
  -> Accounting
  -> Payroll
  -> Financial intelligence
  -> Better pricing / scheduling / purchasing
  -> Better future jobs
```

## 2. Priority verticals

### A. Handymate Pay — highest adjacency

Handymate already creates the commercial event and invoice. Payments are therefore a direct extension.

Potential capabilities:

- Bank payment/payment links
- Swish and/or card through licensed partners
- Automatic invoice matching
- Payment status in project/customer timeline
- Refunds
- Deposits/prepayments
- Partial payments
- Payment reminders
- Automated ledger posting
- Later: Handymate business card/expense card

Target flow:

```text
Invoice -> Pay -> Match -> Reconcile -> Book -> Update project profitability
```

Strategic value:

- Better customer UX
- Faster payment
- Eliminates reconciliation work
- Transaction-based revenue potential
- Gives Handymate real-time cash-flow data
- Makes Accounting materially better

Important: Handymate should initially use regulated payment/banking partners rather than attempting to become a bank or payment institution itself.

### B. Handymate Supply / Procurement

Handymate knows what job is being performed, what was quoted, historical material usage/cost, supplier preferences and required timing.

Potential capabilities:

- Material lists generated from quotes/projects
- Supplier catalog/pricing integrations
- Compare customer-specific supplier pricing
- Purchase orders
- Delivery/pickup scheduling
- Project-level purchasing
- Supplier invoice matching
- Vehicle/warehouse inventory
- Reorder suggestions
- Price inflation detection

Future UX:

> "Materials for Thursday's bathroom project cost SEK X at supplier A and SEK Y at supplier B. Supplier B can deliver Wednesday. Order?"

Revenue opportunities include supplier partnerships, procurement commissions/marketplace economics and premium purchasing automation.

### C. Handymate Payroll / People Operations

Handymate already has much of the source data payroll requires:

```text
employee -> schedule -> project -> check-in -> hours -> absence -> mileage -> payroll
```

Potential capabilities:

- Payroll basis
- Salary runs
- Overtime
- Absence
- Sick pay
- Vacation
- Mileage/travel allowance
- Benefits
- Employer reporting integrations
- Employee documents

Payroll is high adjacency but also high correctness/regulatory risk. Build after the ledger/accounting foundation is stable.

### D. Handymate Capital

Once Handymate owns operational + accounting + payment data, it can understand future cash flow unusually well.

Signals may include:

- Cash balance
- Receivables
- Customer payment behavior
- Signed pipeline
- Future scheduled work
- Expected project margin
- Payroll obligations
- Material commitments

Potential product:

> "Based on scheduled purchases and expected customer payments, cash is projected to fall below the preferred buffer in 24 days. Financing is available through our partner."

Start as embedded financing via regulated lending partners. Do not initially take credit risk onto Handymate's own balance sheet.

Potential revenue: referral/revenue share and eventually deeper embedded-finance economics.

### E. Handymate Fleet

For trades companies, vehicles are mobile offices and warehouses.

Potential capabilities:

- Vehicle registry
- GPS/route data
- Driving log
- Mileage
- Service intervals
- Inspection reminders
- Fuel/charging costs
- Leasing information
- Tools/inventory by vehicle
- Vehicle-level profitability/TCO

Handymate can then proactively identify expensive vehicles, upcoming lease expirations and maintenance needs.

### F. Handymate Insurance

With customer permission and suitable partners, Handymate may know many inputs relevant to commercial insurance:

- Revenue
- Employee count
- Vehicles
- Work categories
- Equipment
- Project sizes
- Geography

Initial model should be insurance distribution/partner integrations rather than Handymate underwriting risk.

Potential categories:

- Business liability
- Vehicle
- Tools/equipment
- Other trade-specific business cover

Handymate can detect when operational changes suggest existing coverage should be reviewed.

### G. Handymate People / Recruiting / Capacity Network

Handymate can identify staffing needs from actual workload before the business owner manually realizes the problem.

Signals:

- Pipeline growth
- Utilization
- Declined work due to capacity
- Skill bottlenecks
- Overtime
- Geographic demand

Potential products:

- Recruiting marketplace
- Candidate matching
- Subcontractor network
- Temporary capacity exchange between Handymate businesses

This can eventually create B2B network effects.

### H. Handymate Marketplace — long-term network layer

Once Handymate has sufficient contractor supply, open a demand-side product for consumers/business buyers.

Consumer flow:

```text
Need + photos + location + timing
  -> Handymate understands/scopes request
  -> matches suitable Handymate businesses
  -> quote/booking
  -> project
  -> payment
```

Handymate's advantage could be matching using actual operational data rather than only reviews/listings:

- Availability
- Skill/job history
- Geographic fit
- Historical pricing
- Conversion
- Completion performance
- Customer outcomes

This creates the strongest potential network effect:

```text
More contractors
 -> better marketplace coverage
 -> more customer demand
 -> more jobs for contractors
 -> more value from Handymate
 -> more contractors
```

Do not prioritize marketplace before sufficient supply density exists.

## 3. Recommended sequence

The likely strategic order is:

```text
Core Handymate / PMF
        |
        v
Accounting foundation <----> Pay
        |                     |
        +----------+----------+
                   v
          Procurement / Supply
                   |
                   v
             Payroll / People
                   |
          +--------+---------+
          v                  v
       Capital              Fleet
          |                  |
          +--------+---------+
                   v
              Insurance
                   |
                   v
       Capacity / Recruiting Network
                   |
                   v
              Marketplace
```

This is directional rather than rigid. Several modules should overlap in development because they strengthen each other.

## 4. Accounting + Pay should be designed together

**Yes: Pay is the most logical product to build in parallel with / immediately after Accounting.**

The reason is architectural, not merely commercial.

Accounting without bank/payment data still requires reconciliation.

Payments without accounting creates another isolated transaction layer.

Together they create a closed financial loop:

```text
Quote
 -> Invoice
 -> Payment request
 -> Money received
 -> Invoice automatically settled
 -> Bank transaction matched
 -> Journal entry created
 -> VAT/accounting updated
 -> Cash flow updated
 -> Project margin updated
```

This is substantially more valuable than either product independently.

### Recommended implementation relationship

Do **not** wait for Accounting to be completely finished before starting Pay.

Suggested overlap:

#### Accounting weeks 1–4
Focus on ledger, journal, posting rules, fiscal periods, audit trail.

At the same time, design the common **Money Movement domain model**:

```text
payment_intents
payments
payment_attempts
refunds
payouts
bank_accounts
bank_transactions
payment_allocations
reconciliation_matches
```

#### Accounting weeks 4–8
Begin payment provider integration and automatic AR matching while Accounting implements AR/AP/VAT/reporting.

#### Accounting weeks 8–12
Integrate the two deeply:

```text
payment_received
 -> payment allocation
 -> receivable settlement
 -> bank reconciliation
 -> ledger posting
```

This creates a much stronger Accounting beta.

## 5. Handymate Pay architecture principles

Build an internal provider-neutral payments domain. Do not scatter a specific PSP's object IDs and semantics across Handymate.

Conceptual architecture:

```text
Handymate
  |
Money Movement Layer
  |
Provider Adapter
  |
Licensed PSP / Bank / Open Banking provider
```

Core internal concepts should remain stable even if providers change.

Important engineering requirements:

- Idempotent webhook/event handling
- Signed webhook verification
- Explicit payment state machine
- Immutable money movement history
- Refund/chargeback handling
- Currency support from day one
- Tenant/business isolation
- Reconciliation identifiers
- Ledger linkage
- Full audit trail
- No assumptions that `payment_received` means funds are irreversibly final

Suggested state concepts:

```text
created
pending
authorized (where relevant)
processing
settled
failed
cancelled
refunded/partially_refunded
disputed (where relevant)
```

Exact states should be normalized from provider-specific states.

## 6. International architecture

The Global Ledger + provider-adapter approach creates an important expansion advantage.

Keep these separate:

```text
Global operational core
Global ledger core
Global money movement core
Country accounting packs
Country tax packs
Country payment-provider adapters
```

A new market should therefore require primarily localization and provider/regulatory work rather than a rewrite of the business platform.

## 7. Revenue model evolution

Long-term customer revenue can become multi-layered:

```text
SaaS subscription
+ Accounting tier
+ Payroll tier
+ Payment revenue share
+ Card economics
+ Financing referral/revenue share
+ Procurement economics
+ Insurance commission
+ Marketplace/lead economics
```

The strategic metric should eventually move beyond only SaaS ARPU toward something closer to:

> **Revenue and value generated per active Handymate business across the full economic relationship.**

However, new monetization must improve customer economics. Handymate should win because the customer saves time/money or makes more money, not because hidden fees accumulate.

## 8. Pricing implications

As Handymate replaces more vendors, willingness-to-pay and LTV should increase materially.

Potential future packaging:

```text
Handymate Core
  AI operations / CRM / sales / projects / invoicing

Handymate Business
  + Accounting
  + Bank/reconciliation
  + Pay
  + Supplier invoices

Handymate Complete
  + Payroll
  + deeper financial automation
  + advanced intelligence

Embedded services
  Payments / Capital / Insurance / Supply
  monetized according to the economics and regulatory structure of each service
```

Exact packaging/pricing should be validated against real customer software spend and willingness-to-pay after launch.

## 9. Vertical prioritization framework

Before committing engineering resources to a new vertical, score it on:

```text
Customer pain
Data adjacency
Workflow adjacency
Revenue potential
Retention impact
International portability
Regulatory complexity
Engineering complexity
Partner dependency
Strategic moat contribution
```

A vertical with high revenue but weak data/workflow adjacency can distract Handymate. Prefer products that make the core operating system better.

## 10. The strategic moat

The individual modules can be copied. The integrated data loop is harder to copy.

Handymate can eventually know:

```text
What demand exists
What the company quoted
What it expected the job to cost
What materials actually cost
How long employees actually spent
When the customer paid
What accounting profit resulted
Which job types are most profitable
What the future pipeline implies
```

That dataset enables an autonomous business advisor that can take actions, not just display dashboards.

Example:

> "Bathroom projects generated an 18.4% gross margin last quarter versus 31.7% for service jobs. Supplier material prices rose 8.2%. I recommend increasing the material markup from X to Y for future bathroom quotes. Apply the change?"

The loop then improves the next quote automatically.

## 11. Long-term positioning

Avoid defining the company too narrowly as "AI admin for trades".

Long-term positioning:

> **Handymate — The operating system for the trades.**

Possible evolution:

```text
AI administration
 -> Operational system of record
 -> Financial system of record
 -> Embedded financial/services platform
 -> Supply + demand network
 -> Trade business operating system
```

The ultimate strategic objective is not maximum feature count. It is to make Handymate the system through which the customer's business naturally operates.
