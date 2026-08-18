# Etapp Å — Owner Absence V1 ("Matte håller ställningarna")

Frånvarofönster: normala händelser samlas, en sluten lista deterministiska
eskaleringsklasser pushar igenom, ingen ny behörighet någonsin, deterministisk
återkomstrapport (ingen LLM avgör vad som är akut).

## Migration
- [x] sql/v153_owner_absence.sql — `automation_settings.owner_absence JSONB`
      (samma precedent som auto_approve_config). {from,to,set_by,set_at}.

## Lib (facit först)
- [x] lib/absence/absence-window.ts — isAbsenceActive (ren), read/write helpers
- [x] lib/absence/escalation.ts — classifyAbsenceEvent, sluten AbsenceEvent-union,
      uttömmande switch + never-check
- [x] lib/absence/franvarorapport.ts — byggFranvarorapport, återanvänder
      byggDygnsdigest (generaliserad med `from`) + classifyAbsenceEvent
- [x] lib/jarvis/dygnsdigest.ts — lägg till valfritt `from`-fält (bakåtkompatibelt)

## Push-strypunkt
- [x] lib/notifications/approval-push.ts — absence-gate i sendApprovalPush
      (enda chokepoint), risk_level tillagt i ApprovalLike
- [x] app/api/cron/driftlarm/route.ts — per-business ägar-push för
      payment_failed/automation_activity-failed under aktiv frånvaro

## Cap-avslag-loggning
- [x] app/api/cron/send-reminders/route.ts + quote-follow-up/route.ts —
      tagga payload.cap_exceeded på redan skapat godkännandekort

## API
- [x] app/api/absence/route.ts — GET/POST/DELETE, owner-admin
- [x] app/api/absence/report/route.ts — GET, owner-admin
- [x] tests/permission-contract.spec.ts — registrera båda rutterna

## UI
- [x] components/jarvis/home/MatteHero.tsx — absenceBand-slot (uppdragBand-mönstret)
- [x] components/jarvis/home/AbsenceBand.tsx — snabbknapp, statusrad, avfärdbar
      återkomstrapport (localStorage-dismiss, mandagsmote-mönstret)
- [x] components/jarvis/JarvisHome.tsx — montera AbsenceBand

## Verifiering
- [x] Riktade tester (rött→grönt)
- [x] npx tsc --noEmit
- [x] npx next build
- [x] git status, commit specifika filer, ingen push

---

# Etapp Ä — Jobbpass V1 (Closeout-to-Lifetime)

Digitalt jobbpass som Lars föreslår vid projektavslut: accepterad omfattning,
godkända ÄTA, utfört arbete (signerad fältrapport), UTVALDA foton (ägaren
väljer), egenkontroll, fakturareferens, standardgaranti, valfri
service-samtycke. Inget nytt utskick — bara data + en publik länk.

## Migration
- [x] sql/v154_jobbpass.sql — ny tabell `jobbpass` (id jp_-prefix, business_id,
      project_id UNIQUE, selected_photo_ids JSONB, service_consent boolean,
      status draft/published, token, published_at). RLS: service_role only
      (samma mönster som v148). EJ körd — Andreas kör manuellt.

## Lib (facit först — rött innan bygge)
- [x] lib/jobbpass/jobbpass.ts
      - JOBBPASS_ALLOWED_FIELDS (exporterad allowlist-konstant)
      - deriveJobbpassView() — REN funktion, bygger kundvyn genom EXPLICIT
        fältplock (aldrig spread av råa DB-rader) → strukturellt omöjligt
        att läcka ett fält som inte står i allowlisten
      - loadJobbpassSourceData() — I/O, smala .select()-listor, fail-soft
      - loadSelectedJobbpassPhotos() — .in('id', selectedIds) — bara valda
      - getOrCreateDraftJobbpass / setJobbpassSelection / publishJobbpass /
        getPublishedJobbpassByToken / getJobbpassServiceConsent (I/O)
      - Kommentarer beskriver förbjudna fält i PROSA, aldrig kolumnnamnen
        ordagrant (självreferens-fällan mot källskanningsfacit)
- [x] tests/jobbpass.spec.ts — facit (a)-(f) + källskanning + fake-supabase
      derivationstest för foturvalet (52 tester, gröna)

## Closeout-hook
- [x] lib/projects/complete-project.ts — nytt effect-steg 'jobbpass_proposal'
      i runCompletionEffects (samma dedupe/idempotens-idiom som
      scheduled_review_request/project_debrief), tillagt i completion_batch
      .in()-listan, CloseoutEffectName + userWarningForEffect uppdaterade

## Ägar-ytan
- [x] app/api/projects/[id]/jobbpass/route.ts — GET (kandidatfoton signerade
      + nuvarande urval) / PATCH (foturval + samtycke), owner-admin
- [x] app/api/projects/[id]/jobbpass/publish/route.ts — POST publicera
      (genererar token), owner-admin
- [x] app/dashboard/projects/[id]/jobbpass/page.tsx — fotoval, förhandsgranskning,
      samtyckesbock, publicera-knapp, kopiera länk

## Publik portalvy
- [x] app/api/jobbpass/public/[token]/route.ts — GET, publik, 404 om ej published
- [x] app/jobbpass/[token]/page.tsx — svensk, ljus/teal, mobiloptimerad

## Approvals-UI
- [x] app/dashboard/approvals/page.tsx — TYPE_CONFIG-post + särskild gren för
      'jobbpass_proposal' (länk till ägar-ytan i st f rakt godkänn, samma
      mönster som project_debrief), "Hoppa över" avvisar

## Hanna-kopplingen
- [x] getJobbpassServiceConsent(projectId) — läsfunktion, dokumenterad var den
      SKA läsas (befintlig recensions-/rekommendationsflöde), inte kopplad
      till någon cron nu

## Behörighetskontrakt
- [x] tests/permission-contract.spec.ts — registrerade
      projects/[id]/jobbpass + projects/[id]/jobbpass/publish (owner-admin)

## Verifiering
- [x] npx playwright test tests/jobbpass.spec.ts --no-deps (rött → grönt, 52 st)
- [x] npx playwright test tests/permission-contract.spec.ts --no-deps (26 st)
- [x] npx playwright test tests/canonical-project-completion.spec.ts
      tests/project-closeout-copilot.spec.ts --no-deps (26 st, oberörda)
- [x] npx tsc --noEmit (0 fel)
- [x] npx next build (ren build)
- [x] git status + ett commit med specifika filer, ingen push
