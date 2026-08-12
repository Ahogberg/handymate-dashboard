# Handymate — Post-Reality Launch Value Wave

**Target launch:** 2026-09-01  
**Purpose:** Prioritize the highest-impact customer-value improvements to consider only AFTER Reality Week / launch validation is substantially green.

This document is deliberately not a backlog of random new features. The guiding principle is:

> **Use the remaining pre-launch window to make Handymate's existing intelligence, automation and learning feel obvious, useful and economically valuable from the first days of use.**

The strongest direction is to make three product promises unmistakable:

> **På morgonen:** Handymate har redan gått igenom firman.  
> **Under arbetsdagen:** Säg vad som händer en gång — Handymate tar det vidare.  
> **I slutet av veckan:** Här är vad Handymate gjorde och vad det var värt.

Internal shorthand:

# Morgon → arbete → kvitto

---

# 1. First 30 Minutes / Instant Company Scan

## Thesis

A new company starts with almost no Handymate history. The risk is therefore that a very powerful product feels empty on day one.

The onboarding should aim for:

> **Ge Handymate 15 minuter så börjar teamet jobba.**

After company setup, integrations and/or import, Handymate should perform an initial Company Scan using data that is actually available.

Potential result:

```text
Matte sätter upp firman…

✓ 347 kunder hittade
✓ 18 öppna fakturor analyserade
✓ 11 pågående projekt identifierade
✓ 7 offerter hittade
✓ 4 saker behöver din uppmärksamhet
✓ Karin hittade 63 400 kr i utestående kundfordringar
✓ Daniel hittade 3 offerter som borde följas upp
✓ Lars har börjat bevaka 6 aktiva projekt
```

Then the user lands directly in the Command Center:

> **Handymate är igång. Här är vad teamet hittade.**

This is a much stronger activation experience than:

> Välkommen — skapa ditt första projekt.

## Why this matters

- dramatically lowers time-to-value
- immediately explains the agent model
- creates an early ROI story
- connects Företagskollen / sales promises to the real product
- lets imported historical data create value on day one

## Guardrails

- Never invent findings merely to make onboarding look exciting.
- Clearly separate imported facts, identified opportunities and estimated value.
- Empty integrations should degrade honestly and still give the user useful next steps.

## Priority

**Very high if Reality Week is green.**

---

# 2. Agent Presence Everywhere — but never Clippy

## Thesis

Handymate's agents should not feel like separate AI pages.

The user should experience that the digital team is present in context across the operating system.

Examples:

### Quote

**Daniel**  
> Jag hittade två lärdomar från liknande jobb.

### Project

**Karin**  
> Den här kalkylen börjar röra sig.

### Customer

**Matte**  
> Ni lovade att återkomma om materialpriset.

### Invoice

**Karin**  
> Den här brukar jag kunna följa upp åt dig.

## UX principle

The system must remain restrained:

- max one relevant intervention at a time
- contextual, not random
- dismissible
- respect dismissal / snooze
- priority based on impact, confidence and urgency
- never repetitive

The desired visual message is:

> **Teamet finns faktiskt överallt i systemet.**

## Priority

Use mainly as a polish/composition layer around already-built intelligence.

---

# 3. Explainability — “Why does Handymate know this?”

## Thesis

As Handymate becomes more intelligent, trust UX becomes more valuable.

Every important AI-derived suggestion should ideally make its evidence understandable.

Example:

> Kunden verkar vilja ha ek.

CTA:

**Varför säger Handymate det?**

Reveal:

```text
Kundmöte · 11 augusti 14:32
“…vi föredrar nog ek framför ask…”

Bekräftat av Andreas · 11 augusti
```

Margin Guardian example:

> Möjligt ÄTA · 7 800 kr

**Så kom Karin fram till det**

```text
Accepterad offert
→ spotlights saknas

Kundmöte
→ kunden bad om 6 spotlights

Projekt
→ inget godkänt ÄTA finns
```

## Strategic value

This turns AI from black-box magic into understandable operational reasoning.

For skeptical trade-company owners, this can become a meaningful competitive advantage.

## Priority

High-value polish, especially around:

- Margin Guardian
- Customer Facts
- Meeting Intelligence
- Revenue Recovery
- Playbook recommendations

---

# 4. Distributed Value Receipts — “Handymate did this”

## Thesis

Value Ledger should not only exist as one retrospective dashboard.

The product should continuously give small receipts showing what just happened and why it mattered.

Examples:

### Invoice reminder

> ✓ **Karin skickade påminnelsen**  
> 18 400 kr bevakas nu.

### ÄTA

> ✓ **ÄTA godkänt**  
> 7 800 kr har gått från möjlig intäkt → godkänt arbete.

### Meeting Intelligence

> ✓ **Matte tog hand om mötet**  
> 3 uppgifter skapade  
> 1 kundpreferens sparad  
> 1 möjligt ÄTA väntar på dig

### Debrief

> ✓ **Handymate lärde sig något**  
> Daniel kommer ta hänsyn till detta vid liknande offerter.

## Product principle

The customer should repeatedly experience:

> **Aha — det var därför jag betalar för Handymate.**

## Truthfulness

Maintain strict status semantics:

```text
identified ≠ actioned ≠ invoiced ≠ paid
```

Do not call something recovered revenue until the economic outcome is actually verified.

---

# 5. Weekly Owner Report

## Thesis

A concise weekly owner report is potentially one of the highest-impact retention features relative to implementation effort because most of the underlying data already exists.

Potential format:

# Veckan med Handymate

## Pengar

+ 24 800 kr nya offerter accepterade  
+ 7 800 kr ÄTA godkända  
+ 18 400 kr fakturerat  
⚠ 31 200 kr kräver uppmärksamhet

## Projekt

3 går enligt plan  
1 behöver dig  
2 avslutades

## Sälj

4 nya leads  
3 offerter skickade  
2 behöver följas upp

## Handymate-teamet

Matte hanterade 8 möten  
Karin bevakade 12 ekonomihändelser  
Daniel följde 5 offerter  
Lars övervakade 6 projekt

## Lärt sig den här veckan

> Badrumsrivning tenderar att ta längre tid än kalkylerat.

CTA:

> **Öppna veckans viktigaste saker**

## Strategic value

The report creates a recurring reminder that:

> **Handymate jobbar även när ägaren inte sitter i systemet.**

Strong potential impact on:

- retention
- perceived subscription value
- habit formation
- owner oversight
- expansion/upgrades

---

# 6. Mobile “Säg det en gång” / Field Command

## Thesis

If Reality Week confirms that Matte + tool routing + mobile are sufficiently stable, the mobile product should increasingly allow the tradesperson to describe what happened once and let Handymate distribute the information correctly.

Example voice input:

> “Matte, vi är klara här. Lägg till två timmar på mig och Johan, kunden ville också ha en extra list i hallen och boka återbesök nästa torsdag.”

Handymate parses:

```text
✓ +2 h Andreas
✓ +2 h Johan
⚠ Extra list → möjligt ÄTA
✓ återbesök nästa torsdag
```

CTA:

> **Godkänn allt**

## Strategic significance

This is “Säg det en gång” applied to the actual workday.

The broader target becomes:

> **Ägaren arbetar i firman. Handymate dokumenterar firman.**

This may become one of Handymate's strongest category-defining product experiences.

## Guardrails

- Consequential writes still respect approval/action contracts.
- Ambiguous entity resolution must fail safely.
- Do not infer price or billable scope without evidence.
- Voice is an input layer, not a separate business brain.

---

# 7. Project Closeout Magic

## Thesis

Project completion should become the visible payoff of the full Handymate learning loop.

Potential experience:

# Storgatan är klar

## Resultat

Offert: 184 000 kr  
ÄTA: +14 600 kr  
Slutvärde: 198 600 kr

Förväntad marginal: 28 %  
Utfall: ~25 %

## Handymate under projektet

2 möjliga ÄTA upptäckta  
1 kundlöfte fångat  
3 möten sammanfattade  
7 800 kr återvunnet via Guardian

Then:

> **Tre snabba så blir nästa liknande jobb bättre.**

Voice/text Debrief follows.

After completion:

> ✓ Tack. Daniel kommer använda lärdomen nästa gång.

## Why this matters

The user sees the entire moat loop in one moment:

```text
quote
→ project
→ changes
→ margin protection
→ outcome
→ debrief
→ future learning
```

This makes the learning system tangible instead of hidden architecture.

---

# 8. Demo Story — make it theatrical

## Thesis

For founder-led sales, the demo should tell one coherent operating story rather than tour menus.

Potential narrative:

# 08:07 — Du kommer till jobbet

Matte:

> God morgon. Jag har redan gått igenom firman.

Then:

**Karin**  
> Ett projekt riskerar marginal.

**Daniel**  
> En offert börjar kallna.

**Matte**  
> Kunden på Storgatan bad om något nytt i gårdagens möte.

The salesperson moves through one connected story where each action creates the next consequence.

The demo ends with:

# Den här veckan hade Handymate…

and the Value Ledger / receipts summarize what happened.

## Goal

A prospect should leave thinking:

> **Den här grejen verkar faktiskt driva firman åt mig.**

not merely:

> De har många smarta funktioner.

---

# Recommended Top 3 after a green Reality Week

If only three significant pre-launch improvements fit safely into the remaining window:

## 1. First 30 Minutes / Instant Company Scan

Primary effect:

**Activation / time-to-value**

A new company should experience useful Handymate intelligence immediately.

## 2. Weekly Owner Report + Distributed Value Receipts

Primary effect:

**Retention / willingness to pay / ROI visibility**

Handymate continually proves that it is working.

## 3. Mobile “Säg det en gång” / Matte Field Command

Primary effect:

**Differentiation / real-world usability**

The tradesperson can work naturally while Handymate handles structured administration around them.

---

# Supporting polish layer

Where implementation cost is low, reinforce the top three with:

- contextual Agent Presence
- Why Handymate Knows This / evidence reveal
- Project Closeout Magic
- Demo Story polish

These should mainly compose existing primitives rather than introduce new subsystems.

---

# What NOT to rush before launch

Even after a clean Reality Week, avoid reopening large architectural bets immediately.

Candidates better suited for post-launch evidence:

- full Expectation Drift
- large generic semantic Company Search
- major new agent personas
- predictive scheduling engines
- broad new knowledge graphs
- large autonomous workflow expansions without production evidence

The pre-launch window should favor:

> **composition + activation + trust + visible ROI**

over:

> feature count.

---

# Final Product Principle

The ideal product experience should increasingly map to one simple daily story:

## MORNING

> **Handymate har redan gått igenom firman.**

The owner immediately sees:

- what needs attention
- what risks money
- what Handymate is already handling

## WORKDAY

> **Säg vad som händer en gång. Handymate tar det vidare.**

Meetings, calls and voice inputs become structured business actions without duplicate administration.

## END OF WEEK

> **Här är vad Handymate gjorde och vad det var värt.**

The owner receives a truthful receipt for outcomes, actions, learning and identified opportunities.

# Morgon → arbete → kvitto

This should be treated as a candidate product narrative for launch and early GTM, not just an internal roadmap mnemonic.

---

# Decision gate

Do not execute this roadmap automatically.

After Reality Week / Launch Jury, rank each item against:

- actual customer-value gaps discovered in testing
- regression risk
- remaining calendar time
- onboarding/demo readiness
- mobile readiness
- production evidence

A successful Reality Week may justify one or more of these. A problematic Reality Week should override this document and keep the focus on launch correctness.
