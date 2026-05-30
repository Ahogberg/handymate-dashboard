# TD — time_entry.hourly_rate backfill när intern timkostnad sätts

**Loggat:** 2026-05-30 (under Fas 1a SQL-verifiering)
**Prioritet:** Medium — blockerar marginal_distribution Tier C-mönster för historisk data, men inte pilot-launch.

## Problem

Bee Service har 5 time_entries — **5/5 saknar `hourly_rate`** (verifierat 2026-05-30).

När pattern-extraction Tier C aktiveras (marginal_distribution per projekt-typ), kommer den behöva läsa `time_entry.hourly_rate × duration_minutes` för att räkna arbetskostnad per projekt. Med saknat `hourly_rate` blir kostnaden 0 → marginal-beräkningen blir falsk-hög → mönstret blir vilseledande.

## Konsekvens om ej fixat

- `marginal_distribution`-mönstret skriver **permanent** `is_stale=true` för historisk data (även när hantverkare sätter intern timkostnad i settings senare)
- compute-economics-helpern fortsätter producera `arbetskostnad_konfigurerad=false` för projekt med dessa historiska entries → MarginalCard fortsätter visa "Sätt intern timkostnad"-gate
- Lars kan inte ge meningsfulla marginal-warnings för historiska projekt

Detta är inte en bug i koden — det är en följd av att tidsregistrering kom innan internal-cost-fältet fanns. Men effekten är permanent dålig signal.

## Föreslagen fix

**När hantverkare sätter `internal_hourly_cost` i `/dashboard/settings/internal-costs`:**

1. Modal-prompt: *"Du har 5 tidigare tidrapporter utan timkostnad. Vill du applicera 850 kr/h retroaktivt på dem?"*
2. Default: kryssa i (assumes yes)
3. Backfill UPDATE: `time_entry SET hourly_rate = X WHERE business_id = Y AND hourly_rate IS NULL OR hourly_rate = 0`

Alternativ A: backfill alla (default-knapp)
Alternativ B: backfill per projekt (visa lista, välj per rad)
Alternativ C: skippa (acceptera permanent osäkerhet på historik)

## Beroenden

- compute-economics-helpern är redan på plats (Etapp 2.1)
- internal-costs-settings finns
- Det enda som saknas är UI-flödet för retroaktiv applicering

## Estimat

- Modal + backfill-route: 2-3 timmar
- UI-tester: 1 timme
- Total: ~halv arbetsdag

## Trigger för fix

- När Bee Service (eller annan pilot) sätter internal_hourly_cost första gången → erbjud backfill
- Om vi väntar tills marginal_distribution Tier C aktiveras (4-8 veckor) blir historiken förlorad permanent — bättre fixa nu så hantverkare kan välja att räddat den när de upptäcker compute-economics-värdet
