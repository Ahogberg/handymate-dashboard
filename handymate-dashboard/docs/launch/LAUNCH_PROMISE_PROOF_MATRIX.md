# Lanseringslöften — löfte till bevis

**Datum:** 2026-09-03
**Syfte:** Visa vad Handymate får lova på lanseringsdagen och vilket bevis
som återstår. Det här är **inte en tredje lanseringschecklista**.

- Beslutet `GO` eller `NO-GO` fattas endast i
  `docs/launch/GO_NO_GO.md`.
- Exakt körordning och bevisformat finns endast i
  `docs/launch/LAUNCH_TEST_SUITE.md`.
- Den här matrisen är ett index från kundlöfte till kod, test och obligatorisk
  skarp station. Ett grönt kodtest ersätter aldrig ett verkligt leverantörsprov.

## Statusspråk

| Status | Betydelse |
|---|---|
| `BEVISAT I KOD` | Implementationen och dess kontrakt finns. Den kan fortfarande kräva skarp leverantör eller kundresa. |
| `BEVISAT MOT DB` | Ett avgränsat test har provat den körande databasen utan att läsa SQL-filer som facit. |
| `KRÄVER SKARPBEVIS` | Funktionen får inte beskrivas som fullt aktiverad förrän den verkliga stationen passerat på release-SHA:n. |
| `DOLT TILLS BEVISAT` | Funktionen ska vara dold eller tydligt märkt som kommande för nya kunder. |
| `INTE LANSERINGSLÖFTE` | Byggd eller planerad funktion som inte ingår i V1-löftet. |

## Kundlöften

| Kundlöfte | Nuvarande status | Kod- och kontraktsbevis | Kvar före `GO` |
|---|---|---|---|
| Två betalplaner med kanoniska månads- och årspriser, ingen gratis provperiod | `BEVISAT I KOD` + `KRÄVER SKARPBEVIS` | `lib/feature-gates.ts`, `lib/launch/readiness.ts`, `app/onboarding/components/Step5Activate.tsx` | Stripe live: verkligt köp, signerad webhook, exakt liggarrad och säkert retry/refund-prov. |
| Guidad onboarding före betalning och första tydliga nästa steg | `BEVISAT I KOD` + `KRÄVER SKARPBEVIS` | `app/onboarding/page.tsx`, `tests/genomgang-fore-betalning.spec.ts`, `tests/onboarding-wow.spec.ts` | Fyra färska konton utan databasfix; mät tid, tvekan och första värde per bransch. |
| Chefsagenten Matte samordnar ett sekventiellt specialistteam | `BEVISAT I KOD` + `BEVISAT MOT DB` | `lib/agent/orchestration.ts`, `tests/agent-team.spec.ts`, `tests/e2e-golden-path/mission-proof.spec.ts` | Ett kundlikt klickpass på den låsta releasen och kontroll av delvis misslyckat uppdrag. |
| Uppdrag byggs av verkliga signaler och skiljer potential från verifierat utfall | `BEVISAT I KOD` + `BEVISAT MOT DB` | `lib/mission/`, `tests/mission-truth-guard.spec.ts`, `tests/mission-progress.spec.ts`, `tests/e2e-golden-path/mission-proof.spec.ts` | Ett positivt uppdrag från verklig portföljsignal till verifierat affärsutfall på release-SHA:n. |
| Webbformulär ger kund, lead och affär i samma tenant | `BEVISAT I KOD` + `BEVISAT MOT DB` | `lib/leads/golden-path.ts`, `app/api/storefront/`, Golden Path-bevis i `docs/REALITY-WEEK.md` | Kör ny kund och befintlig kund igen på release-SHA:n; noll dubbletter och synlig notis. |
| Professionell offert, publik visning, signering och säker projektövergång | `BEVISAT I KOD` + `KRÄVER SKARPBEVIS` | `tests/first-quote-reality-harness.spec.ts`, `tests/quote-public-dto.spec.ts`, `tests/quote-signing-atomic.spec.ts`, `tests/project-quote-idempotency.spec.ts` | Skicka till extern inkorg, öppna länk/PDF på mobil och desktop, acceptera och skapa projekt exakt en gång. |
| Tid, material och ÄTA följer projektet till korrekt fakturaunderlag | `BEVISAT I KOD` + `KRÄVER SKARPBEVIS` | `tests/canonical-project-completion.spec.ts`, `tests/project-completion-transition.spec.ts`, `tests/invoice-evidence-manifest.spec.ts` | Kör hela projektet utan databasfix och verifiera belopp, relationer, blockerare och bevismanifest. |
| E-postutskick visar aldrig falsk framgång | `BEVISAT I KOD` + `KRÄVER SKARPBEVIS` | `tests/facit-outbound-truth.spec.ts`, `tests/invoice-delivery-truth.spec.ts`, `tests/quote-sender-identity.spec.ts` | Verklig offert och faktura till extern inkorg, SPF/DKIM, länkar, PDF och leverantörsfel. |
| Lisa kan följa upp missade samtal via SMS när kanalen är aktiverad | `KRÄVER SKARPBEVIS` | `docs/launch/LISA_SHARP_PROOF.md`, `tests/lisa-launch-proof.spec.ts`, `lib/leads/golden-path.ts` | Positivt 46elks-saldo, tilldelat nummer och hela sjupunktsprovet från extern telefon. Publik text ska vara villkorad tills dess. |
| Samtalsinspelning och efterbearbetning | `DOLT TILLS BEVISAT` | `docs/audits/CALL_POSTPROCESSING_V1_HANDOFF.md`, inspelningsflaggor i serverkoden | Juridiskt beslut, verifierad leverantörsgallring, informationslänk och verkliga telefonprov. |
| Google Kalender | `KRÄVER SKARPBEVIS` | Integrationsrutter och `lib/launch/readiness.ts` | OAuth med användare utanför testlista, läs/skriv, idempotent återkörning och begriplig frånkoppling. |
| Gmail | `KRÄVER SKARPBEVIS` | Gmail-rutter och plan-grinden i `lib/feature-gates.ts` | Verklig anslutning, inkommande mejl till rätt tenant och synlig återhämtning när token löper ut. |
| Fortnox | `DOLT TILLS BEVISAT` | Fortnox-rutter samt `tests/facit-fortnox-*.spec.ts` | Riktigt bolag: kund, artikel, faktura, betalning, återkörning och felväg. Egen Fortnox-licens krävs. |
| Mobil/PWA och riktad push | `BEVISAT I KOD` + `KRÄVER SKARPBEVIS` | `tests/push-target-user.spec.ts`, `tests/push-delivery-truth.spec.ts`, `tests/push-approval-p1-fixes.spec.ts` | Fysisk iPhone: installation, tillåtelse, rätt mottagare, rätt djuplänk och dubbelgodkännande. |
| AI-support med mänsklig eskalering samt intern Support & drift | `BEVISAT I KOD` | `app/api/support/`, `app/api/admin/support-tickets/`, `app/api/admin/support-operations/`, `tests/facit-admin-support-*.spec.ts` | Skapa ett verkligt supportärende, svara, läs svaret i samma tråd, lös ärendet och kontrollera ett verkligt driftfel i adminytan. |
| Branschrelevant startdata för Bygg, El, Måleri och VVS/HVAC | `KRÄVER SKARPBEVIS` | `lib/branch/`, branschunderlag i `docs/bransch/`, `tests/branschledningen.spec.ts` | Mänskligt godkänn respektive paket och prova på fyra färska konton. Ogranskade paket får inte säljas som färdig branschkunskap. |
| Partnerprogram: 20 % av Nettoabonnemangsintäkt i 36 månader | Separat `NO-GO` tills partnergrinden är komplett | `content/partner/partneravtal-v1.md`, `docs/launch/PARTNER_LAUNCH_GATE_2026-09-02.md`, `tests/partner-launch-gate.spec.ts` | Riktigt DB-bevis, publicerad sida i synk, juridik/redovisning, migrerade partners och visuellt portalprov. |

## Offentliga formuleringar som korrigerades i detta pass

- “Testa Handymate gratis” togs bort eftersom köpflödet saknar gratis
  provperiod.
- “Onboarding på 15 minuter” ersattes med “Guidad onboarding” tills fyra
  färska konton har mätt faktisk tid.
- Ett obevisat löfte om migrering av kunder, offerter och projekt inom 24
  timmar ersattes med den funktion som faktiskt finns: kundimport och
  omfattningsbedömning av övrig historik.
- Lisa, samtalsutkast, Google Kalender och Gmail visas som funktioner som
  kräver aktivering eller skarpbevis.
- Absoluta påståenden om att konkurrenter “saknar” något ersattes med “Ej
  verifierat publikt”. Det är frånvaro av offentligt bevis, inte bevisad
  frånvaro.
- Bygglets offentliga ingångspris uppdaterades till 1 049 kr/mån enligt
  leverantörens prislista granskad 2026-09-03. Easofts pris visas inte som en
  gissad siffra.

## Stoppsignal

Om en rad med `KRÄVER SKARPBEVIS` fortfarande är synlig och beskriven som
ovillkorligt fungerande när releasebeslutet fattas är den stationen `NO-GO`.
Alternativen är bara: kör beviset grönt, dölj funktionen eller märk den ärligt
som ännu inte aktiverad.
