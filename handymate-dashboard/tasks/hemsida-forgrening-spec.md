# Hemsida-förgreningen — spec (godkänd av Andreas 2026-07-24)

## Tes
EN fråga i onboardingen ger TRE vinster:
1. **Aha-ögonblick** — Matte läser kundens hemsida och förifyller onboardingen
   (teamet jobbar innan de ens betalat; minsta möjliga friktion).
2. **Rätt synlighetsväg** — har de sajt → widget + Google-recensionsslussen;
   har de ingen → microsajten publiceras (SEO Fas 1 börjar betjäna någon).
3. **Data vi saknar** — website_url lagras för framtida bruk.

## Verifierat nuläge (2026-07-24)
- Skrapning finns INTE (noll träffar scrape/skrapa/crawl/extractFromWebsite).
- `website_url` finns INTE på business_config (bara `website_api_key` = embed).
- Onboardingen frågar ALDRIG om hemsida.
- **Microsajt-editorn `/dashboard/website` finns INTE i sidomenyn** — bara i
  listan över sidor som döljs för anställda. Ägaren kan alltså inte hitta den.
- `storefront.is_published` default false → microsajten är avstängd tills
  någon aktivt publicerar. Ingen nudge finns.
- SEO Fas 1 (sitemap/JSON-LD/ISR, mergad a6ed6323) gäller bara publicerade
  sajter → betjänar i praktiken ingen förrän förgreningen finns.

## Del 1 — Migration
`sql/v75_website_url.sql` (Andreas kör manuellt):
`ALTER TABLE business_config ADD COLUMN IF NOT EXISTS website_url TEXT;`
+ kommentar + verifieringsselect. Inget annat.

## Del 2 — Skrap- och extraktions-API
Ny route `app/api/onboarding/scrape-website/route.ts` (POST, auth via
getAuthenticatedBusiness):
- Input: `{ url }`. Normalisera (lägg till https:// om saknas), validera att
  det är en publik http(s)-URL. **Blockera interna/privata mål** (localhost,
  127.*, 10.*, 192.168.*, 169.254.*, .local) — SSRF-skydd.
- Hämta sidan server-side: timeout ~8 s, `redirect: 'follow'` (max ett fåtal),
  storleks-tak (~1 MB), User-Agent som identifierar Handymate.
- Strippa HTML till text (ta bort script/style/nav-brus), korta till rimlig
  längd (~15–20k tecken) före LLM.
- Extrahera med **Haiku** (`getClaudeModel('extraction')`, samma mönster som
  övriga extraktioner i repot) till strikt JSON. Fält att försöka hitta —
  ALLA valfria, hellre null än gissning:
  `business_name, org_number, description (kort, om företaget),
  services (string[]), phone, email, address, service_area, opening_hours`.
- Svar: `{ ok: true, extracted: {...} }` eller `{ ok: false, reason }`.
  Aldrig 500 för att kundens sajt är trasig — degradera snällt.
- Fail-safe genomgående: skrapfel/LLM-fel → `ok:false` med svensk orsak.

## Del 3 — Onboarding-frågan (aha-momentet)
Placering: TIDIGT, så extraktionen kan förifylla företagsuppgifterna. Byggaren
läser `app/onboarding/page.tsx` (stegmappningen) + `Step2Business.tsx` och
väljer det minst invasiva: antingen ett litet block överst i Step2Business
eller ett eget mikro-steg precis före det. Motivera valet i rapporten.

Flöde:
1. Fråga: **"Har du en hemsida?"** — [Ja, här är adressen] (URL-fält) /
   [Nej, jag har ingen].
2. **Ja + URL** → "Matte läser din hemsida…" (spinner, max ~10 s) → POST
   scrape-website → förifyll de fält som hittades i onboarding-formuläret,
   med tydlig men diskret markering att de kan ändras. Vid `ok:false`:
   vänlig svensk text ("Jag kunde inte läsa sidan — vi fyller i manuellt
   istället") och fortsätt UTAN att blockera. Spara `website_url` oavsett
   om skrapningen lyckades.
3. **Nej** → ingen skrapning; `website_url` lämnas null.
4. Steget får ALDRIG låsa flödet (samma "aldrig fastna"-princip som
   nummer-steget).

## Del 4 — Förgreningen (synlighetsvägen)
Efter onboarding, baserat på `website_url`:
- **Har website_url** (= egen sajt): visa widget-vägen ("AI på hemsidan" —
  koden att klistra på deras sajt) + Google-recensionsslussen. Microsajten
  hålls opublicerad (ingen kannibalisering — se SEO-resonemanget).
- **Saknar website_url**: erbjud microsajten — förhandsgranska sidan som
  redan går att bygga ur befintlig data (namn, tjänster, priser, öppettider,
  logga) och publicera med ETT klick.
Var detta ytas: enklast i Step6LiveTour/avslutningen ELLER som ett kort på
dashboarden efter onboarding — byggaren väljer det som blir minst invasivt
och motiverar. INGEN omdesign av framdörren (den är pausad, mobil-först).

## Del 5 — Gör microsajten hittbar
`components/Sidebar.tsx`: lägg `/dashboard/website` som synlig post
("Min hemsida", Globe-ikon) nära "AI på hemsidan". I dag finns den bara i
employee-döljlistan → ägaren hittar den aldrig. Behåll rollfiltret.

## EJ i denna insats (senare)
- Kö-kort som nudge ("din sida ligger som utkast — publicera?") — bra
  adoptionsmotor, men bygg efter att förgreningen finns.
- Förstaparts-recensioner → aggregateRating (SEO Fas 1b).
- Canonical-till-egen-domän (nisch, vänta tills någon frågar).

## Verifiering
- `node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit`
  (noll fel) + `npx next build` (ren förutom fortnox-sync-artefakten).
- Skrap-routen: testa mot en riktig svensk hantverkarsajt (t.ex. en publik
  sida) → rimlig extraktion; mot en 404/timeout-URL → `ok:false`, ingen krasch;
  mot `http://localhost` → blockeras (SSRF-skydd).
- Onboarding: "Nej"-vägen går igenom obehindrat; "Ja"-vägen med trasig URL
  blockerar aldrig; website_url sparas.
- Sidomenyn visar "Min hemsida" för ägare, inte för anställd-rollen.
