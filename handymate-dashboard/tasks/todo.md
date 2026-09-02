# Bygglistan 1–2: Referral-stämpeln + självgående onboarding (2026-09-02)

Plan: `C:\Users\Gaming\.claude\plans\cozy-crafting-reef.md` (godkänd 2026-09-02).
Beslut från Andreas: belöning = en månad gratis (Stripe-kundsaldo); stämpeln på alla kundvända dokument.

## Etapp A — "Skickat via Handymate" (worktree `.worktrees/attribution`, branch `feature/attribution-stamp`)

- [x] A1 `lib/branding/attribution.ts` — helper + rena tester (a4a072c3)
- [x] A5 `sql/v202_attribution_link_enabled.sql` + toggle i Inställningar (1f4e4ddb) — omdöpt från v200 (Codex tog v200/v201), KÖRD+verifierad via MCP 2026-09-02
- [x] A3 `app/via/[code]/page.tsx` — publik landningssida + `landing_events`-logg (33cacbf4)
- [x] A2a e-postvägar: quotes/send, send-invoice, invoice-reminder-send, portal notification-emails, orders/send (cbe8eba6)
- [x] A2b PDF: quote-/invoice-templates (4), pdf-generator (2), ata/pdf, job-report (cbe8eba6)
- [x] A2c publika sidor: PortalHandymateAttribution (+monteringar), quote/[token], jobbpass, lead-portal, rekommendera, widget (d1646ab4)
- [x] A4 belöningen: `grantReferralMonthCredit` (Stripe-kredit), död kod bort, SMS/sidtext (54d55bcf)
- [x] A6 facit — delat på fyra specar (`facit-attribution-{email,pdf,pages}`, `attribution-helper`, `via-landing`, `referral-reward`) i stället för en; parity-tester gröna
- [x] Verifiering 2026-09-02: tsc 0 fel, 242/242 playwright gröna (listan + partner-*, parity, onboarding-*, permission-contract, activation-metrics, facit-outbound-truth); npm run build — se granskning
- [x] Oberoende granskning av hela diffen (subagent) + åtgärder (95c6fd63) — 250/250 gröna, build exit 0 efteråt

## Etapp B — självgående onboarding (worktree `.worktrees/onboarding-hardening`)

- [ ] B1 `lib/admin/adoption.ts` + pilots-route + admin-vy + `tests/adoption.spec.ts`
- [ ] B2 betalgrind allowlist, `paid` från GET, verify-route + polling, PUT-tak `<= 8`, döda routes bort, tester
- [ ] B3 `email_inbound_route` auto-provision vid finalize + 46elks-retry-cron
- [ ] B4 livscykelmail dag 2/14 (generaliserad dag-7-cron)
- [ ] B5 Genomgången för ny firma utan import
- [ ] B6 `tests/e2e-onboarding-fresh.spec.ts`
- [ ] Verifiering: tsc, next build, playwright-listan, MCP-SELECT för berörda konton

## Granskning

### Etapp A (2026-09-02, oberoende Fable-granskare över origin/main..HEAD)

Inget blockerande. Multi-tenant håller (alla `loadAttribution` på rätt business_id), v202-toleransen verklig (kolumnen bara i helperns primär-select med fallback + settings egna update), inga queries i loopar, `/via` läcker bara det som redan är publikt på storefronten. `referrals`-tabellen är tom i prod → statusändringen `active`→retry påverkar inga legacy-rader.

Åtgärdat (95c6fd63):
- **Dubbelkredit-fönstret**: `rewarded`-uppdateringen saknade felkoll och låg efter SMS:et; Stripes idempotencyKey gäller 24 h. Nu: rewarded direkt efter krediten + felkoll, `metadata.referral_id` på saldotransaktionen + kontroll mot `listBalanceTransactions` före skrivning = permanent idempotens.
- **Osynlig utebliven kredit**: ingen adminyta listar kund-referrals → `rapporteraTystFel` i båda felgrenarna.
- **Toasten ljög före v202**: sa "sparat" när länkvalet inte gick att spara → egen feltoast.
- `/via`: `cache()` runt uppslaget (var två queries/visning), okända koder loggas inte.
- Riktiga enhetstester för `loadAttribution`-fallbacken och `stampAttributionOnPdf` (var bara källskannade).

Medvetet lämnat:
- Dubbel stämpel på `/quote/[token]` (dokumentets fot i iframen + sidans fot) — länken i sandbox-iframen öppnas inuti A4-rutan. Kosmetiskt; åtgärd = `allow-popups` + `target=_blank` i dokumentvarianten. Ta vid Claude Design-passet på offertytan.
- `quotes/send` bygger stämpeln på inloggat konto, inte `quote.business_id` — samma som `business_name`/`logo_url` redan gör i multikonto-fallbacken; befintligt mönster.
- Årskund som referrer får krediten på nästa faktura (kan vara 11 mån bort). Beslut, inte bugg.
- Ingen rate-limit på `/via` (koder = ~9 000 gissningar per prefix; det som läcker är redan publikt).

Kvar för Andreas: skarptest enligt planen (offert → fot → `/via` → `landing_events`; toggeln av → utan länk), Stripe test-mode-prov av krediten.
