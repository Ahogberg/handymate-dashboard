# Fortnox-licens-blocker

> **Status:** Extern blockerare loggad 2026-05-30. Påverkar pilot-launch-pitch för Bee Service. Inte en kod-bug.
>
> **Relaterat:** [pilot-fix-plan.md](pilot-fix-plan.md) Steg 4 (Audit 1 B3).

## Status
Fortnox-sync via Handymate fungerar inte för Bee Service. OAuth-flödet returnerar fel om "Handymate behöver licens för något/några scopes vi requestar."

Christoffer använder Fortnox aktivt — men manuellt, inte via Handymate. Friktion: dubbel inmatning av fakturor.

## Vad detta INTE är
- Inte en kod-bug (Audit 1 B3-fixen är klar, commit `af725917`)
- Inte ett tekniskt blockerande problem
- Inte unikt för Bee — påverkar alla potentiella Fortnox-kunder

## Vad detta ÄR
- Externt blockerande: Fortnox-konto/partner-status hos oss
- Pilot-pitch-justering: "Fortnox-sync kommer snart" istället för "fungerar idag"
- Måndags-uppgift: kontakta Fortnox support

## Action items (måndag)
1. Kontakta Fortnox support (support@fortnox.se eller telefon)
2. Förklara att vi är en SaaS som integrerar mot kund-Fortnox-konton
3. Fråga vilket licens/partner-program vi behöver
4. Identifiera vilka scopes som specifikt kräver licens
5. Få offert/villkor för det licensiella

## Påverkan på pilot-launch
- B3 (Audit 1) nedgraderas från BLOCKERARE → blockerad-externt
- Steg 4-fixen ligger deployed (`af725917`) men inte aktiv (ingen kan trigga den)
- Sandbox-verifiering pausad tills licens-fråga löst
- Pilot-pitch till Christoffer: "Fortnox-sync kommer när licens-frågan är löst — du fortsätter manuellt tills dess"

## Backlog när licens löst
- Sätt upp Fortnox-sandbox med rätt scopes
- Verifiera Steg 4-fixen i sandbox
- Koppla Bee mot prod-Fortnox via Handymate
- Migrering: hjälpa Christoffer flytta hans aktiva flöde till Handymate (utan att skapa dubbletter)
