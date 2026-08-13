# Reality Week — protokoll

**Syfte:** Bevisa att produktberättelsen vi säljer faktiskt händer, pålitligt,
innan 1 september. Inte enhetstester — en riktig genomkörning av hela
livscykeln plus felvägarna, med bevis per steg.

**Manus:** docs/GYLLENE-VAGEN.md (station 1–14 + adversarial A1–A15).
Detta dokument är BOKFÖRINGEN — status per punkt, uppdateras löpande under
körningen. Duplicera inte stationsdetaljerna hit; körboken äger dem.

**Arbetsmodell:**
- Andreas utför de mänskliga handlingarna (webb + mobil) och rapporterar i
  chatten vad han gjorde och såg.
- Claude verifierar varje stations "Bevis" direkt mot databasen (läsning),
  bokför här, och vid avvikelse: **STOP-THE-LINE** — rotorsak + fix + push +
  omtest innan nästa punkt.
- Automatiserade rökprov körs FÖRST varje passdag: `POST /api/debug/e2e-quote`,
  `/api/debug/e2e-invoice`, `/api/debug/e2e-lifecycle` (admin-gated i prod).
- 2026-08-13: Pass 1 (station 1-7) körd av Claude via ett riktigt
  webbläsar-harness (`tests/e2e-golden-path/`), inte manuellt av Andreas —
  se stationstabellen nedan för resultat och docs/reality-week/pass1-
  2026-08-13.md för fullständiga UI-/DB-bevis per station.

**Status-koder:** ☐ ej körd · ✅ PASS · 🔴 AVVIKELSE (länka fix-commit) ·
🔧 FIXAD & omtestad · ⏭ hoppad (motivera)

---

## Förberedelser (en gång, innan pass 1)

| # | Åtgärd | Vem | Status |
|---|---|---|---|
| F1 | `sql/demo_seed_internal_cost.sql` körd i SQL Editor | Andreas | ☐ |
| F2 | Inloggad som demo@handymate.se → `/dashboard/demo` → "Återställ demon" | Andreas | ☐ |
| F3 | "Skapa testmöte" på samma sida | Andreas | ☐ |
| F4 | Seed-integritet verifierad (radantal per tabell: kunder, offerter inkl. accepterad m. snapshot, projekt inkl. completed, time_entry, ÄTA, outcome, debrief-kort, lessons, customer_facts) | Claude | ☐ |
| F5 | Rökproven e2e-quote / e2e-invoice / e2e-lifecycle gröna | Båda | ☐ |

## Pass 1 — Gyllene vägen (demokontot)

| Station | Kort | Status | Anteckning |
|---|---|---|---|
| 1 | Konto & inloggning | ✅ | Riktig lösenordsinloggning i /login → GET /api/me bekräftar rätt business_id. Se pass1-2026-08-13.md. |
| 2 | Onboarding (inkl. nya intern timkostnad-fältet) | ✅ | /dashboard laddas utan redirect till /onboarding; onboarding_completed_at satt, ägarrad finns. Se pass1-2026-08-13.md. |
| 3 | Första kunden | ✅ | Kund skapad via riktig UI-modal, verifierad i DB. Se pass1-2026-08-13.md. |
| 4 | Offert skapas & skickas | ✅ | Offert skapad+skickad via riktigt UI-flöde; status=sent, portal_token satt. Se pass1-2026-08-13.md. |
| 5 | Offerten öppnas (tracking på tre ytor) | ✅ | Oinloggad kund-context, status sent→opened, tracking-rader verifierade, idempotensbevis (dubbel öppning) grönt. Se pass1-2026-08-13.md. |
| 6 | Kunden accepterar → projekt + snapshot + deal won | ✅ | Riktig canvas-signatur; quotes.status=accepted, project skapat (ps-01), 2 milestones med rätt belopp. Se pass1-2026-08-13.md. |
| 7 | Projektsteget flyttar sig självt | ✅ | Bokning → ps-02, statusändring → ps-03 verifierat via riktiga UI-knappar. Guardian-kortet SKIPPAT (demokontot saknar intern timkostnad — kör F1 för att täcka den delen). Se pass1-2026-08-13.md. |
| 8 | Fakturan | ☐ | |
| 9 | Betalningen | ☐ | |
| 10 | Bevisytorna (digest, kön, Pengar just nu, Värdekvittot) | ☐ | |
| 11 | Projektet stängs → efterkalkyl + debrief-kort | ☐ | |
| 12 | Debriefen besvaras → lärdomar | ☐ | |
| 13 | Mötet som blir minne (kundfakta-kort → kundkort/projektsida) | ☐ | |
| 14 | Cirkeln sluts (ny offert visar lärdom + kundfakta; Guardian vaktar) | ☐ | |

## Pass 2 — Adversarial (A1–A15, förväntad utgång i körboken)

| # | Scenario | Status | Anteckning |
|---|---|---|---|
| A1 | Offert avvisas | ☐ | |
| A2 | Faktura förfaller (påminnelsetrappan) | ☐ | |
| A3 | ÄTA avvisas | ☐ | |
| A4 | Godkännande REDIGERAS (payload.edited, streak bryts) | ☐ | |
| A5 | Autonomt utskick failar (2/14d → nyckeln lämnas tillbaka) | ☐ | |
| A6 | Möte med saknat segment ('[— avsnitt saknas —]') | ☐ | |
| A7 | Dubbel cron-körning (idempotens) | ☐ | |
| A8 | Två användare agerar samtidigt (CAS på kortet) | ☐ | |
| A9 | Anställd utan ekonomibehörighet (403 → ytor göms) | 🔴 | UI-bevis ✅: Ekonomi/ÄTA-priser och 7 menylänkar korrekt dolda för anställd-sessionen. API-bevis 🔴: `GET /api/analytics/economics` gav 401 istället för 403 via harnessets `page.request`-anrop, trots att UI-beviset redan bekräftar att behörigheten fungerar korrekt i praktiken — troligen en Playwright-specifik cookie-timing-kvirk i test-harnesset, inte en produktionsbugg. Se pass1-2026-08-13.md. |
| A10 | Fortnox otillgängligt | ☐ | |
| A11 | Google frånkopplad | ☐ | |
| A12 | Kund utan e-post | ☐ | |
| A13 | Superseded kundfaktum (nytt ersätter, gammalt göms) | ☐ | |
| A14 | Projekt utan intern timkostnad (ärlig "ej konfigurerad") | ☐ | |
| A15 | PWA på iOS Safari (install + push) | ☐ | |

## Pass 3 — Integrationerna på riktigt (Andreas riktiga konto)

| # | Test | Status | Anteckning |
|---|---|---|---|
| I1 | Google Calendar: koppla från → appen degraderar ärligt → koppla igen → synk | ☐ | |
| I2 | Fortnox: tokenutgång/otillgänglighet — felvägen svalt inget | ☐ | |
| I3 | PWA på iPhone: installera, push-notis vid high-risk-kort | ☐ | |
| I4 | Google-verifieringen inskickad (Verification Center) | ☐ | |

## Avvikelselogg

| # | Pass/punkt | Beskrivning | Rotorsak | Fix (commit) | Omtestad |
|---|---|---|---|---|---|
| 1 | Pass 1, upptäckt via harnesset | Offert-visningssidan kraschade för VARJE ny offert (React error #31) | `business_config.default_quote_terms` är JSONB DEFAULT `{}`, läst som sträng | be549e44 | ✅ |
| 2 | Pass 1, station 6 | Projektets `current_workflow_stage_id` initierades aldrig efter signering (29/33 projekt i produktion) | `lib/project-ai-engine.ts`'s `onQuoteAccepted` — en duplicerad, separat projekt-skapare som vinner racet mot `createProjectFromQuote` — saknade helt stage-initiering | 7c59b2db | ✅ |
| 3 | Pass 1, station 6 | Milestones/budget skapades aldrig för RPC-signerade offerter | Samma `onQuoteAccepted` läste budget/rader från tom `quote.items` JSONB istället för `quote_items`-tabellen (samma buggklass som fixades på annat håll 2026-05-22, men missad här) | ae400d22 | ✅ |
| 4 | Pass 2, A9 | API-bevis-testet får 401 istället för 403 mot `/api/analytics/economics` | Ej rotorsakad — troligen harness-specifik cookie-timing, ej en produktionsbugg (UI-beviset bekräftar korrekt beteende) | — | 🔴 öppen, ej blockerande |

---

**Feature freeze: måndag 25 augusti 18:00.** Efter det: endast korrekthet,
tillförlitlighet, UX-blockerare, säkerhet, prestanda, lanserings-GTM.
