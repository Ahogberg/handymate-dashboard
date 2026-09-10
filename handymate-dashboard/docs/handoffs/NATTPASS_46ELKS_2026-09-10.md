# Nattpass 2026-09-10 — kanalerna fungerar, och tiger inte längre

Fem leveranser, alla committade på `claude/next-dev-steps-launch-b4xqwu`.
Kontraktsgrinden 1799 gröna, `npx tsc --noEmit` ren, `npx next build` exit 0
efter varje commit.

## Vad som gjordes

| # | Leverans | Commit | Bevisnivå |
|---|---|---|---|
| 1 | Larm vid avvisad webhook | `e961368e` | Kört lokalt: 11 larm, rätt skäl, hemligheten aldrig i loggen |
| 2 | Riktig webhookautentisering på åtta rutter | `e961368e` | Kört lokalt mot dokumentationens payload, tre lägen |
| 3 | `play`/`ivr` får ett ljud, inte en webhook-adress | `c4e9d529` | Facit + bygge. **Kräver ett riktigt samtal för att räknas som bevisat** |
| 4 | Svep som verifierar att nummer är våra | `cc043bad` | Ren funktion provad mot de utfall vi faktiskt såg |
| 5 | Inkommande SMS genomläst och provat | denna commit | Verklig rutt körd mot dokumentationens payload |

## Det du behöver göra, i ordning

### 1. Sätt hemligheten och deploya

```
ELKS_WEBHOOK_SECRET=<minst 16 tecken, gärna 32>
```

I Vercel, sedan **Redeploy**. Miljövariabler slår inte igenom på ett redan
körande bygge.

`ELKS_SKIP_SIGNATURE=true` ligger kvar och släpper fortfarande igenom, så
ingenting går sönder av deployen. Rör den inte än.

### 2. Uppdatera de tre numren hos 46elks

Lägg `?k=<hemligheten>` på båda adresserna, för varje nummer:

- Voice: `https://app.handymate.se/api/voice/incoming?k=<hemligheten>`
- SMS: `https://app.handymate.se/api/sms/incoming?k=<hemligheten>`

Numren som är i bruk: `+46766860747` (Nordström El), `+46766869541`
(Bee Service), `+46766868219` (Sixsaxbygg).

Nyköpta nummer får hemligheten automatiskt — `purchaseAndAssignNumber` och
`/api/phone/provision` sätter den vid köpet.

### 3. Ta bort skip-flaggan

När numren är uppdaterade: ta bort `ELKS_SKIP_SIGNATURE` i Vercel och deploya.
Då är de åtta rutterna autentiserade igen. Just nu står de öppna.

### 4. Ring två samtal

Från en **annan telefon** än den samtalet kopplas till — `personal_phone` på
Nordström El är `+46708379552`, alltså din vanliga mobil. Ringer du därifrån
får du upptaget och provet säger ingenting om det viktiga fallet.

- **Du svarar** → inget SMS ska gå ut.
- **Du låter det ringa ut** (20 sekunder) → SMS ska komma.

Det andra fallet är bevisat en gång (2026-09-09 22:16). Det första är inte
bevisat alls, och det är det viktigare: ett SMS som säger "vi missade ditt
samtal" till någon du just pratat med är värre än inget SMS.

### 5. Skicka ett SMS till numret

Aldrig gjort. Noll inkommande SMS i hela databasens historia. Efter steg 1–3
ska det landa. Säg till så läser jag `sms_log`, `agent_runs` och
`sms_conversation` direkt efteråt.

## Läget på kontot just nu

Jag ställde om Nordström El i natt till det enkla lanseringsläget:

- `call_handling_mode = 'agent_with_transfer'` — ringer alltid hantverkaren
- `call_recording_enabled = false` — hoppar över consent-vägen helt
- `personal_phone` / `forward_phone_number` = `+46708379552` (E.164-rättat)

Vill du prova inspelning och transkribering krävs `call_recording_enabled =
true` OCH att `CALL_RECORDING_POLICY_APPROVED` och
`CALL_RECORDING_PROVIDER_RETENTION_VERIFIED` är satta i Vercel — annars
returnerar `recordingNoticeUrl()` null och samtalet kopplas utan inspelning.
Det är avsiktligt: en kund ska aldrig tappas för att en policyflagga saknas.

## Vad jag inte kunde bevisa

Leverans 3 är verifierad med facit, typkontroll och bygge, men inte mot 46elks.
Hela ljudvägen kräver ett matchande företag i databasen, och den lokala
instansen har en attrapp. Enligt regeln vi satte i kväll — simulerade
leverantörer är värda noll — räknas den inte som bevisad förrän du ringt.

## Sprintförslaget

`tasks/sprint-samtalet-blir-ett-jobb.md`. Din invändning var riktig: nattens
fem leveranser gör produkten *ärlig*, men de flyttar inte värdepropositionen.
Förslaget är loopen som gör det — kunden svarar på fångst-SMS:et i fritext, och
hantverkaren får ett kort med kundens egna ord, kunden inlagd, och en väg till
offert. Han gör ingen intag. Fyra femtedelar finns byggt.

Läs den före du bestämmer veckans ordning.
