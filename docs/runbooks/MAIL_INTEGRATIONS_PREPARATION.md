# Gmail och Microsoft 365: förberedelse inför lansering

2026-09-11. Status: förberett underlag, ingen aktivering eller inskickad ansökan.

Bygger vidare på [onboardingens startpaket](../design/ONBOARDING_STARTPAKET_LAUNCH.md) och styrdokumentet `docs/roadmap/BRAIN_VISIBILITY_WEEKEND.md`. Användaren har beställt förberedelser för fyra punkter: granskningspaket och Microsoft-koppling, separerade behörigheter, sammanhängande tester samt sanningsenlig onboarding med möjlig vidarebefordran.

## Leverans och ordning

| Punkt | Förberett här | Nästa utförande |
|---|---|---|
| 1. Google-verifiering och Microsoft | [Ansökningsunderlag](MAIL_PROVIDER_VERIFICATION.md), scopeval och konfigurationslista | Slutför tekniska hinder nedan; konfigurera testappar; spela in fungerande flöde; lämna in Google-underlag och initiera Microsoft publisher verification |
| 2. Kalender och mejl separat | Implementationskontrakt nedan med konto-, scope- och tokenregler | Genomför i avgränsad PR och testa befintlig kalender som regression |
| 3. Hela kundresan | [Testprotokoll](MAIL_INTEGRATIONS_ACCEPTANCE.md) med positiva och negativa fall | Automatisera kontraktsfallen; kör leverantörsprov när liveprov återupptas |
| 4. Onboarding och övergång | Status-/textmatris och villkor för vidarebefordran | Koppla befintlig channel-health till aktuell anslutning och verkligt prov |

Granskningsunderlag och Microsoft-implementation kan beredas parallellt. Ingen ny agentmotor eller generell integrationsplattform behövs. Google-granskningen ska inte vara ett dolt beroende för lansering av övriga Handymate.

## Bevisläge

Kodbas: lokal commit `aefbcf6`; motsvarande senaste dokumentcommit på arbetsgrenen i GitHub `a1ec021228226557d0363d02aa7e6f594f5ec4c5`. Metadata läst från Supabase-projekt `pktaqedooyzgvzwipslu` 2026-09-11. Inga tokenvärden eller kundmejl hämtades. Inga DB-skrivningar, ändrade scopes, utskick eller livewebbläsartester utfördes.

| Källa | Observerat | Konsekvens |
|---|---|---|
| `lib/google-calendar.ts` | Begär calendar.readonly, calendar.events och userinfo.email; tokenresultatet lämnar inte vidare beviljade scopes | Kalenderanslutning bevisar ingen Gmail-behörighet |
| `app/api/google/callback/route.ts` | Sätter båda Gmail-scopeflaggorna false; behåller gammal refresh-token om ny saknas; matchar sessionens företag | Hantera faktisk behörighet och verifiera samma användare/konto innan en gammal token återanvänds |
| `lib/google/oauth-state.ts` | Signerad state med företag, business-user och tid; ingen engångsnonce eller funktions-/returmål | Utöka med sessionsbundet engångsskydd och tillåtet återgångsmål; signatur ensam bevisar inte aktuell användare |
| `lib/gmail/poller.ts` | Befintlig inkrementell import med ny läsning av aktivering, konto och token | Återanvänd importskydden; startgräns och läsposition ska höra till rätt konto |
| `lib/gmail-send.ts` | Väljer första aktiva Google-raden i företaget; sändning kräver även gmail_sync_enabled | Kräver uttryckligt avsändarval och beslut om separat sändning kontra pausad läsning |
| `lib/gmail/processor.ts` | Gmail-specifika meddelande-/tråd-ID:n; kundmatchning, lagring och befintliga ärenden | Återanvänd verksamhetslogik först efter att Gmail-antaganden har separerats |
| `lib/gmail-lead-detection.ts` | Anropar Anthropic | Leverantör och faktiska dataflöden ska ingå i granskningen; avtals-/lagringsinställningar inte verifierade |
| `app/api/google/disconnect/route.ts` | Tar bort kopplingsraden och försöker återkalla Google-beviljandet | Frånkoppling är inte bevis på radering av redan importerade mejl |
| `app/api/integrations/email-lead/route.ts` | Befintligt vidarebefordringsflöde; kommentaren om saknad tabell är äldre än verkligt schema | `email_inbound_route` finns i prod, men det bevisar inte fungerande leverans |
| Genomsökta `app/api` och `lib` | Ingen Microsoft connect/callback identifierad | Microsoft är implementationsarbete, inte en inställning som kan slås på |

### Hinder att lösa före aktivering

1. **Tokens och åtkomst.** `calendar_connection` har RLS, men authenticated har SELECT/INSERT/UPDATE/DELETE och en ALL-policy med `is_business_member(business_id)`. Tabellen innehåller access_token och refresh_token. Kontrollerade skriv-/läsställen använder tokenvärden direkt utan synlig applikationskryptering. Detta är ett konkret granskningshinder, inte bevis på att ett intrång skett. Verifiera Data API-exponering, medlemsfunktion, triggers och krypterings-/nyckelhantering; skydda tokenåtkomst via servern. Bevara kundens säkra statusläsning. Ändra inte prod-grants blint eftersom klientberoenden måste kartläggas först.
2. **Meddelandeidentitet.** Prod har unik nyckel på enbart `email_conversations.gmail_message_id`. Microsoft-ID:n får inte skrivas in som om de vore Gmail-ID:n. Välj en migreringssäker identitet per företag, leverantör, konto och meddelande, med separat original-ID för API-anrop. Kartlägg alla läsare, trådlänkar och befintliga rader före en minimal migration på befintlig tabell. Ingen ny tabell är beslutad.
3. **Återanslutning och kontobyte.** Återanvänd aldrig refresh-token från konto A med access-token från konto B. Vid byte ska gammal synk stoppas och cursor/provstatus återställas. Första anslutning utan fungerande förnyelse ska inte visas som redo för bakgrundsarbete.
4. **Vald avsändare och mandat.** Företagets äldsta Google-koppling är inte säkert den avsändare kunden valt. Sändvägen måste kontrollera aktuell koppling, behörighet och befintliga routing-/godkännanderegler även precis före utskick.

## Behörighetskontrakt

| Förmåga | Föreslagen behörighet | Avgränsning |
|---|---|---|
| Google kalender | Behåll nuvarande kalenderbehörigheter | Kalenderanslutning begär inte nya Gmail-scopes |
| Gmail läsa | `https://www.googleapis.com/auth/gmail.readonly` | Restricted; begärs när kunden väljer mejlassistenten |
| Gmail skicka | `https://www.googleapis.com/auth/gmail.send` | Sensitive; svarsförslag skapas i Handymate |
| Microsoft läsa/skicka | Delegerade `Mail.Read`, `Mail.Send` | V1: inloggad användares egen Microsoft 365-arbetsbrevlåda |
| Microsoft identitet/bakgrund | `openid`, `profile`, `offline_access`; `User.Read` endast om vald kod behöver `/me` | Verifiera identitet server-side med avsett bibliotek; e-postadress är inte en stabil kontoidentifierare |

Inga Gmail modify/compose/full-mail-scopes eller Microsoft organisationsomfattande application permissions behövs för den föreslagna första versionen. Delade Microsoft-brevlådor och privata Outlook-konton ingår inte i v1:s acceptanslöfte. Delegerade shared-scopes stödjer inte prenumerationer för ändringsnotiser på delade mappar; välj separat upplägg när det behovet tas in. [Gmail-scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [Graph-behörigheter](https://learn.microsoft.com/en-us/graph/permissions-reference), [delade mappar](https://learn.microsoft.com/en-us/graph/outlook-share-messages-folders).

## Implementationskontrakt och avgränsade arbetspaket

### A. Skydda anslutningen och bevara kalendern

- Inventera tokenläsare och direkta klientanrop innan DB-skydd ändras. Välj och dokumentera serveråtkomst, kryptering, nyckelrotation och hantering av gamla tokenvärden. Inga hemligheter i status-JSON eller loggar.
- Google: separata avsikter för kalender respektive mejl. Använd incremental authorization och `include_granted_scopes` enligt [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server). Lägg inte bara fler scopes i dagens globala lista.
- För tillbaka faktiskt beviljade scopes från leverantörens tokenresultat eller verifierad tokeninformation. Sätt inte flaggor utifrån vad som begärdes eller godtyckliga query-parametrar. Saknad scopeinformation är okänd status tills den verifierats.
- Partial consent: läsning och sändning bedöms var för sig. Nekad sändning får inte bli en automatisk sändning via annan leverantör. Befintlig kalender behålls endast om dess åtkomst faktiskt finns kvar.
- Bind start och callback till aktuell användare, företag, provider och avsikt. Kontrollera aktivt medlemskap i callback. Förhindra återspelning med sessionsbunden engångsnonce; tillåt endast fasta interna återgångsmål. Använd PKCE där valt OAuth-bibliotek stöder flödet.
- Dela på ”pausa mejlbevakning” och ”koppla bort Google”. Paus är lokal. Återkallning av ett gemensamt Google-beviljande kan även stoppa kalendern och måste beskrivas så i UI.

### B. Microsoft-adapter till befintlig kundresa

- Förbered appregistrering för flera organisationer, authorization-code-flöde, säkert tokenlager och kontoidentitet från verifierad tenant/användare. Starta med en uttryckligen vald egen arbetsbrevlåda.
- Föreslagna nya routes: `/api/microsoft/connect`, `/callback`, `/status`, `/disconnect`. Dessa finns inte ännu; registrera ingen callback som fungerande innan route och miljö finns.
- Normalisera inkommande mejl till ett gemensamt internt kontrakt med provider, konto, originalmeddelande-ID, tråd, avsändare, mottagare, tid och text. Flytta bara nödvändiga Gmail-antaganden ur befintlig processor; skapa ingen ny lead-/agentmotor.
- Välj pollning/delta som första avgränsade synkväg om kapaciteten räcker. Implementera paginering, rate-limit/backoff, cursor efter beständig lagring samt omstart utan dubbletter. Bilagor kräver eget storleks-/åtkomst-/lagringsprov före aktivering.
- Sänd genom befintlig godkännandekedja med vald avsändare och korrelation till ursprungsmejlet. Ett accepterat API-anrop är inte en leveransbekräftelse. Oklart utfall får inte automatiskt skickas igen.

### C. Koppla befintlig onboarding

Återanvänd kontaktsteget och `/api/onboarding/channel-health`. Valet ”E-post” prioriterar anslutningshjälp och ger inget agentmandat. Behåll ”Gör senare”. Följande är föreslagen presentation, inte nya databas-enums:

| Bevisläge | Kundtext | Handling |
|---|---|---|
| Provider ännu inte lanserad | ”Direktkoppling förbereds” | ”Ställ in vidarebefordran” endast om den vägen finns och kan testas |
| Tillgänglig, ej ansluten | ”Koppla företagets e-post” | Anslut vald provider |
| OAuth klart, inget prov | ”Ansluten. Testa att en förfrågan kommer fram.” | Visa ansluten adress och testinstruktion |
| Mejl mottaget, ingen färdig affärskedja | ”Testmejlet har kommit fram” | Visa faktiskt nästa steg; kalla inte hela resan verifierad |
| Mottagning och kund-/affärskedja bevisade | ”Kundintaget fungerar” | Visa när och vilken aktuell anslutning som provats |
| Läsning fungerar, sändning saknas | ”Tar emot mejl. Sändning behöver kopplas.” | Komplettera behörighet |
| Token eller synk felar | ”E-postkopplingen behöver åtgärdas” | Återanslut eller konkret felhjälp |

Kalender, mottagning, kundmatchning och sändning ska ha egna bevis. Gammalt prov får inte följa med ett nytt konto. Grönt kräver både tillgänglig provider, aktuella behörigheter och relevant verifiering.

### D. Vidarebefordran som övergång

Återanvänd `email_inbound_route`, `lib/email/provision-inbound-route.ts`, `/api/email/inbound` och befintlig kanalhälsa. Verifiera avsedd mottagaradress, signerad providerhändelse, företagsrouting och loop-/dublettskydd. Testa att ursprunglig avsändare bevaras till kundmatchningen. Vidarebefordran innebär inte tillgång till äldre mejl, skickat-mappen eller kalendern och ger inte automatiskt rätt att skicka som kundens adress.

Visa separat vilket verifierat konto eller vilken avsändardomän svar går från. Om sändning inte fungerar: kunden får ett svarsförslag och tydlig manuell nästa handling. Vid senare direktkoppling ska överlapp mellan vidarebefordran och mailboxsynk hanteras innan båda är aktiva. Ingen vidarebefordran markeras provad i detta dokument.

## Klar-för-aktivering

Samtliga relevanta acceptansfall är godkända på samma release; token-/meddelandehindren ovan är lösta; leverantörens nödvändiga godkännande finns; supporttext och faktiskt beteende stämmer. Säker rollback pausar ny import och sändning utan att radera kundens befintliga uppgifter. Kvarvarande köade försök måste också omfattas av pausgrinden. Aktivering får ske per provider så att Google inte blockerar Microsoft eller övrigt kundintag.
