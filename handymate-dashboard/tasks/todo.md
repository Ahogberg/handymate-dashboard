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
