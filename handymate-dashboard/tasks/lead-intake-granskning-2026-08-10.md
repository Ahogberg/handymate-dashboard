# Lead-intake-granskningen — ChatGPT-förslaget mot faktisk kodbas

*Planeringsagentens kritiska granskning 2026-08-10. Underlag: ChatGPT-brainstormen
"External Lead Intake, Automation & Growth Ideas" (22 sektioner, 8 epics).
Slutmål: vilka 2–3 lead-spår som bör bli nästa kommersiella epics efter
lanseringsverifieringen.*

---

**Huvuddom:** Förslaget är strategiskt rimligt men **faktamässigt föråldrat mot
kodbasen**. Uppskattningsvis 60–70 % av det som föreslås finns redan byggt, och
kärnabstraktionen det vill införa — ett kanoniskt lead-intag — **existerar sedan
2026-05-28** (`lib/leads/golden-path.ts`). Det verkliga problemet är inte
avsaknad av plattform utan att 3–4 befintliga skapandevägar ännu inte konvergerat
på den — vilket repots egen audit (`tasks/lead-domain-audit-2026-05-22.md`) redan
diagnostiserat. Förslagets värde ligger i tre smala, kommersiella epics — inte i
dess plattformsvision.

## Agentteamet (§21): inget är påhittat

Alla sex agenter finns i kod (`lib/agents/team.ts:28–35`, `lib/agents/registry.ts:26–32`):
Matte (orkestrerare) ✅, Lisa (kundservice/telefonist) ✅, Daniel (säljare —
offertjakt) ✅, Hanna (marknadschef — gatad reaktivering i drift, cron 08:30) ✅,
Karin (ekonom) ✅. Lars (projektledare) ⚠️ rolldrift: platsbesök finns som flöde
(`app/api/voice/site-visit`, `lib/e2e-deal-flow.ts:27`) men är inte "Lars agent".

## Vad finns redan (urval med bevis)

| Idé | Läge | Bevis |
|---|---|---|
| Kanoniskt intag | **FINNS**: kund-dedup → lead med source/source_ref → deal i `new_inquiry` → SMS via strypunkten → `fireEvent('lead_received')` | `lib/leads/golden-path.ts:102–249` |
| Missat samtal → lead | **FINNS end-to-end**: okänd uppringare → golden path; catch-SMS via seedad regel; svaret tolkas av Matte-intelligensen | `app/api/voice/incoming/route.ts:177–201`, `lib/seed-defaults.ts:92–100`, `app/api/sms/incoming/route.ts:210–256` |
| E-post → lead | **FINNS i två spår**: Postmark-webhook med tvåstegs Haiku-klassning → `lead_review`-kort i kön; Gmail OAuth-polling var 15:e min. **Saknas:** multi-tenant-routning (låst till EN business via env) + historikskanning | `app/api/email/inbound/route.ts`, `lib/gmail-lead-detection.ts:33–164` |
| Webbformulär/widget | **FINNS**: AI-chatwidget (IP-rate-limit), lead-portal per källa (`portal_code`), storefront-formulär (honeypot), `/api/leads/intake` med API-nyckel | `sql/website_widget.sql`, `app/api/widget/chat/route.ts` |
| Reaktivering | **FINNS, i drift**: Hanna v1 (gatad, drip 5/dag, dedup 90 dgr, endast tysta kunder ≥180 dgr), proaktiv omsorg, garantiuppföljning, nurture, säsongscron — allt bakom approvals + frekvenstak | `lib/agents/hanna-outbound.ts`, `lib/proactive-care.ts`, `lib/outbound/frequency-guard.ts` |
| Referral/recension | **DELVIS**: recensionsflödet finns; kundnivå-referral med attribution saknas MEN är redan spec:ad (Hanna v2 spel 1) | `sql/v_review_requests.sql`, `tasks/hanna-sales-engine-v2-spec.md` |
| QR-koder | 80 % täcks av `lead_sources.portal_code` — en QR är en utskriven länk till befintlig källkodad sida | `app/api/leads/intake/route.ts:40–59` |
| AI-kvalificering | **DELVIS**: deterministisk lead-scoring (hot/warm/cold), `qualify_lead`-verktyg, Matte-intent på SMS | `lib/lead-scoring.ts` |
| Attribution | **DELVIS-BRA**: lead.source/lead_source_id/source_ref, win-loss per källa, attributionskärnan + Värdekvittots ärlighetsregler | `lib/value/vardekvitto.ts:8–27` |
| Growth Intelligence | Redan klassad AFTER EVIDENCE i roadmapen | `docs/council/ACTIVE_ROADMAP.md:39, 543–557` |

## Vägarna som INTE konvergerat på golden path (kärnfyndet)

| Väg | Problem |
|---|---|
| `app/api/lead-portal/[code]` | Ingen deal skapas — frånkopplad |
| `app/api/widget/chat` | Deal **utan lead-rad** (TD-72) — inverterad |
| `lib/matte/action-executor.ts:137–143` `create_lead` | Explicit TODO i koden: "Kör golden-path-helpern här" |
| tool-router `qualify_lead` | Agent-skapade leads når inte pipelinen |
| `/api/public/book/[slug]` | Kund+bokning men ingen lead/deal — bokningskanalen osynlig i pipeline |
| `lib/approve-actions.ts:41–54` `createBooking` | Insertar ny kund **utan någon dedup alls** |

## Dedup-hålet (konkret bugg)

Golden path normaliserar inte telefonnummer (`golden-path.ts:120` gör bara
`replace(/\s/g,'')` + exakt match) medan dedup-libben har `normalizeSwedishPhone`.
46elks ger E.164 (`+4670…`), webbformulär ger `070…` — **samma person som ringer
och sedan fyller i formuläret blir två kunder idag.** Fix: en rad (använd
`normalizeSwedishPhone` + e-postfallback i golden path) — inte en resolution-motor.

## Säkerhet/integritet

- **Historikskanning av inbox**: ny GDPR-yta (tredjepartsuppgifter, ändamålsbegränsning)
  + "~320 000 kr potentiellt offertvärde" bryter mot Värdekvittots regel 1 (ingen
  schablon når kronor). **Skjut upp helt**; kan omprövas som opt-in med ANTAL, aldrig kronor.
- **`/api/leads/intake`**: CORS `*` och ingen synlig rate-limit — ge den widgetens
  `checkRateLimitDb`-mönster innan fler publika källor pekas dit.
- **Postmark multi-tenant**: routning adress→business måste vara fail-closed
  uppslagstabell — aldrig payload-styrd tenant-val.

## Farliga auto-beteenden

1. **Followup-läckan är förutsättningen**: godkända follow_up/callback/reminder
   landar i `human_followup_queue` som ingen läser (tasks/rapport-human-followup-queue.md).
   Varje lead-epic som ökar inflödet häller mer vatten i en läckande hink —
   vägval A (routa till tasksystemet) måste göras FÖRST.
2. **`lead_received` → seedat auto-SMS utan approval** (`seed-defaults.ts:83–91`):
   varje ny källa som konvergeras börjar auto-fyra detta — designa medvetet per källa.
3. Kvalificeringsfrågor via SMS = nya utskickstyper → måste genom approvals/regler
   + `sendSmsViaElks` (opt-out-spärren).

## Projekt-grindningen (§14)

Bekräftad: alla tre projekt-skapare är post-accept; v103:s `project_one_per_quote`
stänger race-fönstret. *(Agenten flaggade v103 som okörd utifrån roadmap-texten —
det stämmer inte: v103 kördes och verifierades i prod 2026-08-09, inklusive
städning av två dubblettpar. Roadmapens NEXT ACTION-lista är inaktuell på den
punkten.)*

## Dom

**MUST BUILD** (efter lanseringsgrindarna):
- **Epic A — Konvergens & intagshygien**: alla vägar in i golden path + dedup-normalisering + rate-limit. Högst värde per kodrad, lägst risk.
- **Epic B — Företagsmailen för ALLA kunder**: multi-tenant e-post→lead (detektion + kö finns; sista milen är produktifiering). Moat: telefon+SMS+mail i EN pipeline har ingen konkurrent i segmentet.
- **Epic C — Ägd tillväxt med kvitto**: Hanna v2 (recension + offertjakt → referral med `referral_customer_id`) så "Johansson genererade X kr" blir sant via attributionskärnan.

**SHOULD BUILD**: bokningslänk → golden path (timmar); kvalificeringsdjup på telefon/SMS-leads.

**LATER**: källa→marginal-tratten (gated bakom X2), QR (UI-affordance, vid efterfrågan), grannbrev (blockerat på riktig adressdata), Google/Meta-adaptrar (vid första annonserande kund).

**DO NOT BUILD**: ny intake-plattform/SIGNAL-entitet (plattformiserar det som finns; bryter roadmapens princip 2/5), historikskanning med kronbelopp, Growth Autopilot nu, "LeadBot"-agenter (teamet finns).

## Byggordning efter lanseringsverifieringen

1. Grindarna (oförändrade): gyllene vägen, tvåtenantprovet, STOPP-provet, B8, v103 m.fl. migrationer
2. Followup-läckan (vägval A) — NOW-klass, förutsättning
3. X1b-piloten löper enligt roadmap (lead-epics rör inte revenue-filerna)
4. Epic A (kan gå parallellt med X1-observationen — disjunkta filer)
5. Epic B (efter A — ökar volymen genom golden path)
6. Epic C (efter pilotsignal, i Hanna v2-specens egen sekvens)
7. Easoft-etapp 3–5 + full attribution: styrs av pilotgaten resp. X2

## Minsta koherenta V1 (allt på befintliga filer)

1. `createFollowUp` → tasksystemet (`lib/approve-actions.ts`, `app/api/suggestions/approve/route.ts`)
2. `normalizeSwedishPhone` + e-postfallback i `createLeadAndDeal`
3. lead-portal, widget-chat, `matte/action-executor`, `public/book` → golden path
4. `checkRateLimitDb` på `/api/leads/intake`
5. Postmark-routning per business (uppslagstabell i stället för env-var)

Ingen ny tabell utom ev. routningstabellen; ingen ny agent; inga nya utskickstyper.
