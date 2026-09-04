# Övergripande plan: stäng autopilot-loopen (2026-09-04, Andreas: "arbeta igenom alla dessa")

Underlag: docs/audits/AUTOPILOT_REVISION_2026-09-04.md.

## Vad vi bygger, i en mening
Loopen **agent → kort → kunden får veta → beslut eller utgång → rapport** ska
vara stängd i kod och bevisbar med facit — utan att en enda riktig användare
behövs för beviset. Andreas korrigering är rätt: med piloter som knappt
använder produkten säger "andel hanterade kort" ingenting. Det som håller är
att varje steg i loopen faktiskt är kopplat.

## Acceptanskriteriet (samma för alla pass)
För ett kort av en typ kunden agerar på (t.ex. `karin_deadline`):
1. skapas det via `skapaKort()` → en `push_dispatch_log`-rad (eller hållen i
   tyst tid) — facit: källskanning + ren funktion
2. går det ut oläst → en `automation_activity`-rad som syns i "Skött utan dig"
3. veckan därpå → med i veckorapporten

## Passen och ordningen (filöverlapp styr)
| Pass | Innehåll | Rör | Körs |
|---|---|---|---|
| A | Push når fram: klientfix, "Aktivera notiser", `skapaKort()` med push, inkoppling i tysta cronar | PWAInstallBanner, settings, ny lib/approvals/skapa-kort.ts, 3–4 cronar | nu |
| D | NBA får sina principer; kill-switchen täcker evaluate-thresholds | next-best-action.ts, onboarding finalize, evaluate-thresholds | nu, parallellt med A |
| B | Utgångna kort syns; kortdiet (observation/dispatch/monthly_review/checklist → digestrader) | maintenance, save-and-push, 3 cronar | efter A |
| C | Veckorapporten som SMS; digestfönstret "sedan du var här senast" | ny cron, weekly-value, dygnsdigest, JarvisHome | efter B |

Detaljplaner: tasks/plan-autopilot-A-push.md, -B-utgang.md, -C-rapport.md,
-D-nba.md. Varje pass: Sonnet-agent, inga commits, verifiering enligt planen.

## Vad vi INTE gör
Slår inte på utgående automationer. Känslan ska komma från rapporteringen.
Intjänad autonomi (lib/autonomy/earned-autonomy.ts) är redan den ärliga vägen.
