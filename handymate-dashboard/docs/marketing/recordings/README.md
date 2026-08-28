# Inspelningar — produktbevis för Video Creative Bible

Här hamnar det som inspelningsläget (`tests/filming/`) spelar in: **en video (webm, 1080×1920) + en stillbild per beat + en sanningsfil** per film. Allt är produktens riktiga ytor med riktiga statusar på demokontot. Inget läggs till i efterhand utom text/logotyp i post.

## Köra

```bash
# Alla tre filmerna
npx playwright test --project=filming

# En film
npx playwright test --project=filming tests/filming/f08-ny-kund.spec.ts

# F06 med riktigt godkännande (SMS via 46elks — kräver saldo, annars filmas ett ärligt fel)
FILMING_APPROVE=1 npx playwright test --project=filming tests/filming/f06-offert.spec.ts
```

Kräver i `.env.test`: `DEMO_OWNER_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY` (samma som Golden Path). Kontot är `DEMO_BUSINESS_ID` (default demokontot) — **inspelningsläget vägrar köra om kontot inte är demo-flaggat i databasen.**

## Vad som händer i varje film

| Film | Seed (via produktens API:er som ägaren) | Beats |
|---|---|---|
| **F08 Ny kund** | Hemsidan publiceras tillfälligt om den är opublicerad; förfrågan fylls i på riktigt på `/site/<slug>`; lead + affär läses ur databasen | hemsidan → formulär ifyllt → skickat → pipeline "Ny förfrågan" → kundkortet |
| **F06 Offerten** | Kund + offert skapas, offerten **skickas på riktigt** (mejl till harnessets adress), `sent_at` backdateras 6 dagar (det enda produkten inte kan själv), Daniels kort skapas av produktens egen byggare | offert "Skickad" → tidslinjen → hemkön med Daniels kort → "Läs raderna" → Godkännanden → (valfritt) efter godkännande |
| **F07 Klart ≠ faktureringsklart** | Kund → offert → accepterad (skapar projektet) → tidrapport → ÄTA (utkast) markeras "skickad till kund" → projektet avslutas; readiness läses med produktens egen funktion | ÄTA-fliken → översikten → frågan till Matte → Matte namnger blockeraren |

Filmkunderna heter Maria Lindqvist (F08), Familjen Bergström (F06) och Johan Ek (F07) och bär harnessets telefon/mejl. Nästa körning städar dem (samma svep som Golden Path). Vill du titta på datat i appen efteråt: gör det innan nästa körning.

## Sanningsgränser (läs innan klipp)

- **F08:** webbformuläret är bevisat; mejlinflödet är det inte. Säg "hemsidan". Lisa svarar aldrig i telefon.
- **F06:** uppföljningen är ett SMS. Med tomt 46elks-saldo blir godkännandet ett ärligt fel. Filma "skickat"-beatet först efter påfyllning (`FILMING_APPROVE=1`).
- **F07:** Evidence-to-Payment (åtta bevisplatser) har ingen egen sida — den syns via Matte. Handbokens shotlist-rad "riktig projektvy: bevisplatsen markeras blocked" måste därför bli "Matte namnger blockeraren". Visa aldrig procent eller "AI-bedömning".
- Sanningsfilen `HM_<FILM>_SANNING.json` säger exakt vad databasen sa när bilderna togs — bifoga den i promptloggen.

## Filnamn

`HM_F06_OFFERT_BEAT-03_hemkon-daniels-kort_1080x1920.png`, `HM_F06_OFFERT_PRODUKTBEVIS_9x16.webm`, `HM_F06_OFFERT_SANNING.json`. Konvertera webm → mp4/ProRes i klippet; behåll webm som råfil.

## Om UI:t ändras

Kör om. Det är hela poängen: produktbeviset spelas in deterministiskt och kan alltid tas om — ingen annons får ligga ute med en skärm som inte längre finns.
