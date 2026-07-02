# Förtjänad autonomi — design-spec

_Datum: 2026-07-01 · Status: design godkänd av Andreas, spec för granskning_
_Beslut låsta: scope = Konservativ (4 typer) · tröskel 15/60 dgr · inline-erbjudande via godkännande-UI_

## Mål

Agenterna förtjänar autonomi **per åtgärdstyp, per företag**, baserat på mätt
godkännande-historik — istället för att kräva blind tillit dag 1 (konkurrenternas
på/av-toggle). Hantverkaren slipper ~80 % av Godkänn-trycken, i exakt den takt han
själv bevisat förtroende. Alltid reversibelt.

**Pitch-mening:** "Ditt AI-team börjar försiktigt och tar över mer i takt med att
du litar på det — mätt i din egen data, och du kan alltid ta tillbaka ratten."

## Scope — hårdkodad allowlist (KONSERVATIV)

Endast dessa fyra åtgärdstyper kan NÅGONSIN graderas upp:

| Autonomi-nyckel | Flöde | Skapas av |
|---|---|---|
| `invoice_reminder` | Fakturapåminnelse | Motorn (threshold-regel, `requires_approval`) |
| `booking_reminder` | Bokningspåminnelse | Motorn (threshold-regel) |
| `quote_followup_sms` | Offertuppföljnings-SMS | Motorn (threshold/event-regel) |
| `review_request` | Recensionsförfrågan | `cron/review-requests` (skapar approval direkt) |

**Aldrig autonoma (kod, inte config):** skicka offert/faktura, skapa bokning,
Hannas reaktivering (`proactive_care`), allt annat. Allowlisten är en funktion i
kod — inga andra typer kan graderas ens av misstag.

## Mekanik

1. **Streak** = antal RAKA godkännanden av en åtgärdstyp utan avvisning, inom
   senaste 60 dagarna. Härleds ur `pending_approvals`-historik (status
   `approved`/`rejected` finns verifierat i datan) — ingen ny räknartabell.
2. **Tröskel:** 15 raka → erbjudande. En avvisning nollar streaken.
3. **Erbjudande** skapas INLINE när det 15:e godkännandet exekveras (i
   approvals-routens approve-flöde; ingen ny cron): ett `pending_approvals`-item
   av ny typ **`autonomy_offer`** — "Du har godkänt Karins 15 senaste
   fakturapåminnelser. Låt henne sköta dem själv? Du kan alltid ta tillbaka
   ratten." Autonomin godkänns alltså i samma godkännande-UI (webb + mobil,
   befintligt). Max ett öppet erbjudande per typ (dedup mot pending) + 30 dagars
   cooldown efter AVVISAT erbjudande (tjat-skydd).
4. **Beviljat** (`autonomy_offer` godkänns) → exekveringen skriver
   `earned_autonomy`-state (se datamodell). Ingen extern effekt → låg risk.
5. **Autonomt läge:** åtgärden skickas direkt (samma `sendSmsViaElks`-väg som
   approve-exekveringen) istället för att skapa godkännande. Loggas alltid i
   `v3_automation_logs` med agent-attribution (finns).
6. **Återkallande:**
   - Manuellt: "ta tillbaka ratten"-knapp per typ i trust-ladder-vyn.
   - Automatiskt: om hantverkaren avvisar ETT godkännande av samma typ (kan
     förekomma t.ex. före beviljande eller efter manuell återgång) → nedgradera
     till gatad + nolla streak.

## Datamodell

Ny JSONB-kolumn på `v3_automation_settings` (tabellen ALTER:as rutinmässigt):

```sql
-- sql/v65_earned_autonomy.sql (körs manuellt i Supabase, konvention)
ALTER TABLE v3_automation_settings
  ADD COLUMN IF NOT EXISTS earned_autonomy JSONB DEFAULT '{}';
-- Form: { "invoice_reminder": { "status": "autonomous", "granted_at": iso,
--          "offer_approval_id": id }, ... }
```

Streak lagras INTE — härleds vid behov. Endast beviljande-state persisteras.

## Exekvering — två wiring-punkter (verifierat mot kod)

1. **Motorn** (`lib/automation-engine.ts` ~rad 845, `needsApproval`-beslutet):
   om `needsApproval` OCH regeln mappar till en allowlistad autonomi-nyckel OCH
   `isAutonomous(businessId, key)` → exekvera direkt istället för
   `handleCreateApproval`. Täcker invoice_reminder + booking_reminder +
   quote_followup_sms.
2. **`cron/review-requests`**: samma check före `pending_approvals`-insert →
   skicka direkt via `sendSmsViaElks` (payload-fälten för utskicket finns redan
   i cronens approval-payload).

Delad hjälpare: `lib/autonomy/earned-autonomy.ts` med `isAutonomous()`,
`computeStreak()`, `maybeCreateOffer()`, `grantAutonomy()`, `revokeAutonomy()`
+ allowlist-mappningen (regel→nyckel).

**Öppet för implementationsplanen (verifieras, gissas ej):** exakt härledning av
autonomi-nyckel ur motor-approvals — motorns approvals har `approval_type:
'automation'`, så nyckeln måste härledas ur regel-identitet (rule_name/
trigger_config) i payload/context. Planen pinnar exakta fält.

## UX

- **Trust-ladder-vyn** (finns): per-typ-status — Gatad → Nära (12/15) →
  Autonom sedan {datum} + återkalla-knapp.
- **Veckodigesten** (finns): rad "Karin skickade 8 påminnelser självständigt
  (autonomi du beviljat)".
- `autonomy_offer` renderas i befintlig approvals-UI med tydlig svensk copy;
  mobilen renderar den via befintlig Approval-typ (ev. unionsutökning i
  mobil-repo — liten).

## Säkerhet & felhantering

- Nattspärr (21–08), SMS-kvot och dedup gäller OFÖRÄNDRAT i autonomt läge
  (samma utskicksvägar).
- Autonomt utskick som misslyckas → loggas `failed` + notis till ägaren
  (ingen tyst svält).
- Allowlist i kod; `autonomy_offer`-exekvering = endast settings-skrivning.
- All UI-text svenska, inga tekniska termer (per CLAUDE.md).

## Verifiering (acceptanskrav)

- `npx tsc --noEmit` 0 fel · `npx next build` ren.
- Enhetstester på `computeStreak` (rak serie → 15; avvisning nollar;
  60-dagarsfönster; blandade typer separeras).
- Manuellt: simulera 15 godkännanden av en typ → erbjudande skapas (exakt ett)
  → bevilja → nästa åtgärd av typen skickas direkt + loggas → avvisa ett
  godkännande av typen → nedgraderad + streak nollad → trust-ladder visar rätt
  state genom hela kedjan.
- Mobil-regress: `autonomy_offer` renderas och kan godkännas/avvisas.

## Byggda avvikelser/förtydliganden (efter granskningsrundor)

- Redigerade godkännanden räknas EJ i streaken och nollar den EJ (payload.edited-stämpel; en korrigering är inte blind tillit).
- Motor-typernas streaks börjar räknas från deploy (autonomy_key stämplas i approval-payload framåt; historiska automation-rader saknar nyckeln). review_request räknar full historik via approval_type.
- Streak sorteras på resolved_at (beslutsordning) med delad 200-raders budget i fönstret — kan underskatta, aldrig överskatta (fail-safe).
- UTGÅNGET (ej avvisat) erbjudande har ingen cooldown → återkommer vid nästa godkännande. Endast AVVISAT erbjudande ger 30 dagars cooldown.
- Review-cronen: misslyckat autonomt utskick faller tillbaka till ett godkännande-kort (utöver logg + notis) — kunden tappas aldrig.
- KÄND ASYMMETRI (v2-kandidat): efter beviljande skapas inga approvals av motor-typerna → auto-nedgradering via avvisning är onåbar för dem post-grant; manuell återkallning (Förtroendetrappan) är enda utvägen. review_request har en organisk väg (fail → kort → avvisa → nedgradering). v2-förslag: stickprovs-gating eller motor-fail→kort.

## Utanför scope (v2+)

Fler åtgärdstyper (kräver nytt scope-beslut), autonomi-nivåer (t.ex. "autonom
under arbetstid"), Hanna-reaktivering (medvetet exkluderad), aggregerad
autonomi-statistik cross-business.
