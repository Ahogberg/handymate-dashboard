# Open-source and open-standard landscape for Swedish accounting — what Handymate reuses, references, and avoids

> Status: Research record, 2026-09-13. Inputs to package briefs C4b, C9, C10, C11, C13 and to open decision D3.
> Method: web search plus direct reads of repositories and manifests on 2026-09-13. Swedish
> public-sector sites (skatteverket.se, bolagsverket.se, bas.se, sie.se, taxonomier.se) were
> not directly readable from the research environment; claims about them come from search
> excerpts and from third-party implementations that consume them, and are marked *(indirect)*.
> Verify each before relying on it in a package.
> Owner of the conclusions: Andreas. Nothing here changes an architecture rule.

## 0. The one-paragraph answer

Nobody has open-sourced a Swedish trades-company ledger we can adopt, and the kernel must not
be built on someone else's data model (parent §31, roadmap §21.1). But the *formats* the
kernel has to speak are all open and several have reference implementations: SIE 4/5, the
VAT return's box structure, the ROT/RUT request XML, ISO 20022 bank statements, Peppol
invoices, and the digital annual report. The highest-value reuse is **machine-readable
reference data and executable format specifications**, not application code. The single
biggest finding is not open source at all: Skatteverket's Momsdeklaration API exists since
November 2025 and changes the shape of D3.

## 1. Verdict table

| Area | Asset | Licence | Verdict | Feeds package |
|---|---|---|---|---|
| Chart of accounts | Odoo core `l10n_se` account template (282 accounts, classes 1–9) | LGPL-3 | **Reference data.** Cross-check our SE country pack's account list against it; do not import as truth — the accountant confirms every number (orchestration C9). | C9 |
| VAT | Odoo core `l10n_se` tax templates incl. *omvänd skattskyldighet* construction (posts 2647 / 2614) and EU/import variants | LGPL-3 | **Reference data.** The reverse-charge posting pattern is exactly the F1 gap; use as the first candidate posting rule to put in front of the accountant. | C9 |
| VAT return | Odoo core `l10n_se` tax report: boxes 05–08, 10–12, 20–24, 30–32, 35–42, 48, 49, 50, 60–62 as tag expressions | LGPL-3 | **Reference data.** A complete, machine-readable box map including reverse charge on both sides (§15.3). Turn into the C13 golden-path fixtures. | C13 |
| VAT filing | Skatteverket **API för Momsdeklaration 1.0** (partner API, OAuth2 cert / e-legitimation, live 2025-11) *(indirect)* | Terms of use | **Adopt, later.** Prepare-and-submit is possible; signing is not. Input to D3, see §4. | C13, D3 |
| VAT filing | Vertel `l10n_se_skatteverket_api` + `l10n_se_tax_report` (Odoo, integrates the API above for moms and skattekonto) | AGPL-3 | **Read as proof-of-integration only.** AGPL: never copy code into Handymate. Shows the partner agreement is obtainable. | C13 |
| SIE | Format specifications SIE 1–4 and SIE 5 (XML), published by SIE-Gruppen; free to implement, certification for members *(indirect)* | Open spec | **Implement ourselves** (SIE 4 reader + writer, SIE 5 later). The format is small. | C4b, C10 |
| SIE | `barsoom/sie` (Ruby, MIT, parser + generator, 151 commits) | MIT | **Reference implementation** for our TS writer; reuse its fixtures as test inputs. | C4b, C10 |
| SIE | `holar2b/node-sie-reader` = npm `sie-reader` (MIT, read-only, CP437→UTF-8), `airnumby/libsie` (MIT, reader/writer, 7 commits), `TechMDW/sie-parser` (WIP, 2 commits) | MIT / unstated | **Do not depend on.** Thin, unmaintained. The CP437 handling is the one thing worth copying the idea of. | C4b |
| SIE | Vertel `l10n_se_sie` (import only), `vibloteket/bokfri` (Java, GPL-3, import + export + BgMax) | AGPL / GPL | **Reference behaviour only.** Useful for edge cases (#IB/#UB/#RES, dimensions). | C4b |
| ROT/RUT | Skatteverket HUS schema v6: `Begaran.xsd`, `BegaranCOMPONENT.xsd`; rules: ROT and RUT never in one file, requested ≤ paid, requested + paid ≤ labour cost, same payment year, ≤ 100 buyers *(indirect)* | Official schema | **Adopt.** The XSD is the contract; validate against it in CI. The e-service enforces the business rules, so our golden paths must too. | C4, C14 |
| ROT/RUT | `elialm94/driva` (Next.js + Supabase, AI-native SME admin: bokföring, moms, ROT/RUT HUS v6 export, SIE, OCR matching) | **Licence not verified** | **Read for structure, do not copy.** Closest stack to ours. Their PR #110 documents the HUS v6 export end to end. Check the licence before reading code closely. | C4, C14 |
| Bank | ISO 20022 `camt.053`/`camt.054` (Bankgirot and banks retiring BgMax; Handelsbanken drops BgMax 2026-05-31) *(indirect)* | ISO schema | **Adopt camt as the primary bank format.** Do not build on BgMax. | C11 |
| Bank | `darko-mijic/iso-20022-camt-053-parser` (TS, MIT, camt.053 only, 5 commits); `jonpetterbergman/bgmax` (Haskell, BSD-3, validated against Bankgirot examples) | MIT / BSD | **Do not depend on.** Write our own camt reader from the XSD; use the Haskell BgMax parser's record coverage as the checklist if BgMax is ever needed. | C11 |
| Bank | OCR reference numbers: Luhn check digit, optional length digit, 2–25 digits *(indirect, Bankgirot manual)* | Public rule | Trivial; implement with tests. Odoo core `l10n_se` also carries OCR handling. | C4, C11 |
| E-invoicing | `OpenPEPPOL/peppol-bis-invoice-3` (official schematron rules, UBL examples); Swedish validator sfti.validex.net *(indirect)* | OpenPEPPOL terms | **Later.** Mandatory only for public-sector buyers today. Keep the invoice domain able to emit UBL when a pilot needs it. | post-C14 |
| Annual report | Bolagsverket digital årsredovisning: iXBRL mandatory for fiscal years starting after 2025-12-31, submissions during 2027; taxonomies on taxonomier.se; submission API *(indirect)* | Official | **Out of near scope.** Note that "replace Fortnox" will be measured against this in 2027. | roadmap |
| Company data | Skatteverket developer portal: partner APIs (Momsdeklaration, INK2 hämta, skattekonto), company-information API in development *(indirect)* | Partner terms | Track. | C13, later |
| Ledger apps | `e9wikner/bok` (Python/FastAPI + Next.js, MIT, BFL + BFNAR 2013:2, BAS 2026, K2, "bokföring för agenter": operating rules served by the API), `jonah855/minbokforing` (Python, hash chain between vouchers, correction by reversal, licence unstated), `Lsjbot/LsjBok` (Windows) | MIT / unstated | **Patterns, not code.** Two ideas worth stealing: rules-served-by-API as part of system behaviour (matches §40.3 rulebook), and a hash chain over vouchers (a cheap, strong answer to §36.1 unbroken series). | C8 |
| ERP | Odoo 19 Community `account` module: lock dates in three tiers, reversal preserving both entries, reconciliation models; OCA `account-reconcile` | LGPL-3 | **Design reference for C8/C11 and candidate shadow reference (shadow §21.5 option 4).** Never the ledger. | C8, C11, C12 |
| Desktop | GnuCash | GPL | Not applicable to a SaaS. | — |
| Commercial | KAPITAS 59 kr/mån | — | Price floor for bare bookkeeping; confirms roadmap §18 that the ledger is commoditised. | pricing |

No OCA `l10n-sweden` repository exists (404 on 2026-09-13); Vertel's `odoo-l10n_se` is the de
facto community localisation, and Odoo SA's core `l10n_se` is the permissively licensed part.

## 2. Licence rules for this initiative

- **AGPL-3** (Vertel modules): read to learn, never copy, never link. Handymate is a hosted
  service; AGPL's network clause would apply to derived code.
- **GPL-3** (Bokfri): same rule.
- **LGPL-3** (Odoo core): reference data and behaviour. Account numbers and box codes are
  facts published by BAS and Skatteverket; re-deriving them from the official sources with the
  accountant is both the licence-clean and the orchestration-correct path (C9: "a model's
  plausible BAS number is a proposal"). Do not vendor Odoo's CSVs.
- **MIT/BSD**: fixtures and small utilities may be reused with attribution; nothing here is
  mature enough to take a runtime dependency on.
- **Unverified** (driva, minbokforing): treat as all-rights-reserved until checked.
- **BAS chart of accounts itself**: BAS publishes PDF/Excel; the terms for embedding in
  software were not readable from here. Confirm with BAS before shipping the chart in
  product. Vendors clearly do, but the terms must be on file.

## 3. Odoo as a second shadow reference (shadow §21.5 option 4) — evaluation

What it gives: an independent derivation of journal entries and balances from the same
source documents, with community-maintained Swedish tax rules, reachable today and touching no
customer connection. That fills Levels 2–3 of the comparison ladder, which the current Fortnox
grant cannot.

What it does not give: accountant-grade truth. Odoo's Swedish localisation is maintained by a
community and by one vendor; its reverse-charge and cash-basis handling must be checked by
the same manual rulebook track (R0) that checks ours. Two independent wrong answers can agree.

Cost and shape: one hosted Community instance per pilot cohort; a reference adapter
(shadow §3) that creates invoices/bills/payments through Odoo's API and reads `account.move`
lines back into `shadow_reference_snapshots`. Odoo's own SIE export is not in core, so
comparison is at the object and aggregate level, which is exactly Levels 2–3.

Recommendation to the owner: accept option 4 as a complement to the 2026-09-12 decision
(option 2), scheduled with C12, and make R0 the tie-breaker whenever the two references
disagree.

## 4. Input to open decision D3 (file vs produce the momsdeklaration)

Skatteverket's API för Momsdeklaration 1.0 went live in November 2025. A partner system can
create and manage the return's basis, submit it, and read back submitted returns and
decisions. **The signature that constitutes filing still happens at Skatteverket by the
taxpayer and cannot be done via the API** *(indirect, Skatteverket and Fortnox
announcements)*. Consequences:

- "Handymate files the return" in the strong sense is not available to any vendor.
- The realistic choice is *produce-only* versus *prepare-and-submit, customer signs*. The
  second is what the market leaders now do and keeps the bookkeeping obligation with the
  customer by construction (§40.1).
- Getting the partner agreement is a Sprint −1 counterparty task with unknown lead time; a
  one-person vendor (Vertel) has it, so it is obtainable.

The decision stays with the owner (§38.3). This section only narrows it.

## 5. What goes into which brief

- **C4b (opening balances, SIE import):** implement SIE 4 reading in TS against the official
  spec; take `barsoom/sie` fixtures and Bokfri's export as cross-check inputs; CP437 decoding
  is mandatory; `#IB`, `#UB`, `#RES`, `#KONTO`, `#SRU` and dimensions (`#DIM`/`#OBJEKT`) must
  round-trip.
- **C9 (SE posting rules):** put Odoo's reverse-charge construction template
  (2647/2614 pattern) and its domestic/EU/import variants in front of the accountant as the
  first proposal set. Record where our rules differ and why.
- **C10 (SIE export):** SIE 4 writer, then SIE 5 XML; validate exports by importing them into
  Bokfri and into an Odoo instance and comparing balances.
- **C11 (bank):** camt.053/054 first; OCR Luhn; no BgMax unless a pilot bank still requires it.
- **C13 (VAT return):** box map from Odoo's tax report as the fixture skeleton; design the
  output so it can both render the return and feed the Momsdeklaration API.
- **C14 / ROT-RUT:** HUS schema v6 XSD in the repo, validated in CI; e-service business rules
  as golden paths.
- **C8 (ledger core):** consider a per-business hash chain over posted vouchers as the §36.1
  integrity mechanism; steal the "rules served by the API" idea for the rulebook.

## 6. Sources

Direct reads: [odoo/odoo l10n_se manifest](https://raw.githubusercontent.com/odoo/odoo/18.0/addons/l10n_se/__manifest__.py), [tax report data](https://raw.githubusercontent.com/odoo/odoo/18.0/addons/l10n_se/data/account_tax_report_data.xml), [tax templates](https://raw.githubusercontent.com/odoo/odoo/18.0/addons/l10n_se/data/template/account.tax-se.csv), [account template](https://raw.githubusercontent.com/odoo/odoo/18.0/addons/l10n_se/data/template/account.account-se.csv); [vertelab/odoo-l10n_se](https://github.com/vertelab/odoo-l10n_se) and its manifests for `l10n_se_sie`, `l10n_se_tax_report`, `l10n_se_skatteverket_api`; [barsoom/sie](https://github.com/barsoom/sie); [holar2b/node-sie-reader](https://github.com/holar2b/node-sie-reader); [airnumby/libsie](https://github.com/airnumby/libsie); [TechMDW/sie-parser](https://github.com/TechMDW/sie-parser); [magnusfroste/sie-parser](https://github.com/magnusfroste/sie-parser); [darko-mijic/iso-20022-camt-053-parser](https://github.com/darko-mijic/iso-20022-camt-053-parser); [jonpetterbergman/bgmax](https://github.com/jonpetterbergman/bgmax); [OpenPEPPOL/peppol-bis-invoice-3](https://github.com/OpenPEPPOL/peppol-bis-invoice-3); [vibloteket/bokfri](https://github.com/vibloteket/bokfri); [elialm94/driva](https://github.com/elialm94/driva) and [PR #110](https://github.com/elialm94/driva/pull/110); [e9wikner/bok](https://github.com/e9wikner/bok); [jonah855/minbokforing](https://github.com/jonah855/minbokforing); [sambruk/Open-Accounts-Payable](https://github.com/sambruk/Open-Accounts-Payable).

Indirect (search excerpts only): [Skatteverket — Momsdeklaration 1.0 API overview](https://www7.skatteverket.se/portal/apier-och-oppna-data/utvecklarportalen/api/momsdeklaration/1.0.20/%C3%96versikt), [tjänstebeskrivning](https://www7.skatteverket.se/portal-wapi/open/apier-och-oppna-data/utvecklarportalen/v1/getFile/tjanstebeskrivning-momsdeklaration-v1-0/pdf/1.0.7/Tjanstebeskrivning-Momsdeklaration-v1.pdf), [Fortnox on the API](https://www.fortnox.se/fortnox-foretagsguide/driva-foretag/skatt/forenkla-momsdeklarationen-med-skatteverkets-nya-api), [Skatteverket — lämna momsdeklaration via fil](https://www.skatteverket.se/foretag/moms/deklareramoms/lamnamomsdeklarationviafilietjansten.4.2fb39afe18dabf1e4d223cc.html), [Skatteverket — schema för rot och rut](https://www.skatteverket.se/foretag/etjansterochblanketter/allaetjanster/schemalagerxml/rotochrutforetag.4.71004e4c133e23bf6db800063583.html), [regler för att importera fil till Rot & rut](https://www.skatteverket.se/privat/sjalvservice/allaetjanster/tjanster/rotrut/reglerforattimporterafiltillrotrut.4.76a43be412206334b89800033198.html), [Skatteverkets API:er och öppna data](https://www.skatteverket.se/omoss/digitalasamarbeten.4.3684199413c956649b56298.html), [SIE 5 specification PDF](https://sie.se/wp-content/uploads/2020/08/SIE-5-rev-161209-konsoliderad.pdf), [sie.se/format](https://sie.se/format/), [SIE (Wikipedia)](https://en.wikipedia.org/wiki/SIE_(file_format)), [BAS kontoplaner](https://www.bas.se/kontoplaner/), [BAS changes 2026](https://www.bas.se/2025/12/04/andringar-i-kontoplanen-2026/), [Bolagsverket — API for digital submission](https://bolagsverket.se/apierochoppnadata/lamnaforetagsinformation/digitalinlamningavarsredovisningochrevisionsberattelse/apiforanslutningtilldigitalinlamningavarsredovisningochrevisionsberattelse.5936.html), [Bolagsverket iXBRL application guidance 1.8](https://bolagsverket.se/download/18.2733cf65187efcf5c7e5b972/1700048440182/tillampningsanvisningar-arsredovisning-ixbrl-1-8.pdf), [Handelsbanken on ISO 20022](https://www.handelsbanken.se/sv/foretag/konton-betalningar/forbattrad-standard-for-betalningar), [Bankgirot OCR reference check](https://www.bankgirot.se/tjanster/inbetalningar/bankgiro-inbetalningar/ocr-referenskontroll/), [Odoo 19 bank reconciliation docs](https://www.odoo.com/documentation/19.0/applications/finance/accounting/bank/reconciliation.html), [OCA/account-reconcile](https://github.com/OCA/account-reconcile).

## 7. Amendment log

| Date | Change | Source |
|---|---|---|
| 2026-09-13 | Created. | Research session, Andreas's question from the Vibe Coding Sverige thread |
