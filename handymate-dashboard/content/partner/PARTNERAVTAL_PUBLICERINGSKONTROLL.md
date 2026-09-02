# Intern publiceringskontroll — Handymate Partneravtal v1

**Status 2026-09-02: NO-GO — får inte publiceras eller accepteras externt ännu. Se `docs/launch/PARTNER_LAUNCH_GATE_2026-09-02.md`.**

Det avtalsmässiga standardbeslutet i `partneravtal-v1.md` är **20 % av faktiskt mottagen och behållen abonnemangsintäkt exkl. moms i 36 kalendermånader**. Följande ska vara stängt innan avtalet läggs på partnersidan eller en partner godkänns på villkoren.

## P0 — avtal och produkt måste säga samma sak

- [ ] Ändra `handymate.se/partners`: sidan säger i dag 20 % i 12 månader.
- [x] Ändra standardkonfigurationen för nya partners till fast 20 % i 36 månader och 0 % därefter (`sql/v189_partner_flat_commission_and_agreement.sql`, `lib/partners/commission.ts`).
- [x] Browserlöst facit mot provisionsmotorn: månadsvis kund, årsplan, upp-/nedgradering, obetald månad, återbetalning, chargeback, churn, återkomst inom period och månad 37 (`tests/partner-launch-gate.spec.ts` samt befintliga partnerfacit).
- [ ] Kör det riktiga databasbeviset efter att v204/v205/v206 körts manuellt (`npm run proof:partner`). v204–v205 är körda; v206 återstår efter att första beviset fann en verklig schemaavvikelse.
- [x] Migrera de två befintliga partnerkonfigurationerna från den gamla standardtrappan till 20 % i 36 månader via v189; individuellt konfigurerade avvikelser lämnas orörda.
- [ ] Besluta och dokumentera hur de två migrerade partnerna informeras om den nya kommersiella modellen och den nya avtalsversionen. Migrationen ersätter inte kommunikation eller ny acceptans.

## P0 — avtalspart och juridisk granskning

- [ ] Fyll i Handymates verkliga juridiska namn, organisationsnummer, registrerade adress och avtals-e-post i Partnerbekräftelsen.
- [ ] Låt svensk affärsjurist granska hela dokumentet, särskilt samarbetsklassificering, ansvarsbegränsning, efterprovision, dataskydd, marknadsföring och tvistforum.
- [ ] Bekräfta att relationens faktiska arbetssätt fortsätter vara hänvisning/marknadsföring: partnern ska inte löpande förhandla eller sluta kundavtal i Handymates namn.
- [ ] Bekräfta självfaktureringsmodellen med redovisningskonsult. Standardtexten kräver avtal i förväg, en separat fakturanummerserie märkt ”Självfakturering”, momshantering samt en rutin för partnerns godkännande av varje underlag.

## P0 — giltig elektronisk acceptans

- [x] Visa länk till avtalet före registrering och lägg till en separat, otvetydig acceptansruta som inte är förkryssad.
- [x] Spara `partner_id`, `agreement_version`, dokumenthash, `accepted_at` och IP; adminaktivering och nya hänvisningar blockeras utan gällande version.
- [ ] Mejla eller gör en varaktig kopia av exakt accepterad version nedladdningsbar för partnern.
- [x] Kräv ny acceptans innan en partner får göra nya hänvisningar på en väsentligt ändrad kommersiell version.
- [ ] Arkivera gamla versioner; ändra aldrig en redan accepterad version på samma URL utan versionshistorik.

## P1 — partnerdrift

- [x] Synka `content/partner/partner-paket.md`, operating plan och dashboardtexter från 12 månader/trappa till 36 månader fast 20 %.
- [ ] Synka extern partnersida och FAQ till samma villkor; kontrollera publicerad miljö före avtalslansering.
- [x] Gör partnerns villkor synliga i dashboarden: faktisk sats, månad N av 36 och därefter 0 %.
- [ ] Dokumentera attributionsreglerna i portalen, inklusive befintlig relation, dubblett, självhänvisning och invändningsfrist.
- [ ] Inför godkänd marknadsföringshandbok och versionsstyr produktpåståenden.
- [x] Säkerställ i partnerfacit att partnern bara kan läsa sina egna batchar, underlag och nödvändiga kund-/provisionsuppgifter.
- [x] Lägg in produktflöde för invändning, korrigering, självfaktura, minimiutbetalning och explicit slututbetalning (`v193`, `v194`, `v205`).
- [ ] Låt redovisningskonsult godkänna den operationella processen innan skarp utbetalning.
- [ ] Dokumentera och godkänn gränserna för gemensamt paketerade tilläggstjänster och Direkt konkurrerande produkter enligt avtalets punkter 9.4–9.7.

## Juridiska utgångspunkter för juristen

- Handelsagentlagen definierar handelsagentur som självständig och varaktig försäljning eller köp av **varor** för huvudmannens räkning. Handymate är en SaaS-tjänst, men relationens faktiska arbetssätt måste ändå bedömas; avtalsrubriken kan inte ensam styra klassificeringen.
- Marknadsföringslagen har särskilda regler om elektronisk direktmarknadsföring och kräver alltid en giltig opt-out-adress vid e-postmarknadsföring, även till juridiska personer.
- Varje Part behöver egen rättslig grund för den personuppgiftsbehandling den bestämmer. Direktmarknadsföring kan ibland vila på intresseavvägning men ska upphöra vid invändning.
- Självfakturering kräver ett i förväg träffat avtal och en rutin för säljarens godkännande av varje faktura. Fakturan ska märkas ”Självfakturering”.
- Sekretessklausulen kompletterar, men ersätter inte, lagen om företagshemligheter.

Detta dokument är en intern kontrollista, inte en bilaga till partneravtalet och ska inte publiceras på partnersidan.
