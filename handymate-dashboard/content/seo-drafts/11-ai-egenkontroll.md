---
typ: produktartikel (kategoriförsvar, kvalitetskontroll)
målsökord: AI egenkontroll bygg, digital egenkontroll hantverkare, egenkontroll app, AI-först kvalitetskontroll
status: UTKAST — ej godkänd, EJ publicerad förrän skarpt testad (se DoD i tasks/easoft-gap-plan.md)
---

# Egenkontroll som sköter sig själv — nästan

## Ett formulär till är inte lösningen

Egenkontroll är ett av de mest etablerade kraven i svensk byggbransch — och
en av de mest ignorerade administrativa uppgifterna. Du vet att du ska
dokumentera att tätskiktet sitter rätt, att jordfelsbrytaren är testad, att
skarven är tätad. Du gör jobbet. Sedan är frågan om någon faktiskt bockar av
listan, eller om den ligger ifylld i huvudet och ingenstans annars.

De flesta system löser det med ett digitalt formulär istället för ett
papper. Det är ett steg framåt — men det är fortfarande du som ska komma
ihåg att öppna det, gå igenom varje punkt, och bocka i. Ett annat ställe att
knappa in samma sak du redan vet.

## Vad som är annorlunda

När du laddar upp ett foto från jobbet — vilket du redan gör, för egen del
eller för kunden — tittar en medarbetare på det mot projektets checklista.
Stöder fotot en punkt? Då hamnar ett förslag i din kö: *"Foto styrker 2
egenkontrollpunkter — markera som klara?"* Ett tryck, klart.

Ser något inte klart ut — en skarv som inte verkar tätad, en spärr som
saknas i bild — flaggas det istället som en avvikelse, med en kort
motivering. Du avgör alltid själv om bedömningen stämmer.

**Det här är inte en AI som godkänner ditt arbete.** Det är en medarbetare
som läser dina egna foton och sparar dig från att sitta med listan i
efterhand. Beslutet, och ansvaret för besiktningen, är fortfarande ditt.

## Och om du inte ens har en checklista än

De flesta hinner aldrig sätta upp en checklista på ett nytt projekt — det är
ännu ett steg i en redan full dag. Så när ett projekt skapas föreslår teamet
en checklista som passar din bransch, färdig att godkänna. Du behöver aldrig
leta upp en mall själv.

## Varför det spelar roll utöver att slippa admin

Egenkontroll är inte bara ett internt minneskrav. Det är underlag vid
besiktning, vid en ÄTA-diskussion, och vid en försäkringsfråga där någon
frågar vad som faktiskt gjordes. Ett foto med en tidsstämpel och en
kopplad checklistpunkt väger tyngre än ett minne.

## Vad vi INTE gör

- Vi säger aldrig att ett projekt är "godkänt enligt besiktningskrav" —
  det är en bedömning bara en behörig besiktningsman kan göra.
- Vi bockar aldrig av en punkt automatiskt. Allt är ett förslag i kön,
  precis som resten av teamets arbete.
- Vi gissar inte. Är ett foto för otydligt för att bedöma en punkt, säger
  teamet det — hellre än en chansning.

## En bransch full av admin ingen har byggt AI-först

Om du jämför olika system för hantverkare ser du samma mönster: digitala
formulär, digitala checklistor, digitala rapporter. Bra som ersättning för
papper. Men fortfarande du som gör jobbet med att fylla i dem. Det gäller
kvalitetskontroll lika mycket som fakturering eller tidrapportering — en
administrativ uppgift som blivit digital utan att bli någon annans jobb än
ditt.

---

## Källkontroll (läs vid godkännande)

| Påstående i texten | Stöd i koden/inventeringen | Bedömning |
|---|---|---|
| Foto mot checklista → förslag/avvikelse i kön | lib/egenkontroll/*, tasks/easoft-gap-plan.md etapp 1a-1b — **BYGGT★** | OK — funktionellt beskrivet, ingen drifthistorik (0 kunder ännu, se ⚠ nedan) |
| "Ett tryck, klart" | Godkännandekö **LIVE**, samma mönster som övriga approval_types | OK |
| Aldrig auto-bockat, aldrig "godkänt enligt besiktningskrav" | Juridikregeln inbyggd i systemprompten (lib/egenkontroll/photo-assessment.ts) | OK — spegling av kodens egen regel, inte extra försiktighet på ytan |
| Checklist-förslag vid nytt projekt | lib/egenkontroll/suggest-checklist.ts — **BYGGT★** | OK |
| "Hellre säga att bedömningen är osäker än chansa" | ej_bedombar-statusen i parsern, facit-testad | OK |
| "En bransch full av admin ingen byggt AI-först" | tasks/easoft-gap-plan.md — Easofts egen "tio tidsbovar"-artikel, tio digitala-men-inte-AI-lösningar | OK — **medvetet INGEN namngiven konkurrent i denna artikel**, se flagga nedan |

**⚠ FLAGGA 1 — ingen kund har använt funktionen ännu.** Texten beskriver vad
produkten GÖR (BYGGT★), inte vad en kund upplevt. Publicera inte förrän
Andreas testat skarpt på ett riktigt projekt — samma regel som allt annat
BYGGT★-material.

**⚠ FLAGGA 2 — konkurrentnamn medvetet utelämnat.** Planen (easoft-gap-plan.md)
säger att "alla tio"/jämförande slutkampanj väntar tills minst 8/10 är
BYGGT★ MED kunddrift. Den här artikeln nämner därför ingen konkurrent vid
namn — den står på egna ben som en produktartikel. Easoft-jämförelsen hör
hemma i en framtida, bredare artikel (eller en uppdatering av 09) när fler
etapper är klara, med samma juridiska ögonkoll som 09 fick.

**⚠ FLAGGA 3 — juridik, "besiktning"-ordet.** Artikeln nämner besiktning som
KONTEXT för varför egenkontroll är viktigt, men påstår aldrig att produkten
utför eller ersätter en besiktning. Rekommendation: samma juridiska
ögonkoll som artikel 09 fick, given ordet förekommer.

**Medvetet utelämnat:** kundsiffror, tidsbesparing i kr/timmar, alla
konkurrentnamn, påstående om vilka branscher/checklistor som redan finns
seedade.
