# Push-Sender Audit 2026-05-12

**Fråga:** Är backend-sender byggd för att leverera Expo push till Christoffer's enhet, eller är mobile-sidans arbete (token-reg + foreground + deep-linking + tap-nav från idag) bara hälften av pipeline?

**Kort svar:** **Scenario B — sender finns och funkar, men event-wiring är bara 50%.** Manuella `/api/approvals` POST triggar push korrekt. Auto-events (`quote_signed`, `ata_signed`, `review_request`, portal-message, reschedule) går förbi push-anropet eftersom de skapar `pending_approvals`-rader direkt i lib-kod istället för via `/api/approvals`.

---

## Del 1 — Sender-status

### Vad finns ✅

| Komponent | Fil | Status |
|-----------|-----|--------|
| Token-registrering API | `app/api/push-tokens/route.ts` (POST/GET) | ✅ Byggd, upsert-dedup på `token`, uppdaterar `last_used_at` |
| `push_tokens`-tabell | `sql/v13_push_tokens.sql` | ✅ Med index + RLS (users ser bara egen business) |
| Expo-sender helper | `lib/notifications/expo-push.ts` — `sendExpoPushNotification(businessId, title, body, data?)` | ✅ POSTar direkt till `https://exp.host/--/api/v2/push/send` via fetch |
| Push-dispatcher route | `app/api/push/send/route.ts` (POST) | ✅ Dual-fanout: PWA web-push (VAPID) + mobile Expo |
| Approval → push-wire | `app/api/approvals/route.ts` POST | ✅ Fire-and-forget fetch till `/api/push/send` med `title: 'Nytt att godkänna'` |

### Vad saknas / är medvetna val ⚠️

- **Ingen `expo-server-sdk` dependency** — bygger på rå `fetch()`. Konsekvens: **ingen chunking för >100 tokens, ingen receipt-polling, ingen retry-logik**. För pilot med 1 enhet = irrelevant. För scale = kommer behövas.
- **Ingen `EXPO_ACCESS_TOKEN`** i env (inte sett i `.env.local`/exempel). Expo Push API kräver inte detta — push-tokens är publik-identifierbara — men för rate-limit + receipts vill man oftast ha en. **Inte blocker för pilot.**
- **Ingen Supabase trigger / DB webhook** som lyssnar på `pending_approvals` INSERT. All push-trigger sker i applikationskod.
- **`web-push` är installerad** (för PWA), `expo-server-sdk` är **inte**. Dual-stack med två olika pipelines.

---

## Del 2 — Event-trigger-mapping

För varje Tier 1+2-event: triggas push idag?

### Tier 1 — customer actions

| Event | Var skapas approval-raden? | Triggas push? | Vad krävs |
|-------|---------------------------|---------------|-----------|
| `ata_signed_notification` | `app/api/ata/sign/[token]/route.ts` — direkt INSERT på `pending_approvals` | ❌ **Nej** — kringgår `/api/approvals` POST | Wire-up: lägg `sendExpoPushNotification()`-anrop efter INSERT, eller routea via `/api/approvals` POST |
| `quote_signed` | `app/api/quotes/public/[token]/route.ts` — triggar `triggerEventCommunication('quote_signed')` + skapar projekt, **men ingen `pending_approvals`-row** | ❌ **Nej** — inget push-relevant event-fire idag | Antingen: skapa pending_approval-row, ELLER: lägg explicit `sendExpoPushNotification()` i quote-signed-handler |
| `portal_message_received` (NY) | Ingen approval idag — `customer_message` insertas direkt i `app/api/portal/[token]/messages/route.ts` POST | ❌ **Nej** | Bygg helt — antingen skapa approval-row, eller direkt push-anrop |
| `booking_rescheduled_by_customer` (NY) | **Finns inte alls** — ingen kund-driven reschedule i koden | ❌ **Nej** | Hela flödet saknas, inte bara push |

### Tier 2 — pending approvals (selektivt)

| Event | Var skapas raden? | Triggas push? | Vad krävs |
|-------|------------------|---------------|-----------|
| `review_request` (A4, byggd idag) | `app/api/cron/review-requests/route.ts` — cron INSERT på `pending_approvals` | ❌ **Nej** — kringgår `/api/approvals` POST | Wire-up: anropa `sendExpoPushNotification()` efter INSERT i cron, eller routea genom `/api/approvals` |
| Manuell approval-create | `app/api/approvals/route.ts` POST | ✅ **Ja** — fire-and-forget redan inbyggt | — |
| SMS/email/quote/invoice approvals | Beror på källa — om de går genom `/api/approvals` POST: ja. Annars nej. | ⚠️ **Delvis** | Audit per-event |

### Rotorsak till luckan

Approval-creation är **decentraliserad**. `/api/approvals` POST har push-anropet, men de flesta auto-events skapar approvals direkt mot Supabase i lib-kod / route-handlers. Två fix-strategier:

1. **DB-trigger:** Supabase webhook på `pending_approvals` INSERT → POSTar till `/api/push/send`. Centraliserat, ingen kodändring per call-site. (Rekommenderas men kräver Supabase-konfig.)
2. **Helper-funktion:** `createApprovalAndNotify(businessId, payload)` som ersätter alla direkta `.insert()` på `pending_approvals`. Mer kodändring, men explicit.

---

## Del 3 — Konkret estimat

**Scenariot vi befinner oss i: B (sender finns + 50% wiring).**

### Konkret att-göra-lista för full Tier 1+2-täckning

| Uppgift | Estimat | Beroenden |
|---------|---------|-----------|
| **DB-webhook på `pending_approvals` INSERT** → `/api/push/send` | 1-2 h | Supabase-dashboard-config + payload-mapping |
| ALT: Manuell wire-up i 4 call-sites (ATA, review-cron, ev. quote, ev. message) | 2-3 h | Risk: missar nya call-sites senare |
| Bygg `portal_message_received`-flow (insert i `customer_message` → push) | 2 h | Klar, kräver bara push-anrop |
| Bygg `booking_rescheduled_by_customer`-flow | **EJ scope för push-audit** | Hela kund-reschedule-UI:t saknas (se [portal-audit-2026-05-12.md](portal-audit-2026-05-12.md)) |
| Testa end-to-end med riktig device | 2-4 h | Beroende på EAS-build-status — se Del 4 |
| Lägg till `expo-server-sdk` om vi vill ha receipts/chunking | 1-2 h | Inte blocker för pilot |

**Total för Tier 1+2 push-leverans (utan reschedule-flödet):** **5-9 timmar fokuserat arbete**, förutsatt att EAS-build redan finns på Christoffer's telefon.

---

## Del 4 — Pilot-påverkan till 25 maj

### Beroenden (verifierat)

| Beroende | Status | Risk |
|----------|--------|------|
| EAS-config i mobile-projekt | ✅ Finns — `eas.json`, projectId `0b6320d8-f349-42b4-9d1c-514a77821b42`, appleTeamId `3UK664MT97`, bundleId `com.handymate.mobile` | Låg — config är klar |
| `expo-notifications` plugin | ✅ I `app.json` | — |
| iOS push entitlement / APNS-cert | ⚠️ **Inte verifierat i denna audit** — credentials hanteras av EAS men ingen produktions-build-status sedd | **Medel** — om EAS Build aldrig körts i produktions-läge har APNS-cert inte genererats |
| EAS Build körd för iOS produktion | ⚠️ **Inte verifierat** | **Medel-hög** — utan build → ingen TestFlight → Christoffer kan inte få push |
| TestFlight-status | ⚠️ **Inte verifierat** | Beroende av build |
| Christoffer på TestFlight | ⚠️ **Inte verifierat** | Beroende av build + invite |

> **Inget av "EAS Build", "TestFlight", "APNS", "Christoffer", "Bee Service" hittades som strängar i någondera kodbasen.** Det betyder inte att de inte är gjorda — bara att det inte finns konfig/dokumentation om dem i repot.

### Realistisk leverans till 25 maj (13 dagar kvar)

| Scope | Bedömning | Förutsättning |
|-------|-----------|---------------|
| **Demo-mode (mock push i dev/Expo Go)** | ✅ **Klart redan** — sender funkar mot `/api/approvals` POST. Demo i web/iOS-simulator möjlig. | Inget extra |
| **Produktion-push till Christoffer's telefon för manuella approvals** | ✅ **Mycket realistiskt** — kräver bara EAS Build + TestFlight-invite om de inte redan finns | EAS Build på iOS måste finnas / göras (1 build = ~30 min + Apple review för TestFlight) |
| **Produktion-push för alla Tier 1+2-events** | ✅ **Realistiskt** om event-wiring prioriteras denna vecka (5-9 h) | EAS-build + event-wiring |
| **Push för portal-message-received** | ✅ **Realistiskt** | 2 h utveckling + del av tier-fixet |
| **Push för booking_rescheduled_by_customer** | ❌ **Inte i scope** — hela kund-reschedule-UI:t saknas i portalen | Stort frö-arbete |
| **Andra pilot-businesses än Bee Service** | ❌ **Ej i scope** (per användarens instruktioner) | — |

### Kritisk path till "Christoffer får push på riktigt 25 maj"

1. **Verifiera/köra EAS Build för iOS produktion** (största okända — kan vara klart, kan vara nollat)
2. **TestFlight-invite till Christoffer**
3. **Wire-up push i ATA-signed + review-cron** (2-3 h) — säkrar att Track C och A4 faktiskt levererar push
4. **Bygg `portal_message_received` push-trigger** (2 h)
5. **End-to-end test med Christoffer's telefon i loopen**

**Rekommendation:** Behandla **EAS Build + TestFlight** som högsta risk. Allt annat är 1-2 dagars arbete. Om EAS-build inte är gjord ännu — börja med det idag, parallellt med event-wiring.

---

## Sammanfattning

- **Sender-pipeline:** Byggd. `/api/push-tokens`, `lib/notifications/expo-push.ts`, `/api/push/send`, mobile-token-reg — allt på plats.
- **Wiring-gap:** Endast manuella `/api/approvals` POST triggar push. Auto-events (`ata_signed`, `quote_signed`, `review_request`, portal-message) gör direkta DB-inserts som kringgår push-anropet.
- **Fix-storlek:** 5-9 h kod + EAS Build/TestFlight (okänd status).
- **25 maj-leverans:** Realistiskt för Christoffer på Bee Service om EAS Build kan köras nu. Demo-läge funkar redan.

---

*Audit baserad på kod-läsning av `handymate-dashboard` + `handymate-mobile` HEAD per 2026-05-12. Inga gissningar — där ovissheten finns (EAS Build-status, TestFlight, APNS) är det explicit markerat som icke-verifierat.*
