# Lisa — skarpt lanseringsbevis

## Vad som ska bevisas

Lanseringslöftet är en sammanhängande verklig kedja:

1. Ett externt telefonnummer ringer företagets tilldelade 46elks-nummer.
2. 46elks träffar den signerade webhooken i produktion.
3. Rätt tenant identifieras från numret som ringdes.
4. Handymate skapar eller återanvänder kund och skapar lead + affär.
5. Lisa skickar verklig återkoppling via SMS när samtalet inte besvaras.
6. Ett SMS-svar hamnar i samma tenants konversation och triggar agentflödet.
7. Utgående svar passerar STOPP, SMS-kvot och Bränsletak.

Detta bevisar **inte** att Lisa för en fri talad AI-dialog under själva
telefonsamtalet. Den funktionen ingår inte i lanseringslöftet.

## Förutsättningar

- 46elks-kontot har positivt saldo.
- Testföretaget har `assigned_phone_number`.
- Numret är kopplat till produktionswebhookarna.
- Testägaren kan öppna onboardingens ringtest eller motsvarande statusvy.
- Testtelefonen har ett nummer som inte redan är en verklig kund hos ett annat
  företag i databasen.

Om någon förutsättning saknas är resultatet **BLOCKERAT**, aldrig godkänt.

## Körprotokoll

| Station | Handling | Bevis | Godkänt när |
|---|---|---|---|
| 1 | Armera ringtestet | API/UI visar det faktiska tilldelade numret | Fönstret är aktivt i 10 minuter |
| 2 | Ring från extern telefon | 46elks/Vercel visar signerad webhook | `called_at` sätts efter samtalet |
| 3 | Kontrollera pipelinen | Kund, lead och deal bär samma business | Alla tre finns och leadets källa är telefonsamtal |
| 4 | Kontrollera testtelefonen | Verkligt SMS mottas | `sms_sent=true`, inget `sms_error` |
| 5 | Svara med en tydlig kundfråga | Inkommande rad i `sms_conversation` | Raden bär rätt business och telefonnummer |
| 6 | Vänta på Lisa | Verkligt utgående svar + agent_run | Svaret är relevant och skickat exakt en gång |
| 7 | Isoleringskontroll | Sök samma telefon hos den andra testtenanten | Inga rader, notiser eller svar har läckt dit |

## Underlag som sparas

- datum och klockslag,
- testföretagets business-id,
- 46elks call-id och SMS-id,
- lead-id, deal-id och customer-id,
- skärmbild från pipelinen,
- skärmbild av verklig SMS-tråd,
- PASS/BLOCKERAD/FAIL per station,
- feltext ordagrant vid FAIL.

## Nuvarande blockerare 2026-08-26

De två isoleringstestkontona saknar `assigned_phone_number`, och 46elks-saldot
är tomt. Därför kan det externa telefoni-/SMS-beviset inte ärligt markeras som
PASS ännu. Det browserlösa kontraktet finns i `tests/lisa-launch-proof.spec.ts`;
det skarpa protokollet körs direkt efter påfyllt saldo och nummerallokering.
