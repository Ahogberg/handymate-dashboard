# Handoff: Booking Types — mockup-filer

Mockuparna från Christoffer + Andreas-diskussion 2026-05-08. **Validerad design**, inte gissning.

## Filer i denna katalog

- [Idag_och_Projekt.html](Idag_och_Projekt.html) — wrapper som monterar alla 5 skärmar
- `idag-projekt-screens.jsx` — React-komponenter för fem skärmar (Andreas paste:ar in från sin lokala maskin)
- `idag-projekt.css` — prototyp-styles (Andreas paste:ar in från sin lokala maskin)

> Notera: JSX/CSS-filerna kan ha mojibake i svenska tecken (cp1252/UTF-8-mismatch från upload). Funktionella ändå — text-content är förståelig.

## Fem skärmar

| # | Plattform | Skärm | Modell |
|---|---|---|---|
| 1 | Mobile | Hem · Idag (sektionsbaserad gruppering) | Modell B |
| 2 | Mobile | Jobbdetalj · projekt-bokning (banner + "Avsluta dagen") | Modell A |
| 3 | Mobile | Jobbdetalj · sista dagen (morfning + "Slutför projektet & fakturera") | Modell C |
| 4 | Desktop | Schema v.18 (projekt-lanes + lösa pass) | Modell B på desktop |
| 5 | Desktop | Projekt-detalj (8-stage timeline + bokningar per vecka) | Befintlig + bokningstabell |

## Tre design-modeller (kombinerade)

- **Modell A — olika ord per booking-typ:** projekt-bokningar har CTA "Avsluta dagen", lösa pass har "Stäng jobb / Skicka faktura"
- **Modell B — sektionsbaserad gruppering med smart-hide:** Hem visar `Projekt idag` (med stage-band) ovanför `Lösa pass` (rena kort). Tomma sektioner döljs.
- **Modell C — sista-dagen-morfning:** På den sista bokningen i ett projekt morfas Jobbdetalj-banner och CTA till "Slutför projektet & fakturera"

## Backend-implementation

Se [tasks/booking-type-implementation.md](../../tasks/booking-type-implementation.md) för design-doc + migration-plan + backend-changes.
