# Rollprov — testföretag och identiteter (steg 3 i rollgranskningen)

Skapade 2026-09-07 av Claude på beslut av Andreas, via `sql/v220_rollprov_testforetag.sql`
(körd mot produktion; lösenordshashar sattes vid körning och finns inte i repot).
Inloggningsuppgifter lämnas via privat kanal — aldrig i repo, PR eller chattlogg som delas.

Rättningarna som ska provas: main 9eac7f48 (R1–R4) och 76dcee17 (saknad
medlemsidentitet failar stängt). Bara ägare/admin får radera projekt (beslut Andreas).

## Företag

| business_id | Namn | subscription_status | Ägare |
|---|---|---|---|
| `biz_rollprov_a` | TEST Rollprov A | comp | rollprov-owner |
| `biz_rollprov_b` | TEST Rollprov B | comp | rollprov-owner-b |

Båda är `onboarding_status = completed`, hemturen markerad sedd, bransch el.
Inga telefonnummer, inga agenter aktiva, ingen kundkommunikation kan utlösas.

## Identiteter (alla e-postadresser är `andreashogberg93+rollprov-<nyckel>@gmail.com`)

| Nyckel | business_users.id | Företag | role | see_all_projects | see_financials | manage_users | approve_time | create_invoices | Intern timkostnad (dold för alla utom owner/admin) |
|---|---|---|---|---|---|---|---|---|---|
| owner | `bu_rollprov_owner` | A | owner | ✓ | ✓ | ✓ | ✓ | ✓ | 320 |
| admin | `bu_rollprov_admin` | A | admin | ✓ | ✓ | ✓ | ✓ | ✓ | 330 |
| pm-on | `bu_rollprov_pm_on` | A | project_manager | ✓ | ✓ | ✗ | ✓ | ✓ | 340 |
| pm-off | `bu_rollprov_pm_off` | A | project_manager | ✗ | ✗ | ✗ | ✗ | ✗ | 350 |
| emp-assigned | `bu_rollprov_emp_assigned` | A | employee | ✗ | ✗ | ✗ | ✗ | ✗ | 360 |
| emp-unassigned | `bu_rollprov_emp_unassigned` | A | employee | ✗ | ✗ | ✗ | ✗ | ✗ | 370 |
| owner-b | `bu_rollprov_owner_b` | B | owner | ✓ | ✓ | ✓ | ✓ | ✓ | 380 |

Alla har `hourly_rate = 850` (debiteringspris, får synas) och `accepted_at` satt.
Ingen väntande inbjudan finns — skapa en admininbjudan som owner om R3 ska provas
med en riktig token (`POST /api/team` → sedan `GET /api/team` som emp-unassigned:
`invite_token` ska vara `null`, `invite_pending` `true`).

## Projekt i A

| project_id | Namn | Ekonomi | Tilldelning | Avsett för |
|---|---|---|---|---|
| `proj_rollprov_p1` | P1 Solvägen 12 – badrum | budget 120 000, offert `quote_rollprov_p1` total 120 000, 2 milstolpar med belopp, 2 tidposter (timpris 850/950, kostnad 340/360), 2 material med inköps-/försäljningspris | pm-on (lead), emp-assigned (member) | R1: tilldelad läsning med/utan ekonomifält |
| `proj_rollprov_p2` | P2 Ekvägen 3 – kök | budget 90 000, 1 milstolpe, 1 tidpost, 1 material | ingen | R1: otilldelad → 404 för pm-off/emp-* |
| `proj_rollprov_p3` | P3 Tomt – raderingsprov nekad | inga | ingen | R2: DELETE som pm-on/pm-off/emp-* → 403, raden kvar |
| `proj_rollprov_p4` | P4 Tomt – raderingsprov tillåten | inga | ingen | R2: DELETE som owner/admin → 200 |

Kund: `cust_rollprov_a1` Rollprov Kund AB, +46700000901.

## Förväntat per identitet

| Anrop | owner/admin | pm-on | pm-off | emp-assigned | emp-unassigned | owner-b |
|---|---|---|---|---|---|---|
| `GET /api/projects` | alla 4 | alla 4 | `[]` | P1 | `[]` | egna (0) |
| `GET /api/projects/proj_rollprov_p1` | 200 + ekonomi | 200 + ekonomi | 404 | 200, `prices_redacted`, inga belopp i project/quote/milestones/time_entries/materials | 404 | 404 |
| `GET /api/projects/proj_rollprov_p2` | 200 + ekonomi | 200 + ekonomi | 404 | 404 | 404 | 404 |
| `DELETE /api/projects?projectId=proj_rollprov_p3` | (använd inte, P3 ska nekas) | 403 | 403 | 403 | 403 | 404 |
| `DELETE /api/projects?projectId=proj_rollprov_p4` | 200 | 403 | 403 | 403 | 403 | 404 |
| `GET /api/team` | token + lönekostnad | `invite_token: null`, kostnad null | samma | samma | samma | eget team |
| `PATCH /api/team` eget namn | fullt svar | svar utan kostnad/token | samma | samma | samma | — |

Återkallad behörighet under session: logga in som pm-on, hämta P2 (200), låt owner
slå av `can_see_all_projects` via `PATCH /api/team`, hämta P2 igen utan ny inloggning
→ 404 (getCurrentUser läser business_users per anrop, ingen cache på servern).
Mobilen: `lib/user-store.ts` kan behålla gammal roll med `stale=true` vid nätfel —
det är UI-läge, servern ska ändå neka.

## Städning

Se utkommenterade DELETE-satser nederst i `sql/v220_rollprov_testforetag.sql`.
Raderas bara på beslut av Andreas, aldrig av ett prov.
