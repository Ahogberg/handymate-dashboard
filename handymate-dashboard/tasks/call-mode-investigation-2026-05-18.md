# Call_mode-investigation — 2026-05-18

**Fråga:** Är `call_mode`-kolumnen i business_config en pilot-blocker?

**Kort svar:** **Nej. `call_mode` är en zombie-kolumn som aldrig läses av voice-systemet.** Den faktiska switchen är `call_handling_mode` i en helt annan tabell (`v3_automation_settings`), som har en säker default (`'agent_with_transfer'`) som triggas automatiskt vid business-skapande.

**Men:** Investigationen hittade två andra "döda kolumner" i samma område som är värda att flagga separat — `greeting_script` och `knowledge_base` används inte av voice-pipelinen alls.

---

## A. `call_mode`-kolumnen — zombie-status

### Var skrivs

| Plats | Värde |
|-------|-------|
| `app/api/auth/route.ts:91` (registrering) | `'human_first'` (hårdkodat) |
| `app/api/auth/register/route.ts:75` | `'human_first'` (hårdkodat) |
| `app/api/onboarding/phone/route.ts:72, 125` | `call_mode \|\| 'human_first'` (fallback) |
| `app/api/admin/create-pilot/route.ts:97` | `'human_first'` (hårdkodat) |

**Default vid skapande: `'human_first'`** — det är alltid satt, aldrig NULL för nya businesses.

### Var läses

- `app/onboarding/types.ts:19` — bara TypeScript-typ
- `app/api/admin/pilots/route.ts:93` — hämtas för pilot-admin-lista (display only)
- `app/api/onboarding/route.ts:22` — hämtas för onboarding-status
- `app/api/settings/route.ts:56` — tillåts uppdateras

**❌ Ingen voice-endpoint läser eller använder `call_mode`. Det är display-data utan effekt.**

---

## B. Den ACTUAL switch: `call_handling_mode` i `v3_automation_settings`

### Schema
[sql/v4_phone_migration.sql:24-26](../sql/v4_phone_migration.sql):
```sql
ALTER TABLE v3_automation_settings
ADD COLUMN IF NOT EXISTS call_handling_mode TEXT DEFAULT 'agent_with_transfer';
```

### Default-rad skapas auto
[sql/v3_automation_settings.sql:46-48](../sql/v3_automation_settings.sql):
```sql
INSERT INTO v3_automation_settings (business_id)
SELECT business_id FROM business_config
ON CONFLICT (business_id) DO NOTHING;
```

→ Varje business får automatiskt en rad med `call_handling_mode = 'agent_with_transfer'`.

### Tre möjliga värden

| Värde | Beteende |
|-------|----------|
| `human_work_hours` | Ring till hantverkaren direkt under arbetstid, agent utanför arbetstid |
| `agent_with_transfer` (default) | Agent svarar, kan vidarekoppla om personal_phone svarar inom 20s, annars voicemail |
| `agent_always` | Agent svarar alltid, tar meddelande, ingen transfer |

---

## C. Vad händer när 46elks ringer in

Voice-webhook: [app/api/voice/incoming/route.ts](../app/api/voice/incoming/route.ts)

**Rad 80-87** — fetch:
```typescript
const { data: autoSettings } = await supabase
  .from('v3_automation_settings')
  .select('call_handling_mode, work_start, work_end, work_days')
  .eq('business_id', business.business_id)
  .maybeSingle()

const callHandlingMode = autoSettings?.call_handling_mode || 'agent_with_transfer'
```

**Rad 88** — transfer-prio:
```typescript
const transferPhone = business.personal_phone || business.forward_phone_number
```

`personal_phone` (V4-kolumn) prioriteras över `forward_phone_number` (legacy).

**Rad 173-247** — routing-logiken:

| Scenario | Resultat |
|----------|----------|
| `mode='human_work_hours'` + transferPhone finns + inom arbetstid | Connect direkt till transferPhone |
| `mode='human_work_hours'` + utanför arbetstid | Fallthrough → agent |
| `mode='agent_with_transfer'` + transferPhone finns | Agent svarar, försöker transfer efter 20s |
| `mode='agent_with_transfer'` + transferPhone NULL | Agent tar över, spelar greeting, tar meddelande |
| `mode='agent_always'` | Agent svarar alltid, ingen transfer-försök |
| `call_handling_mode IS NULL` | Default `'agent_with_transfer'` → ovanstående |

### Fallback-säkerhet

✅ **Alla NULL-fall hanteras säkert.** Värsta fall: agent tar över och spelar greeting. Inga error-svar eller hängande samtal.

---

## D. Två andra döda kolumner i samma område

### `greeting_script` — sparas, men aldrig spelas

Kolumnen kan redigeras via Settings ([app/dashboard/settings/page.tsx:595](../app/dashboard/settings/page.tsx)) men **ingen voice-endpoint läser den**. Voice-systemet spelar greeting via en generisk `play`-action från 46elks utan att hämta `business_config.greeting_script`. Hantverkare som ändrar sin "AI-hälsning" ser ingen effekt.

### `knowledge_base` — inte kopplad till voice

`knowledge_base` JSONB injicerats i widget-chat-systempromppt (det fixade jag i 2f293aa3), men voice-systemet använder den inte alls. Voice-pipelinen hämtar bara `assigned_phone_number, personal_phone, call_recording_*` — inget av kunskapsbas-data går in i AI-telefoni-prompten.

⚠️ **Det här är troligen en avsiktlig arkitekturlös frikoppling, inte en bugg** — voice kan ha sin egen prompt-struktur. Men det betyder att om Christoffer fyller i FAQ och förväntar sig att Lisa kan svara på dem i telefonen så blir han besviken. Värt att verifiera med Andreas om detta är medvetet.

---

## E. SQL att köra mot prod för verifiering

Du bad ursprungligen om denna query — men nu vet vi att den **inte är meningsfull** eftersom `call_mode` inte läses. Den intressanta queryn är:

```sql
-- Verifiera att alla onboardade businesses har v3_automation_settings-rad
-- och att call_handling_mode är satt
SELECT
  bc.business_id,
  bc.business_name,
  bc.onboarding_completed_at,
  bc.call_mode AS call_mode_zombie,
  vas.call_handling_mode AS actual_call_mode,
  bc.assigned_phone_number,
  bc.phone_number AS forward_legacy,
  COALESCE(vas.work_start, 'NULL') AS work_start,
  COALESCE(vas.work_end, 'NULL') AS work_end
FROM business_config bc
LEFT JOIN v3_automation_settings vas ON vas.business_id = bc.business_id
WHERE bc.onboarding_completed_at IS NOT NULL
ORDER BY bc.created_at DESC;
```

**Vad du letar efter:**
- `actual_call_mode` ska vara `'agent_with_transfer'` (eller annat icke-NULL värde) för alla onboardade businesses
- Om `actual_call_mode IS NULL` för någon → de fick aldrig en v3_automation_settings-rad → potentiell bugg i onboarding eller bulk-insert som inte triggades
- `call_mode_zombie` ska vara `'human_first'` för alla (display-data, ingen funktionell effekt)

### Sekundär query: `personal_phone` vs `forward_phone_number`

```sql
-- Bee Service + andra pilots: vilken kolumn används för transfer?
SELECT
  business_id,
  business_name,
  assigned_phone_number,
  personal_phone,
  forward_phone_number,
  phone_setup_type,
  CASE
    WHEN personal_phone IS NOT NULL THEN 'transfer to personal_phone'
    WHEN forward_phone_number IS NOT NULL THEN 'transfer to forward_phone_number (legacy)'
    ELSE 'NULL → agent tar över (no transfer)'
  END AS transfer_target
FROM business_config
WHERE business_name ILIKE '%bee%' OR is_pilot = true;
```

---

## F. Slutsatser

### För pilot-leverans

**Det här är inte en pilot-blocker.** Voice-systemet fungerar med säkra defaults:
- `call_handling_mode = 'agent_with_transfer'` (default)
- Om transferPhone NULL → agent tar meddelande
- Alla onboardade businesses bör automatiskt få v3_automation_settings-rad

### Tekniska skuld-fynd (inte akuta)

1. **`call_mode` är en zombie-kolumn** — borde antingen kopplas in eller dödas. Dödning är säkrare (3 ställen i koden skriver, ingenstans läser i voice-flödet). Risk: någon framtida session läser den och förvirras.

2. **`greeting_script` används inte** — antingen koppla in i voice eller flagga som "kommer senare". Pilot-användare som ändrar AI-hälsning ser ingen effekt.

3. **`knowledge_base` i voice** — verifiera om det är avsiktligt eller saknad feature. Christoffer som fyller i FAQ förväntar sig troligen att Lisa också vet det.

### Verifierings-steg du bör göra

1. **Kör SQL ovan** för att bekräfta att alla pilots har `v3_automation_settings`-rad
2. **Be Christoffer ringa sitt 46elks-nummer** — observera om det går till AI eller hans personal-telefon (avslöjar default-beteende live)
3. **Bestäm strategi för greeting_script + knowledge i voice** — implementera eller döda

### Mitt rekommenderade fokus

**Kör Live-Ring-testet.** Det är 5 minuter och avslöjar mer än 30 minuters SQL-analys. Om Lisa svarar och samtalet fungerar OK → call_mode-mysteriet är löst (det är inte ett problem). Sen kan vi fokusera på `greeting_script` + voice-knowledge som faktiskt påverkar pilot-upplevelsen.

---

*Investigation baserad på kod-trace per 2026-05-18. Voice-pipelinen är kartlagd från 46elks-webhook till routing-beslut. SQL kräver din körning i Supabase Editor.*
