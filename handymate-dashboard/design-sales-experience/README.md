# Handymate Sales Experience — designkällan

`SalesExperience.dc.html` är **källan**. Den kompileras till React med

```
python3 scripts/dc_till_react.py \
  design-sales-experience/SalesExperience.dc.html \
  components/sales/sales-experience.generated.jsx \
  SalesExperienceGenererad
```

och monteras på `app/admin/sales` (vi säljer) och `app/case/[token]`
(kunden öppnar sin länk). Partnerportalen blir en tredje monteringsplats.

Ändra designen i kanvasen, lägg tillbaka filen här, kör om skriptet,
granska diffen i den genererade filen. **Redigera aldrig den genererade
filen** — den skrivs över.

## Två rader som MÅSTE finnas kvar vid en ny export

Kanvasen exporterar designen, inte våra funktionella krav. Båda raderna
nedan ligger i `componentDidMount` och vaktas av
`tests/salj-case-overlamning.spec.ts` — faller de bort fäller grinden
bygget, men då har någon redan tappat dem.

1. **Token läses ur sökvägen, inte bara ur `?case=`.** Den personliga
   länken är `/case/<token>`. Läser sidan bara frågeparametern hittar den
   aldrig sitt eget case.

2. **CTA:n använder serverns `onboardingUrl`** (`caseOnboardingUrl` sätts
   ur GET-svaret). Faller den tillbaka på `location.pathname + '#onboarding'`
   tappas `?ref=` — alltså partnerns provision, tyst.

## Varför inte bara visa kanvasen i en iframe

Kanvasens iframe har ingen nätutgång bortom sin egen origin. CTA:n kan
därför aldrig nå `/api/sales-case` därifrån; den faller tillbaka på
localStorage, som inte följer med till kundens webbläsare. Porteringen är
inte kosmetik — den är själva kopplingen.

## Vad skriptet gör och inte gör

Det översätter markupen: `{{hål}}`, `<sc-for>`, `<sc-if>`, inline-stilar,
`style-hover`/`style-focus` (som blir riktiga CSS-regler med egen klass,
36 av dem) och attributnamn React vill ha i camelCase. CSS:en från
`<helmet>` skopas under `.hm-sx` — annars hade `*`, `body`, `a`, `button`
och `p` slagit mot hela dashboarden.

Logikklassen följer med **orörd**. Det är avsiktligt: en handportering av
600 rader logik hade drivit isär från designkällan vid första ändringen.

Variablerna designen använder (`--teal-700`, `--slate-900`, `--border`,
`--fg-muted` …) kommer från kanvasens brand-bundle och finns inte i
dashboardens CSS. De definieras därför i `components/sales/sales-tokens.css`
med repots egna värden (`tailwind.config.ts` primary-skalan är teal-skalan).
