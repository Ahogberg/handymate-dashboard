# Intern publiceringskontroll — Handymate Partneravtal v1

**Status 2026-09-01: Får inte publiceras eller accepteras externt ännu.**

Det avtalsmässiga standardbeslutet i `partneravtal-v1.md` är **20 % av faktiskt mottagen och behållen abonnemangsintäkt exkl. moms i 36 kalendermånader**. Följande ska vara stängt innan avtalet läggs på partnersidan eller en partner godkänns på villkoren.

## P0 — avtal och produkt måste säga samma sak

- [ ] Ändra `handymate.se/partners`: sidan säger i dag 20 % i 12 månader.
- [x] Ändra standardkonfigurationen för nya partners till fast 20 % i 36 månader och 0 % därefter (`sql/v189_partner_flat_commission_and_agreement.sql`, `lib/partners/commission.ts`).
- [ ] Bevisa mot provisionsmotorn: månadsvis kund, årsplan, upp-/nedgradering, obetald månad, återbetalning, churn, återkomst inom period och månad 37.
- [x] Migrera de två befintliga partnerkonfigurationerna från den gamla standardtrappan till 20 % i 36 månader via v189; individuellt konfigurerade avvikelser lämnas orörda.
- [ ] Besluta och dokumentera hur de två migrerade partnerna informeras om den nya kommersiella modellen och den nya avtalsversionen. Migrationen ersätter inte kommunikation eller ny acceptans.

## P0 — avtalspart och juridisk granskning

- [ ] Fyll i Handymates verkliga juridiska namn, organisationsnummer, registrerade adress och avtals-e-post i Partnerbekräftelsen.
- [ ] Låt svensk affärsjurist granska hela dokumentet, särskilt samarbetsklassificering, ansvarsbegränsning, efterprovision, dataskydd, marknadsföring och tvistforum.
- [ ] Bekräfta att relationens faktiska arbetssätt fortsätter vara hänvisning/marknadsföring: partnern ska inte löpande förhandla eller sluta kundavtal i Handymates namn.
- [ ] Bekräfta självfaktureringsmodellen med redovisningskonsult. Standardtexten kräver avtal i förväg, en separat fakturanummerserie märkt ”Självfakturering”, momshantering samt en rutin för partnerns godkännande av varje underlag.

## P0 — giltig elektronisk acceptans

- [ ] Visa länk till avtalet före registrering och lägg till en separat, otvetydig acceptansruta som inte är förkryssad.
- [ ] Spara minst `partner_id`, `agreement_version`, dokumentets hash eller oföränderlig URL, `accepted_at`, accepterande person och nödvändig teknisk bevisning.
- [ ] Mejla eller gör en varaktig kopia av exakt accepterad version nedladdningsbar för partnern.
- [ ] Kräv ny acceptans innan en partner får göra nya hänvisningar på en väsentligt ändrad kommersiell version.
- [ ] Arkivera gamla versioner; ändra aldrig en redan accepterad version på samma URL utan versionshistorik.

## P1 — partnerdrift

- [x] Synka `content/partner/partner-paket.md`, operating plan och dashboardtexter från 12 månader/trappa till 36 månader fast 20 %.
- [ ] Synka extern partnersida och FAQ till samma villkor; kontrollera publicerad miljö före avtalslansering.
- [ ] Gör partnerns villkor synliga i dashboarden: 20 %, månad N av 36, därefter 0 %.
- [ ] Dokumentera attributionsreglerna i portalen, inklusive befintlig relation, dubblett, självhänvisning och invändningsfrist.
- [ ] Inför godkänd marknadsföringshandbok och versionsstyr produktpåståenden.
- [ ] Säkerställ att partnern bara ser de kund- och provisionsuppgifter som behövs.
- [ ] Lägg in process för invändning, korrigering, självfaktura, minimiutbetalning och slututbetalning.
- [ ] Dokumentera och godkänn gränserna för gemensamt paketerade tilläggstjänster och Direkt konkurrerande produkter enligt avtalets punkter 9.4–9.7.

## Juridiska utgångspunkter för juristen

- Handelsagentlagen definierar handelsagentur som självständig och varaktig försäljning eller köp av **varor** för huvudmannens räkning. Handymate är en SaaS-tjänst, men relationens faktiska arbetssätt måste ändå bedömas; avtalsrubriken kan inte ensam styra klassificeringen.
- Marknadsföringslagen har särskilda regler om elektronisk direktmarknadsföring och kräver alltid en giltig opt-out-adress vid e-postmarknadsföring, även till juridiska personer.
- Varje Part behöver egen rättslig grund för den personuppgiftsbehandling den bestämmer. Direktmarknadsföring kan ibland vila på intresseavvägning men ska upphöra vid invändning.
- Självfakturering kräver ett i förväg träffat avtal och en rutin för säljarens godkännande av varje faktura. Fakturan ska märkas ”Självfakturering”.
- Sekretessklausulen kompletterar, men ersätter inte, lagen om företagshemligheter.

Detta dokument är en intern kontrollista, inte en bilaga till partneravtalet och ska inte publiceras på partnersidan.
