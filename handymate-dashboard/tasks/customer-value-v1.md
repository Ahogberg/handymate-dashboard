# V1 — spårbara värdehändelser

- [x] Läs brief, orkestrering, arkitektur och befintlig värdemetod.
- [x] Atomär logg vid befintliga skrivvägar; RLS, proveniens, idempotens, torrkörd historikinläsning.
- [x] Metod 3 med metod 2 som jämförelse och säker standard före driftsättning.
- [x] Separata uppmätta ledtider och uppskattad arbetstid i kvitton.
- [x] SQL-facit, producentprov, metodjämförelse, TypeScript och produktionsbygge.
- [ ] Slutlig CI-status redovisas på PR #72.
- [x] PR #72 och handoff för Claudes A/B-granskning. Ingen produktionsmigration.

## M1 — Claude review correction

- [x] Rebase on main with V0 honesty spec in the identical CI/local position.
- [x] Reproduce member-write failure, then make the three trigger wrappers SECURITY DEFINER with fixed search_path.
- [x] Verify member writes, foreign-tenant denial, private RPCs and the value suites.
- [ ] Push updated #72 for Claude's re-verification; no migration or activation.

M1 local verification: 107 relevant tests passed. Full CI is recorded on the updated PR.
