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
| 1 | Konto & inloggning | ☐ | |
| 2 | Onboarding (inkl. nya intern timkostnad-fältet) | ☐ | |
| 3 | Första kunden | ☐ | |
| 4 | Offert skapas & skickas | ☐ | |
| 5 | Offerten öppnas (tracking på tre ytor) | ☐ | |
| 6 | Kunden accepterar → projekt + snapshot + deal won | ☐ | |
| 7 | Projektsteget flyttar sig självt | ☐ | |
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
| A9 | Anställd utan ekonomibehörighet (403 → ytor göms) | ☐ | |
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
| — | | | | | |

---

**Feature freeze: måndag 25 augusti 18:00.** Efter det: endast korrekthet,
tillförlitlighet, UX-blockerare, säkerhet, prestanda, lanserings-GTM.
