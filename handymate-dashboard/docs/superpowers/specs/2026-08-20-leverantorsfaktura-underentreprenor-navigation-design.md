# Leverantörsfakturor och underentreprenörer — plats i navigationen

## Bakgrund

Under arbetet med matchningsförslag för leverantörsfakturor
(`docs/superpowers/specs/2026-08-20-leverantorsfaktura-matchningsforslag-design.md`)
uppdagades två navigationsluckor:

1. **Leverantörsfakturor** har ingen samlad vy. De syns bara på två ställen:
   per projekt (Leverantörer-fliken i projektdetaljen) och i Karins
   matchningskö (men bara de utan projekt). Ingen sida visar ALLA
   leverantörsfakturor för företaget.
2. **Underentreprenörer** har en fullständig, färdigbyggd sida
   (`app/dashboard/subcontractors/page.tsx` — lista, lägg till, redigera,
   status, betyg, specialisering, timpris) men den är helt orphanad: ingen
   länk till den finns någonstans i appen, varken i `Sidebar.tsx` eller på
   någon annan sida. Bara nåbar genom att skriva URL:en direkt.

## Beslut

Bygg en ny samlad översiktssida för leverantörsfakturor (inte bara en
nav-länk till en befintlig, ofullständig yta), och koppla in
underentreprenör-sidan i navigationen. Motivering: en länk till Karins kö
hade bara löst halva problemet — de redan matchade fakturorna (de allra
flesta, i takt med att kön töms) hade fortfarande varit osynliga utanför
sina respektive projekt.

## Ny sida: leverantörsfakturor

**Fil:** `app/dashboard/supplier-invoices/page.tsx`

**Data:** `GET /api/supplier-invoices` utan `project_id`-parameter — stödjer
redan detta (`app/api/supplier-invoices/route.ts:25-35`, filtrerar bara på
`business_id` om ingen `project_id` skickas), redan `see_financials`-
gated. Ingen ny eller ändrad backend-rutt krävs för grunddatan.

Utöver huvudanropet, två kompletterande hämtningar för visningsnamn:
- `GET /api/projects` (`app/api/projects/route.ts`, bekräftat existerande
  och stödjer `status`-queryparameter) för att slå upp projektnamn för
  raders `project_id`.
- `GET /api/subcontractors?status=active`, fail-soft mot 403 (samma
  mönster som redan används i `SupplierInvoiceModal` och Karins
  matchningskö, eftersom rutten är `checkFeatureAccess`-gated bakom
  planfunktionen `subcontractors`), för att slå upp UE-namn för raders
  `subcontractor_id`.

**Lista:** leverantör, fakturanummer, fakturadatum, förfallodatum, belopp,
statusbadge (obetald/förfallen/betald — förfallen härleds klientsidan
genom att jämföra `due_date` mot dagens datum, samma princip som
Fortnox-importens mappning redan använder). Kopplat projekt visas som
länk dit; rader utan `project_id` visas med en tydlig "Ej kopplad ännu"-
markering som länkar till Karins matchningskö.

**Filter (V1, minimalt):** status (alla/obetald/förfallen/betald) och
fritextsökning på leverantörsnamn. Inga datumintervall eller
projektfilter i V1 — kan läggas till senare om behovet visar sig.

**Behörighet:** Sidan själv kräver ingen egen serverkontroll utöver vad
`GET /api/supplier-invoices` redan gör (401/403 om `see_financials`
saknas) — sidan renderar bara vad API:et ger, och API:et är redan
korrekt grindat.

## Navigationsändringar

**Fil:** `components/Sidebar.tsx`, i den befintliga gruppen `jobs`
("Jobb", innehåller idag Offerter/Projekt/Fakturor/ROT-RUT till
Skatteverket/Dokument, rad 111-117).

Två nya `NavChild`-poster i den gruppen, placerade direkt efter
"Fakturor":

```typescript
{ label: 'Leverantörsfakturor', href: '/dashboard/supplier-invoices' },
{ label: 'Underentreprenörer', href: '/dashboard/subcontractors', featureGate: 'subcontractors' },
```

`featureGate: 'subcontractors'` på underentreprenör-posten matchar sidans
egen `checkFeatureAccess(business, 'subcontractors')`-spärr — samma
mönster som andra `featureGate`-poster i filen (t.ex. `analytics` med
`lead_intelligence`).

`/dashboard/supplier-invoices` läggs till i `HIDDEN_CHILDREN_FOR_EMPLOYEE`
(rad 583) — samma dolt-för-anställd-hantering som `/dashboard/invoices`
redan har, eftersom båda visar `see_financials`-skyddad data och en
anställd utan den behörigheten annars hade sett en nav-länk som bara
ger 403.

`/dashboard/subcontractors` läggs INTE till i `HIDDEN_CHILDREN_FOR_EMPLOYEE`
— UE-listan är inte ekonomiskt känslig data på samma sätt (namn, kontakt,
specialisering), och sidans egen `checkFeatureAccess`-spärr är
planbaserad, inte rollbaserad.

## Testning

- Facit-test: `Sidebar.tsx` innehåller båda de nya `NavChild`-posterna
  med rätt `href` och `featureGate`, och `/dashboard/supplier-invoices`
  finns i `HIDDEN_CHILDREN_FOR_EMPLOYEE` medan `/dashboard/subcontractors`
  INTE gör det.
- Facit-test: den nya sidan anropar `/api/supplier-invoices` utan
  `project_id`-parameter, och renderar en länk till Karins kö för rader
  utan `project_id`.
- Facit-test: UE-namnuppslaget är fail-soft (samma mönster som tidigare
  etapper) — ingen krasch om `/api/subcontractors` 403:ar.
- Regression: `npx tsc --noEmit`, `npx next build`,
  `tests/permission-contract.spec.ts` (ingen ändrad grind — sidan
  återanvänder en redan grindad rutt, ingen ny kontraktsrad ska behövas).

## Utanför scope

- Ändrad backend-gating (befintlig `see_financials`-spärr på API:et
  räcker).
- Datumintervall- eller projektfilter i listan.
- Bulk-åtgärder (massmarkera som betald, etc.).
- Ändringar i Karins matchningskö eller matchningsförslaget — det är en
  separat, parallell spec
  (`2026-08-20-leverantorsfaktura-matchningsforslag-design.md`).
