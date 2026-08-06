> ## ⚠️ Granskningsnot — läs före avsnitt 5 (Claude Code, 2026-08-06)
>
> Dokumentets två P0:or verifierades mot faktisk kod. **Båda är verkliga men
> felklassade, och den allvarligaste risken saknas helt.** Åtgärdat i commits
> `3a973b45` (dashboard), `210e581` (mobile), `c530c40` (landing).
>
> **Det verkliga P0 stod inte här.** Analysen stannade vid `lib/api.ts` i
> mobilrepot och beskrev därför ett backend-hål som ett mobil-UI-problem.
> **31 av 460 API-rutter hade någon rollkontroll.** `getAuthenticatedBusiness()`
> avgör vilket *företag* ett anrop gäller — inte vad användaren får se inom det.
> Bland de ogrindade: `app/api/export` returnerade hela kundregistret med
> **personnummer i klartext**, `gdpr/delete` raderade hela kontot, och
> `billing/checkout` ändrade abonnemanget — allt för vilken anställd som helst.
> Nu grindat och vaktat av `tests/permission-contract.spec.ts`.
>
> **P0.2 (mobilen) — ingen rättighetseskalering.** Backend härleder rollen ur
> databasen per anrop och avvisar skrivningar oavsett vad klienten tror.
> Exponeringen var *läsning*. Två saker dokumentet missade gjorde den dock
> värre än beskrivet: fail-open utlöstes även på **lyckade 200-svar** med
> ofullständigt permissions-objekt, och fallbacken **persisterades** till
> AsyncStorage och skrev över en korrekt nedgraderad roll.
> Påståendet om ogrindad `PATCH /api/team/[id]` stämmer inte — filen har bara
> GET, och teamuppdateringarna i `team/route.ts` är korrekt grindade.
>
> **P0.1 (SSRF) — verklig, men P1 i praktiken.** På Vercel utan VPC, och med rå
> HTML som passerar Claude innan något når klienten, var den realistiska
> omedelbara skadan inte credential-stöld utan obegränsad `.text()` (minnes-DoS)
> och oautentiserad tokenförbränning. Fixad ändå, fullt ut.
>
> **Dokumentet känner inte till veckans arbete.** Det är daterat samma dag som
> Snabboffert-sprinten men refererar varken den, produktbankskopplingen eller
> godkännandefixen. Flera förslag i avsnitt 8 har därför primitiv som redan
> finns — särskilt **8.2 Field-to-cash**, vars röstintag, transkribering och
> godkännande-kö byggdes 2026-08-05/06. Rekommenderad ordning för avsnitt 8 är
> därför 8.2 → 8.4 → 8.3 → 8.6, inte dokumentets.
>
> Avsnitt 9 (*vad som inte bör prioriteras nu*) är dokumentets starkaste sida
> och står oförändrad.

# Handymate — Fullständig produkt-, arkitektur- och genomförandeplan

**Datum:** 2026-08-06  
**Scope:** `handymate-dashboard`, `handymate-mobile`, `handymate-landing`  
**Målgrupp:** Claude Code och utvecklingsteamet  
**Syfte:** Göra Handymate säkrare, mer robust och tydligare differentierat — samt prioritera utveckling som kan skapa ett verkligt och försvarbart försprång mot traditionella affärssystem för hantverksföretag.

---

# 1. Instruktion till Claude Code

Läs hela dokumentet innan du börjar ändra kod.

Arbeta i följande ordning:

1. Verifiera varje risk och avvikelse mot aktuell kod.
2. Markera sådant som redan är åtgärdat.
3. Skapa en implementation plan per repo.
4. Bryt arbetet i små, självständiga commits.
5. Ändra aldrig flera domäner i samma commit om det går att undvika.
6. Skriv tester som låser varje säkerhets- och produktprincip.
7. Kör typecheck, lint, tests och build före varje avslutad uppgift.
8. Skapa aldrig breda refaktorer utan tydligt definierat affärsvärde.
9. Prioritera driftssäkerhet och korrekthet före nya featureytor.
10. Behåll Handymates grundprincip: **AI:n föreslår, hantverkaren beslutar — tills förtroende har förtjänats.**

## Förväntad arbetsform

För varje uppgift:

```text
1. Observation
2. Risk / affärspåverkan
3. Föreslagen lösning
4. Filer som berörs
5. Teststrategi
6. Acceptance criteria
7. Commit-meddelande
```

Använd separata branches och pull requests. Ingen AI-agent får pusha direkt till `main`.

---

# 2. Executive summary

Handymate är inte längre ett traditionellt CRM eller ett säljverktyg. Plattformen håller på att bli ett **agentdrivet operativsystem för hantverksföretag**.

Den största styrkan är att AI:n redan är kopplad till verkliga handlingar:

- skapa kunder
- kvalificera leads
- skapa offerter
- skapa fakturor
- skapa ÄTA-utkast
- kontrollera kalender
- boka arbete
- skicka SMS och e-post
- följa upp kunddialog
- analysera projektlönsamhet
- uppdatera projekt
- logga tid
- kommunicera mellan agenter
- skapa approvals
- föreslå autonoma handlingar

Detta gör Handymate till ett potentiellt **system of action**, inte bara ett system of record.

Den största risken är samtidigt tydlig:

> Produktens komplexitet har sprungit ifrån kvalitetssystemet runt den.

Featurebredden är mycket hög, men releasegrindar, testautomatisering, kontrakt mellan webb och mobil, säkerhet i publika endpoints och gemensam agentinfrastruktur behöver förstärkas innan ytterligare större featureexpansion.

## Samlad bedömning

| Område | Bedömning |
|---|---|
| Produktvision | Mycket stark |
| Featurebredd | Extremt hög |
| Agentarkitektur | Stark och ovanligt genomtänkt |
| Konkurrensdifferentiering | Tydlig men måste skärpas |
| UX-sammanhållning | Förbättras snabbt men är ojämn |
| Mobilprodukt | Funktionsrik men tekniskt eftersatt mot dashboarden |
| Säkerhet | Blandad — ett fåtal akuta risker |
| Test- och releaseförtroende | För svagt för produktens komplexitet |
| Skalbarhet | God potential men växande teknisk skuld |
| Strategisk potential | Hög, om fokus flyttas från fler moduler till closed-loop automation |

---

# 3. Repositoryöversikt

## 3.1 `handymate-dashboard`

Dashboarden innehåller redan kärnan i ett komplett vertikalt affärssystem:

- CRM
- kundregister
- leads
- pipeline
- kundhistorik
- samtal
- SMS
- e-post
- kampanjer
- kommunikationsregler
- offerter
- AI-genererade offerter
- produktbank
- ROT/RUT
- signering
- fakturor
- Fortnox
- betalningar
- lönsamhetsuppföljning
- bokningar
- kalender
- projekt
- bemanning
- kapacitet
- tidrapportering
- GPS-incheckning
- projektmaterial
- ÄTA
- kundportal
- leadportal
- storefront/webbplats
- partnerflöden
- automationscenter
- approvals
- aktivitetsloggar
- AI-agentteam
- agentminne
- agentobservationer
- agent-till-agent-kommunikation

Dashboarden är produktens centrum och bär merparten av affärslogiken.

## 3.2 `handymate-mobile`

Mobilappen är inte en tunn companion-app. Den innehåller:

- hem / idag
- approvals
- offerter
- projekt
- bokningar
- tidrapportering
- GPS-incheckning
- verksamhetsöversikt
- Matte via text
- Matte via röst
- pushnotiser
- deep links
- offline-/nätverksindikering
- Sentry
- global error boundary
- SecureStore-baserad auth

Mobilappen är viktig eftersom hantverkarens primära arbetsyta är telefonen.

## 3.3 `handymate-landing`

Landningsrepon innehåller:

- huvudlandningssida
- AI-teamssida
- separata agentsidor
- demo
- offertgenerator
- webbplatserbjudande
- jämförelsesida
- partnerflöde
- leadinsamling
- publika AI-endpoints
- webbplatsscraper
- demo-API
- offertmallsgenerator

Landningsrepon är både marknadsföringsyta och en attack-/kostnadsrisk eftersom flera publika endpoints anropar externa tjänster.

---

# 4. Vad Handymate gör särskilt bra

## 4.1 AI:n är kopplad till riktiga handlingar

Detta är produktens viktigaste tillgång.

Agenternas tool-router ger dem tillgång till verkliga affärshändelser, inte bara textgenerering.

Exempel på faktiska actions:

- `get_customer`
- `search_customers`
- `create_customer`
- `update_customer`
- `create_quote`
- `get_quotes`
- `create_invoice`
- `create_ata_draft`
- `check_calendar`
- `create_booking`
- `update_project`
- `log_time`
- `get_person_schedule`
- `send_sms`
- `send_email`
- `read_customer_emails`
- `qualify_lead`
- `update_lead_status`
- `get_lead`
- `search_leads`
- `get_daily_stats`
- `create_approval_request`
- `check_pending_approvals`
- `get_project_profitability`
- `update_business_preference`
- `get_automation_settings`
- `log_automation_action`
- `check_fortnox_status`
- `trigger_fortnox_sync`
- `get_pricing_suggestion`
- `send_agent_message`
- `get_agent_messages`
- `get_efterkalkyl_insight`
- `get_project_outcome`
- `run_customer_base_sweep`
- `book_site_visit`

Detta gör att Handymate kan bli ett operativt system som driver jobbet framåt, inte bara visar information.

## 4.2 Godkännande och autonomi är rätt tänkt

Handymate har en tydlig princip:

- användarinitierade handlingar kan genomföras direkt
- systeminitierade handlingar kräver godkännande
- godkännande kan senare ersättas av förtjänad autonomi

Detta är en mycket bättre modell än en generell inställning för “AI på/av”.

Det skapar möjlighet till en riktig produktvallgrav:

- autonomi per action
- autonomi per kund
- autonomi per beloppsgräns
- autonomi per kanal
- autonomi per confidence
- autonomi baserad på historisk approve-rate

## 4.3 Bakgrundsagenterna har ovanligt mogen guardrail-logik

Det finns redan stöd för:

- deduplicering
- kostnadstak
- kill-switch
- approval-rate limiting
- agentidentiteter
- pushnotiser
- typed actions
- sparade observationer
- agentmeddelanden
- approval-kö
- dagliga gränser

Det är tydligt att systemet redan försöker lösa problem som många agentprodukter först upptäcker efter lansering:

- spam
- dubbla förslag
- okontrollerad kostnad
- otydlig agentattribution
- autonomi utan kontroll

## 4.4 Produktutvecklingen utgår från verkliga arbetsproblem

Offertflödet visar en stark produktfilosofi:

> Hantverkaren är expert på jobbet. Handymate ska vara expert på dokumentet och processen.

Flytten mot Snabbofferten är strategiskt rätt:

- AI bygger utkast
- hantverkaren granskar sektioner
- endast relevant kontroll visas
- samma state används i snabb- och fullständig editor
- användaren slipper bygga dokumentet från noll
- approval betyder att det som användaren såg faktiskt sparas

Detta är bättre än att kopiera ett traditionellt formulärsystem och lägga AI ovanpå.

## 4.5 Mobilens driftstöd är en bra grund

Mobilappen har:

- SecureStore för sessioner
- Sentry
- global error boundary
- nätverksbanner
- pushnotiser
- deep links
- Expo-router
- Zustand
- testfiler

Det visar att mobilen behandlas som en riktig produkt och inte bara ett demo-gränssnitt.

## 4.6 Marknadspositioneringen är begriplig

Budskapet “Ditt AI-team som sköter kontorsarbetet” är tydligt och lätt att förstå.

Det finns även bra SEO-grunder:

- canonical
- Open Graph
- Twitter metadata
- strukturerad data
- SoftwareApplication-schema
- Organization-schema

---

# 5. Kritiska kvalitets- och säkerhetsproblem

# P0 — måste hanteras omedelbart

## P0.1 SSRF-risk i publik webbplatsscraper

### Berörd yta

`handymate-landing/api/hemsida-scrape.js`

### Problem

Endpointen tar emot en användarstyrd URL och gör server-side `fetch(url)`.

Utan tillräckliga kontroller kan detta användas för att nå:

- `localhost`
- interna privata nätverk
- cloud metadata endpoints
- link-local-adresser
- interna adminytor
- alternativa protokoll
- redirectkedjor mot privata resurser
- DNS rebinding-mål

### Affärsrisk

- intern dataläcka
- komprometterad deployment
- scanning av intern infrastruktur
- kostnadsdrivande missbruk
- säkerhetsincident före lansering

### Rekommenderad lösning

Skapa en gemensam `safeFetchExternalUrl()`.

Den ska:

1. endast acceptera `https:`
2. blockera credentials i URL
3. blockera loopback
4. blockera privata IPv4-intervall
5. blockera privata IPv6-intervall
6. blockera link-local
7. blockera cloud metadata hosts
8. resolva DNS och validera IP
9. validera varje redirect
10. begränsa redirects
11. begränsa svarsstorlek
12. begränsa content type
13. använda timeout
14. logga abuse-signaler
15. rate-limita per IP
16. ligga bakom CAPTCHA eller motsvarande

### Acceptance criteria

- `https://example.com` fungerar
- `http://localhost` blockeras
- `https://127.0.0.1` blockeras
- `https://169.254.169.254` blockeras
- privata RFC1918-adresser blockeras
- redirect från publik till privat adress blockeras
- DNS-svar som resolve:ar till privat IP blockeras
- response över maxstorlek avbryts
- testsuite täcker samtliga ovanstående scenarier

### Föreslagen första commit

```text
security(landing): block SSRF in website scraper
```

---

## P0.2 Mobilen faller tillbaka till owner med alla rättigheter

### Berörd yta

`handymate-mobile/lib/api.ts`

### Problem

Vid vissa nätverks-, server- eller parsefel skapas en fallback-användare med:

- `role: owner`
- alla permissions satta till `true`

Det är en fail-open-modell.

### Affärsrisk

Även om backend i många fall skyddar själva operationen kan UI:

- visa ekonomisk information för fel roll
- exponera funktioner som användaren inte ska se
- ge falsk trygghet
- maskera saknade backendkontroller
- göra behörighetsbuggar svåra att upptäcka

### Rekommenderad lösning

Byt till fail-closed:

1. använd senast verifierade rättigheter från säker lokal cache
2. markera cache som stale
3. om ingen verifierad cache finns: använd minimal read-only-roll
4. dölj känsliga ytor tills rättigheter är verifierade
5. visa tydligt offline-/begränsat läge
6. logga avvikelsen i Sentry

### Acceptance criteria

- nätverksfel ger aldrig owner/all
- 404 ger aldrig owner/all
- parsefel ger aldrig owner/all
- senast verifierade permissions kan användas offline
- cached permissions har timestamp/version
- känsliga ytor döljs utan verifierade rättigheter
- backend är fortsatt source of truth

### Föreslagen första commit

```text
security(mobile): fail closed on permission lookup
```

---

# P1 — hög prioritet

## P1.1 Ingen riktig automatisk releasegrind

### Problem

Dashboarden har scripts för:

- dev
- build
- start
- lint

Men saknar en standardiserad CI-kedja som alltid kör:

- typecheck
- unit tests
- integration tests
- smoke tests
- build

De befintliga GitHub Actions-flödena är manuella eller pausade.

Mobilen har testberoenden och testfiler men saknar scripts för:

- test
- lint
- typecheck

### Affärsrisk

- regressioner når `main`
- agentändringar kan bryta kritiska flöden
- mobil/webb glider isär
- högre risk när Claude Code gör stora förändringar
- builds ger falsk trygghet eftersom build != funktionell korrekthet

### Rekommenderad lösning

Inför obligatoriska branch protection-regler.

#### Dashboard CI

```bash
npm ci
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e:smoke
```

#### Mobile CI

```bash
npm ci
npm run typecheck
npm run lint
npm run test
npx expo-doctor
```

#### Landing CI

```bash
npm ci
npm run lint
npm run test
npm run build
```

### Acceptance criteria

- `main` är skyddad
- merge kräver gröna checks
- CI körs på pull request
- smoke tests täcker de viktigaste flödena
- testartefakter sparas vid failure
- CI använder `npm ci`
- secrets är minimalt scoped

### Föreslagen commitserie

```text
ci(dashboard): add mandatory quality gates
ci(mobile): add typecheck lint and test workflow
ci(landing): add security and build checks
```

---

## P1.2 GitHub-agenten får skriva för fritt

### Problem

Agent-workflowet använder en mycket bred behörighetsmodell och kan i praktiken skriva kod och pusha ändringar.

### Risk

- direkt förändring av produktionskod
- okontrollerad scope
- supply-chain-risk
- svårt att verifiera exakt vad agenten gjort
- hög blast radius

### Rekommenderad lösning

Agenten ska:

- skapa branch
- skapa draft PR
- aldrig pusha direkt till `main`
- använda minimalt token-scope
- begränsas till definierade paths där möjligt
- kräva CI
- kräva mänskligt godkännande
- skriva en ändringsrapport
- inte få använda `--dangerously-skip-permissions` i produktionsrepo

### Acceptance criteria

- ingen agent kan skriva direkt till `main`
- alla agentändringar sker via PR
- agentens tillåtna filscope är dokumenterat
- PR innehåller testresultat
- PR innehåller riskbedömning
- branch protection blockerar direktpush

---

## P1.3 In-memory rate limiting fungerar inte i serverless

### Problem

Rate limiting använder processlokal `Map`.

I serverlessmiljö innebär det:

- varje instans har egen räknare
- cold starts nollställer räknaren
- samtidiga instanser kringgår gränsen
- dagskvoter blir opålitliga

### Rekommenderad lösning

Använd en distribuerad räknare:

- Upstash Redis
- Redis
- Supabase RPC med atomiska operationer
- dedikerad usage-metering-tabell

### Designkrav

Varje limit ska stödja:

- business
- user
- IP
- endpoint
- action type
- minut
- dag
- plan
- override
- soft warning
- hard block

### Acceptance criteria

- samma limit gäller över alla instanser
- reset fungerar korrekt
- atomiska increments
- limitdata kan observeras
- planbaserade kvoter fungerar
- abuse-events loggas

---

## P1.4 Publika AI-endpoints kan missbrukas ekonomiskt

### Berörda ytor

Exempel:

- `handymate-landing/api/demo.js`
- `handymate-landing/api/hemsida-scrape.js`
- offertgeneratorendpoints
- lead endpoints

### Problem

Publika AI-endpoints saknar eller verkar sakna:

- robust rate limiting
- CAPTCHA
- användarkvot
- IP-budget
- maximal inputlängd
- abuse detection
- kostnadsbudget
- request body-gräns

### Risk

- okontrollerade Anthropic-kostnader
- spam
- bottrafik
- prompt abuse
- tjänsten används som gratis AI-proxy

### Rekommenderad lösning

Skapa `public-ai-guard` med:

- CAPTCHA-verifiering
- rate limit per IP
- daily budget
- input length cap
- allowlisted scenarios
- output cap
- request timeout
- abuse scoring
- kill switch
- observability

### Acceptance criteria

- anonyma användare kan inte skapa obegränsade anrop
- kostnad per endpoint kan följas
- max input och output är hårda
- fel returnerar korrekta statuskoder
- bottrafik blockeras
- kill switch kan stänga endpointen utan deploy

---

## P1.5 Agentanrop saknar en gemensam robust model gateway

### Problem

Agentanropen har bra diagnostik men infrastrukturen är fragmenterad.

Risker:

- modellnamn hårdkodade
- priser hårdkodade
- ingen central timeout
- ingen central retry/backoff
- regexbaserad JSON-parsing
- `any` i kritisk parsing
- raw output och thinking-data kan läcka PII
- flera implementationer kan glida isär

### Rekommenderad lösning

Skapa `lib/ai/model-gateway`.

Gatewayen ska hantera:

- modellrouting
- timeout
- retries
- structured outputs
- schema validation
- fallbackmodell
- token usage
- cost estimation
- trace id
- prompt version
- PII-redaktion
- logging policy
- business budget
- feature budget
- eval hook
- error taxonomy

### Acceptance criteria

- alla nya agentanrop går via gateway
- kritiska befintliga anrop migreras
- inga fulla thinking-block sparas
- schemafel ger definierad fallback
- timeout testas
- retries är begränsade och idempotenta
- modellpris ligger i central registry

---

# 6. Arkitekturproblem som kommer bromsa utvecklingen

## 6.1 För stora domänfiler

Flera filer har vuxit till egna system:

- stora kunddetaljsidor
- stora kalenderfiler
- stor agentvy
- stor approvalsvy
- stor mobil tidsvy
- stor mobil `api.ts`

Problemet är inte bara radantalet. Problemet är att följande blandas:

- rendering
- state
- API-anrop
- affärslogik
- datamappning
- behörighet
- side effects
- felhantering

### Rekommenderad målstruktur

```text
domain/
application/
api/
components/
hooks/
schemas/
tests/
```

### Exempel

```text
quotes/
  domain/
    quote.ts
    quote-calculations.ts
    quote-validation.ts
  application/
    create-quote.ts
    send-quote.ts
  api/
    quote-client.ts
    quote-contracts.ts
  components/
  hooks/
  tests/
```

### Viktig princip

Refaktorera inte efter filstorlek enbart.

Refaktorera när det förbättrar:

- testbarhet
- tydliga kontrakt
- återanvändning
- felsökning
- ägarskap
- agentförståelse

---

## 6.2 Dashboard och mobil delar inte verkliga kontrakt

### Problem

Mobilen duplicerar många API-shapes manuellt.

Det leder till drift mellan:

- approval-typer
- request payloads
- response payloads
- permissions
- statusfält
- agent attribution
- felkoder

### Rekommenderad lösning

Skapa:

```text
@handymate/contracts
```

Paketet ska innehålla:

- Zod-scheman
- TypeScript-typer
- request/response-kontrakt
- approvaltyper
- eventtyper
- permissions
- agent actions
- gemensamma felkoder
- pagination contracts
- versionering

### Acceptance criteria

- dashboard och mobile importerar samma kontrakt
- API svar valideras runtime
- okända approval-typer renderas säkert
- kontraktstester körs i CI
- breaking changes kräver versionsändring

---

## 6.3 Dokumentation och implementation har börjat glida isär

### Problem

Historiska kommentarer och auditdokument beskriver ibland problem som redan är lösta.

Detta kan få framtida utvecklare eller agenter att:

- återskapa gamla buggar
- fatta fel arkitekturbeslut
- prioritera fel saker
- misstolka produktprinciper

### Rekommenderad lösning

Inför:

- ADR:er
- `last_verified_at`
- ägare per dokument
- tester som uttrycker beslut
- arkivering av gamla auditrapporter
- “historical” märkning
- borttagning av utdaterade kommentarer

### Acceptance criteria

- aktiva dokument har verifieringsdatum
- gamla auditdokument markeras som historiska
- viktiga beslut länkar till test
- kommentarer beskriver nuvarande beteende

---

## 6.4 Agentminnet är ännu inte en försvarbar vallgrav

### Nuvarande svagheter

- embedding är `null`
- retrieval baseras främst på importance
- deduplicering är textbaserad
- provenance saknas
- tidsmässig giltighet saknas
- rättelseflöde saknas
- forget-flöde saknas
- PII-klassificering saknas
- minnen kan bli felaktiga eller utdaterade

### Rekommenderad målbild

Varje minne ska ha:

```text
id
business_id
agent_id
entity_type
entity_id
memory_type
content
source_type
source_id
created_at
valid_from
valid_until
confidence
confirmed_by_user
sensitivity
access_scope
embedding
supersedes_id
status
```

### Retrieval ska väga in

- semantisk relevans
- recency
- confidence
- entity
- source
- användarbekräftelse
- risk
- expiry

### Acceptance criteria

- varje minne har källa
- minnen kan rättas
- minnen kan glömmas
- känsliga minnen har access scope
- stale minnen används inte
- retrieval är mätbar
- beslut kan förklara vilka minnen som användes

---

# 7. Strategisk position

## 7.1 Nuvarande position

Handymate kan beskrivas som:

> Ett komplett affärssystem med ett AI-team.

Det är begripligt men inte tillräckligt försvarbart.

Konkurrenter kan också lägga till AI-agenter.

## 7.2 Rekommenderad position

> **Handymate driver varje jobb från första kundkontakt till betald faktura.**

Detta är starkare eftersom det beskriver ett resultat, inte en teknik.

## 7.3 Kategorin Handymate bör äga

> **Autonom jobbmotor för hantverksföretag**

Traditionella system:

- lagrar
- visar
- kräver manuella steg
- väntar på att användaren ska agera

Handymate ska:

- förstå vad som händer
- upptäcka vad som saknas
- föreslå nästa steg
- utföra det säkert
- följa upp att det blev gjort
- lära sig av resultatet

## 7.4 Konkurrens mot Bygglet

Bygglet är starkt på traditionell operativ bredd:

- arbetsorder
- tid
- material
- offerter
- fakturering
- ÄTA
- KMA
- riskhantering
- personalliggare
- projektbudget
- ekonomiintegrationer

Handymate behöver inte kopiera varje meny.

Handymate måste däremot uppnå minst lika hög tillförlitlighet i kritiska flöden:

- fältdokumentation
- compliance
- ekonomiexport
- offline
- tid/material
- projektuppföljning

## 7.5 Konkurrens mot Easoft

Easoft är den strategiskt farligare konkurrenten.

De har redan:

- CRM
- kalkyl/offert
- planering
- resursstyrning
- projektuppföljning
- lager
- dokumentation
- ekonomi
- mobilitet
- AI-agentpositionering

Handymate kan därför inte vinna långsiktigt på:

> “Vi har AI-agenter.”

Handymate måste vinna på:

1. färre knapptryckningar
2. snabbare time-to-value
3. closed-loop execution
4. personlig verksamhetsinlärning
5. bättre marginalkontroll
6. tidigare riskdetektion
7. mätbar ekonomisk effekt
8. överlägsen mobil arbetsupplevelse

---

# 8. High-impact-utveckling

# 8.1 Project Autopilot

## Mål

Varje projekt ska ha en maskinläsbar mission.

### Mission ska innehålla

```text
mål
deadline
förväntad omsättning
målmarginal
kundlöften
bemanning
materialbehov
risker
nästa milstolpe
väntande actions
saknade bevis
faktureringsstatus
```

## Autopiloten ska kontinuerligt kontrollera

- försening
- materialrisk
- bemanningsrisk
- utebliven kunduppföljning
- odokumenterad ÄTA
- ofakturerat arbete
- marginalavvikelse
- saknade bevis
- nästa bästa action

## Produktresultat

En gemensam styrning per jobb i stället för separata agentinsikter.

## MVP

- skapa `project_mission`
- skapa `project_risk`
- skapa `project_next_action`
- daglig evaluator
- projektkort med status
- “varför flaggas detta?”
- CTA direkt till action

## Acceptance criteria

- varje aktivt projekt har mission
- minst en next action kan genereras
- actions dedupliceras
- actions kan godkännas/avvisas
- utfall loggas
- nästa action kan härledas till data

---

# 8.2 Field-to-cash från röst och foto

## Vision

Hantverkaren säger:

> “Vi blev klara med rivningen. Kunden ville även flytta golvbrunnen. Två timmar extra och material för cirka 1 800.”

Handymate ska:

1. transkribera
2. förstå
3. koppla till projekt
4. skapa dagboksnotering
5. identifiera möjlig ÄTA
6. bifoga tid/plats/foton
7. skapa kundunderlag
8. förbereda nytt pris
9. skicka för godkännande
10. lägga i fakturaunderlag

## Varför detta är viktigt

Det omvandlar en naturlig fälthändelse till intäkt och dokumentation.

## MVP

- voice intake
- project matching
- event extraction
- ATA candidate
- evidence bundle
- approval card
- invoice candidate

## Acceptance criteria

- en röstanteckning kan skapa strukturerade events
- användaren kan korrigera transkript
- inget skickas utan approval
- evidence kopplas till projekt
- ÄTA kan bli fakturaunderlag

---

# 8.3 Profitability Autopilot

## Mål

Visa förväntad marginal vid projektets slut.

## Datakällor

- offert
- planerade timmar
- faktiska timmar
- material
- inköpskostnad
- underentreprenörer
- frånvaro
- omplanering
- ÄTA
- fakturor
- återstående arbete
- historiska liknande projekt

## Output

Exempel:

> Projektet väntas landa på 14 % marginal mot målet 24 %. Två extra dagar står för huvuddelen. Fakturerbar ÄTA om cirka 18 400 kr saknar godkännande.

## MVP

- baseline budget
- actuals
- estimated remaining
- forecast at completion
- top margin drivers
- recommended actions

## Acceptance criteria

- prognosen kan förklaras
- osäkerhet visas
- källor visas
- historiskt prognosfel mäts
- användaren kan korrigera antaganden

---

# 8.4 Förtjänad autonomi

## Nivåmodell

```text
Nivå 0 — AI observerar
Nivå 1 — AI föreslår
Nivå 2 — AI förbereder, människa godkänner
Nivå 3 — AI utför inom risk-/beloppsgräns
Nivå 4 — AI äger processen och rapporterar avvikelser
```

## Autonomi ska definieras per

- agent
- action
- kund
- kanal
- beloppsgräns
- tid
- confidence
- historisk approve-rate
- riskklass

## Produktkrav

- tydlig förklaring
- revoke
- action ledger
- undo där möjligt
- policy simulation
- autonomy proposal
- approval history

## Acceptance criteria

- autonomi är aldrig globalt diffus
- varje autonom action har policy snapshot
- varje action kan auditeras
- användaren kan stoppa och återkalla
- felaktiga actions påverkar trust score

---

# 8.5 Handymate Business Memory Graph

## Mål

Skapa en sammanhängande minnesmodell för:

```text
Företag
Kund
Projekt
Leverantör
Medarbetare
Arbetssätt
Prisregel
Beslut
Löfte
Risk
Utfall
```

## Exempel

### Företag

- föredragen tonalitet
- standardpåslag
- minsta jobbvärde
- godkännanderegler
- arbetstider
- serviceområde

### Kund

- kommunikationspreferens
- tidigare jobb
- betalningsbeteende
- önskemål
- missnöje
- beslut

### Projekt

- löften
- ändringar
- risker
- bevis
- milstolpar
- slututfall

## Acceptance criteria

- minnen har provenance
- minnen kan rättas
- minnen kan glömmas
- minnen har confidence
- beslut visar använda minnen
- access följer behörighet
- PII kan klassificeras

---

# 8.6 Compliance- och bevismotor

## Mål

Automatisera kontroll av:

- KMA
- egenkontroller
- riskbedömningar
- foto före/efter
- ÄTA-godkännande
- kundsignatur
- ROT/RUT-underlag
- produktspårning
- personalliggare
- vem gjorde vad och när

## Output

> Projektet är färdigt, men tre bevis saknas innan fakturan bör skickas.

## Acceptance criteria

- projektet har evidence checklist
- bevis har timestamp
- bevis har actor
- bevis kan exporteras
- saknade bevis flaggas
- fakturering kan varna men inte nödvändigtvis blockera

---

# 8.7 Customer Agent

## Mål

En gemensam kundrelation över:

- telefon
- SMS
- e-post
- webbformulär
- offertportal
- projektuppdateringar
- fakturadialog

## Kundagenten ska känna till

- tidigare frågor
- företagets löften
- offertstatus
- projektstatus
- nästa bokning
- fakturastatus
- kundpreferenser
- missnöje
- nästa bästa svar

## Acceptance criteria

- alla kanaler kan kopplas till samma conversation
- kundens historik sammanfattas
- duplicerade svar undviks
- commitments extraheras
- nästa steg loggas
- handoff till människa fungerar

---

# 8.8 Benchmarking från verkliga jobb

## Senare potential

När datakvaliteten är tillräcklig kan Handymate skapa anonymiserade riktvärden:

- timmar per jobbtyp
- materialavvikelse
- offertacceptans
- marginal
- försening
- optimal bemanning
- prisintervall
- vanligaste risker

## Viktig begränsning

Bygg inte detta innan:

- datakontrakt är stabila
- events är konsekventa
- projektutfall är korrekta
- privacy-design är klar

---

# 9. Vad som inte bör prioriteras nu

Bygg inte nu:

- fler namngivna AI-agenter
- fler generella dashboards
- fler generiska AI-textverktyg
- fler moduler som duplicerar konkurrenters menyer
- kosmetiska analytics utan actions
- nya autonoma flöden utan action ledger
- fler publika AI-demos utan kostnads- och abusekontroll

Nästa fas ska handla om:

1. kvalitet
2. säkerhet
3. sammanslagna arbetsflöden
4. closed-loop execution
5. ekonomisk effekt

---

# 10. Rekommenderad 90-dagarsplan

# Fas 1 — Gör grunden pålitlig

## Vecka 1–3

### Säkerhet

- stäng SSRF
- säkra publika AI-endpoints
- fail-closed permissions i mobilen
- distribuerad rate limiting
- body size limits
- request timeouts
- central secrets policy

### Kvalitet

- obligatorisk CI
- branch protection
- contract package
- model gateway
- action ledger
- PII-redaktion
- smoke tests
- error taxonomy

### Dokumentation

- ADR-format
- dokumentstatus
- arkivera gamla auditrapporter
- uppdatera stale kommentarer

---

# Fas 2 — Bygg en sammanhängande jobbmotor

## Vecka 4–8

- Project Mission
- Project Autopilot
- next-action-kö
- Field-to-cash
- ÄTA-kandidat
- fakturaberett jobb
- lönsamhetsprognos
- evidence checklist
- projekt-riskkort

---

# Fas 3 — Bevisa autonomin

## Vecka 9–12

- autonominivåer
- trust score
- action policies
- customer agent
- kapacitetsfyllning
- business outcome dashboard
- pilotmätning
- agent-evals

---

# 11. Prioriterad backlog

# P0

- [ ] Blockera SSRF i `hemsida-scrape`
- [ ] Ta bort owner/all fail-open i mobilen
- [ ] Lägg skydd framför publika AI-endpoints
- [ ] Säkerställ att inga hemligheter kan läcka via loggar

# P1

- [ ] Obligatorisk CI i alla tre repositories
- [ ] Skydda `main`
- [ ] Flytta rate limiting till distribuerad lagring
- [ ] Skapa `@handymate/contracts`
- [ ] Skapa central model gateway
- [ ] Skapa agent action ledger
- [ ] Inför request IDs och trace IDs
- [ ] Lägg body size limits
- [ ] Lägg robust input validation på publika endpoints
- [ ] Flytta GitHub-agent till PR-baserat flöde

# P2

- [ ] Bryt ut stora domänfiler
- [ ] Inför API schema validation
- [ ] Förbättra agentminnet
- [ ] Inför source/provenance i minnen
- [ ] Gemensam felkodmodell
- [ ] Standardisera logging
- [ ] Lägg Sentry även på dashboard om det saknas
- [ ] Automatisera stale documentation checks

# P3

- [ ] Project Autopilot
- [ ] Field-to-cash
- [ ] Profitability Autopilot
- [ ] Customer Agent
- [ ] Compliance Engine
- [ ] Benchmarking

---

# 12. Föreslagen teststrategi

## 12.1 Unit tests

Testa rena funktioner:

- prisberäkningar
- ROT/RUT
- autonomy gating
- dedup
- rate limit decisions
- URL-säkerhet
- permission fallback
- agent routing
- quote section mapping
- memory ranking
- risk scoring

## 12.2 Contract tests

Testa:

- dashboard response mot schema
- mobile parsing mot schema
- approvaltyper
- eventtyper
- permissions
- statusvärden
- pagination
- error payload

## 12.3 Integration tests

Testa:

- skapa kund
- skapa offert
- skicka offert
- skapa faktura
- approval execution
- SMS
- e-post
- kalender
- Fortnox
- check-in
- ÄTA
- customer portal

## 12.4 E2E smoke tests

Minst:

1. signup/login
2. skapa kund
3. skapa offert
4. skicka offert
5. kundsignering
6. skapa projekt
7. logga tid
8. skapa faktura
9. approval approve/reject
10. mobil login och home
11. mobil check-in
12. mobil approval

## 12.5 Agent evals

Skapa fasta scenarier för:

- lead qualification
- offertgenerering
- betalningspåminnelse
- ÄTA-detektering
- kapacitetsfyllning
- riskbedömning
- lönsamhetsinsikt
- kundsvar
- agent handoff

Mät:

- korrekt action
- korrekt tool
- felaktig autonomi
- hallucination
- schemafel
- latency
- kostnad
- mänsklig korrigering
- approve-rate

---

# 13. Observability

Inför gemensam struktur:

```text
trace_id
request_id
business_id
user_id
agent_id
feature
action
trigger_type
model
prompt_version
latency_ms
input_tokens
output_tokens
cost_usd
result
error_code
approval_required
autonomy_policy_id
```

## Logga inte

- full thinking
- råa access tokens
- fulla personnummer
- fulla API-nycklar
- okrypterad känslig kunddata
- fulla e-postmeddelanden utan behov

---

# 14. Agent action ledger

Varje agentaction bör logga:

```text
action_id
business_id
agent_id
trigger_source
action_type
target_type
target_id
input_summary
policy_snapshot
approval_id
autonomy_level
status
started_at
completed_at
result
error
undo_available
undo_status
cost
trace_id
```

## Detta möjliggör

- audit
- förklaring
- trust score
- autonomy
- rollback
- kundsupport
- agent-evals
- compliance

---

# 15. Produktprinciper som ska låsas med tester

1. Användarinitierade konversationssvar ska inte stoppas av bakgrundskostnadstak.
2. Autonoma systemhandlingar kräver approval om inte explicit autonomi finns.
3. Approval ska spara exakt det användaren såg.
4. Mobilen får aldrig anta owner vid permissionfel.
5. Publika URLs får aldrig ge servern åtkomst till privata nätverk.
6. Agenten får aldrig skicka osäkra handlingar utan policykontroll.
7. Ofullständig AI-output får aldrig se ut som fullständig.
8. Spara aldrig mer känslig data än nödvändigt.
9. Varje ekonomisk beräkning ska kunna förklaras.
10. Varje agentinsikt ska kunna härledas till data.

---

# 16. Mätvärden som ska styra produkten

Sluta prioritera antal AI-features som huvudmått.

Mät i stället:

- administrativ tid per jobb
- tid från lead till svar
- tid från platsbesök till offert
- offertacceptans
- upptäckt ÄTA
- godkänd ÄTA
- färdigt jobb till faktura
- utfört men ofakturerat värde
- prognosfel för slutmarginal
- approve-rate
- ändrade agentförslag
- ångrade autonoma handlingar
- misslyckade agentactions
- jobb som går från lead till betald faktura med minimal administration

## Kommersiellt kärnbudskap

Inte:

> Du får sex AI-medarbetare.

Utan:

> Handymate minskar tiden till offert, fångar missad ÄTA och får färdiga jobb fakturerade snabbare.

---

# 17. Rekommenderad resursfördelning kommande 90 dagar

- **50 %** kvalitet, säkerhet, kontrakt, tester och agent-evals
- **35 %** Project Autopilot, field-to-cash och lönsamhetsprognos
- **15 %** onboarding, paketering och mätbar kundnytta

---

# 18. Första genomförandeplan för Claude Code

## Sprint 1 — Security foundation

### Task 1

**Titel:** Block SSRF in landing scraper

**Filer att granska:**

```text
handymate-landing/api/hemsida-scrape.js
```

**Nya filer, exempel:**

```text
handymate-landing/lib/security/safe-url.js
handymate-landing/lib/security/ip-ranges.js
handymate-landing/tests/security/safe-url.test.js
```

**Krav:**

- endast HTTPS
- privat IP blockeras
- redirectvalidering
- timeout
- size cap
- content type validation
- tests

---

### Task 2

**Titel:** Fail closed on mobile permissions

**Filer att granska:**

```text
handymate-mobile/lib/api.ts
handymate-mobile/lib/user-store.ts
```

**Krav:**

- inga owner/all fallbacks
- verifierad cache
- read-only fallback
- Sentry event
- tests

---

### Task 3

**Titel:** Protect public AI endpoints

**Filer att granska:**

```text
handymate-landing/api/demo.js
handymate-landing/api/offertmall.js
handymate-landing/api/hemsida-scrape.js
handymate-landing/api/save-lead.js
```

**Krav:**

- rate limit
- CAPTCHA
- body size limit
- input validation
- cost budget
- abuse logging
- kill switch

---

## Sprint 2 — CI and contracts

### Task 4

**Titel:** Add mandatory quality gates

**Repos:**

```text
handymate-dashboard
handymate-mobile
handymate-landing
```

**Krav:**

- typecheck
- lint
- tests
- build
- smoke
- branch protection documentation

---

### Task 5

**Titel:** Create shared API contracts

**Nytt package:**

```text
packages/contracts
```

**Första kontrakt:**

- approvals
- permissions
- agent actions
- user
- errors
- pagination

---

## Sprint 3 — Agent platform hardening

### Task 6

**Titel:** Create model gateway

**Mål:**

- central model routing
- central cost
- timeout
- retries
- schemas
- redaction
- trace IDs

---

### Task 7

**Titel:** Create action ledger

**Mål:**

- logga varje action
- policy snapshot
- approval link
- undo status
- cost
- outcome

---

## Sprint 4 — Project Autopilot foundation

### Task 8

**Titel:** Introduce project mission

**Nya domäner:**

```text
project_mission
project_risk
project_next_action
```

**Första evaluatorer:**

- projekt försenat
- saknad kunduppföljning
- odokumenterad ÄTA
- utfört men ofakturerat
- saknade bevis

---

# 19. Definition of done

En uppgift är inte klar förrän:

- implementation finns
- tester finns
- typecheck är grön
- lint är grön
- build är grön
- risker är dokumenterade
- migration är säker
- rollback är beskriven
- observability finns
- acceptance criteria är verifierade
- commit är liten och begriplig

---

# 20. Slutrekommendation

Handymate har redan en starkare teknisk och produktmässig kärna än många tidiga vertikala SaaS-produkter.

Försprånget kommer dock inte från att bygga flest moduler eller flest AI-agenter.

Försprånget kommer från att göra Handymate till:

> **Den första pålitliga autonoma jobbmotor som driver ett hantverksjobb från första kundkontakt till betald faktura.**

Det innebär att nästa fas ska fokusera på:

1. säkra publika ytor
2. stabila releasegrindar
3. gemensamma kontrakt
4. robust agentplattform
5. action ledger
6. projektcentrerad autopilot
7. field-to-cash
8. lönsamhetsprognos
9. förtjänad autonomi
10. mätbar ekonomisk effekt

Det finns redan tillräcklig featurebredd.

Nu måste produkten bli:

- mer sammanhängande
- mer pålitlig
- mer förklarbar
- mer mätbar
- mer autonom
- svårare att kopiera

