# Gemensam struktur för godkännandekort

Datum: 2026-09-10. Scope utökat av användaren: presentation och faktisk första handling ska vara korrekta för alla korttyper, inte bara projektvyn.

## Kanoniskt kontrakt

Återanvänd `lib/approvals/action-contract.ts`, `lib/jarvis/approval-view.ts`, serverns granskningskontrakt och `reviewedApprovalFetch`. Ingen ny typklassificering, ingen ny beslutsmotor.

| Befintlig klass | Första handling | Vad som får påstås |
| --- | --- | --- |
| INFORMATIONAL | Läskvittens | Informationen är läst; ingen extern handling |
| ACKNOWLEDGEMENT | Notering/läskvittens enligt befintligt kontrakt | Påminnelsen är noterad; inget utskick |
| REVIEW_REQUIRED | Granskning eller befintlig särskild beslutsvy | Underlaget öppnas; inget utfört ännu |
| EXECUTABLE_ACTION | Granska; slutlig effektknapp i serverbunden dialog | Ingen sändning eller ändring före slutlig bekräftelse |
| Okänd/saknad klass | Försiktig granskningsväg, serverns stopp kvar | Aldrig gissa en handling eller hävda utfört |

## Kartlagda ytor

| Yta | Fynd och riktning |
| --- | --- |
| ProjectApprovalsBlock | Egna agent-/typkartor, Godkänn och ovillkorligt sändningslöfte ersätts med gemensam presentation. |
| IdagCore | Vanliga kort ignorerade API-display; läs- och granskningshandling ska skiljas åt. |
| JarvisHome / AgentDecisionCard | Gemensamma etiketter finns; redigering och grupper ska inte lova utskick före granskning. Befintliga frågor/länkar behålls. |
| GorDettaForst / MandagsmoteTakeover | Gemensam approveLabel används; befintliga rekommendations-/navigationsflöden behålls. |
| Godkännandesidan | Specialflöden för rapporter, telefon, projekt och egna beslutsvyer behålls; generell handling, redigering och paket ska beskriva granskning. |
| Experiments beslutsvy | Domänspecifika val och gemensam granskningsväg behålls. |
| Mobil ApprovalCard | API-display används delvis, men reservtext/inline-edit/autonomikort kan lova direkt beslut. Nuvarande respondToApproval saknar native hantering av serverns granskning. |

## Mobil väg

API-display kompletteras med befintlig `action_class` som maskinläsbar metadata. Informations-/noteringskort med verifierad klass kan fortsätta kvitteras i appen. Beslut och okända kort ska tydligt öppna befintlig webbgranskning. Ingen transport av sessionshemligheter via länken och ingen borttagning ur mobilkön bara för att webben öppnas. Detta är inte bevis för en fullständig native granskningsupplevelse.

## Avgränsning och bevis

Separata domänbeslut som kundens offertsignering, portalens ÄTA och cookieval är inte samma kortsystem och ska inte få mekaniska textbyten.

Webbimplementationen återanvänder en gemensam presentationsadapter och befintlig klassificering. Projekt, Idag, Home och godkännandesidans generella kort/ändringar/grupper/paket är rättade; särskilda beslutsvyer behålls. Grupper skiljer information/notering från granskning. API-display innehåller nu action_class. 16 fokuserade tester och typkontroll är gröna före slutlig CI-koppling; uppdaterad webbpreview återstår. Mobilbryggan implementeras separat och är ännu inte publicerad. Lokala prov, CI, inloggad webbgranskning och faktisk mobilbuild ska redovisas separat. Ingen korttyp får status verifierat utförd på grund av att presentationen är förbättrad.
