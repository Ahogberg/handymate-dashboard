# Onboarding Fix — Telefon steg 3

## SQL-filer (kör i Supabase SQL Editor)

1. `sql/v4_phone_migration.sql` — Lägger till `personal_phone`, `public_phone` i `business_config` + `call_handling_mode` i `v3_automation_settings`

## Implementerade ändringar

### Steg 1: Databas
- `sql/v4_phone_migration.sql` — personal_phone, public_phone, call_handling_mode
- Migrerar assigned_phone_number → public_phone, forward_phone_number → personal_phone

### Steg 2: Onboarding steg 3
- `app/onboarding/components/Step3Phone.tsx` — Helt omskriven:
  - Handymate-nummer visas prominent (teal box med checkmark)
  - "Ditt privata mobilnummer" — nytt fält, sparas till personal_phone
  - Samtalsläge-val med 3 alternativ (radio buttons)
  - Vidarekopplingskod kollapsad under "Har du ett gammalt nummer?"
  - Operator-knappar (Telia/Tele2/Tre/Telenor) inne i kollapsbart avsnitt
  - Fortsätt-knappen sparar personal_phone + call_handling_mode

### Steg 3: API
- `app/api/settings/route.ts` — personal_phone tillagd i allowedFields
- `app/api/automation/settings/route.ts` — call_handling_mode i default-response

### Steg 4: Telefoni-routing
- `app/api/voice/incoming/route.ts` — Helt omskriven routing:
  - `agent_always`: Agenten tar meddelande, ingen transfer
  - `agent_with_transfer`: Agenten svarar, kopplar till personal_phone (default)
  - `human_work_hours`: Under arbetstid → ring personal_phone direkt, utanför → agenten
  - isWithinWorkHours() helper för svensk tidzon
  - personal_phone fallback till forward_phone_number
  - fireEvent('call_transferred') vid transfer

### Steg 5: Agent system prompt
- `app/api/agent/trigger/system-prompt.ts` — Vidarekopplingssektion:
  - Om personal_phone finns: agenten kan koppla vidare
  - Om personal_phone saknas: agenten tar alltid meddelande
- `app/api/agent/trigger/route.ts` — Hämtar personal_phone + call_handling_mode

### Steg 6: Inställningar
- `app/dashboard/settings/page.tsx` — CallHandlingModeSection komponent:
  - Samma 3 alternativ som i onboarding
  - Auto-sparar vid klick via /api/automation/settings
  - Visas under Samtalsinspelning i Telefoni-fliken
