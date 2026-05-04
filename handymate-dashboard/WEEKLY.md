# Veckans plan — 2026-05-04

> Genererad av Strategist Agent baserat på QA-rapport 2026-04-24 + ARCHITECTURE.md
> (Ingen research- eller CS-rapport tillgänglig denna körning)

---

## 🚨 Kritiska säkerhetsbuggar (fixa idag — blockerar ingenting, men riskerar dataintegriteten)

1. **BUG-005: Kunddata-leakage i offerter** — `app/api/quotes/route.ts:99` — ~30 min  
   Saknar `.eq('business_id', businessId)` på customer-lookup. Kan exponera kunder från andra företag.

2. **BUG-013: Cross-tenant projekt-radering** — `app/api/projects/route.ts:454` — ~45 min  
   Barnrader raderas INNAN ägarverifiering. En business som känner till ett project_id kan radera annan businesses data.

---

## 🔴 Kritiska buggar att fixa denna vecka

3. **BUG-015: Fel kolumnnamn i project_log-delete** — `app/api/projects/route.ts:469` — ~15 min  
   `order_id` istf `project_id` — blockerar projektradering via FK eller lämnar orphaned records.

4. **BUG-001: Blank page i invoices/new** — `app/dashboard/invoices/new/page.tsx:94` — ~30 min  
   `.single()` utan null-check — kraschar om business_config saknas.

5. **BUG-016: Pipeline-vy saknar try/catch** — `app/api/leads/route.ts` — ~1 tim  
   GET, PATCH och POST har inga try/catch — vid DB-fel returneras 500-sida utan JSON-body, pipeline-vyn laddas inte.

6. **BUG-014: time_entry-count saknar business_id** — `app/api/projects/route.ts:455` — ~15 min  
   False-positive count kan blockera radering av tomt projekt.

---

## 🚀 Features att bygga denna vecka

1. **BUG-017: Canvas stale useEffect** — `components/project/ProjectCanvas.tsx` — ~30 min  
   Lägg till `resolvedId` i dependency array — annars visas alltid första projektets canvas.

2. **BUG-018: Canvas tyst save-fel** — `components/project/ProjectCanvas.tsx` — ~20 min  
   Visa felindikator i UI vid misslyckad auto-save — hantverkaren ritar, stänger, allt försvinner tyst.

3. **BUG-003: Popup-modal varje sidbesök** — `app/dashboard/quotes/new/page.tsx` — ~20 min  
   Lägg till localStorage-persist så modalen inte dyker upp vid varje besök.

---

## 💡 Vild idé att diskutera med Andreas

**Matte som context-aware "missat samtal"-responder:**  
Idag: missat samtal → generisk bekräftelse-SMS.  
Idé: Matte slår upp vem som ringde (befintlig kund? vilket projekt? vad pratades senast?) och skickar ett SMS som låter som att vi *vet* varför de ringde — inte ett mall-svar. `call_missed`-event är redan live, resolver.ts kan slå upp kontexten. Kräver ~2 tim. Hög impact på proffsintryck.

---

## 📊 Status

- Kritiska buggar kvar: 7 (2 säkerhet, 5 UX/crash)
- Senaste version: V36 (Stripe Elements) ✅ Klar
- Nästa föreslagna version: V37 — Matte Full Loop (se strategy-rapport)
- Christoffers senaste feedback: saknas (ingen CS-rapport tillgänglig)
- Senaste commits: Matte chat — multi-turn, bildstöd, vision-analys

---

## ⏭️ Nästa vecka (preliminärt)

- **V37 Sprint 1**: Implementera saknade events — `contacted`, `booking_created`, `booking_reminder`, `quote_expired`
- **Matte approval-stabilisering**: `send_matte_customer_reply` approval-execution
- **BUG-007 + BUG-019**: Auth-cookie logging + toast-timer cleanup (snabba wins, <30 min totalt)
