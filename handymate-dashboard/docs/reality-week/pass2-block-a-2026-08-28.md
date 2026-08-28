# Pass 2/3 — Block A (2026-08-28)

Körd efter "Kör vidare då!" på HEAD `2583a741`. Allt nedan är observerat i prod eller kört mot prod — inget är antaget.

## A. Golden Path mot prod på dagens HEAD

`npx playwright test --project=golden-path-setup --project=golden-path` → **16 passed (3.6 min)**. Inga avvikelser. (Kedjan gick igenom kund → offert → signering → projekt → tid → faktura → betalning → stängning på `biz_al7pjuu5smi`.)

## B. Cron-hälsa utan Vercel-inloggning (fotavtryck i DB, 14 dagar)

Källor: `v3_automation_logs`, `pending_approvals`. "Senast ok" = senaste rad med `status='success'`.

| Cron / väg | Fotavtryck | Senast ok | Bedömning |
|---|---|---|---|
| `agent-context` → Morgonrapport | 100 körningar, 10 företag | 2026-08-28 06:02 | ✅ daglig, en failed 17 aug |
| `evaluate-thresholds` → "Faktura eskalering dag 7" | 3 kort (3 företag) | 2026-08-28 06:02 | ✅ live — Provfirmans kort för FV-2026-001 skapades i dag |
| `check-overdue` → `invoice_overdue` | send_sms-kort + notify_owner | 2026-08-28 07:03 | ✅ live |
| `maintenance` (checklist_forslag) | 25 kort, 4 företag | 2026-08-28 09:28 | ✅ |
| Dispatch-förslag (Lars) | 14 kort, 3 företag | 2026-08-28 09:29 | ✅ |
| Stegmotorn (`bumpProjectStage`, 7 regler) | 91 flyttar, 4 företag | 2026-08-28 09:30 | ✅ live sedan avvikelse #28 |
| `quote_signed_confirmation` (mejl) | 12 ok, 1 företag | 2026-08-28 09:29 | ✅ |
| `quote-follow-up` (Offertuppföljning) | SMS 3 ok / mejl 4 ok | SMS 22 aug, mejl 18 aug | ⚠️ inget att göra sedan dess — varken bevis på fel eller på hälsa |
| `send-reminders` (påminnelsetrappan) | **0 rader någonsin** | — | ⛔ se C |
| "Snabbsvar på ny lead" (V3 send_sms) | 4 failed i dag | — | ⚠️ förväntat: 46elks utan saldo. Utlöst av Codex widget-bevis (`website_form`, "Proof Nykund Två/Tre") |
| Alla `invoice_reminder`-kort senaste 7 d | 3 godkända, **3 utförandefel** | — | ⚠️ alla tre = "SMS-tjänsten är tillfälligt otillgänglig" (46elks) — kortet är korrekt, leveransen faller på saldot |

Punkt 6 i Launch Truth Gate ("senaste lyckade körning per cron") kan alltså besvaras för de cronar som lämnar fotavtryck. Rena beräkningscronar (`patterns`, `morning-brief`, `sync-calendars` m.fl.) syns inte här och kräver fortfarande Vercel-loggen.

## C. A2 — påminnelsetrappan, live

**Byggt:** `POST /api/cron/send-reminders?business_id=<id>` — admin-grindad (`isAdmin`), kör exakt cronens logik men bara för ett företag. Cronvägen oförändrad. Facit `tests/facit-paminnelse-scope.spec.ts`; 128 pinnade påminnelse-tester gröna; CI grön (`2583a741`).

**Kört mot prod (Provfirman `biz_eaj2vp3xf2`, en förfallen faktura FV-2026-001, 9 dagar):**

1. Oinloggad → `403 Endast admin får köra påminnelser för ett enskilt företag` ✅
2. Som admin → `200 {"reminders_sent":0,"approvals_created":0,"results":[]}` — fakturan valdes (urvalet träffade), men släpptes av två **korrekta** vakter i tur och ordning:
   - företaget har en aktiv V3-regel med `entity: invoice` → cronen lämnar över till `evaluate-thresholds` (dedup-designen)
   - `auto_reminder_enabled = false`

**Sanningen som föll ut av detta:**

- `auto_reminder_enabled` är **false för 26 av 26** aktiva/trial-företag. Trappan i `send-reminders` har aldrig skickat, avgiftsbelagt eller skapat ett kort i prod. Den är inte trasig — den är avstängd överallt (default false, togglas bara i Inställningar → Fakturor).
- 16 av 26 företag har den seedade "Faktura eskalering dag 7" (create_approval, kräver godkännande). **Det är den vägen som faktiskt bär fakturapåminnelser i prod**, och den är live-bevisad i dag (06:02, tre företag).
- Ett steg till i trappan (toggle på + V3-regeln av på testkontot) blockerades av behörighetsklassificeraren — det är en prod-konfigändring, så den lämnas till Andreas (se "Kvar" nedan). Inget ändrades: verifierat med SELECT efteråt (`auto_reminder_enabled=false`, regeln `is_active=true`).

**A2-status:** ✅ scope:ad körning + vakter live-bevisade; trappans egen kortskapande/leverans fortfarande kontraktsnivå (`overdue-trigger-selection` 8/8, `invoice-reminder-card`).

## D. Avvikelse #36 — två kort för samma förfallna faktura

För FV-2026-001 fick Provfirman i dag:
- 06:02 `automation`-kort "Faktura FV-2026-001 — obetald 7+ dagar" (V3 `evaluate-thresholds`)
- 07:03 `send_sms`-kort "SMS till +46701234567" (`check-overdue` → `fireEvent('invoice_overdue')` → smart-communication)

Seed-kommentaren i `lib/seed-defaults.ts` beskriver exakt denna dubblett som redan löst (v85) — men det gällde två *seeders*; den här dubbletten kommer från två *vägar*. Beslut för Andreas: vilken väg äger förfallna fakturor? Rekommendation: låt V3-regeln (kort med ärlig text) äga dag 7+, och låt `invoice_overdue`-eventet bara `notify_owner` (inte `send_sms`-kort) när en aktiv V3-fakturaregel finns — spegelbild av cronens egen dedup.

## E. A7 — dubbel cron-körning (idempotens), live

`POST /api/agent/trigger` två gånger med samma `idempotency_key` → samma `run_id` (`run_wqlh3mflkyr`), andra svaret `duplicate: true`. ✅ live.

## F. Automationsinventering (Launch Truth Gate punkt 8)

Fullständig lista (28 automationer som handlar utan per-instans-godkännande + de som bara skapar kort) togs fram av en läsande agent över `vercel.json` (43 cron), `lib/automation-engine.ts`, `lib/smart-communication.ts`, `lib/nurture.ts`, alla `app/api/cron/*`. De fyra som saknar **varje** form av grind och går till kund:

| # | Automation | Trigger | Grind | Kod |
|---|---|---|---|---|
| 1 | Bokningspåminnelse 24 h (SMS till kund) | `agent-context` 05:00 | **ingen** — ligger utanför `outboundPaused`; `booking_reminder` finns i autonomi-allowlistan men läses aldrig | `lib/booking-reminders.ts:83` |
| 2 | Mattes kundsvar på inkommande SMS | webhook `sms/incoming` | **ingen** — modellens eget `autonomous`-beslut | `lib/matte/action-executor.ts:236` |
| 3 | Mattes kundsvar på inkommande mejl | `gmail-poll` */15 | **ingen** (samma) | `lib/gmail/processor.ts:418` |
| 4 | Recensionsförfrågan via **tidsutgång** — ett obesvarat `scheduled_review_request`-kort auto-godkänns och skickar SMS+mejl | `maintenance` 03:00 | **ingen** — enda stället där ett *obesvarat* kort blir ett utskick | `app/api/cron/maintenance/route.ts:92-165` |

Fyra till gick från död till levande de senaste två dygnen (projektstart-SMS, legacy steg-SMS, ny-lead-SMS till ägaren, portalmejl vid stegbyte) — aldrig volym i prod. Övriga 20 har toggle/kort/autonomi-grind. Nurture-sekvenserna är medvetet undantagna approval-grinden (TD-52) men **auto-enrollas** i `smart-communication.ts:505` — kommentaren "armeras EXPLICIT av hantverkaren" stämmer inte.

Övriga direkt-sändande (med grind) i korthet: projektstart-SMS (`create-from-quote.ts:280`), legacy steg-SMS (`projects/[id]/stages/route.ts:98`), portalmejl vid stegbyte (1 h dedup), nya bilder/tack-för-betalning-mejl (portal+e-post), ny-lead-SMS till ägaren (`golden-path.ts:46`), kampanjer (`send-campaigns`), auto-faktura vid avslut (`auto_invoice_on_complete`), V3-regler SMS/mejl (is_active + requires_approval + förtjänad autonomi), smarta meddelanden (`sms_auto_enabled` + per-typ), nurture (bara `agents_globally_paused`), påminnelsetrappan (autonomi/mandat, annars kort), offertuppföljning, recensionsförfrågan (Hanna), dag-7-mejl, månadsrapport-SMS, morgonrapport-SMS, driftlarm (mejl till andreas@handymate.se), mötespåminnelse (push), veckans rekommendationer (push, bränslegrind), första värdehändelsen (SMS, engångs), värvningsbelöning (SMS), offertbekräftelse (`quote_signed_email_enabled`).

Förtjänad autonomi: exakt fyra nycklar (`invoice_reminder`, `booking_reminder`, `quote_followup_sms`, `review_request`), streak 15/60 dagar; belopps-tak bara för två — `booking_reminder` och `review_request` har inget tak.

**Rekommendation till punkt 8:** stäng av 1–4 före lansering (1 och 4 är en rad var; 2–3 = `autonomous` tvingas false tills Matte har en tenant-toggle). Resten kan stå kvar bakom sina grindar.

## Kvar från Block A

- A4 live (redigerat godkännande bryter streak) — lämnad på kontraktsnivå.
- A2 trappan end-to-end på testkonto — kräver Andreas: `auto_reminder_enabled=true` + V3-regeln av på Provfirman, sedan `POST /api/cron/send-reminders?business_id=biz_eaj2vp3xf2` som admin, sedan återställ.
