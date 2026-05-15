# Kundportal — Audit 2026-05-12

**Syfte:** Faktabaserad nulägesbild av Handymate-kundportalen inför strategiskt beslut om utbyggnad till "primär kommunikationskanal hantverkare ↔ kund". Inga feature-förslag i detta dokument — bara vad som faktiskt finns i koden idag.

**Scope:** `C:\Users\Gaming\handymate-dashboard\handymate-dashboard`

---

## 1. Portalens routes och sidor

### Huvudportal — `/portal/[token]`
- **Fil:** `app/portal/[token]/page.tsx`
- **Åtkomst:** Publik, token-baserad (`customer.portal_token`). Ingen login.
- **Arkitektur:** Orchestrator med tab-system (`home` / `project` / `docs` / `contact`) + sub-routes (`?tab=quotes`, `?tab=messages`, `?tab=review`).
- **Status:** Aktiv, omdesignad (Claude Design redesign v2).

### Standalone offert-signering — `/quote/[token]`
- **Fil:** `app/quote/[token]/page.tsx`
- **Åtkomst:** Publik, `sign_token`.
- **Beteende:** Om kund har `portal_token` → **redirect** till `/portal/[token]?tab=quotes` (line 137-139). Annars fristående signering med canvas + ROT/RUT-vy + PDF-download.

### ÄTA-signering (API, Track C) — `/api/ata/sign/[token]`
- **Fil:** `app/api/ata/sign/[token]/route.ts`
- **Åtkomst:** Publik GET/POST, `sign_token`.
- **Notering:** Själva ÄTA-signerings-UI:t är inbäddat i `PortalProjectDetail`-komponenten, inte en egen route.

### Lead-portal — `/lead-portal/[code]`
- **Fil:** `app/lead-portal/[code]/page.tsx`
- **Åtkomst:** Publik, `portal_code` från `lead_source`.
- **Notering:** Annan typ av portal — leads-insamling, inte kundportal. Räknas inte i denna audit men noteras för fullständighet.

---

## 2. Funktioner i portalen — verifierat mot kod

| Funktion | Status | Bevis (fil) |
|----------|--------|-------------|
| Offert-visning + signering | ✅ Finns | `app/portal/[token]/components/PortalQuoteSigningModal.tsx`, `app/api/portal/[token]/quotes/route.ts` |
| ÄTA-visning + signering (Track C) | ✅ Finns | `app/api/ata/sign/[token]/route.ts`, inbakad i `PortalProjectDetail` |
| Projektstatus-vy + milestone-tracker | ✅ Finns | `app/api/portal/[token]/projects/route.ts`, `project_milestone`-tabell |
| Faktura-vy | ✅ Finns | `app/api/portal/[token]/invoices/route.ts`, `PortalInvoiceDetail` |
| Foto-galleri (project_photos) | ✅ Finns | `PortalPhotoLightbox.tsx`, max 12 bilder/projekt (API-limit) |
| Kund-meddelanden / chat | ✅ Finns | `app/api/portal/[token]/messages/route.ts`, `customer_message`-tabell, `PortalMessagesThread` |
| Aktivitetsfeed (timeline) | ✅ Finns | `app/api/portal/[token]/activity/route.ts` — 10 senaste händelserna |
| Kontakt-info (hantverkare) | ✅ Finns | `PortalContact.tsx`, läser `business_config` |
| Projekt-logg (latest entry) | ⚠️ Delvis | Visar bara `latestLog` (senaste anteckning), inte full historik |
| Booking-översikt | ⚠️ Delvis | `schedule_entry` läses som "nästa besök", **read-only** |
| Faktura-betalning (Swish/BG-info visning) | ✅ Finns | `PortalSwishBlock.tsx`, OCR + payment info |
| Review-CTA (efter completion) | ✅ Finns | `PortalReviewCTA.tsx` — länk till Google-recension |
| Tidrapport-synlighet för kund | ❌ Finns inte | `time_entries` existerar men exponeras ej i portal |
| Reschedule-request från kund | ❌ Finns inte | Endast hantverkar-flow via agent-system. Kund måste chatta. |
| Avbeställning-request från kund | ❌ Finns inte | Ingen UI-väg |
| Två-vägs SMS-tråd i portal | ❌ Finns inte | Bara text-meddelanden i `customer_message` (in-app), ej SMS |
| Kund laddar upp egna foton | ❌ Finns inte | `project_photos` är hantverkar-only |
| ROT-utbetalning godkännande av kund | ❌ Finns inte | ROT visas på faktura, inget godkännande-flow |
| Material-val reaktion från kund | ❌ Finns inte | Ingen UI |

---

## 3. Events som triggas när kund agerar i portalen

Bekräftade event-triggers (alla wrapped i try-catch — non-blocking så API-svar lyckas även om event-fire failar):

| Kund-handling | Event | Konsekvens hos hantverkare |
|--------------|-------|---------------------------|
| Signerar offert | `quote_signed` | `pending_approvals` + automation-engine + projekt skapas via `triggerAutopilot()` + smart-communication + notifications |
| Öppnar offert (1:a gången) | `quote_opened` | quotes.status: `sent` → `opened`, `quote_tracking_events` row insertad, automation-engine |
| Avböjer offert | `quote_declined` | `lost_reason` lagras, smart-communication event |
| Signerar ÄTA | `ata_signed` | `pending_approvals` (`approval_type: 'ata_signed_notification'`) → ApprovalCard på Hem |
| Avböjer ÄTA | `ata_declined` | `pending_approvals` (low risk), `declined_at` + `declined_reason` lagras |
| Öppnar portal (1:a gången) | `portal_welcomed` | Välkomst-SMS skickas till kund via 46elks, `portal_welcomed_at` sätts atomiskt |
| Skickar meddelande i chat | `portal_message_sent` | Row insertas i `customer_message` (direction: `inbound`) |

**Saknas (ej implementerat):**
- Notis till hantverkare när kund öppnar/läser meddelande
- Notis när kund visar faktura
- Notis när kund öppnar projekt-vy

---

## 4. Portal-engagement-tracking

### Vad loggas idag
- **`sms_log`-tabell** finns (`sql/sms_tables.sql`). Kolumner: `direction`, `message_type`, `trigger_type`, `trigger_id`, `status`, `elks_id`. Portal-welcome SMS loggas med `message_type: 'portal_welcome'`.
- **`quote_tracking_events`-tabell**: events `opened` / `closed` (via beacon API), `session_id`, `duration_seconds`, `ip_hash`, `user_agent`. Endast för offerter — **inte för portal-länkar generellt**.
- **`customer.portal_last_visited_at`** uppdateras vid varje portal-öppning.
- **`customer.portal_welcomed_at`** sätts första gången, atomiskt via `.eq('portal_welcomed', false)` på update.

### Vad loggas INTE
- ❌ Per-view tracking (vilka tabbar/sidor besöks i portalen)
- ❌ Click-tracking på portal-länkar i SMS/email (bara på offert-mail via pixel)
- ❌ Tid spenderad i portal
- ❌ Återbesökarmönster (visit-count, frequency)

### Mätbart idag — bara grova proxies
- **Antal öppningar per portal:** Implicit via `portal_last_visited_at` (men endast senaste, ej historik)
- **Quote-engagement:** `view_count`, `first_viewed_at`, `last_viewed_at` på `quotes`-tabell
- **SMS-leverans:** `status`-kolumn i `sms_log`

→ **Slutsats:** Vi kan **inte** idag svara på frågorna "hur ofta öppnas portal-länkar?" eller "hur många gånger per projekt loggar kunden in?" utan att lägga till tracking. Bara senaste besök finns.

---

## 5. Kända friktioner i koden (TODOs, debug-notes)

### Aktiva issues
1. **TD-22: ÄTA-rader saknas i API-respons**
   - `app/api/portal/[token]/projects/route.ts`, ~lines 116-144
   - SQL returnerar 4 ÄTA-rader, API ibland färre. Under utredning, debug-loggning tillagd. Hypotes: client-side row-dropping.

2. **Progress column naming mismatch (fixat men noterat)**
   - Frontend läste `p.progress`, DB har `progress_percent`. Tyst PostgREST-error 42703 → data=null → [].
   - Fix: alias i select (`progress:progress_percent`).

3. **Cache-issue på token-routes (fixat)**
   - `export const dynamic = 'force-dynamic'` deployad. Samma URL = samma cache-key gjorde att senaste rader missades.

### Designval värda att notera
- **Quote-redirect-pattern:** Om kund har `portal_token` redirectas `/quote/[token]` → `/portal/[token]?tab=quotes`. Konsekvens: alla kund-länkar leder till portal som hub.
- **Non-blocking event-fire:** Alla event-handlers wrapped i try-catch så signing aldrig failar pga event-fel. Trade-off: silent failure möjlig.
- **`assigned_phone_number` vs `phone_number`:** Portal visar 46elks-nummer, inte ägarens privatmobil. Medvetet val.

---

## 6. Säkerhet & åtkomst

- All portal-åtkomst är **token-baserad publik** (ingen login).
- Tokens skickas via SMS (46elks) eller email (Resend).
- Quote/ÄTA-signering har egna `sign_token` separat från `portal_token`.
- Inga rate-limits eller IP-restriktioner observerade i portal-routes.

---

## 7. Komponentstruktur (för referens)

```
app/portal/[token]/
├── page.tsx                          (orchestrator)
├── layout.tsx
├── types.ts
├── helpers.ts
├── portal.css
└── components/
    ├── PortalThemeProvider.tsx       (accent från business)
    ├── PortalShellHeader.tsx         (header + unread badge)
    ├── PortalBottomNav.tsx           (tabs)
    ├── PortalHome.tsx                (greeting, aktivt projekt, feed)
    ├── PortalProjectDetail.tsx       (milestones, foton, ÄTA)
    ├── PortalPhotoLightbox.tsx       (fullscreen-galleri)
    ├── PortalQuotesList.tsx
    ├── PortalQuoteSigningModal.tsx   (inline-signering)
    ├── PortalInvoiceDetail.tsx
    ├── PortalDocumentsList.tsx       (quotes + fakturor)
    ├── PortalMessagesThread.tsx      (chat)
    ├── PortalContact.tsx
    ├── PortalReviewCTA.tsx
    ├── PortalHandymateAttribution.tsx
    ├── SignatureCanvas.tsx           (reusable)
    └── PortalSwishBlock.tsx
```

---

## 8. Sammanfattning — nuläge

**Portalen är idag:** En multifunktionell projekt-tracker + dokumenthanterare. Kund kan se aktivt projekt, signera offerter och ÄTA, läsa fakturor, se foton, läsa milestones, chatta med hantverkare via in-app-meddelanden.

**Portalen är inte idag:**
- En tvåvägs SMS-kanal
- Ett verktyg för kund att initiera handlingar (reschedule, avbeställning, ROT-godkännande, foto-upload)
- Mätbar i engagement-termer (vi vet bara "senast öppnad")

**Strategiskt gap mot "primär kommunikationskanal":** Stora delar av kund→hantverkare-flödet kräver fortfarande telefon/SMS utanför portalen (ombokning, frågor om material, krishantering, foto-rapportering av problem). In-app-chat finns men triggar inga notifikationer till hantverkare (ej verifierat — bör testas).

**Mätinfrastruktur saknas** för att kunna prioritera utbyggnad data-drivet. Innan stora investeringar i nya features bör tracking på portal-visits + per-tab-engagement läggas till så att vi vet vad kund faktiskt gör i portalen idag.

---

*Genererad av Claude (audit-läge), verifierat mot kod i `handymate-dashboard` HEAD per 2026-05-12. Inga feature-förslag — bara nulägesbild.*
