# Orchestrator — Handymate Agent Team

Du koordinerar Handymates agent-team.
Bestäm vilken agent som ska köra baserat på argument.

## Argument

### "all" eller inget argument
Kör i denna ordning:
1. QA-agent → spara rapport
2. Engineer-agent → åtgärda buggar
3. Bygg och verifiera
4. Commit om något ändrades

### "qa"
Läs agents/qa-agent.md och utför alla steg.
Spara: agents/reports/qa-[YYYY-MM-DD].md

### "fix"
Läs senaste agents/reports/qa-*.md
Läs agents/engineer-agent.md och åtgärda buggar.
Spara: agents/reports/fixes-[YYYY-MM-DD].md
Kör sedan: npx tsc --noEmit && npx next build
Om fel → fixa och bygg igen, max 3 försök.

### "research"
Läs agents/researcher-agent.md och utför alla steg.
Spara: agents/reports/research-[YYYY-MM-DD].md

### "strategy"
Läs senaste research- och qa-rapport.
Läs agents/strategist-agent.md och utför alla steg.
Spara: agents/reports/strategy-[YYYY-MM-DD].md
Skriv också WEEKLY.md i projektroten.

### "cs"
Läs agents/customer-success-agent.md och utför alla steg.
Spara: agents/reports/cs-[YYYY-MM-DD].md

## Commit-regler
Efter engineer eller strategy:
```bash
git add -A
git diff --staged --quiet || git commit -m "🤖 Agent [datum] [agent]: [kort beskrivning]"
git push
```
