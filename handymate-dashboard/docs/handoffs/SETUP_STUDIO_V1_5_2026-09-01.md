# Setup Studio V1.5 — Matte som guide, samma onboardingmotor

Datum: 2026-09-01  
Status: byggd lokalt bakom flagga, ej aktiverad, ej pushad

## Utfall

V1.5 lägger ett chattlikt Matte-skal runt de befintliga åtta onboardingstegen.
Det är ett rent presentationslager:

- samma stegkomponenter renderas exakt en gång;
- samma lokala formstate, validering och `/api/onboarding`-skrivvägar används;
- ingen ny LLM-, API-, mission- eller offertskrivväg har skapats;
- företagets verkliga svar visas löpande som ett litet inställningskvitto;
- `Byt till klassisk guide` växlar omedelbart och minns valet i `sessionStorage`;
- reducerad rörelse respekteras;
- mobil och desktop har separata responsiva layouter.

## Aktivering

```text
NEXT_PUBLIC_SETUP_STUDIO_ENABLED=true
```

Flaggan är exakt och fail-closed: saknad, `false` eller annan stavning ger den
befintliga guiden. `?classic=1` tvingar klassiskt läge och `?studio=1` kan
återaktivera Studio när byggflaggan är på. Parametrarna påverkar inga
företagsdata.

Rekommenderad ordning:

1. Sätt flaggan endast i Preview/intern miljö.
2. Kör färsk-kontot hela vägen på mobil och desktop.
3. Verifiera resumption efter omladdning, Stripe-retur och klassisk fallback.
4. Aktivera inte i Production före godkänt skarpbevis.

V1.5 behöver inte vara produktionsaktiverad till lanseringen. Den befintliga
V1-guidningen i commit `8df45b01` är fortsatt standard tills flaggan slås på.

## Sanningsbevis

Två avsedda testföretag kontrollerades read-only mot produktionsdatabasen.
Båda ligger på onboardingsteg 1, saknar `onboarding_completed_at` och har noll
produkter, jobbtyper, offertmallar, kunder, leads och affärer. De är därför
giltiga färsk-konton för det interaktiva skarpbeviset utan reset eller
kunddatapåverkan.

Den automatiska kontrollen bevisar:

- flaggan är av som standard;
- klassisk fallback vinner;
- alla åtta steg återanvänds i en enda rendergren;
- Studio-skalet saknar nätverks- och AI-anrop;
- rörelsereducering och publik flaggning är uttryckliga.

Körda kontroller:

- `npx playwright test tests/onboarding-setup-studio.spec.ts tests/onboarding-wow.spec.ts tests/onboarding-first-mission.spec.ts --no-deps` — 68 gröna i desktop + mobil.
- `npx tsc --noEmit` — rent.
- `npx next build` — exit 0. Bygget loggar befintliga auth/supabase-varningar när det körs utan `.env.local`, men sammanställning, typkontroll och statisk generering slutförs.

## Kvar före aktivering

Det verkliga kontot måste fortfarande klickas igenom. Beviset ska minst omfatta:

1. företagsuppgifter och återupptagning efter omladdning;
2. prismodell + uttryckligt standardpris/fallback;
3. telefonval och betalretur;
4. import utan låtsassignaler;
5. 1–3 jobbtyper, 3–5 verkliga artiklar och ett offertupplägg;
6. första uppdraget på tom portfölj;
7. flygningen till den riktiga offertvyn;
8. klassisk fallback utan tappad formstate.

Om skarpbeviset hittar en defekt fixas den i den befintliga motorn. Studio-
skalet får inte bli platsen för kompensationslogik.

