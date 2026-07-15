# Lanseringsverifiering — wow-kedjan + Stripe-köp

_Facit-runbook för A-testet före lansering. Datum: 2026-07-09._

Två delar: **(1)** hela wow-kedjan end-to-end, **(2)** Stripe-köpet med exakt DB-facit
efteråt (kan inte automatiseras — riktig kortdebitering). De deterministiska
logik-bitarna (payoff-siffror, Fortnox-mappning) täcks redan av facit-tester:

```
npx playwright test tests/facit-instant-value.spec.ts tests/facit-fortnox-invoice-map.spec.ts --no-deps --workers=1
```

---

## Del 1 — Wow-kedjan ✅ GODKÄND (verifierad av Andreas; bockad i efterhand 2026-07-15)

Kör hela flödet i ett svep. Bocka av varje steg.

- [x] **Signup** — nytt konto skapas, landar i onboarding steg 1 (MeetTheTeam).
- [x] **Företaget** (steg 2) — namn/org/bransch sparas; konto registreras.
- [x] **Så jobbar du** (steg 3) — specialiteter/tider/pris sparas.
- [x] **Telefon** (steg 4) — nummer-val sparas (provisioneras först efter betalning).
- [x] **Aktivera** (steg 5) — plan väljs, copy säger **debiteras direkt + resultatgaranti**
      (INGEN "provperiod"/"inget dras"-text). → Stripe Checkout (se Del 2).
- [x] **Betala** — efter genomförd betalning: redirect till `/onboarding?payment=success`
      → flödet går vidare till importsteget.
- [x] **Hämta in verksamhet** (steg 6) — "Koppla Fortnox" → OAuth → tillbaka till
      onboarding → hämtar-state → success med **riktiga siffror** (X kunder, Y obetalda,
      Z kr utestående). Testa även CSV-vägen och "Hoppa över".
- [x] **Payoff** (steg 7, LiveTour) — payoff-heron visar **Karins krona-fynd** ur den
      nyss importerade datan (matchar siffrorna i steg 6). Guidad tur funkar. "Kör igång".
- [x] **Dashboard** — landar inloggad; kund-/faktura-siffrorna matchar det payoff visade.

### Fallgropar att aktivt verifiera
- [x] **Importerade förfallna fakturor skickar INGET** — kolla att inga SMS/mejl gick ut.
      (Facit-testet låser `reminder_count=0` + inget `next_reminder_at`; verifiera ändå i data.)
- [x] **Payoff-siffror = dashboard-siffror** — ingen drift (samma status-konvention).
- [x] **Skippad import** ger ändå en varm payoff ("Ditt AI-team är redo"), aldrig tom yta.
- [x] **Fortnox utan data** → mjuk CSV-fallback, aldrig återvändsgränd.

---

## Del 2 — Stripe-köpet (debiteras direkt, ingen trial)

### Så fungerar det (kod-fakta)
- `POST /api/billing/onboarding-checkout` skapar en **subscription-checkout UTAN
  `trial_period_days`** → prenumerationen blir `active` direkt och kortet dras.
- Webhooken (`/api/billing/webhook`, `checkout.session.completed`) speglar Stripes
  verkliga status till `business_config.subscription_status`, sätter Stripe-IDs,
  **provisionerar telefonnummer** (46elks) och loggar en `billing_event`.
  Idempotent via `stripe_event_id` (Stripe retriar → ingen dubbelhantering).
- **Garantin** är en manuell återbetalning (ingen kod-väg) — inte en trial. Data ska
  alltså se "betald" ut direkt; garantin hanteras vid ev. refund.

### Välj testväg (prod kör LIVE-nycklar)
| Väg | Hur | Kostnad |
|-----|-----|---------|
| **A — Stripe test mode** (rek.) | Vercel preview/staging med Stripe **test**-nycklar + testkort `4242 4242 4242 4242`, valfritt utg.datum/CVC | 0 kr |
| **B — Riktigt köp i prod** | Köp på riktigt i app.handymate.se, **återbetala direkt** i Stripe efteråt | Tillfällig debitering |

> Testkort i LIVE-läge fungerar INTE. Väg A kräver test-`STRIPE_SECRET_KEY` +
> test-`STRIPE_WEBHOOK_SECRET` i miljön du testar mot. Väg B ger den sannaste
> verifieringen (samma nycklar som kunder möter).

### DB-facit — direkt EFTER genomfört köp
Kör mot `business_config` för test-`business_id`:

- [ ] `subscription_status = 'active'` (INTE 'trial'/'trialing' — vi har ingen provperiod).
- [ ] `subscription_plan` = vald plan.
- [ ] `stripe_customer_id` satt (cus_…).
- [ ] `stripe_subscription_id` satt (sub_…).
- [ ] `trial_ends_at` = NULL (ingen trial).
- [ ] `assigned_phone_number` satt (telefon provisionerad av webhooken).
- [ ] `billing_period_start` / `billing_period_end` satta (best-effort; om NULL — kolla
      att `sql/v69` körts i prod, icke-blockerande för aktiveringen).

Kör mot `billing_event` för samma `business_id`:

- [ ] Rad med `event_type = 'checkout_completed'` och `stripe_event_id` satt.
- [ ] `data.amount_total` = planpriset (i öre).
- [ ] Endast EN sådan rad per köp (idempotens håller — även om Stripe retriar webhooken).

### Negativa/edge-vägar (om tid finns)
- [ ] **Avbruten betalning** → `/onboarding?payment=cancelled`, kvar på betalsteget,
      går att försöka igen. Ingen `active`-status skrivs.
- [ ] **Retry av webhook** (skicka om samma event i Stripe CLI/dashboard) → svar
      `{ duplicate: true }`, inga dubbla `billing_event`-rader.
- [ ] **payment_failed** (testkort `4000 0000 0000 0341`) → `subscription_status='past_due'`.

---

## Klart-kriterium
Wow-kedjan går från signup → live dashboard utan död-lägen, payoff visar ärliga
siffror som matchar dashboarden, importen skickar inget, och ett köp lämnar
`business_config` i `active` med telefon provisionerad + en `checkout_completed`-rad.
Då är lanseringssprintens verifiering stängd.
