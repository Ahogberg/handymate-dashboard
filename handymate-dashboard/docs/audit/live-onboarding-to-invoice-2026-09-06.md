# Fortsatt liveprov: onboarding → offert → projekt → fakturaunderlag

Datum: 2026-09-06, cirka 20:50–21:04 UTC.
Konto: TEST Codex – onboarding El (comp).
Hantverkarvy: befintlig integrationspreview, handymate-dashboard-git-codex-3bda24-andreas-projects-f2b98374.vercel.app.
Kundportal och publik offert: app.handymate.se via de länkar som appen själv genererade.
Produktionens inloggade hantverkarvy krävde inloggning och provades inte. Fynd i previewn är inte automatiskt bekräftade på senaste main.

## Testdata och sidoeffekter

- En testkund skapad: TEST – Offertresa Codex, cust_k6fzhuqer. Andreas tidigare godkända kontaktuppgifter användes.
- Offert #001: quote_p2nselz75pj, TEST – Laddbox offertresa 6 september.
- Beskrivningen säger uttryckligen TESTRUNDA, ingen verklig beställning, en arbetstimme och inget ROT eller RUT.
- Ett e-postutskick genomfört till Andreas angivna testadress. Appen registrerar skickat; faktisk leverans i inkorgen är inte verifierad.
- Offerten accepterad med ritad testsignatur i kundportalen.
- Projekt P-1001: proj_1788728258574_1d9olo.
- En debiterbar testtimme registrerad 2026-09-06, start 08:00, snabbval 1h.
- En uppgift skapad och tilldelad TEST Codex: TEST – kontrollera laddbox före överlämning.
- Inga SMS-förslag godkända. Ingen faktura skapad eller skickad. Tidrapporten är fortsatt ofakturerad.
- Fakturaskaparen lämnad med importerad tidrad, osparad. Projektet ligger kvar som Pågår.
- Inga finansiella integrationer eller leverantörsbetalningar använda.

## Verifierat

| Flöde | Utfall |
|---|---|
| Comp → avsluta onboarding | Passerar Stripe. Vald jobbtyp Installera laddbox och Elinstallation 850 kr/tim följer med till första offerten. |
| Kundregister → kundval | Kund skapad och valbar efter omladdning av offertskaparen. |
| Återställningskopia | Omladdning ger val att återställa. Rad, pris och avstängt ROT återställs. Första-offertguiden visas inte efter återställning. |
| Spara offert | #001 sparas med kund, beskrivning, en arbetstimme à 850 kr och utan ROT. |
| Utkast i kundportal | Portalen visar 0 offerter före utskick. |
| E-postutskick → portal | Efter utskick visas offerten i portalen. Publikt dokument har rätt kund, rad och avstängt ROT. |
| Portalaccept → hantverkarvy | Två steg, signatur krävs. Tack-kvitto visas. Hantverkarvyn visar Accepterad, signatur och händelser. |
| Accepterad offert → projekt | Skapa projekt ger P-1001, Pågår, rätt kund och offererat 850 kr. |
| Projektuppgift → Mina uppgifter | Sparas direkt, visas i globala listan med ansvarig och projektlänk. |
| Tid → fakturaskapare | En timme sparas och kan importeras via Fakturor → Ny faktura → Från tidrapport. Kund följer med. Fel pris följer också med, se F17. |

## Nya fynd, fortsättning efter F15

### F16 – första offertens kundval saknar väg att skapa första kunden (medel)

1. Slutför onboarding utan kundimport.
2. Välj Använd för min första offert.
3. Guiden säger Välj kund. Knappen fokuserar en tom select med enbart Välj kund…
4. Ingen skapa-kund-knapp eller direkt väg till ny kund finns i denna del av offertskaparen.

Kunden måste förstå att öppna kundregistret separat och därefter uppdatera offertvyn. Testet lyckades via separat flik och återställningskopian, men standardresan stannar utan vägledning.

### F17 – onboardingens 850 kr/tim blir 650 kr/tim i tidrapport och fakturaunderlag (hög)

1. Onboardingens standardpris är 850 kr/tim.
2. Artikel Elinstallation och accepterad offert visar 1 tim × 850 kr.
3. Skapa projekt från offerten.
4. Tid & team → Lägg till tid. Registrera 08:00 och snabbval 1h, fakturerbar, utan manuell prisändring.
5. Efter omladdning visar tidrapporten 650 kr/tim och 650 kr totalt.
6. Projektet visar Offererat 850 kr, men Fakturerbart underlag 650 kr.
7. Fakturor → Ny faktura → Från tidrapport visar 650 kr. Import ger en rad à 650 kr och totalsumma 812,5 kr inkl. moms.

Konsekvens: 200 kr exkl. moms lägre underlag per testtimme än det uttryckligen valda priset. Orsak och prisprioritet är ännu inte bekräftade i databasen. Kontrollera företagets prisinställningar, användarpris, projektpris och standardvärden innan rättning. Senaste main behöver omprovas; detta är ett livefynd i previewn.

### F18 – lyckad tidregistrering lämnar projektet tomt tills omladdning (medel)

Efter Spara visas Tid registrerad!, men Tid & team visar 0.00 tim och Inga tidrapporter annu. Översikten visar inget fakturerbart underlag. Omladdning hämtar den sparade timmen. Ingen dubbelregistrering gjordes.

### F19 – projektets fakturaknappar leder inte till fakturaunderlag i provet (medel/hög)

- Översikt → Fakturera öppnar Mattes röstflik; webbläsaren stöder inte röstinspelning. Ingen faktura förbereds av klicket.
- Översikt → Förbered delfaktura byter till Ekonomi & offert som endast visar Material och Leverantörsfakturor, inga fakturarader eller skapa-faktura-val.
- Alternativvägen Fakturor → Ny faktura → Från tidrapport fungerar och exponerar F17.
- Detta gäller befintliga knappar i previewn, inte den parkerade betalplans-PR #12.

### F20 – inkonsekvent avrundning mellan summa och dokument (låg/medel)

- Kundportalens offertlista: 1 062,5 kr.
- Offertdokument och signeringsknapp: 1 063 kr.
- Fakturaskaparens summering: 812,5 kr, moms 162,5 kr.
- Samma fakturas dokument: 813 kr, moms 163 kr.

Beräkningen är inte här visad fel på öresnivå; visningen är inkonsekvent. Kontrollera vilket belopp som är betalningsgrundande och visa en konsekvent precision eller uttrycklig öresavrundning.

### F21 – kontrollera förfallodatum mot 30 dagar netto (medel, behöver verifieras)

Ny faktura visar fakturadatum 2026-09-06 och förfallodatum 2026-10-05 samtidigt som dokumentet säger 30 dagar netto. Datumskillnaden är 29 dagar. Inget datum ändrades manuellt. Kontrollera tidszon och datuminitiering; ingen faktura sparad.

## Omprov av äldre fynd

- F03 kvar i previewn: synlig Underentreprenörer-länk leder till /dashboard utan förklaring. Ingen åtkomstspärr kringgicks.
- F06 kvar i previewn: projektfliken Uppgifter visar Bokningar (kund), Schemalagt team, Delmoment och Arbetsorder. Själva uppgiftsskapandet och globala listan fungerar.
- F07 kvar i previewn: Så ska teamet jobba → Så ska Handymate arbeta / Hur mycket teamet gör på egen hand öppnar AI-assistent, hälsningsfras och AI-röst.
- F04 inte omprovat färdigt. Schemaknappen gav inte synliga undermenyer vid denna fortsättning. Det räcker inte för en bekräftad ny rotorsak.
- 46elks-numret inte omprovat; väntar på påfyllning.

## Kvar

- Omprov av nya fynd i inloggad produktion och kontroll av relevanta databasvärden.
- Rätt timpris hela vägen före fakturaskapande; sedan fakturasparande och koppling tillbaka till tid/projekt.
- Material, ÄTA, dagsavslut, slutfaktura, kreditering och Fortnox är inte verifierade av denna testomgång.
- Faktisk mejlleverans och PDF-filens renderade innehåll inte verifierade.
- Mobilutförande av denna kompletta resa återstår.
- PR #17: samtliga 11 rapporterade check-runs på 21bca064 är gröna vid kontrollen; detta är separat från livefynden ovan.

Ingen produktionskod ändrad i denna testomgång.
