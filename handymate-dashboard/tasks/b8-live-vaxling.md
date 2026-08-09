# B8 — LIVE-växlingen (körs som ETT sammanhållet pass, ~15 min)

**Förutsättningar innan detta körs (alla ska vara gröna):**
- [x] B7 bevisad (2026-08-09: `active` + `sub_1U2dhP…` + billing_events)
- [ ] Gyllene vägen dokumenterad (Christoffers steg-svar)
- [ ] STOPP-provet grönt (steg 10c)
- [ ] Tvåtenantprovet kört

**Varför ett sammanhållet pass:** halvväxlat läge (live-nycklar + test-priser,
eller tvärtom) ger "No such price" för varje kund som försöker betala. Gör
alla fyra stegen i följd, verifiera, klart.

---

## 1. Stripe LIVE-läge — webhooken

Stripe Dashboard → växla AV Test mode → Developers → Webhooks → Add endpoint:

- URL: `https://app.handymate.se/api/billing/webhook`
- Events (exakt dessa fem):
  `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `invoice.payment_succeeded`,
  `invoice.payment_failed`
- Kopiera **Signing secret** (`whsec_…`) — det är LIVE-webhookens, skiljer
  sig från testets.

## 2. Vercel — tre värden byts (namnen rörs ALDRIG)

| Variabel | Nytt värde |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_…` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | LIVE-webhookens `whsec_…` (steg 1) |

Spara → **Redeploy** (env biter först vid ny deploy).

## 3. Supabase — live-price-id:na tillbaka

Test-id:na sattes 2026-08-09 för B7. Originalen (ur billing_plan före bytet):

```sql
UPDATE billing_plan SET stripe_price_id = 'price_1TEqYCEOkbEJyOgCJYGPslmR' WHERE plan_id = 'professional'; -- Firman 5995
UPDATE billing_plan SET stripe_price_id = 'price_1TEqYcEOkbEJyOgCdxP0TOOG' WHERE plan_id = 'business';     -- Storfirman 11995
UPDATE billing_plan SET stripe_price_id = 'price_1TEqXkEOkbEJyOgC5dpXPePq' WHERE plan_id = 'starter';      -- Bas (ej i köpflödet)

-- Verifiera:
SELECT plan_id, name, stripe_price_id FROM billing_plan;
```

**Kontroll före körning:** bekräfta i Stripe LIVE → Product catalog att de
tre id:na finns där och bär rätt belopp (5995/11995/2495 SEK månadsvis).

## 4. Verifiera utan att betala

- Öppna betalsteget → **Aktivera Handymate** → Stripes checkout ska öppnas i
  LIVE-läge (4242-kortet ska nu AVVISAS — det är beviset på live).
- Avbryt checkouten. Ingen riktig betalning görs i B8; första riktiga köpet
  är Del C (första betalande kunden).
- Stripe → Webhooks → LIVE-endpointen ska visa lyckade leveranser när första
  riktiga händelsen kommer.

## Efteråt

- [ ] Uppdatera minnet `launch_status`: B8 klar, prod i LIVE-läge
- [ ] Städa B7-testkontot ("Andreas Bygg"): avsluta testprenumerationen i
      Stripe TEST-läge så den inte ligger och rullar
- [ ] `tasks/capability-inventory.md`: Stripe BYGGT → LIVE
