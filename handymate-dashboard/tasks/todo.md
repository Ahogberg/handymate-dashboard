# Sanering — tyst döda automationer (audit 2026-08-05) — KLAR

_Plan 2026-08-05. Underlag: två audit-svep + Andreas pg_constraint-koll.
FK-facit från prod: quotes/invoice/project/time_entry har customer-FK →
embed-klustren FRISKA (quote-nudge-kommentaren var fel). deal.customer_id
SAKNAR FK → deal→customer-embedden död. pending_approvals→customer-embed
(dashboard/today:241) overifierad — kontrolleras i sprinten._

## Del 1 — Namnfel (bevisbart trasiga, mekaniska fixar)

- [ ] lib/admin-auth.ts:60 admin_audit_log→admin_actions_log (admin-audit tom i prod)
- [ ] app/dashboard/customers/[id]/page.tsx:288,308 projects→project (+ PK
      id→project_id) — kundens projektlista + projektbokningar
- [ ] app/api/customers/[id]/timeline/route.ts:404 projects→project
- [ ] app/api/portal/[token]/activity/route.ts:68 project_photo→project_photos,
      :89 project_tracker_stage→project_stages — portalens foton/etapper
- [ ] app/dashboard/projects/[id]/page.tsx:4159,4187 work_order→work_orders
- [ ] activity→customer_activity ×3 (invoice-reminder-send:200,
      auto-invoice-on-complete:354, invoices/send:278)
- [ ] app/api/quotes/send/route.ts:406 död customers-fallback bort
- [ ] approvals-routen :1067 automation_logs→v3_automation_logs med rätt
      kolumner + approval_id (warranty-exekveringen)

## Del 2 — Trasiga v3-logg-inserts

- [ ] quote-confirmation-email:110, on-my-way:162, job-report:149+347 —
      okända kolumner (action_taken/success), saknar action_type/status
- [ ] status 'completed'→'success': matte/agent-router:30,
      matte/action-executor:247, project-stages/automation-engine:175;
      pipeline/deals:135-filtret läser 'completed' → 'success'

## Del 3 — leads CHECK-brott (lead markeras aldrig avvisad)

- [ ] approvals-routen :274 status 'declined'→'lost'
- [ ] automation-engine :615 status 'rejected'→'lost'

## Del 4 — Mattes tysta tomma kontext

- [ ] matte/resolver:149 + morning-brief:78 pipeline_stage→pipeline_stage_key
- [ ] matte/resolver:142 booking-filter på 'completed' som aldrig skrivs →
      rätt kolumn (job_status)

## Del 5 — deal utan customer-FK

- [ ] e2e-deal-flow:1073 embed → separat kundhämtning
- [ ] Kontrollera dashboard/today:241 pending_approvals→customer-embedden
- [ ] sql/v87_deal_customer_fk.sql till Andreas körlista (FK:n bör finnas
      på sikt — separat hämtning gör koden oberoende av den)

## Del 6 — Schema-kontraktstestet (guardrail — hela felklassen)

- [ ] tests/schema-contract.spec.ts: extraherar alla .from('...')-namn ur
      lib/app/components och validerar mot facit byggt av sql/-mappens
      CREATE TABLE + RENAME + dokumenterad vitlista (bastabeller utan
      sql-fil: business_config, customer, booking, quotes, invoice,
      price_list; manuellt skapade: customer_activity, sms_campaign,
      sms_campaign_recipient, material_order, human_followup_queue,
      case_record[TODO utred])
- [ ] Testet ska FAILA på alla Del 1-namnen före fix (verifiera), grönt efter

## Verifiering

- [ ] npx tsc --noEmit — 0 fel
- [ ] npx next build — grön
- [ ] Kontraktstestet + alla befintliga facit-tester gröna
- [ ] Commit + push

## Review (2026-08-05)

Alla sex delar klara. tsc 0 fel, next build exit 0, 292/292 facit-tester
gröna (6 nya i kontraktstestet).

**FK-facit från prod (Andreas pg_constraint-koll):** quotes, invoice,
project och time_entry HAR sina customer-FK:er → embed-klustren (19
invoice-siter, quotes-siterna, project-siterna) är FRISKA. Kommentaren i
lib/autopilot/quote-nudge.ts som påstod motsatsen är alltså FEL — men
lämnad orörd, den beskriver en defensiv lösning som fungerar oavsett.
deal.customer_id saknade FK → e2e-deal-flow embedden var död, nu separat
kundhämtning + sql/v87_deal_customer_fk.sql på körlistan (koden är
oberoende av att den körs).

**Fixat:** 8 tabellnamn (admin_audit_log, projects ×3, customers,
activity ×3, work_order ×2, project_photo, project_tracker_stage,
automation_logs) · 4 trasiga v3-loggar (quote-confirmation-email,
on-my-way, job-report ×2) · status 'completed'→'success' i tre
skrivställen + pipeline/deals-filtret läser båda · leads CHECK-brott ×2
('declined'/'rejected'→'lost', nu med error-koll) · pipeline_stage→
pipeline_stage_key i resolver + morning-brief · booking-filter på
'completed' → job_status (or-form pga null-semantik).

**Guardrail:** tests/schema-contract.spec.ts validerar alla .from()-namn
mot facit byggt av sql/ + två dokumenterade vitlistor. VERIFIERAT att det
fångar felklassen — återinförde admin_audit_log tillfälligt, testet blev
rött i båda kontrollerna, återställde.

**Kvarstår (medvetet):** MANUAL_TABLES-vitlistan är dokumenterad skuld —
sex tabeller i prod utan migrationsfil (customer_activity, sms_campaign,
sms_campaign_recipient, material_order, human_followup_queue,
case_record). case_record har EN referens och inget som skapar/läser
rader — trolig död kvarleva, utred och ta bort. human_followup_queue
skrivs från tre håll men läses aldrig.
