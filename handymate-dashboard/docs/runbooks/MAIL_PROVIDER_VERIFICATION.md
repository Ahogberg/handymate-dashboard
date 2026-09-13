# Underlag för Google- och Microsoft-verifiering

2026-09-11. Arbetsutkast; inte inskickat och inte ett intyg om att kraven är uppfyllda. Tekniska luckor finns i [förberedelseplanen](MAIL_INTEGRATIONS_PREPARATION.md).

## Google: scope-motivering att färdigställa inför ansökan

Följande engelska utkast beskriver målfunktionen. Använd det i ansökan först när videon kan visa samma faktiska beteende:

> Handymate helps trade businesses manage customer enquiries and prepare responses. A business user explicitly connects their mailbox. The application identifies relevant enquiries, associates messages with that business's customer records and prepares a response for review under the business's approval settings.
>
> We request gmail.readonly to read message content needed to understand and process customer enquiries. Metadata alone does not contain the enquiry details. We request gmail.send to send responses from the connected mailbox when authorized through Handymate's approval workflow. Drafts are prepared inside Handymate. We do not require permission to delete messages, modify mailbox labels or create Gmail drafts for this workflow.

Komplettera befintlig ansökan med samtliga faktiskt begärda kalender- och identitetsscopes; utelämna dem inte för att detta underlag gäller mejl. [Scopeklassificering](https://developers.google.com/workspace/gmail/api/auth/scopes).

## Google: checklista med kvarvarande fält

| Underlag | Förberett | Kvar före inskick |
|---|---|---|
| App och domän | Handymate; koden använder app.handymate.se som fallback | Bekräfta verklig produktionsdomän, ägarskap, appnamn, support-/utvecklarkontakt |
| Projekt och klienter | Befintlig Google OAuth-klient används i kod | Läs projekt-ID, klient-ID, miljöseparering och nuvarande granskningsstatus i Console; hemligheter ska inte in i dokumentet |
| Data access | Föreslagna scope-motiveringar ovan | Deklarera exakt scopeset för den byggda versionen |
| Webb och policy | Innehållskrav nedan | Bekräfta offentliga URL:er och att texten överensstämmer med implementationen |
| Demonstration | Manus nedan | Spela in verkligt testflöde och fyll i videolänk |
| Säkerhetsgranskning | Risklista och dataflöde nedan | Fastställ Googles tilldelade granskningsväg, bedömare, offert och förnyelseansvar |

Google beskriver separat varumärkes-/scopeverifiering och säkerhetsgranskning för serverhanterad restricted-data enligt CASA. Planera återkommande granskning minst var tolfte månad och möjlig handläggning i flera veckor. Inget pris eller slutdatum är fastställt för Handymate. Publik hemsida, verifierad domän, korrekt integritetspolicy, scope-motivering och demonstrationsvideo ingår i förberedelsen. Testläge är en utvecklingsväg med begränsningar, inte lanseringsbevis. [Googles verifieringskrav](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

## Datakarta och policyunderlag

| Steg | Kodstöd/avsedd behandling | Evidens som återstår |
|---|---|---|
| Anslutning | Google OAuth → server → calendar_connection | Tokenkryptering, nyckelägare, säker statusläsning, sessionsbindning |
| Mottagning | Gmail poller → processor → email_conversations | Importurval, första synkgräns, retention, rätt företags-/kontoidentitet |
| Tolkning | Befintlig Gmail lead-detection använder Anthropic | Exakt skickad payload, modell, region, avtalsvillkor, lagring och träningsinställningar |
| Kundresa | Kund-/leadmatchning och befintliga ärenden | Vilka uppgifter sparas var; åtkomst per roll; möjlighet att rätta felmatchning |
| Bilagor | Gmail-bilagors kod använder Storage och customer_document | Om funktionen ingår i v1, tillåtna typer/storlekar, privata länkar och radering |
| Svar | Befintlig sändväg och godkännanden | Verifierad avsändare, reply-tråd, mandat, kvittens och osäkra utfall |
| Frånkoppling/radering | Google disconnect finns | Radering av importerad data, derivat, bilagor, loggar och backupfördröjning; återkallning är en separat åtgärd |

Integritetstexten behöver uttryckligen beskriva varför mejl läses, vilka uppgifter som lagras, vilka underleverantörer som får dem, lagringstid per datatyp och hur kunden stänger av/raderar. Dokumentera separata regler för mejlkopior och eventuella affärshandlingar som måste bevaras; hitta inte på ett gemensamt raderingslöfte. Ange faktisk supportväg och uppdatera Limited Use-förklaringen enligt Google.

Google medger produktivitets-/CRM-funktioner och generativa sammanfattningar men begränsar vidareöverföring och användning för modellträning. Verifiera leverantörskedjan mot dessa villkor; ett policylöfte ersätter inte rätt inställning. Granskningen måste även omfatta skydd mot instruktioner i inkommande mejl: meddelandetext får inte ändra agentmandat, mottagare eller behörigheter. [Workspace datapolicy](https://developers.google.com/workspace/workspace-api-user-data-developer-policy).

## Manus för Google-demonstration

Spela in med syntetiska kunduppgifter och testbrevlådor. Visa faktisk app och relevant klient-ID, men inga tokenvärden eller hemligheter.

1. Visa Handymates hemsida, integritetslänk och inloggad e-postinställning.
2. Starta mejlanslutning; visa samtyckesflödet på engelska och varje begärd behörighet.
3. Återgå till rätt företag och steg; visa kopplat konto och separata kalender-/mejlförmågor.
4. Ta emot en tydligt märkt testförfrågan. Visa ursprungsmejlet och dess koppling till kund/ärende i Handymate.
5. Visa vad agenten föreslår, dess faktiska källunderlag och godkännandesteget. Inga påhittade automatiseringsbevis.
6. Godkänn det avgränsade provsvaret till testbrevlådan. Visa API-utfallet och mottaget svar separat.
7. Visa paus/frånkoppling och var radering begärs. Demonstrera endast beteende som finns implementerat.

Videolänk: **saknas**. Release/commit: **saknas**. Projekt-/klientreferens: **saknas**. Alla tre ska fyllas i före ansökan.

## Microsoft: konkret konfigurationsunderlag

- Registrera/bekräfta en app i Microsoft Entra för konton i flera organisationer. V1 avser Microsoft 365-arbetskonton.
- Använd serverbaserad authorization code med validerad state och PKCE. Delegerade Mail.Read/Mail.Send, identitetsbehörigheter och offline_access enligt implementationsplanen. Dokumentera om User.Read verkligen behövs.
- Föreslagen produktionscallback: `https://app.handymate.se/api/microsoft/callback`. Detta är en planerad route, inte en nu fungerande endpoint. Testmiljön ska ha en egen uttryckligen registrerad callback; inga wildcard-returadresser.
- Föreslagna serverkonfigurationer: MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET eller bibliotekets certifikatkonfiguration, MICROSOFT_REDIRECT_URI. Dessa variabler är ännu inte implementerade. Lägg nycklar i befintlig hemlighetshantering, aldrig i repo eller NEXT_PUBLIC-variabler.
- Förbered organisationsverifierat partnerkonto och koppla rätt PartnerID till appregistreringen för publisher verification. Kundens tenantpolicy kan fortfarande kräva administratörsgodkännande. Förbered UI-text: ”Din Microsoft-administratör behöver godkänna anslutningen.”

Publisher verification verifierar utgivarorganisationen och är inte ett intyg att Handymates kod har säkerhetsgranskats. [Microsoft publisher verification](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview), [Graph-behörigheter](https://learn.microsoft.com/en-us/graph/permissions-reference).

Microsoft tenant-/app-ID, verifieringsstatus och testkonto: **inte kontrollerade i Entra**. Inga Google Cloud-/Entra-konfigurationsverktyg identifierades i den tillgängliga verktygssökningen. Underlaget kan därför färdigställas i kod, men kontoägaren eller en auktoriserad administratör behöver hantera återstående konsolsteg. Inga lösenord behöver lämnas i chatten.
