# Lanseringssprinten — från BYGGT till BETALANDE

_Startad 2026-07-07. Mål: allt kritiskt prod-verifierat + betalvägen bevisad →
en riktig kund kan registrera sig, uppleva värdet och betala._

## Läge vid start
Byggt & deployat men EJ prod-verifierat: aha-onboardingen, tillval, förtjänad
autonomi (v65 körd), Bee-fixarna, offert-fixvågen. Radarn DEPLOYAD 2026-07-07
(motor + API + dashboard-kort + Karins måndagsrad, 158 tester gröna) → A5 körbar.
Stripe: aldrig ett skarpt köp; billing_plan har okänt schema.

---

## Del A — Facit-tester ✅ GODKÄND (verifierad av Andreas; bockad i efterhand 2026-07-15)

- [x] **A1 · Bee-verifiering (2 min):** låt en anställd (ej Christoffer) logga in
      → hälsningen visar DERAS förnamn → dashboarden visar bara uppgifter de är
      tilldelade/skapat. Christoffer (owner) ser allt som förut.
- [x] **A2 · Tillval (10 min):** skapa offert med 2 tillval (ett Förvalt) →
      alla tre preview-flikarna visar ☑/☐ → skicka till dig själv → öppna
      portalen → "Läs offerten"-PDF:en visar tillvalen + noten → kryssa i/ur,
      se "Att betala" uppdateras live → signera → kolla: quotes-totalen
      uppdaterad, signed_options satt, fakturan (från offert) innehåller exakt
      valen.
- [x] **A3 · Aha-samtalet (15 min):** ny test-onboarding → steg 3 reserverar
      RIKTIGT nummer (obs: köper ett 46elks-nummer) → "Testa Lisa nu" → ring
      från mobilen → hör hälsningen → SMS:et landar i handen → checklistan
      tänds 📞💬✅ → "Ta bort testet" → ring numret IGEN (oarmerat) → normalt
      beteende. Gör även ETT kvällstest (efter 21) — ska fungera identiskt.
- [x] **A4 · Förtroendetrappan (2 min):** agent-sidan → panelen visar per-typ
      streaks (X/15). (Beviljande testas organiskt när Bee når 15 raka.)
- [x] **A5 · Radar-kollen (när deployad):** dashboarden visar "Pengar in"-kortet;
      Bee bör ha ready:true — staplarna rimliga mot verkliga fakturor; testa en
      dipp-åtgärd (Påminn → SMS-flödet; Jaga → förslag i Att godkänna).

**Rapportera avvikelser direkt till Claude — varje fel fixas innan Del B avslutas.**

## Del B — Stripe TEST → bevisad betalväg (Andreas + Claude)

- [ ] **B1 · billing_plan-introspektion (Andreas, 1 min):** kör i Handymate-
      projektet och klistra BÅDA svaren till Claude:
      ```sql
      select column_name, data_type from information_schema.columns
      where table_name = 'billing_plan' order by ordinal_position;
      ```
      ```sql
      select * from billing_plan;
      ```
- [ ] **B2 · Uppgraderings-SQL (Claude):** skriver exakt skript som ger
      billing_plan kolumnerna checkouten kräver (plan_id, name, price_sek,
      stripe_price_id) + seedar/uppdaterar planerna — baserat på B1, aldrig gissat.
- [ ] **B3 · Stripe TEST-läge (Andreas):** skapa produkter + priser för planerna
      (+ leads-addons) → anteckna price-id:n (test).
- [ ] **B4 · Env — VIKTIGT (Andreas):** sätt TEST-nycklarna i Vercels
      **Preview**-environment (INTE Production — prod har LIVE-nycklar som inte
      får bytas): STRIPE_SECRET_KEY (sk_test), STRIPE_WEBHOOK_SECRET (test),
      STRIPE_LEADS_STARTER_PRICE_ID, STRIPE_LEADS_PRO_PRICE_ID.
- [ ] **B5 · Preview-deploy:** öppna en PR/branch-deploy (Claude ordnar trigger
      vid behov) → testa mot preview-URL:en.
- [ ] **B6 · Webhook (Andreas):** Stripe test-webhook → {preview-URL}/api/billing/
      webhook, events: checkout.session.completed, customer.subscription.updated/
      deleted, invoice.payment_succeeded/failed.
- [ ] **B7 · Testköp:** kort 4242 4242 4242 4242 → verifiera i business_config:
      subscription_status='active' + stripe_subscription_id satt + billing_event-
      rad skapad. DET är beviset på hela betalvägen.
- [ ] **B8 · LIVE-växling:** sätt LIVE price-id:n i billing_plan (prod behåller
      sina LIVE-nycklar orörda) + prod-webhooken i Stripe LIVE-läge.

## Del C — Första betalande kunden

- [ ] **C1 · Garantin klar i pitch:** "spara tid annars pengarna tillbaka" —
      copy finns (pitch-dokumentet); ingen kod.
- [ ] **C2 · Onboarding end-to-end-koll:** en HELT ny signup → 6 stegen →
      aha-samtalet → Stripe-steget (nu på riktigt) → LiveTour → dashboard.
- [ ] **C3 · Första kunden:** Bee förblir comp-pilot; första riktiga = ny
      hantverkare via Christoffers nätverk/referral. Målet: EN betald månad.

## Parallellt (Claude, blockerar inget)
Radarn deployad ✅ (2026-07-07). Röst-Lisa-designen startar EFTER sprinten —
medvetet parkerad så sprinten inte konkurrerar om fokus.

## Definition of done
Alla A-boxar gröna · B7-testköpet bevisat · C2 hela vägen · = produkten är LIVE
på riktigt, inte BYGGT. Kapabilitets-inventeringen uppdateras då från BYGGT→LIVE.
