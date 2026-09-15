# Förmågematris — ersätta Fortnox inför 2027

> Första arbetsleveransen i [FORTNOX_REPLACEMENT_2027.md](FORTNOX_REPLACEMENT_2027.md), ifylld av Claude
> 2026-09-15 från faktisk kod, [paketloggen](../strategy/FINANCIAL_KERNEL_PACKAGE_LOG.md) och
> [den svenska domängranskningen](../strategy/FINANCIAL_KERNEL_SE_LEDGER_REVIEW.md).
> Uppdateras vid varje milstolpe. Raderna är lästa ur koden, inte uppskattade.

## Hur statusorden används

Planen kräver att varje rad skiljer fyra lägen, och de är inte grader av samma sak:

| Ord | Betyder |
|---|---|
| **Byggd** | Koden finns och är mergad. |
| **Testad** | Automatiska kontrakt bevisar beteendet. Grön CI är inte kundbevis. |
| **Pilotverifierad** | Ett riktigt företag har kört flödet i drift och utfallet är granskat. |
| **Aktiverad** | Flaggan är på för den kundgruppen i produktion. |

Inget i matrisen är pilotverifierat i dag. Kärnan är två dygn gammal och står i `off` för samtliga 29 företag,
vilket är förväntat och inte ett fel: den har medvetet inte släppts på ett företag ännu.

## A. Det som redan bär kundens pengaflöde

Handymate fakturerar i dag och synkar till Fortnox, som gör själva bokföringen. Kolumnen visar vad vi äger.

| Förmåga | Kundbehov och avgränsning | Aktuell implementation | Saknat arbete | Ansvarig | Godkännandeprov | Målperiod |
|---|---|---|---|---|---|---|
| Kundfakturor | Skapa, skicka, kreditera, PDF, från offert/projekt/tidrapport | **Byggd + testad.** `lib/invoices/*`, `app/api/invoices/{send,credit,pdf,from-quote,from-project,from-time-entries}` | Inget för att fakturera. Konteringen av fakturan saknas (rad B1) | — | Befintliga fakturakontrakt | Klart |
| Leverantörsfakturor | Registrera, matcha, attestera | **Byggd.** `sql/v11_supplier_invoices.sql`, `app/api/supplier-invoices`, Fortnox-import och matchning | Kontering och momsavdrag (B1, B2). Attestflöde mot bokföring | Codex | Nytt kontrakt vid B1 | Oktober |
| Betalningar och allokering | Betalning kopplas till rätt fordran, delbetalning, ROT-del, återföring | **Byggd + testad.** Kärnan C4/C5/C5b: `financial_receivables`, `financial_payments`, `financial_payment_allocations`, `execute_payment_command` | Pilotverifiering. Bankinläsning saknas (C11) | Codex | Kernel-sviterna; sedan S1-skugga på pilot | Oktober |
| ROT/RUT | Underlag, tak, fördelning per etapp, ansökan | **Byggd + testad.** `lib/rot-rut.ts`, `lib/rot-rut-limits.ts`, `lib/rot/*`, Fortnox `housework.ts` | Kontering av skattereduktionen (SE-granskning §2.3). Direktansökan mot Skatteverket är extern | Codex + ägare | ROT-kontrakten + konsultgranskad kontering | Oktober |
| Spårbarhet | Varje siffra ska kunna härledas till sin källa | **Byggd + testad.** `financial_events` som append-only händelselogg med idempotens, lease och skuggjämförelse | Koppling från verifikat till händelse när B1 finns | Codex | Kernel-kontrakten | Oktober |
| Skattedeadlines | Påminnelse om moms- och arbetsgivardeklaration | **Byggd.** `lib/karin/obligations.ts`, `calendar.ts` | Det är en kalenderpåminnelse, inte en deklaration. Se C3 nedan | — | — | Klart |

## B. Bokföringslagret — det som faktiskt ersätter Fortnox

Detta är kärnan i frågan. Händelsekatalogen reserverar redan `journal_entry_posted`, `journal_entry_reversed`,
`period_locked` och `period_unlocked` under rubriken *Ledger (bokföring)*. Ingenting producerar dem ännu.

| # | Förmåga | Kundbehov och avgränsning | Aktuell implementation | Saknat arbete | Ansvarig | Godkännandeprov | Målperiod |
|---|---|---|---|---|---|---|---|
| B1 | Kontoplan och konteringsmotor | Varje affärshändelse blir ett verifikat med debet och kredit | **Inget byggt.** Paket **C8** i loggen | C8: verifikatschema, konteringsmotor, verifikatserier | Codex | Nytt SQL-kontrakt + PGlite-facit, mönster som C2/C3 | **Oktober — kan börja nu, se §Beroenden** |
| B2 | Svenska konteringsregler | Försäljning, omvänd byggmoms, ROT, dröjsmålsränta, PSP-avgift, kundförlust | **Domänen utredd, inget byggt.** [SE-granskningen](../strategy/FINANCIAL_KERNEL_SE_LEDGER_REVIEW.md) §1–2 har reglerna och kontoförslaget; paket **C9** | C9: reglerna som kod, efter konsultgranskning | Codex + konsult | Konsultgranskat facit per regel | Oktober |
| B3 | Bokföringsmetod | Fakturerings- kontra kontantmetod | **Delvis byggd.** `accounting_method: 'accrual' \| 'cash'` bärs redan på `invoice_issued` i kärnans händelsetyper; SE-granskningen §3 har reglerna | Metoden måste styra konteringen i C9 | Codex | Facit för båda metoderna på samma faktura | Oktober |
| B4 | Avrundning | Öresavrundning med eget konto | **Interimslösning.** `lib/financial-kernel/policies/se-rounding.ts` säger uttryckligen att C1b ersätter den och att inget konto är valt | C1b | Codex + konsult | Konsultbeslut om konto | Oktober |
| B5 | Krediter och rättelser | Kreditfaktura, återföring, rättelse i stängd period | **Delvis byggd.** Kreditfaktura finns i fakturalagret; kärnan har återföring av allokering. SE-granskningen §4 har reglerna | Konteringssidan (C9) och periodlås (B6) | Codex | Facit per rättelsetyp | Oktober |
| B6 | Räkenskapsår och perioder | Periodlås, verifikatserier, spärr mot bokning i stängd period | **Inget byggt.** Händelsenamnen reserverade; SE-granskningen §5 | Del av C8 | Codex | Bokning i låst period nekas | Oktober |
| B7 | Ingående balanser och brytdatum | Ta över mitt i ett år eller vid årsskifte | **Inget byggt.** Paket **C4b** | C4b | Codex | Balansprov mot konsultgranskat underlag | November |
| B8 | Momsrapport | Momsdeklarationens underlag | **Inget byggt.** Paket **C13** | C13 | Codex | Facit mot konsultgranskad period | November |
| B9 | Bankavstämning | Läs in kontohändelser, matcha mot fordringar | **Inget byggt.** Paket **C11** | C11 + bankåtkomst | Codex + ägare | Matchningsfacit på pilotens riktiga konto | November |
| B10 | Kundreskontra över tid | Åldersfördelning, påminnelser, kundförlust | **Delvis byggd.** Fordringar och påminnelser finns; paket **C14** för livscykeln | C14 | Codex | Reskontrafacit | November |

## C. Rapporter, konsult och export — och därmed gränssnittet

Här ligger den lucka du pekade på: planen provar konsultresan i november men schemalägger aldrig att bygga den.

| # | Förmåga | Kundbehov och avgränsning | Aktuell implementation | Saknat arbete | Ansvarig | Godkännandeprov | Målperiod |
|---|---|---|---|---|---|---|---|
| C1 | SIE-export | Konsult och myndighet ska kunna läsa året | **Inget byggt.** Paket **C10**; SE-granskningen §8 | C10 | Codex | SIE4 som läses in i ett annat system utan fel | November |
| C2 | Rapportytor | Huvudbok, balans, resultat, verifikatlista, momsunderlag | **Inget byggt.** Ingen route under `app/dashboard` rör bokföring | Design + implementation ovanpå C8/C10 | **Claude design, Codex bygge** | Konsult utför en månadsavstämning i ytan | **Design september, bygge november** |
| C3 | Deklarationsinlämning | Skicka momsdeklaration | Karin påminner om datum. Inlämning sker utanför Handymate | **Inriktning satt 2026-09-15: förbereda och skicka, kunden signerar.** Signeringen görs alltid av den skattskyldige hos Skatteverket och kan inte göras via API av någon leverantör, inte heller Fortnox. Kvarstår: ansökan om partneråtkomst och organisationscertifikat, sedan C13 mot testmiljön | **Ägare (ansökan) + Codex (C13)** | Underlag som Skatteverket accepterar i testmiljön | Ansökan i september, kod i november |
| C4 | Konsultåtkomst och byrå | **Beslut 2026-09-15: ja.** Har företaget en redovisningsbyrå ska byrån kunna logga in för sina klientföretag med egen behörighet | **Inget byggt.** Rollerna är `owner`, `admin`, `employee`; ingen konsultroll och ingen byråentitet finns | Ny roll, byråkoppling över flera företag, inbjudan, spår över vad konsulten gjort, och ägarens vy över vem som har åtkomst | Codex | Konsult arbetar en hel period med egen inloggning i två klientföretag | Oktober |
| C5 | Huvudstruktur och utseende | Hur bokföringsdelen hänger ihop med resten av Handymate | **Designprompt skriven** 2026-09-15: [BOKFORING_UI_DESIGNPROMPT.md](../design/BOKFORING_UI_DESIGNPROMPT.md), åtta artboards med varumärkestokens ur koden | Köra prompten i Claude Design, sedan genomgång | **Claude + ägare** | Genomgång med Andreas, därefter med konsulten | **September — pågår** |

## D. Övergången från Fortnox

| Förmåga | Aktuell implementation | Saknat arbete | Ansvarig | Målperiod |
|---|---|---|---|---|
| Skuggverifiering mot Fortnox | **Byggd + testad** för betalningar (C6, S1-läge, nivå 1-jämförelse, kill switch) | **C12** utökar skuggan till bokföringen när C8 finns | Codex | November |
| Historisk återspelning | Inget kört | Isolerad testmiljö, Christoffers år som referens | Codex + konsult | Oktober |
| Företagsvis övergångsplan | Inget | Balanser, öppna poster, historikåtkomst, ansvar | Ägare + konsult | December |

## E. Uttryckligt utanför första kundgruppen

Planen kräver att dessa klassificeras, inte lämnas öppna: **lön** är utanför, **deklarationsinlämning** är
beslut D3, **betalväxel** är paket C7 och inte nödvändigt för att lämna Fortnox, **årsredovisning** är
utanför och sker hos konsulten. Ingen av dessa markeras färdig av matrisen.

## Beroenden — det viktigaste i hela dokumentet

**C8, konteringsmotorn, är ofri just nu.** Paketloggen anger dess blockerare till C2 och C3, och båda är
mergade sedan 2026-09-13 respektive 09-14. Ingenting hindrar att den börjar i dag, och nästan allt i avsnitt
B och C hänger på den: C9, C10, C12 och C13 väntar alla på C8. Det är den enskilt viktigaste raden i matrisen.

**Fyra grindar är dina, inte Codex.** De blockerar mer än de ser ut att göra:

| Grind | Blockerar | Läge |
|---|---|---|
| Namngiven redovisningskonsult | C1b, C9, B2, B4, hela facitstrategin | Öppen sedan starten |
| P0 merchant of record (D1) | C9 | Öppen |
| D3 producera eller lämna in deklaration | C13, C3 | **Inriktning satt**: förbereda och skicka. Kvar: ansökan, som tar månader |
| D4 brytdatum och övertagandeår | C4b, B7 | Öppen |

Konsulten är den hårdaste. Utan namngiven konsult finns inget granskat facit, och utan facit kan
konteringsreglerna byggas men aldrig godkännas. Det gör konsultvalet till september månads viktigaste beslut,
inte ett administrativt ärende.

**Designen är inte blockerad av något, och är påbörjad.** Avsnitt C rad 5 och rad 2 kan börja innan en enda verifikatrad finns.
Vad en konsult behöver se för att våga signera är besvarbart ur domänen i dag, och svaret avgör vilka flöden
som måste byggas. Det är därför designen hör hemma i september och inte efter konteringsmotorn.

## Vad matrisen säger om den 30 november

Faktureringen, betalningarna, ROT och spårbarheten är byggda och testade. Bokföringslagret är noll rader kod
med utredd domän. Mellan dessa två ligger tio paket, varav fyra väntar på beslut som bara du kan fatta.

Bedömningen är alltså inte att januari är omöjligt, utan att den avgörs av två saker i september: att en
konsult är på plats, och att C8 startar. Släpar någon av dem är det omfattningen som ska krympa, inte datumet
som ska flyttas — planen säger själv att ett företag vars nödvändiga flöden saknar stöd inte kvalificerar.

## Ändringslogg

- **2026-09-15 (kväll):** Två beslut inskrivna. Byråer ska kunna logga in för sina klientföretag (rad C4). Inriktningen för D3 är förbereda och skicka där kunden signerar, vilket är det starkaste någon leverantör kan erbjuda. Designprompten för de åtta ytorna skriven (rad C5).
- **2026-09-15:** Matrisen ifylld från kod av Claude. Femton förmågor lästa ur implementationen, tio paket
  identifierade som saknade, fyra ägargrindar listade. C8 konstaterad ofri. Design av huvudstruktur och
  rapportytor lagd i september eftersom inget blockerar den.
