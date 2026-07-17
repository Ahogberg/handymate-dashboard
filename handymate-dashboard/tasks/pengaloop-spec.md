# Pengaloopen — spec för beslut (2026-07-12)

_Sprint B. Beslutsunderlag för Andreas — INGET byggt än._

**Källvarning:** betalvägs-research-agenten hängde sig innan den levererade.
Betalinfrastruktur-fakta nedan är från kunskap (cutoff jan 2026) och
**måste verifieras** där det står [VERIFIERA] innan bygge. Skattesats-nivån
av noggrannhet gäller inte kod förrän detta bekräftats.

## Varël

Betalvägen är grundfunktionernas strategiskt svagaste länk (Explore-verifierat
2026-07-12). Idag: faktura blir "betald" via (a) manuell mark-as-paid
(`POST /api/invoices/[id]/mark-paid`) eller (b) Fortnox-avstämning
(`/api/cron/fortnox-sync/payments` drar bankgiro-status FRÅN Fortnox). Swish
finns bara som QR-bild i portalen (`PortalSwishBlock` + `/api/swish-qr`) — INGEN
callback, ingen auto-avprickning. ServiceTitan-lärdomen: sluta pengaloopen vid
signatur (14 dagar → 24 tim till faktura) = stort kassaflödesvärde.

## Två delar

Pengaloopen är egentligen två saker — separera dem:

### Del 1 — Jobb klart → fakturautkast i kön (byggbart NU, ingen betalinfra)
Från ServiceTitan Max-mönstret. När ett projekt markeras klart (status→completed,
`app/dashboard/projects/[id]/page.tsx` ~rad 1306) → skapa ett fakturautkast som
KÖ-KORT i `pending_approvals` (typ `send_invoice`, återanvänder
`/api/invoices/from-project`). Hantverkaren godkänner → faktura skickas med
betallänk. **Detta kräver ingen ny betalinfrastruktur** — bara wiring av
projekt-avslut till approval-kön. Låg risk, hög kassaflödeseffekt. Kan byggas
autonomt efter godkänt.

### Del 2 — Kund betalar → appen VET (avstämning)
**VERIFIERAT 2026-07-17 (webbresearch mot officiella källor — inga
[VERIFIERA]-flaggor kvar):**

**Stripe-Swish: JA, GA.** Stripe stödjer Swish som betalmetod, generellt
tillgängligt, INGEN svensk Stripe-entitet krävs (28 EU-länder), aktiveras per
konto i Dashboard, fungerar med Checkout/Payment Links. Avgift: **1 % + 3 kr,
TAKAD PÅ 7 KR per transaktion** — på en 20 000 kr-faktura = 7 kr. Webhook
`payment_intent.succeeded` ger omedelbar avstämning. Caveat: "Stripe" står
som mottagare i kundens Swish-app (hantverkarens namn i meddelandefältet).
Källa: docs.stripe.com/payments/swish + stripe.com/pricing.

**Swish Handel native:** teknisk leverantörs-modell FINNS (SaaS:en certifierar
sig hos getswish och använder eget certifikat åt alla) — MEN varje hantverkare
måste ändå teckna eget Swish Handel-avtal med sin bank (~85–500 kr/mån +
1,50–4 kr/transaktion beroende på bank). Callback-API:t är solitt
(callbackUrl + payeePaymentReference för faktura-matchning, MSS-sandbox finns).
Källa: swish.nu/vill-du-bli-partner + developer.swish.nu + Danske Bank.

**Slutsats — Stripe vinner på fakturabelopp:** 7 kr-taket gör Stripe
BILLIGARE än native Swish Handel för hantverkarfakturor så fort man räknar
bankens månadsavgift, och Connect-onboarding (självservice) slår
bankavtals-friktion per hantverkare. Native-vägen lönar sig först vid hög
volym per hantverkare — och kan byggas senare utan schemaändring om vi
matchar fakturor via egen referens redan i Stripe-bygget.

**Fortnox-avstämning (finns redan):** för Fortnox-kopplade hantverkare stäms
bankgiro/OCR av via Fortnox — den pragmatiska RIKTIGA avstämningen finns redan.
MEN Fortnox är licens-blockerat (149 kr/mån, [[fortnox-license-model]]).

## Rekommendation

**Fas 1 (dag-1, INGEN ny per-hantverkare-setup):**
1. Del 1 ovan (jobb klart → fakturautkast i kön).
2. Portalens Swish-QR får en **"Jag har betalat"-knapp** → skapar ett
   Karin-bekräftelsekort i godkänn-kön ("Johan säger att faktura #2041 är
   betald — stämmer det?"). Hantverkaren bekräftar med ett tryck → mark-paid.
   Detta sluter loopen ÄRLIGT (människa bekräftar, ingen falsk auto-avprickning)
   utan något Swish Handel-avtal. **Ärligt > fejkad auto-betald.**
3. Där Fortnox är kopplat: visa Fortnox-avstämd betald-status automatiskt (finns).

**Fas 2 (riktig auto-avstämning) — REKOMMENDATION EFTER VERIFIERING 2026-07-17:
Stripe Connect + Swish.** En integration, per-hantverkare Connect-konton
(självservice, noll bankpapper), Swish aktiverat per konto, webhook →
automatisk mark-paid via befintliga `lib/invoices/apply-payment.ts`. 7 kr max
per faktura. Designkrav: matcha fakturor via egen referens (payeePayment-
Reference-mönstret) så en framtida native Swish Handel-väg (teknisk
leverantörs-certifiering hos getswish) kan slottas in utan schemaändring om
volymen motiverar det. Fortnox-avstämningen kvarstår parallellt för
licens-kunder. Byggs som egen sprint när Andreas ger klartecken —
Fas 1 ("Jag har betalat", DEPLOYAD 2026-07-15) täcker tills dess.

## Öppna beslut för Andreas
1. Bygga Del 1 (jobb klart → fakturautkast i kön) nu autonomt? (Rek. JA —
   ingen betalinfra, låg risk, direkt kassaflödesvärde.)
2. Del 1 "Jag har betalat"-knapp + Karin-bekräftelse — ärlig dag-1-loop? (Rek. JA.)
3. Fas 2-vägval — vilken avstämningsväg? Kräver att du verifierar Stripe-Swish-
   status + väger onboarding-friktion. (Rek. vänta tills pilot visar volym.)
4. Verifiera Swish Handel-kravet + Stripe-Swish 2026 innan Fas 2-bygge.

## Verifiering (Del 1, när byggt)
`tsc` 0 fel, `next build` rent, projekt-avslut → fakturautkort dyker i kön,
godkänn → faktura skickas, "Jag har betalat" → Karin-kort → mark-paid.
Ingen dubbel-fakturering (idempotens mot befintlig from-project-faktura).
