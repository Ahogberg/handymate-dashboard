#!/usr/bin/env bash
# Vercel "Ignored Build Step" (vercel.json → ignoreCommand). Exit 0 = hoppa över bygget, exit 1 = bygg.
#
# Varför (2026-09-14): två Vercel-projekt byggde varje push på varje branch, även rena
# dokument- och teständringar, och Codex/Claude pushar många gånger per PR. CI kör
# medvetet inte `next build` (playwright.yml) — preview-bygget är byggkontrollen, så
# kodändringar byggs fortfarande. Bara det som inte kan påverka bygget hoppas över.
#
# Regler:
#   1. main byggs alltid (produktion).
#   2. Sekundärprojektet (handymate-vision-test) får inga preview-byggen alls.
#   3. Övriga branchar byggs bara när commiten ändrar något utanför tests/, tasks/ och *.md
#      inom appens rotkatalog. Ändringar i repo-roten (docs/, .github/) når aldrig hit
#      eftersom Vercel kör kommandot i rotkatalogen handymate-dashboard/.
set -u
ref="${VERCEL_GIT_COMMIT_REF:-}"
if [ "$ref" = "main" ]; then exit 1; fi
if [ "${VERCEL_PROJECT_ID:-}" = "prj_XggvvjhoAe7Ubtr08mizCHjVQta8" ]; then
  echo "vercel-ignore-build: sekundärprojekt, inga preview-byggen"; exit 0
fi
if ! git rev-parse --verify -q HEAD^ >/dev/null; then
  echo "vercel-ignore-build: ingen föräldercommit tillgänglig, bygger"; exit 1
fi
if git diff --quiet HEAD^ HEAD -- . ':(exclude)tests' ':(exclude)tasks' ':(exclude)*.md' ':(exclude)scripts/vercel-ignore-build.sh'; then
  echo "vercel-ignore-build: bara tester/dokument ändrade, hoppar över bygget"; exit 0
fi
exit 1
