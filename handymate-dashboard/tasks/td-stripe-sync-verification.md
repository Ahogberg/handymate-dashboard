# TD — Stripe-sync verification

> **Loggad:** 2026-05-30 efter Bee-business-inventering. Inte pilot-blocker — Bee har co-founder-gratis-access. Värt att fixa innan första riktig betalande kund.

## Bakgrund

Bee-business-inventering avslöjade att `biz_6wunctak49` har `subscription_status='active'` i `business_config` trots att **ingen Stripe-betalning sker** (Bee har co-founder-pilot-status = gratis access).

Det betyder `subscription_status`-fältet kan **drifta isär från Stripe-verkligheten**. För Bee är det icke-issue, men för framtida riktiga betalande kunder är drift farlig:

- Användare cancellar i Stripe → DB säger fortfarande 'active' → de behåller plattformsåtkomst utan att betala
- Eller motsatsen: Stripe betalning lyckas → DB stannar på 'trial' → vi tror trial pågår, kund tror de betalar fullt

## Vad som behöver verifieras

1. **`/api/stripe/webhook`** (eller liknande) hanterar dessa events:
   - `checkout.session.completed` → subscription_status = 'active'
   - `customer.subscription.updated` → spegla nya status
   - `customer.subscription.deleted` → subscription_status = 'cancelled'
   - `invoice.payment_succeeded` → bekräfta 'active'
   - `invoice.payment_failed` → 'past_due'

2. **Webhook-signatur valideras med raw body** (sett i CLAUDE.md fallgropar — men verifiera mot kod)

3. **Stripe webhook-endpoint är registrerad i Stripe dashboard** för alla relevanta events

4. **Reconciliation-cron eller manuell command finns** för att periodiskt synka all subscription_status från Stripe (catch missed webhooks)

## Test-scenario

1. Skapa test-konto med riktig Stripe-subscription (Stripe test-mode)
2. Verifiera DB.subscription_status = 'active' efter checkout
3. Cancel subscription i Stripe dashboard
4. Verifiera DB.subscription_status uppdateras till 'cancelled' inom rimlig tid
5. Reaktivera → verifiera 'active'
6. Simulera payment_failed → verifiera 'past_due'

## Pilot-impact

Inget för Bee Service (gratis-access). **MÅSTE verifieras innan första betalande kund onboardas.**

## Relaterat

- `biz_6wunctak49` exemplifierar problemet: status='active' utan Stripe-betalning. För Bee inget problem (co-founder), men avslöjar latent risk.
- Se [bee-business-inventering](pilot-fix-plan.md) för hela inventeringen.

## Estimat

- Audit av nuvarande webhook-handler: 30 min
- Skriva test-scenario + verifiera mot Stripe test-mode: 1-2 h
- Eventuell fix om webhook missar events: 2-4 h beroende på hål

**Total: 2-5 h** beroende på utfall.
