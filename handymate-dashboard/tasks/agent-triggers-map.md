# Agent-triggers-kartläggning (2026-06-03)

**Mål:** identifiera exakt vad Karin, Daniel och Lisa söker efter, vilka trösklar de använder, och vilka som är hårdkodade vs konfigurerbara.

**Bakgrund:** Bees pilot-data visar 0 förfallna fakturor + 1 ny offert idag + 0 inbound SMS. Förväntat utfall: Karin 0 ärenden, Daniel 0 ärenden (för färsk), Lisa 0 ärenden. Denna kartläggning förklarar **varför** noll-utfallet är korrekt och vilka trösklar som styrde det.

**Format:** kartläggning + rekommendation. INGEN kod-ändring i denna leverans.

---

## Per agent

### Karin — Ekonom (fakturor)

**Cron-fil:** `app/api/cron/agent-observations/[agent]/route.ts` (dynamisk per agent-id) → `lib/agents/karin/observation-prompt.ts:runKarinObservation()`

**Frekvens:** `0 6 * * *` (06:00 UTC dagligen) — `vercel.json:37-39`

**Sök-window:** 90 dagar bakåt (`ninetyDaysAgo`) — bredare än trigger-fönstret för att Karin ska ha kontext.

**DB-queries:**
```typescript
// Alla fakturor senaste 90d (för kontext)
supabase.from('invoice')
  .select('*')
  .eq('business_id', businessId)
  .gte('invoice_date', ninetyDaysAgo)

// Projekt + offerter + kunder (för marginal-/intäkt-kontext)
supabase.from('project')... // budget, margin
supabase.from('quotes')... // acceptance rate
supabase.from('customer')... // typ + phone (BRF/privat)
```

**Trigger-tröskel — actionable overdue:**
```typescript
// observation-prompt.ts:252
const overdue = invoices
  .filter(i => i.status === 'sent')
  .filter(i => daysOverdue >= 7)     // ← TRÖSKEL: HÅRDKODAD
```
**`daysOverdue >= 7`** — fakturor som är minst 7 dagar förfallna med kund som har telefonnummer. Top 3 hamnar i `aggregate.actionable_overdue` → blir SMS-actions i påminnelse-utkast.

**Output:**
- Approval-rader: `approval_type='agent_observation'` med `action.send_sms` i payload
- Max 3 approvals/agent/business/UTC-dag (rate-limit i `save-and-push.ts:61`)
- Dedup-nyckel: `karin_overdue_reminder:{invoice_number}` — 168h-fönster (7d)

**Skip-tröskel — early stage:**
```typescript
// observation-prompt.ts:578-587
if (invoiceCount < 5) return { skipped: 'too_few_invoices' }
if (invoiceCount < 10) // markeras 'early_stage', lättare observation
```

**Bees utfall idag (förväntat):**
- 0 fakturor i `invoice`-tabellen → `invoiceCount=0 < 5` → **Karin skip:ar med 'too_few_invoices'**.
- När Bee skapar 5+ fakturor börjar hon producera observationer; vid 10+ blir hon "full_analysis"-läge.

---

### Daniel — Säljare (offerter + leads)

**Cron-fil:** samma dynamiska route → `lib/agents/daniel/observation-prompt.ts:runDanielObservation()`

**Frekvens:** `5 6 * * *` (06:05 UTC dagligen) — `vercel.json:41-42`

**Sök-window:** 90 dagar bakåt.

**DB-queries:**
```typescript
supabase.from('quotes').select(...).eq('business_id', X).gte('created_at', ninetyDaysAgo)
supabase.from('leads').select(...).eq('business_id', X).gte('created_at', ninetyDaysAgo)
supabase.from('customer').select(...).in('customer_id', customerIds)
```

**Trigger-trösklar:**

1. **Stale-opens (offerter):**
   ```typescript
   // observation-prompt.ts:239
   const staleOpens = quotes
     .filter(q => q.view_count >= 3)                                      // ← HÅRDKODAD
     .filter(q => !['accepted','signed','declined','expired'].includes(q.status))
   ```
   Offerter som setts av kund **minst 3 gånger** utan att signeras. Top 5 sorterat på view_count → top 3 med telefonnummer blir `actionable_nudges` → SMS-actions.

2. **Hot leads:**
   ```typescript
   // observation-prompt.ts:313
   const hotLeads = leads
     .filter(l => l.score >= 7)                                           // ← HÅRDKODAD
     .filter(l => !['won','completed','lost'].includes(l.status))
   ```
   Leads med score ≥ 7 som är aktiva. Top 5. (Genererar inte SMS direkt — bara observation om "X heta leads, prioritera dessa".)

**Skip-tröskel — early stage:**
```typescript
// observation-prompt.ts:513-522
if (quoteCount < 5) return { skipped: 'too_few_quotes' }
if (quoteCount < 10) // 'early_stage'
```

**Output:**
- Approval-rader: `agent_observation` med `action.send_sms` för stale-opens
- Dedup: `daniel_quote_nudge:{quote_id}` — 168h-fönster
- Rate-limit: max 3/dag

**Bees utfall idag (förväntat):**
- 8 offerter totalt i `quotes`-tabellen, 1 ny idag.
- För stale-opens-trigger krävs `view_count >= 3`. Nya offerter har sannolikt `view_count=0` (kunden har inte ens öppnat länken än).
- Resultat: **0 stale-opens → 0 SMS-actions**. Daniel kan ändå producera observation om lead-pipeline om det finns hot leads — det är frikopplat från offert-nudging.

---

### Lisa — Kundservice (inbound SMS)

**Cron-fil:** samma dynamiska route → `lib/agents/lisa/observation-prompt.ts:runLisaObservation()`

**Frekvens:** `0 7 * * *` (07:00 UTC dagligen) — `vercel.json:53-54`

**Sök-window:** **7 dagar** bakåt (smalare än Karin/Daniel — kundsvar har kort halveringstid).

**DB-queries:**
```typescript
// observation-prompt.ts:109
supabase.from('sms_log')
  .select('*')
  .eq('business_id', businessId)
  .gte('created_at', sevenDaysAgo)
  .order('created_at', { ascending: false })
  .limit(500)
```

**Trigger-logik:**
```typescript
// observation-prompt.ts (per phone_from-grupp):
// 1. Senaste inbound per kund
// 2. Finns någon outbound EFTER den senaste inbound?
//    → Nej: kunden är obesvarad
//    → Ja: kunden har fått svar
// 3. Beräkna days_since_inbound
// 4. Top 3 äldsta obesvarade (störst days_since_inbound)
//    + giltigt E.164-format → actionable
```

**Trösklar:**
- **Inbound-fönster:** 7 dagar (hårdkodad — `sevenDaysAgo`)
- **Actionable cutoff:** top 3 äldsta — inget minimum-timgräns. En kund som SMS:at för 2 timmar sedan kan teoretiskt hamna i top 3.
- **E.164-validering:** strikt format `+467XXXXXXX` eller `+46XXXXXXXXX` (annars skippas)
- **Ingen early-stage-fallback** — Lisa kör full analys eller skippar helt.

**Output:**
- Approval-rader: `agent_observation` med `action.send_sms` (utkast-svar per obesvarad SMS)
- Dedup: `lisa_reply:{phone_from_e164}` — 168h-fönster
- Rate-limit: max 3/dag

**Bees utfall idag (förväntat):**
- 0 rader i `sms_log` → 0 obesvarade → **Lisa producerar 1 "allt är besvarat"-observation utan SMS-actions**.

---

## Gemensam infrastruktur

| Komponent | Värde / fil |
|---|---|
| Cron-auth | `Bearer ${CRON_SECRET}` |
| Cost-guards | `business_config.agents_globally_paused` (kill-switch) + `agent_cost_cap_usd_daily` (default 5.00 USD) |
| Rate-limit | `MAX_APPROVALS_PER_AGENT_PER_DAY = 3` (`save-and-push.ts:61`) — hårdkodad |
| Dedup-fönster | 168h default, 48h för anomalier (`dedup.ts:DEDUP_WINDOWS_HOURS`) |
| Thinking | extended-thinking 8000 token budget per agent-call |
| Cost-track | `agent_runs.estimated_cost` summeras per UTC-dag för cap-check |

**Insight vs Approval:** om agenten producerar observation UTAN `suggestion.send_sms` → sparas i `business_knowledge` (för insight-vyer) + push med `approval_type='agent_insight'` (ingen approval-rad). Om `suggestion.send_sms` finns → även `pending_approvals`-rad skapas.

**Approval-cap-beteende:** observation sparas ALLTID i `business_knowledge`. Approval-rad skapas BARA om dagens cap inte är nådd. Insight syns kvar i UI, men användaren får ingen Godkänn-knapp för den.

---

## Identifierade gaps (hypoteser för framtida justering)

Inte fix-nu. Vänta 2-3 veckors pilot-data innan beslut.

### Karin

1. **`daysOverdue >= 7` kan vara konservativt.** Många hantverkare följer upp redan vid 1-3 dagar förfallna fakturor (telefonsamtal eller vänligt SMS). 7d-fönstret kan göra Karin för passiv för business som vill ha tighter cash flow.
   - **Mot:** för aggressiv = nudga kund som är på semester eller har bank-fördröjning.
   - **Beslut:** låt 7d stå tills första pilot-feedback. Eventuellt gör konfigurerbart via `business_config.overdue_nudge_days` (default 7).

2. **`invoiceCount < 5` skip-tröskel.** Stänger Karin helt för Bee (0 fakturor). Inget värde innan första fakturan.
   - **Inget gap** — korrekt design. Skip:en signalerar att Karin inte har underlag.

### Daniel

1. **`view_count >= 3` missar "skickade men aldrig öppnade".** Offert som skickats men kunden aldrig öppnat → `view_count=0` → ingen trigger. Det är troligen ett **större försäljnings-gap** än stale-opens (kunden glömt = lägre konvertering).
   - **Hypotes:** lägg till second trigger `days_since_sent >= 5 && view_count === 0` → "påminn om obeöppnad offert".
   - **Risk:** dubbel-trigger om kunden öppnar dag 6 och då blir både stale (om de öppnar 3 ggr) och just-bumpt.

2. **`score >= 7` för hot leads — vi vet inte hur scoren räknas.** Audit visar inte var/hur lead.score sätts. Om scoren är dåligt kalibrerad blir Daniel antingen tyst eller spammig.
   - **TD:** kartlägg lead-scoring-algoritmen separat innan trösklar justeras.

3. **`quoteCount < 5` skip-tröskel.** Bee har 8 offerter → är förbi tröskeln. Inget gap.

### Lisa

1. **Ingen min-timegate på "obesvarad".** En SMS som kom in för 2 timmar sedan kan rankas som "actionable" om det är de tre äldsta. Det är **för aggressivt** — kunden kanske inte hunnit kolla telefonen.
   - **Hypotes:** lägg till `daysSinceInbound >= 1` eller `hoursSinceInbound >= 6` som min-tröskel.
   - **Risk:** missa akuta kundsvar (men då borde Christoffer hantera dem manuellt, inte via Lisa).

2. **`limit(500)` på sms_log-query.** För högvolym-business (>500 SMS/7d) trunkeras gamla rader bort. Inte ett problem för pilot, men noterar.

### Gemensamt

1. **`MAX_APPROVALS_PER_AGENT_PER_DAY = 3` är hårdkodad** — kan vara för låg för business med hög pipeline. Per-business-config skulle ge flex (men risk för spam).
   - **TD:** flytta till `business_config.agent_approvals_cap_daily` (default 3) när första pilot blir cap-limited.

2. **Dedup-fönstret 168h (7d)** kan göra att Karin missar att nudga samma faktura igen efter en vecka utan svar.
   - **Hypotes:** korta till 72h-96h för `karin_overdue_reminder` så Karin kan följa upp en obeskvarad nudge efter 3-4 dagar.

3. **Trösklar är inte personaliserade per business än.** Pattern-extraction-cron (`business_patterns`-tabellen) finns men trösklarna i agent-prompterna läser INTE pattern-data idag. Detta är Fas 1b-jobbet: koppla `approve_rate` / `deal_cycle` / `ata_frequency` till tröskel-beslut i runtime.

---

## Bees förväntade utfall imorgon 06:00-07:00 UTC

| Agent | Trigger-check | Förväntad output |
|---|---|---|
| Karin (06:00) | invoiceCount=0 < 5 | Skip 'too_few_invoices'. Ingen approval, ingen insight. |
| Daniel (06:05) | quoteCount=8 ≥ 5 | Full analys av offerter. 0 stale-opens (för färska) → 0 SMS-actions. Möjligen 1 observation om lead-pipeline om hot leads finns. |
| Lisa (07:00) | inbound=0 i 7d | 1 positiv observation "alla kundsvar besvarade", 0 SMS-actions. |

**Om utfallet avviker** — t.ex. om Daniel plötsligt nudgar en färsk offert — då är min karta fel och vi behöver re-audit.

---

## Rekommendation

**Justera ingen tröskel nu.** Bees data är för tunn för att kunna kalibrera. Föreslår denna ordning:

1. **Vecka 1-2:** observera Bee-piloten. Logga vilka observationer Karin/Daniel/Lisa producerar och hur Christoffer reagerar (approve / reject / edit / ignore).
2. **Vecka 3:** läs `business_knowledge` + `agent_runs` för Bee. Identifiera om trösklar producerat:
   - **För mycket noise** (Christoffer rejectar / ignorerar) → höj trösklar
   - **För lite värde** (Christoffer säger "Karin har inte sagt något användbart") → sänk trösklar
   - **Saknar uppenbara cases** (Christoffer säger "varför nudgade Daniel inte denna offert?") → utöka trigger-logik
3. **Vecka 4+:** Fas 1b — koppla `business_patterns` till runtime-trösklar så Karin/Daniel/Lisa anpassar sig till business reality (t.ex. Karin justerar `daysOverdue` baserat på `deal_cycle`-pattern).

Tills dess: trösklarna fungerar som tänkt. Bees noll-utfall imorgon är **förväntat och korrekt**, inte en bugg.

---

## Filer som är relevanta för framtida justeringar

| Tröskel | Fil:rad | Hur ändra |
|---|---|---|
| Karin `daysOverdue >= 7` | `lib/agents/karin/observation-prompt.ts:252` | Literal i kod |
| Karin early-stage `< 5` / `< 10` | `lib/agents/karin/observation-prompt.ts:578-587` | Literal |
| Daniel `view_count >= 3` | `lib/agents/daniel/observation-prompt.ts:239` | Literal |
| Daniel `score >= 7` | `lib/agents/daniel/observation-prompt.ts:313` | Literal |
| Daniel early-stage `< 5` / `< 10` | `lib/agents/daniel/observation-prompt.ts:513-522` | Literal |
| Lisa 7d-fönster | `lib/agents/lisa/observation-prompt.ts:109` | Literal |
| Lisa actionable top 3 | `lib/agents/lisa/observation-prompt.ts:204-205` | Literal |
| Rate-limit 3/dag | `lib/agents/shared/save-and-push.ts:61` (`MAX_APPROVALS_PER_AGENT_PER_DAY`) | Konstant |
| Dedup-fönster | `lib/agents/shared/dedup.ts:DEDUP_WINDOWS_HOURS` | Konstant |
| Cost-cap | `business_config.agent_cost_cap_usd_daily` | Per-business-config |
| Kill-switch | `business_config.agents_globally_paused` | Per-business-config |
| Cron-schemas | `vercel.json:37-54` | Cron-strängar |

Allt utom cost-cap + kill-switch är hårdkodat. Det är OK i pilot — när vi har data om vad som ska konfigureras blir det enkelt att flytta till `business_config`.
