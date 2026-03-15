# Handymate Agent Team

Fem autonoma agenter som kör självständigt via GitHub Actions.

## Agenter
| Agent | Fil | Schema |
|-------|-----|--------|
| Orchestrator | orchestrator.md | Koordinerar alla |
| QA | qa-agent.md | Varje push |
| Engineer | engineer-agent.md | Natt 03:00 |
| Researcher | researcher-agent.md | Måndag 08:00 |
| Strategist | strategist-agent.md | Måndag 06:00 |
| Customer Success | customer-success-agent.md | Måndag 06:00 |

## Köra manuellt
```bash
# Alla agenter
claude --dangerously-skip-permissions "Läs agents/orchestrator.md och kör all"

# Specifik agent
claude --dangerously-skip-permissions "Läs agents/orchestrator.md och kör qa"
claude --dangerously-skip-permissions "Läs agents/orchestrator.md och kör research"
claude --dangerously-skip-permissions "Läs agents/orchestrator.md och kör strategy"
```

## Rapporter
Alla rapporter sparas i `agents/reports/` med datum i filnamnet.
Veckans plan skrivs till `WEEKLY.md` i projektroten varje måndag.
