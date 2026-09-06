# Liveprov ÄTA och dagsavslut, 2026-09-06

Konto: TEST Codex – onboarding El. Projekt P-1001 / proj_1788728258574_1d9olo.
Hantverkarvy: den befintliga integrationspreviewn (codex-3bda24). Kundportal: produktion via appens genererade länk. Inloggat produktionsprov återstår; previewn innehåller inte senaste main.

## ÄTA

- Skapade ÄTA-1 som utkast: b57961e5-aa00-42d1-8260-eef90e3d1e60. En TEST kabelkanal à 200 kr, ingen ROT/RUT. Beskrivningen säger inget verkligt uppdrag.
- PDF-förhandsvisning öppnas och visar 200 kr netto, 50 kr moms, 250 kr totalt samt vattenstämpeln UTKAST – ej skickad.
- Intern testmarkör visas i preview-PDF:en. Detta är det redan kända F10, rättat på main, inte en ny regression bekräftad i produktion.
- Skicka till kund öppnar SMS-dialog med en alternativ knapp Kopiera signeringslänken i stället.
- Kopieringen fungerar, men ÄTA:n förblir Utkast. Portalen visar projektet, därefter enbart projekthuvud och fasrad, ingen ÄTA att godkänna. Att kopiera länken är alltså inte en fungerande ersättning för utskick i det här provet. Behöver kontrolleras i aktuell version innan nytt fynd fastställs.
- Inget SMS skickat, inget ÄTA godkänt eller fakturerat.

## Dagsavslut med riktig AI

- Bad om 30 minuter debiterbar efterkontroll à 850 kr/tim och separat intern anteckning; uttryckligen ingen mer ÄTA, inget material eller kundmeddelande.
- AI:n uppmärksammade att 60 minuter redan fanns. Första svaret bad om textbekräftelse utan sparknapp; efter textbekräftelse kom den faktiska kontrollrutan Lägg till tiden. Ingen tid sparades före knappgodkännande.
- Efter godkännande finns exakt ytterligare 0,50 tim, 850 kr/tim, 425 kr. Totalt 1,50 tim och 1 075 kr, inklusive den äldre timmen à 650 kr.
- Detta är ett positivt liveprov efter F17:s databasrättning. Historisk 650-kronorspost ändrades inte.
- Den interna anteckningen föreslogs inte automatiskt som nästa del. Efter en separat uppmaning kom Spara anteckningen.
- Anteckningen sparas i byggdagboken under Dokumentation med exakt innehåll TEST INTERN DAGSAVSLUT – inväntar ny kabelkanal. Den visas med källan Röst trots att inmatningen var skriven text.
- Ingen ytterligare tid skapades vid anteckningssparandet. Projektet är fortfarande Pågår. Inga kundmeddelanden godkända.

## Versions- och nästa-provsnoteringar

- Main vid kodstart: fdb9f7e8, innehåller F17/F20/F21-rättningarna. De äldre fynden är inte nya felrapporter mot main.
- Första-startguiden på dashboarden blockerade bakomliggande klick. När den stängdes med Hoppa över gick projektlänken att använda. Tidigare oklara menyklick är därför inte bekräftad separat navigationsbugg.
- PR #17 uppdaterad mot fdb9f7e8 med mergecommit 56743617. 12 riktade kontroller gröna lokalt efter synken.
- Kodrättningar i den här grenen gäller F03/F06/F07/F16/F18/F19. De har ännu inte provats inloggat i produktion.
- Kvar: ÄTA-utskick/accept, påverkan på faktura, material och slutfakturering. Varken full resa eller produktionsdrift är godkänd av denna rapport.

## PR18 omprov och main-synk (7 september svensk tid)

Main 0c6fd25 är intagen i 8e14282. F22:s projektkvitto följer med. Listorna har livegenomgang-f22 före live-project-navigation-refresh. 16 riktade kontroller gröna efter synk.

Inloggat previewprov, Nordström El AB, projekt P-1015 (eget TEST Codex-projekt):
- F03: Underentreprenörer saknas nu i den öppna Jobb-menyn. Grossistprislista saknas i inställningarnas fristående länkar; widgetkortet saknas under röstinställningen.
- F06: Uppgifter öppnar uppgiftslistan och visar befintlig klar testuppgift.
- F07: Kundkontakt → Telefonassistentens röst öppnar hälsningsfras och Lisa-röst. Ingen inställning sparad.
- F18: en timme 11–12 den 6 september med beskrivningen TEST F18 – omprov, inget verkligt arbete sparad. Utan omladdning syns 1,00 tim à 500 kr, totalt 1,25 tim inklusive tidigare intern kvart. Nedlagt uppdateras 125 → 625 kr, fakturerbart underlag 500 kr. Nordströms timpris är här 500, inte onboardingtestföretagets 850. Detta är previewbevis; produktionsomprov krävs efter merge.
- F19: både Fakturera och Förbered faktura öppnar befintligt Fakturaunderlag. Den nya timmen finns som arbete 500 kr, moms 125 kr, totalt 625 kr, inget avdrag. Den interna kvarten inkluderas inte. Avbrutet utan fakturaskapande.
- F16: formuläret visas i editorn, inte i de inledande offertstegen. Tomt namn blockerar knappen. Eget befintligt telefonnummer avvisas av dubblettskyddet, offertens titel kvar. Positivt skapande ännu inte verifierat.

Två upptäckter under klickprovet rättade i uppföljande commit:
1. F16 tillät tom telefon, men databasen kräver phone_number. Live gav rått NOT NULL-fel. Formuläret kräver nu namn och telefon och använder native formvalidering för e-post; serverfel 500 visas utan databasdetaljer. Exekverande regression provar att blank telefon inte skickas och att serverfelet inte läcker.
2. Mattes flytande knappar överlappar Fakturera längst ned i projektöversikten (1357×932). Klickets centrum öppnade röstpanelen. Klick på knappens fria vänsterdel öppnade rätt modal. Extra bottenutrymme införs så raden kan scrollas fri; visuell omkontroll på den nya deployen återstår.

Inget fynd stängs genom kontraktstester enbart. F22:s kundaccept, PR17 mobil och PR18:s nya validering/placering återstår att liveprova. Ingen merge till main utförd.
