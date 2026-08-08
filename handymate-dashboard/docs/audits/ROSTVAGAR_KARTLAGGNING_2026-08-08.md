# Röstvägarna — kartläggning 2026-08-08

Förarbete till Epic 6 (Voice Transport Adapter) i Codex orkestreringsaudit.
Allt nedan är verifierat mot koden, inte mot dokumentationen.

## Produktbeslutet är redan fattat — i praktiken

**46elks är den enda telefonileverantör som provisioneras.** Numret köps med
`voice_start=/api/voice/incoming` och `sms_url=/api/sms/incoming`
(`lib/phone/purchase-number.ts:58-59`), och samma två URL:er sätts vid resync
(`app/api/phone/settings/route.ts:17-18`) och provisionering
(`app/api/phone/provision/route.ts:83-84`).

**Ingen kod refererar Retell, ElevenLabs, Deepgram eller n8n.** De förekommer
bara i `tasks/rost-lisa-teknikval-2026-08.md`, `tasks/rost-lisa-spec.md`,
`tasks/telephony-integration-roadmap.md` och strategidokumenten. All STT är
OpenAI Whisper.

Frågan "Retell eller 46elks" behöver alltså inget arkitekturbeslut för att
Epic 6 ska kunna byggas — den behöver bara ett *produktbeslut om vi vill byta*.
Byggs Epic 6 på det som finns är entrypointen 46elks.
`tests/voice-boundaries.spec.ts` larmar om någon börjar bygga en andra röstväg.

## Kedjan

```
46elks → /api/voice/incoming (signerad)
       → /api/voice/consent (om inspelning på) → recordcall
       → /api/voice/recording → /api/voice/transcribe (Whisper)
                              → /api/agent/trigger  trigger_type: phone_call → LISA
       → /api/voice/missed (whenhangup) → call_missed → catch-SMS
```

Varje steg i kedjan kan starta en agentkörning. Det är därför ett osignerat
mellansteg inte är ett litet fel: det är en ingång till en främmande tenants
agent.

## Åtgärdat 2026-08-08 (samma commit som detta dokument)

| # | Väg | Felet | Facit |
|---|---|---|---|
| 1 | `voice/missed` | GET exporterades vid sidan av POST men signaturkontrollen låg inuti `if (method === 'POST')`; `business_id` och `from` lästes ur query → förfalskad GET kunde skicka catch-SMS till valfritt nummer på valfritt företags räkning | GET muterar inte längre |
| 2 | `voice/transcribe` | Ingen auth alls — bara `recording_id` — och routen startar en Lisa-körning | Kräver intern hemlighet eller inloggad ägare till inspelningen |
| 3 | `voice/analyze` | Auth fanns men `recording.business_id` jämfördes aldrig med den inloggades | Tenantmatchning före alla skrivningar |
| 4 | `voice/recording` | Ingen signaturverifiering; tenant härleddes ur overifierad payload | 46elks-HMAC som övriga webhooks |
| 5 | `voice/execute` | SMS-grenen anropade `api.46elks.com` direkt och förbigick opt-out-spärren, E.164-normaliseringen och `sms_log` | Går genom `sendSmsViaElks` |
| 6 | `sms/incoming` | Fallbacken slog upp kund på telefonnummer **utan** business-filter och tog första träffen → nummer som är kund hos två företag routade till fel tenant | Avstår när svaret är tvetydigt |

## Kvar — kräver beslut eller åtkomst jag inte har

**Två parallella AI-hjärnor på samma transkript.** `voice/transcribe:134`
triggar Lisa via agentmotorn, medan UI:t (`app/dashboard/recordings/page.tsx:211`,
`app/dashboard/inbox/page.tsx:342`) *oberoende och alltid* anropar
`voice/analyze`, som kör sin egen Claude-prompt och skapar ett eget
förslagsset. Kommentaren i transcribe kallar analyze "legacy fallback", men
UI:t behandlar den inte så. Två uppsättningar förslag på samma samtal är
Epic 6:s kärnproblem — det ska lösas där, inte med en snabbfix.

**Två hjärnor på samma SMS.** `sms/incoming` kör både Matte intent-agent med
`executeMatteActions` (`:196-240`) och `triggerAgentFireAndForget` (`:243-252`),
båda med mutationsrätt.

**Död kod jag INTE tog bort.** `voice/execute`, `voice/process`,
`quotes/transcribe-voice`, `ai-copilot` och den oanvända Claude-grenen i
`jobbuddy/voice:104-164` har ingen anropare i det här repot — men mobilappen
ligger i ett annat repo och kan anropa samma API. Att radera en route som en
klient jag inte kan läsa möjligen använder är inte mitt beslut att fatta ensam.
`voice/execute`s faktiska defekt (opt-out-bypassen) är lagad oavsett.

**Två edge-funktioner utan signaturverifiering.** `supabase/functions/sms-webhook`
och `supabase/functions/vapi-webhook` triggar båda `functions/v1/agent`, som
inte finns i `supabase/functions/`. Om de fortfarande är deployade och 46elks
pekar på dem dubbelkörs inkommande SMS. **Går inte att avgöra från koden** —
kräver kontroll i Supabase- och 46elks-konsolen.

**`ELKS_SKIP_SIGNATURE=true` slår av all signaturverifiering globalt**
(`voice/incoming:44`, `sms/incoming:35`, `voice/missed:41`, nu även
`voice/recording`). Kontrollera att den inte är satt i produktionsmiljön.

**`/api/agent/trigger` accepterar `business_id` fritt ur bodyn** när
`x-internal-secret === CRON_SECRET` (`app/api/agent/trigger/route.ts:43-48`).
En delad hemlighet, inte per-request-härledd tenant. Fungerar, men är den
svagaste länken i hela kedjan och hör hemma i Epic 6:s scope.
