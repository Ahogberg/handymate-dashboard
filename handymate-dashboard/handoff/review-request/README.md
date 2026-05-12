# A4 — Auto-recensionsbegäran: Mobile ApprovalCard-spec

**Status:** Backend klar (dashboard-repo, commits 1-3 av sprint A4).
**För mobile-Code:** Implementera ApprovalCard-rendering för approval_type `review_request` enligt detta kontrakt.
**Datum:** 2026-05-12

---

## Kontext

Backend skapar automatiskt `pending_approvals`-rader 7 dagar efter projekt-completion via `/api/cron/review-requests` (verifierat live 2026-05-12). Christoffer ska se en ApprovalCard i mobile Hem-tab + dashboard Approvals-vy, godkänna eller avvisa. Vid godkännande skickar Hanna ett SMS till kunden via 46elks med Google-recension-länk.

---

## Approval-payload (kontrakt)

GET `/api/approvals` returnerar arrayen med pending approvals. För `review_request`-typ ser raden ut så här:

```json
{
  "id": "<approval-uuid>",
  "business_id": "biz_21wswuhrbhy",
  "approval_type": "review_request",
  "title": "Be Andreas om recension",
  "description": "Projektet \"Badrum Frösundavik\" slutfördes 2026-05-05. Hanna har förberett ett SMS — godkänn för att skicka.",
  "risk_level": "low",
  "status": "pending",
  "created_at": "2026-05-12T09:00:23.412Z",
  "expires_at": "2026-05-26T09:00:23.412Z",
  "payload": {
    "project_id": "proj_xxxxxxxxxxxx",
    "project_name": "Badrum Frösundavik",
    "completed_at": "2026-05-05T14:30:00Z",
    "customer_id": "cust_xxxxxxxxxxxx",
    "customer_name": "Andreas Eriksson",
    "customer_phone": "+46701234567",
    "google_place_id": "ChIJxxxxxxxxxxxx",
    "review_url": "https://search.google.com/local/writereview?placeid=ChIJxxxxxxxxxxxx",
    "suggested_sms_text": "Hej Andreas! Tack för förtroendet med Badrum Frösundavik. Skulle du vilja dela din upplevelse? Det hjälper oss enormt: https://search.google.com/... /Andreas Bygg AB",
    "routed_agent": "hanna",
    "to": "+46701234567",
    "message": "Hej Andreas! Tack för förtroendet med Badrum Frösundavik..."
  }
}
```

### Fält-användning per UI-element

| Fält | Användning i mobile |
|---|---|
| `payload.routed_agent` | Mappa till agent-avatar → använd Hanna (marknadschef) — bg `bg-purple-600` |
| `title` | Kortets rubrik |
| `description` | Sekundär text under rubriken |
| `payload.suggested_sms_text` | Preview-block ("Detta skickas till kunden:") med scroll om långt |
| `payload.customer_name` | För personalisering: "Skicka till {customer_name}" |
| `payload.customer_phone` | Visa diskret under preview ("→ +46 70 123 45 67") |
| `expires_at` | "Försvinner om X dagar" countdown om < 7d kvar |

---

## UI-rendering — referens från mockup

Visuellt: samma kort-stil som andra approval-typer, med Hannas avatar och färg. Tre delar:

```
┌─────────────────────────────────────────────────┐
│ 🟪 Hanna · Marknadschef        låg risk · 14d │
│ Be Andreas om recension                          │
│ Projektet "Badrum Frösundavik" slutfördes …      │
│                                                  │
│ ┌────────────────────────────────────────────┐  │
│ │ Detta skickas till kunden:                 │  │
│ │ "Hej Andreas! Tack för förtroendet …       │  │
│ │  Skulle du vilja dela din upplevelse? …"   │  │
│ │                                            │  │
│ │ → +46 70 123 45 67                         │  │
│ └────────────────────────────────────────────┘  │
│                                                  │
│ [Avvisa]                          [Godkänn]      │
└─────────────────────────────────────────────────┘
```

---

## API-flöde

### Godkänn

```http
POST /api/approvals/{id}
Content-Type: application/json
Cookie: <session>

{ "action": "approve" }
```

**Response (success):**
```json
{
  "success": true,
  "action": "approve",
  "execution": {
    "action": "review_request",
    "sms_sent": true,
    "sms_id": "sms_xxxxxxx",
    "elks_id": "<46elks-id>"
  }
}
```

**Response (SMS failed):**
```json
{
  "success": true,
  "action": "approve",
  "execution": {
    "action": "review_request",
    "sms_sent": false,
    "error": "<46elks-felmeddelande>",
    "sms_status": 400
  }
}
```

Mobile bör visa toast: success → "Skickat till Andreas", fail → "Kunde inte skicka SMS — försök igen". Approval-statusen sätts till `approved` oavsett om SMS lyckades (eftersom användaren faktiskt godkände beslutet — felet är leveransteknik). Om `execution.sms_sent === false` rekommendera retry-knapp eller manuell uppföljning.

### Avvisa

```http
POST /api/approvals/{id}
Content-Type: application/json
Cookie: <session>

{ "action": "reject", "reject_reason": "Kunden var inte nöjd" }
```

`reject_reason` är valfritt — om medskickat loggas det i learning-event för agentens framtida förbättring. UI kan visa en valfri text-input efter Avvisa-tap, men det är OK att skippa det v1.

---

## Edge cases — UI ska hantera

1. **Expired-approval:** om `expires_at` är passerat och status fortfarande `pending` → visa "Förfallen" istället för knappar. Cron `/api/cron/maintenance` (03 UTC) markerar status='expired' automatiskt men det finns ett fönster där fronten ser den.

2. **SMS-fail efter godkännande:** visa `execution.sms_sent === false` clearly. Användaren kan inte godkänna IGEN (approvalen är redan `approved`). UI behöver erbjuda "Skicka SMS manuellt"-fallback med samma `suggested_sms_text` prefyllt — copy/share-link.

3. **Tom payload (dataintegritet):** om `payload.to` eller `payload.message` saknas → `execution.error` blir "payload saknar to eller message". Visa det som icke-tekniskt fel: "Approval-data är skadad, kontakta support".

---

## Avvikelse från ursprungsspec

User-spec sa `POST /api/approvals/{id}/approve` + `/reject` som **separata** endpoints. Implementation följer befintlig codebase-konvention med EN endpoint (`POST /api/approvals/{id}`) som diskriminerar via `body.action`. Anledning: switchen på `approval_type` redan hanterar 8+ approval-typer centraliserat. Att splitta hade dubblerat logiken.

Effekt för mobile: lika många POST-anrop, bara annan body-shape än spec antog.

---

## Test-instruktion

För att testa innan cron triggar på riktigt projekt:

1. Trigga cron manuellt (kräver CRON_SECRET):
   ```
   curl -H "Authorization: Bearer $CRON_SECRET" https://app.handymate.se/api/cron/review-requests
   ```
2. Kolla att en approval skapats för biz_21wswuhrbhy:
   ```sql
   SELECT * FROM pending_approvals
     WHERE business_id = 'biz_21wswuhrbhy'
     AND approval_type = 'review_request'
     ORDER BY created_at DESC LIMIT 1;
   ```
3. Verifiera mobile renderar approval-kortet korrekt
4. Tap Godkänn → kontrollera att SMS gick (sms_log-rad med status='sent' eller 'delivered')
5. Tap Avvisa → kontrollera att status='rejected'

---

## Filer som är klara backend-side (för referens)

- `sql/v_review_requests.sql` — DB-migration (kör i Supabase SQL Editor)
- `app/api/cron/review-requests/route.ts` — cron-routen
- `app/api/approvals/[id]/route.ts` — `review_request`-case i `executeApprovalPayload`
- `vercel.json` — cron-schedule "0 9 * * *"
