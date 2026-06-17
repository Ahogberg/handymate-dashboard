# Passiv verifiering: Steg 0 (auto-invoice review_auto_invoice-fix)

**Status:** Väntar på naturlig trigger. Ej blockerande för Steg 1.
**Fix:** PR #3 (mergad) — `lib/projects/auto-invoice-on-complete.ts`, korrekt `approval_type`/`payload`-shape + `agent_id:'karin'` + synlig `.error`-loggning.

## Vad som ska bekräftas

**Nästa gång ett riktigt projekt avslutas i Bee** (`biz_21wswuhrbhy`) — dvs. status sätts till `completed` via projekt-API:t, vilket triggar `autoInvoiceOnComplete` (`projects/route.ts:526`):

1. Ett `review_auto_invoice`-kort dyker upp i godkännanden.
2. `COUNT(review_auto_invoice)` ökar med 1.

## Check-SQL (kör efter nästa projektavslut)

```sql
SELECT approval_type, status,
       payload->>'agent_id'    AS agent_id,
       payload->>'invoice_id'  AS invoice_id,
       title, created_at
FROM pending_approvals
WHERE business_id='biz_21wswuhrbhy' AND approval_type='review_auto_invoice'
ORDER BY created_at DESC LIMIT 3;
```

**Grönt om:** ≥1 rad finns, nyaste har `agent_id='karin'`, giltigt `invoice_id`, titel "Granska faktura — …". På gamla koden skapades raden aldrig (insert failade tyst) → 0 rader var "före"-läget.

## Förbehåll

Kortet skapas bara om Bee är i **kräver-godkännande-läge** för faktura (`autoSend=false` i `autoInvoiceOnComplete`). Är auto-send på skickas fakturan direkt utan review-kort — då är 0 rader korrekt, inte ett fel.

## Varför passivt räcker

Fixen är korrekt by construction: samma insert-shape (`approval_type` + `payload` + `agent_id`) som redan bevisat skapar rader (30 `agent_observation` + Daniels `send_sms`-nudge). Steg 0 anpassade bara fel kolumnnamn till det verifierade schemat. Den passiva checken är slutbekräftelse, inte en blockare.
