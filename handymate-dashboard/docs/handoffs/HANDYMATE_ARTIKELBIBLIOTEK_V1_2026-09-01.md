# Handymates artikelbibliotek V1 — överlämning 2026-09-01

## Resultat

Produktmodellen är nu uppdelad utan ny tabell eller migration:

1. `getProductCatalog` läser hela det befintliga, granskade branschbiblioteket
   inklusive den prislösa långsvansen.
2. `getStarterProducts` är den enda automatiska startbanken: en huvudsaklig
   timartikel per vald bransch samt tre generella, prislösa rader.
3. Företagets `products` är fortsatt enda kanoniska artikelregister. Valda
   biblioteksrader kopieras dit med `sales_price = 0`.
4. Jobbtypsmallarnas befintliga `linked_product_id`-modell är orörd.

Inga befintliga kundartiklar raderas, arkiveras eller skrivs om.

## Kundupplevelse

- `Inställningar → Produkter & priser` har knappen **Handymate-biblioteket**.
- Biblioteket är sökbart och filtrerbart på arbete, material, hyra och övrigt.
- Redan importerade artiklar markeras och kan inte dubbleras.
- Samma komponent finns i onboardingens produktsteg.
- UI:t säger uttryckligen att priset lämnas tomt tills företaget sätter det.

## Säkerhet och sanning

- `/api/product-catalog` kräver `getAuthenticatedBusiness` och är
  `force-dynamic`.
- Företagets branscher läses server-side; klienten kan inte importera ett
  godtyckligt katalog-SKU utanför den tillåtna mängden.
- Befintlighet härleds tenant-säkert på `business_id`, SKU och namn+enhet.
- Historiska katalogpriser returneras aldrig från GET och kopieras aldrig vid
  POST. Import skriver alltid osatt pris.
- Superadmin-impersonation är read-only även här.

## Ändrade områden

- `lib/product-defaults.ts`
- `lib/seed-defaults.ts`
- `app/api/admin/backfill-products/route.ts`
- `app/api/product-catalog/route.ts`
- `app/dashboard/settings/products/**`
- `app/onboarding/components/StepProductRegister.tsx`
- `tests/product-catalog.spec.ts`
- `tests/onboarding-product-register.spec.ts`

## Verifiering

- Riktade facit: **176/176 gröna** i chromium + mobile.
- `npx tsc --noEmit`: **exit 0**.
- `npx next build`: **exit 0**.
- Ingen SQL-migration krävs eller har körts.

Builden skriver befintliga varningar om statisk generering och saknade lokala
Supabase-envvärden, men avslutas grönt. Den nya katalogrutten är uttryckligen
dynamisk och orsakar inte dessa äldre varningar.

## Manuell kontroll efter deploy

1. Öppna ett elfirmakonto och kontrollera att **Drivdon för LED** går att söka
   fram i Handymate-biblioteket men inte massläggs i en ny artikelbank.
2. Importera artikeln och kontrollera att den visas som **Sätt pris**.
3. Importera den igen och kontrollera att ingen dubblett skapas.
4. Skapa ett färskt företag och verifiera att startbanken innehåller fyra
   rader för en bransch, varav bara timartikeln har onboardingens timpris.
