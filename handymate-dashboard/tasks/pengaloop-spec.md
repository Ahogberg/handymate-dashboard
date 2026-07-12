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
Det svåra. Här är verkligheten:

**Swish Handel-kravet [VERIFIERA]:** Swish för företag (Swish Handel) kräver
att VARJE företag har eget avtal med sin bank + eget Swish-certifikat. En SaaS
kan inte vara "merchant" åt alla hantverkare — pengarna går till hantverkarens
konto, så var och en behöver eget Swish Handel-nummer. SaaS:en kan vara
*teknisk integratör* (skapa payment requests med callbackUrl mot Swish
m-commerce-API), men hantverkaren måste ändå skaffa eget avtal + cert. →
Betyder onboarding-friktion per hantverkare.

**Stripe-Swish [VERIFIERA — troligen tillgängligt, osäker på 2026-status]:**
Stripe lade till Swish som betalmetod för svenska företag (~2024-2025). Om
tillgängligt 2026 är det attraktivt (Stripe redan integrerat för prenumeration)
— MEN kräver att varje hantverkare kopplar eget Stripe-konto (Connect), vilket
är egen onboarding.

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

**Fas 2 (riktig auto-avstämning — affärs-/onboarding-beslut, egen sprint):**
Utvärdera tre vägar när piloten visar volym:
- **Stripe-Swish** (om 2026-tillgängligt): återbrukar Stripe, kräver Connect-
  onboarding per hantverkare. [VERIFIERA tillgänglighet + svensk entitet-krav]
- **Swish Handel direkt**: varje hantverkares eget avtal + cert, SaaS som
  teknisk integratör med callbackUrl. Mest "svenskt" men mest onboarding.
- **Luta på Fortnox** (redan byggt) för de som ändå har licensen.

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
