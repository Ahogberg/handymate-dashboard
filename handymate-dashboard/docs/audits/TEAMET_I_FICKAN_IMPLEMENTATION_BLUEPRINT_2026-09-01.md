# Teamet i fickan — kodverifierad implementationsspec, Etapp 0

Datum: 2026-09-01

Status: read-only blueprint; inga produktionsändringar ingår

Auktoritativ inriktning: `docs/council/ACTIVE_ROADMAP.md` och
`docs/roadmap/TEAMET_I_FICKAN_POST_LAUNCH.md`

## 1. Beslut i en mening

Bygg första vertikala skivan som **ett exakt, personriktat beslut från Matte**:
ett verkligt `pending_approvals`-kort skapas, rätt behöriga mottagare härleds,
varje mottagare får högst en diskret mobilpush, och ett tryck öppnar exakt det
kortet i mobilappen. Befintlig approval- och exekveringskedja återanvänds.

Skivan får inte aktiveras innan P1-fynden i avsnitt 5 är stängda. Om
färsk-konto-/tvåkontosbeviset hittar P0/P1 har det företräde även framför
dessa fynd.

## 2. Avgränsning

### Ingår i första skivan

- notisklassen `decision_required`;
- Matte som användarens koordinator på låsskärmen;
- ett existerande approval som källa till sanningen;
- explicit mottagare eller behörighetsbaserad mottagargrupp;
- dedupe per approval och mottagare;
- diskret låsskärmstext;
- tyst tid, TTL och prioritet;
- exakt mobilvy för ett approval;
- kallstart, bakgrund, utloggad användare, löst/utgånget/borttaget kort;
- sann leveransredovisning: köad, provideraccepterad, misslyckad eller utan
  mottagare — aldrig det osanna ordet "levererad" utan providerbevis.

### Ingår inte

- Mission Control-progress, projektöverlämning, nya leads, betalda fakturor
  eller kundlöften; de byggs som senare vertikala skivor;
- en ny agentmotor, approvalmotor, observationsplattform eller generell
  workflowmotor;
- en generell notispreferenshub;
- autonom exekvering från pushen;
- känsliga kunduppgifter eller belopp på låsskärmen;
- en generell URL-router som öppnar godtycklig payloaddata;
- omskrivning av PWA/web-push utöver att separera dess utfall från Expo;
- åtgärder på de P1-fynd som rapporteras här. De ska göras som egna,
  granskbara fixar före implementationen.

## 3. Verifierat nuläge

### 3.1 Dashboard/API: faktisk kedja

| Steg | Faktisk implementation | Bedömning |
|---|---|---|
| Producent | Många producenter skriver direkt till `pending_approvals`. Ett fåtal anropar sedan `sendApprovalPush`; flera andra anropar `/api/push/send` direkt. | Fragmenterat. `sendApprovalPush` är inte den enda verkliga chokepointen trots filkommentarerna. |
| Approval-sanning | `pending_approvals` bär `business_id`, `approval_type`, `payload`, `status`, `risk_level`, `expires_at`, `routing_role` och valfri `routed_business_user_id`. | Rätt grund att återanvända. Pushen ska aldrig bära en parallell affärssanning. |
| Köbehörighet | `GET /api/approvals` hämtar tenantens rader och filtrerar varje rad med `canActOnApproval`. `GET /api/mobile/home` gör samma sak. | Bra och återanvändbart. |
| Enskilt kort | `GET /api/approvals/[id]` kontrollerar bara `business_id`. | Inte säkert nog för en djuplänk; se P1-3. |
| Utförande | `POST /api/approvals/[id]` identifierar aktuell användare och kör `canActOnApproval` före åtgärd. | Bra säkerhetsgrind. Pushen ska öppna denna befintliga kedja, inte exekvera själv. |
| Agentidentitet | `lib/jarvis/approval-view.ts` härleder agent från explicit `routed_agent`/`agent_id`/`agent` och därefter typ. | Återanvändbar domänregel, men Matte är koordinator på den första låsskärmsnotisen. |
| Pushpresentation | `lib/notifications/approval-push.ts` har 12 hårdkodade mallar med fri `url`. Okänd typ ger ingen push. | För smalt och saknar strukturerat mål. Flera mallar visar känsliga belopp/namn. |
| Mottagare | `routed_business_user_id` slås upp till auth-UUID. Bara samtalsanalysen producerar fältet i vanlig kod. De flesta approvals saknar därför exakt mottagare. | Den första skivan måste införa en explicit resolver; businessblast får inte vara standard. |
| Web-push | `/api/push/send` läser `push_subscriptions`, valfritt filtrerat på `target_user_id`. | Separat kanal; ska inte villkora Expo. |
| Expo | Samma route anropar `sendExpoPushNotification` fire-and-forget efter web-push. | Kan inte redovisa mobilutfall sant och nås inte utan web-prenumeration; se P1-2/P1-4. |
| In-app-notis | Tabellen `notification` har redan `user_id`, `type`, text, länk och metadata. API:t filtrerar dock bara på `business_id`. | Kan återanvändas efter personfiltrering och ett smalt dedupetillägg. Skapa inte en konkurrerande notistabell. |

Kodkällor:

- `lib/notifications/approval-push.ts`
- `lib/notifications/expo-push.ts`
- `app/api/push/send/route.ts`
- `app/api/push-tokens/route.ts`
- `app/api/approvals/route.ts`
- `app/api/approvals/[id]/route.ts`
- `lib/approvals/routing.ts`
- `lib/jarvis/approval-view.ts`
- `sql/notifications.sql`
- `sql/v77_pending_approvals_routing.sql`
- `sql/v159_push_tokens_user_id.sql`

### 3.2 Mobil: faktisk kedja

| Steg | Faktisk implementation | Bedömning |
|---|---|---|
| Registrering | `app/(tabs)/_layout.tsx` anropar `registerForPushNotifications`; `lib/notifications.ts` begär tillstånd, hämtar Expo-token och POST:ar till `/api/push-tokens`. | Fungerande bas. Resultatet visas eller loggas inte i UI. |
| Föregrund | Expo-handlern visar banner/lista och spelar ljud. | Finns, men ingen klassbaserad prioritet. |
| Tap i bakgrund | Root-layouten läser `notification.request.content.data`. | Finns. |
| Kallstart | `getLastNotificationResponseAsync()` läses efter auth och routas efter en kort delay. | Finns, men response-id konsumeras inte; samma senaste respons kan behandlas igen vid ny effect. |
| Routing | Ett strikt `url`-specialfall öppnar samtal. Koden har också ÄTA-grenar som kräver `data.type` + `project_id`, men dashboarden skickar inte dessa fält till Expo. I verklig ändkedja öppnar därför även ÄTA hem. | Bara samtalsmålet är bevisligen sammankopplat. Ingen exakt approval-deeplink. |
| Approval-lista | `app/(tabs)/approvals.tsx` hämtar den behörighetsfiltrerade listan och återanvänder `ApprovalCard`. Den kan bara filtrera på `recording_id`, inte fokusera ett approval-id. | Bra komponent att återanvända; en liten exakt route saknas. |
| Approvalhandling | Mobilen anropar samma `/api/approvals/[id]` som dashboarden och kontrollerar faktiskt exekveringsutfall. | Rätt kedja. |
| Agentgrafik | `theme/tokens.ts` och `AIAvatar.tsx` innehåller alla sex agenter och porträtt. | Färdigt; inget nytt profilsystem behövs. |

Kodkällor i `handymate-mobile`:

- `app/_layout.tsx`
- `app/(tabs)/_layout.tsx`
- `app/(tabs)/approvals.tsx`
- `lib/notifications.ts`
- `lib/api.ts`
- `lib/call-notification.ts`
- `components/ApprovalCard.tsx`
- `components/AIAvatar.tsx`
- `theme/tokens.ts`

## 4. Målarkitektur för första skivan

```text
verkligt pending_approval
        ↓
behörig mottagarresolver
        ↓
personlig notification-rad + atomisk dedupe
        ↓
tyst tid / TTL / diskret copy
        ↓
await:ad Expo-sändning med sant providerutfall
        ↓
strukturerad, versionsmärkt mobilpayload
        ↓
mobilens allowlist-parser
        ↓
/approvals/<id>
        ↓
GET exakt kort + canActOnApproval
        ↓
befintligt ApprovalCard och befintlig POST-grind
```

### 4.1 Välj `four_eyes_quote` som första skarpa producent

Det är den bästa verkliga första skivan eftersom den redan:

- skapas i `app/api/quotes/send/route.ts`;
- har `routing_role='owner_admin'`;
- bär ett konkret `approval_id` och `expires_at`;
- förbjuder själv-godkännande genom `requested_by_user_id`;
- är affärskritiskt nog att bevisa att rätt person får rätt beslut;
- redan har en pushmall, vilket gör före/efter-beteendet tydligt.

Den nuvarande låsskärmstexten visar offertbelopp och offertnamn. V1 ska i
stället använda:

- titel: **Matte behöver ditt beslut**
- brödtext: **Öppna Handymate för att granska.**
- agent: `matte`
- klass: `decision_required`
- prioritet: `high`
- TTL: minsta av approvalens `expires_at` och sju dygn

När appen är upplåst visar det riktiga kortet offert, belopp, vem som begärde
godkännandet och vad knappen gör. Låsskärmen behöver inte göra det.

### 4.2 Mottagarregeln

En gemensam resolver ska returnera **business_users-rader**, inte gissade
e-postadresser eller ägarens UUID.

Prioritet:

1. Om `routed_business_user_id` finns: verifiera att raden är aktiv, tillhör
   samma `business_id` och att `canActOnApproval` är sant. Annars: ingen push.
2. Om den saknas men `routing_role` är specifik: hämta aktiva användare i
   samma tenant och behåll bara dem för vilka `canActOnApproval` är sant.
3. För `four_eyes_quote`: uteslut alltid `requested_by_user_id`, även om
   den personen annars har owner/admin-roll.
4. Om inget säkert mål återstår: skriv `no_eligible_recipient`, behåll
   approval-kortet i kön och skicka ingen push.
5. `routing_role='any'` får inte automatiskt bli businessblast i denna V1.
   Den typen måste få en explicit mottagare eller avstå push.

Om två admins faktiskt kan fatta beslutet får båda varsin notifieringsrad
och push. Det är rollriktning, inte businessblast. Dedupe sker per mottagare.

### 4.3 Minsta delade payload

Payloaden ska vara en liten, strikt och versionsmärkt presentationstransport.
Den ska inte bära approvalens kunddata eller exekveringspayload.

```ts
type AgentPushEnvelopeV1 = {
  schema: 'agent_push_v1'
  notification_id: string
  notification_class: 'decision_required'
  agent_id: 'matte'
  target_kind: 'approval'
  target_id: string
  issued_at: string
  expires_at: string
  privacy: 'discrete'
}
```

Regler:

- `target_id` är `pending_approvals.id`.
- Mobilen accepterar bara kända `schema`, `notification_class`, `agent_id`
  och `target_kind`.
- Ingen `url` från servern får skickas direkt till `router.push`.
- Äldre payloads behåller sina befintliga specialfall under övergången.
- Approvaldata hämtas alltid på nytt efter tap; pushens text är aldrig
  auktoritativ.

### 4.4 Dedupe och beständig notis

Återanvänd tabellen `notification`; skapa inte `AgentMoment`,
`AgentInteraction` eller en ny generell notistabell för samma sak.

Minsta migrationsändring:

- `notification.dedupe_key TEXT NULL`;
- `notification.expires_at TIMESTAMPTZ NULL`;
- unik, partiell constraint/index på
  `(business_id, user_id, dedupe_key)` där `dedupe_key IS NOT NULL`;
- leveranssammanfattningen lagras i `metadata.push`, med ett låst schema:
  `not_attempted | deferred | accepted_by_provider | no_token | failed`;
- spara endast stabil felkod/provider-ticket, aldrig rå kunddata.

Dedupe för första skivan:

```text
approval:<approval_id>:created:v1
```

En insert med `ON CONFLICT DO NOTHING` äger rätten att skicka. En process
som förlorar insertracet får inte skicka pushen. Att först SELECT:a och sedan
INSERT:a är inte tillräckligt.

`notification.user_id` ska vara den faktiska auth-UUID:n. API-läsning och
markering som läst ska visa/ändra rader där `user_id IS NULL` (legacy
businessnotis) eller `user_id=currentUser.user_id`; aldrig andra personers
rader.

### 4.5 Tyst tid, prioritet och TTL

- Standard tyst tid: 21:00–07:00 Europe/Stockholm.
- Använd den tidszonsmedvetna minutlogiken i `lib/outbound/hub-gate.ts` som
  mönster. Återanvänd inte den privata `isQuietHours` i
  `lib/smart-communication.ts`; den läser serverns lokala klockslag.
- Ett `decision_required` med `high` prioritet skjuts till 07:00, inte
  bort, så länge approvalens TTL fortfarande gäller.
- Om `expires_at` inträffar före nästa tillåtna tid: markera notisen
  `expired_before_send` och skicka inte.
- Expo-meddelandet sätter `priority: 'high'` och `expiration`/TTL enligt
  Expo-kontraktet. Ingen senare skiva får hårdkoda samma policy på nytt.
- Frånvarofönstret kan fortsatt undertrycka push, men approvalen ligger kvar.
  Resultatet ska då vara synligt som `suppressed_by_absence`, inte ett tyst
  return.

För uppskjuten sändning behövs ingen ny generell jobbmotor. Lägg den på en
befintlig schemalagd sweep som redan körs dagligen/tillräckligt ofta, eller
på en enda smal befintlig cron. Vercel Hobby-gränsen ska kontrolleras före
val av cron; skapa inte ännu en schemarad slentrianmässigt.

### 4.6 Sant leveransutfall

`sendExpoPushNotification` ska returnera ett strukturerat resultat och
awaitas:

```ts
type ExpoAcceptance = {
  attempted: number
  accepted: number
  rejected: number
  tickets: string[]
  reason?: 'no_token' | 'provider_error' | 'network_error'
}
```

Expo HTTP 200/ticket betyder `accepted_by_provider`, inte "levererad till
telefon". Faktisk leverans kräver senare receipt-sweep; det är inte ett krav
för första UI-skivan, men språket får inte påstå mer än beviset.

Web-push och Expo ska exekveras oberoende. Avsaknad av VAPID eller
web-prenumeration får aldrig stoppa Expo. Routens svar ska redovisa kanaler
separat, exempelvis `{ web: ..., expo: ... }`.

### 4.7 Mobilens exakta approval-vy

Lägg en liten route `app/approvals/[id].tsx` i `handymate-mobile`.

Den ska:

1. hämta `GET /api/approvals/[id]` efter tap;
2. återanvända `mapRawApproval` och `ApprovalCard`;
3. visa agentavatar och innehåll först efter lyckad auth/behörighetskontroll;
4. använda befintliga approve/reject/edit-anrop;
5. visa verklig status om kortet redan är löst eller utgånget;
6. vid 404/403 visa "Ärendet finns inte längre eller är inte tillgängligt"
   och en knapp till `/approvals`;
7. aldrig visa pushpayloadens innehåll som fallbackdata.

Listvyn kan kompletteras med `approval_id` som sökparameter och scroll/fokus,
men en egen tunn route ger säkrare status- och felhantering och återanvänder
samma kort. Ingen ny beslutsdesign behövs.

### 4.8 Tap, auth och konsumtion

Flytta routingen till en ren allowlist-funktion, exempelvis
`lib/notification-target.ts`, som returnerar en Expo Router-route eller
`null`.

Händelser:

- föregrund/bakgrund: tap på `agent_push_v1` → `/approvals/<target_id>`;
- kallstart: behandla response efter router/auth-hydrering;
- utloggad: spara bara målkontraktet lokalt, gå till login och återuppta
  efter verifierad session;
- annan tenant/användare: API:t returnerar generiskt 404/403, ingen payload;
- samma response får konsumeras en gång per Expo
  `notification.request.identifier`, även över remount;
- okänd version/klass/mål: öppna `/approvals`, logga `unsupported_payload`.

## 5. Separata P1-fynd — blockerar implementation

Dessa fynd upptäcktes under Etapp 0 och har inte ändrats i denna leverans.
De ska få egna commits och regressionstester.

### P1-1 — riktad Expo-push faller tillbaka till businessblast

`selectExpoTargets()` returnerar alla tenantens tokens när
`target_user_id` finns men ingen token matchar. Ett personriktat beslut kan
därför exponeras för fel medarbetare. Befintligt test kräver uttryckligen det
osäkra beteendet.

Källor:

- `lib/notifications/expo-push.ts`
- `tests/push-target-user.spec.ts`

Krav: target satt + noll matchningar → noll mottagare och synligt
`no_matching_token`, aldrig broadcast.

### P1-2 — Expo är felaktigt beroende av web-push

`/api/push/send` returnerar innan Expo-anropet om VAPID saknas eller om
tenantens web-prenumerationer är tomma. En appanvändare utan PWA-
prenumeration kan därför sakna all mobilpush.

Källa: `app/api/push/send/route.ts`.

Krav: Expo körs oberoende av web-push och båda resultaten returneras.

### P1-3 — exakt approval-GET saknar radbehörighet

`GET /api/approvals/[id]` verifierar tenant men inte `getCurrentUser` +
`canActOnApproval`. En tenantmedlem som filtreras bort ur listan kan ändå
läsa kortets fulla payload om id:t är känt.

Källa: `app/api/approvals/[id]/route.ts`.

Krav: samma behörighetsprimitiv på GET som på listan och POST; obehörig rad
ska inte exponeras.

### P1-4 — token kan stämplas som fel person och mobilutfall kan inte bevisas

`POST /api/push-tokens` använder ägarens UUID som fallback om
`getCurrentUser` missar. Dessutom kör `/api/push/send` Expo fire-and-forget
och svarsfältet `sent` omfattar bara web-push.

Källor:

- `app/api/push-tokens/route.ts`
- `app/api/push/send/route.ts`
- `lib/notifications/push-internal.ts`

Krav: tokenregistrering fail-closed utan verifierad aktuell användare;
Expo-resultat awaitas och särredovisas sanningsenligt.

### P1-5 — personfältet i `notification` hedras inte av API:t

`notification.user_id` finns, men GET och PUT i `/api/notifications`
filtrerar endast på `business_id`. Personliga rader skulle därmed visas och
kunna markeras lästa av andra i samma tenant.

Källor:

- `app/api/notifications/route.ts`
- `sql/notifications.sql`

Krav: legacy-rader med `user_id IS NULL` får vara businessgemensamma;
personliga rader får endast läsas/ändras av exakt auth-användare.

### P1-6 — ÄTA-tap-routingen får aldrig de fält den kräver

Mobilens root-layout routar ÄTA endast när Expo-data innehåller både `type`
och `project_id`. `/api/push/send` bygger däremot Expo-data av enbart `url`
och `tag`, och `sendApprovalPush` skickar inte `type`/`project_id` som egna
fält. ÄTA-specialfallet kan därför inte träffa i den verkliga kedjan och
faller tillbaka till hemskärmen.

Källor:

- dashboard: `app/api/push/send/route.ts`
- mobile: `app/_layout.tsx`

Krav: ersätt den implicit glidna formen med den versionsmärkta allowlist-
payloaden. Lägg inte till ännu ett löst specialfält bara för ÄTA.

## 6. Implementation i exakta, separata etapper

### Etapp 0A — stäng P1-grunden

Scope:

- fail-closed Expo-targeting;
- oberoende web/Expo-sändning;
- strict tokenägare;
- permission på exakt approval-GET;
- user-skopning i notification-API.

Schema: inget nytt utöver eventuella constraint-/grantjusteringar som
verifieringen kräver.

Acceptance: två användare i samma tenant kan inte få/läsa varandras
personriktade notis eller owner/admin-kort.

### Etapp 0B — smalt AgentPush-kontrakt och dedupe

Scope:

- `AgentPushEnvelopeV1`;
- migrationen på befintlig `notification`;
- atomisk create/dedupe;
- mottagarresolver;
- diskret Matte-copy;
- tyst tid/TTL/prioritet;
- awaitad Expo-provideracceptans.

Första producent: endast `four_eyes_quote`.

Acceptance: en approval ger exakt en notifieringsrad per behörig mottagare
och högst ett sändningsförsök per dedupe key.

### Etapp 0C — exakt mobilmål

Scope i `handymate-mobile`:

- ren payloadparser;
- `/approvals/[id]`;
- återanvänd `ApprovalCard`;
- pending target genom login;
- one-time response-consumption;
- fel-/resolved-/expired-vyer.

Acceptance: tap i foreground, background och killed state öppnar samma
approval och aldrig ett annat objekt.

### Etapp 0D — skarpbevis

Kör med två konton och minst två användare i ett testföretag:

1. anställd skapar offert över fyra-ögon-gränsen;
2. endast andra behöriga owner/admin får push;
3. skaparen och vanlig anställd får ingen push och kan inte läsa id-rutten;
4. tap öppnar exakt approval;
5. admin godkänner genom befintlig endpoint;
6. andra adminens senare tap visar sant "redan hanterat";
7. om Expo-token saknas ligger approval kvar och leveransstatus är
   `no_token`, inte informerad;
8. samma producentkörning/retry skapar ingen andra push.

## 7. Tester som krävs

### Dashboard/browserlösa facit

- target finns och token matchar → bara målets tokens;
- target finns och ingen token matchar → tomt, aldrig blast;
- saknad verifierad current user vid tokenregistrering → 401/403;
- Expo körs när VAPID saknas;
- Expo körs när web subscriptions är tomma;
- webfel påverkar inte Exporesultat och vice versa;
- exakt approval-GET: tillåten användare 200, annan roll 404/403,
  annan tenant 404;
- `notification` GET/PUT: personlig rad isolerad inom samma tenant;
- två samtidiga inserts med samma dedupe key → en vinner;
- tyst tid Stockholm, inklusive sommartid och natt över midnatt;
- TTL före nästa fönster → ingen push;
- låsskärmscopy saknar belopp, kundnamn, telefon, adress och fritext;
- okänd `notification_class`, `agent_id` eller `target_kind` failar stängt;
- producer source-scan: endast den godkända producenten använder V1 i
  första skivan.

### Mobila enhetstester

- parser: exakt V1 → `/approvals/id`;
- godtycklig URL ignoreras;
- okänd version/mål → approval-lista;
- foreground tap;
- background tap;
- cold-start tap;
- utloggad tap → login → samma mål;
- response identifier konsumeras en gång;
- 404/403, deleted, expired och resolved;
- approvalen renderas med rätt agent/avatar och befintliga handlingar;
- fel vid approve visas som fel, inte grön framgång.

### Riktigt integrationsbevis

- två tenants får aldrig varandras token, notis eller approval;
- två personer i samma tenant får bara sina egna personnotiser;
- owner/admin-routing utesluter requestern för `four_eyes_quote`;
- providerfel lämnar notisen som misslyckad/ej informerad;
- retry dubbletterar inte.

## 8. Observability — miniminivå

För varje personlig notis ska följande gå att följa utan kunddata:

- `notification_id`;
- `business_id`;
- hashad/opaque `user_id` i logg, full id endast i DB;
- `dedupe_key`;
- klass, agent och target-kind;
- planerad/attempted timestamp;
- kanal;
- `accepted`, `rejected`, `no_token`, `deferred`, `expired_before_send`
  eller stabil felkod;
- provider-ticket när sådan finns.

Logga aldrig approvalpayload, kundnamn, belopp, telefonnummer, offerttitel
eller push-token. En Expo-ticket är provideracceptans, inte slutleverans.

## 9. Filer som sannolikt påverkas när bygget godkänns

Dashboard:

- `lib/notifications/approval-push.ts`
- `lib/notifications/expo-push.ts`
- `lib/notifications/push-internal.ts`
- ny smal `lib/notifications/agent-push.ts`
- ny smal `lib/notifications/notification-recipient.ts`
- `app/api/push/send/route.ts`
- `app/api/push-tokens/route.ts`
- `app/api/notifications/route.ts`
- `app/api/approvals/[id]/route.ts`
- `app/api/quotes/send/route.ts`
- en numrerad migration i `sql/`, körd manuellt
- riktade facit i `tests/`

Mobil:

- `lib/notifications.ts`
- ny `lib/notification-target.ts`
- `lib/api.ts`
- `app/_layout.tsx`
- ny `app/approvals/[id].tsx`
- befintliga `components/ApprovalCard.tsx` och `components/AIAvatar.tsx`
  återanvänds, inte kopieras
- tester i `__tests__/`

## 10. Saker som uttryckligen inte ska byggas

- ingen `AgentNotification`-supermodell för alla framtida kanaler;
- ingen pushdriven agentexekvering;
- ingen generisk deeplink från fri URL;
- ingen businessblast när personriktning misslyckas;
- ingen falsk "delivered"-status från ett fire-and-forget-anrop;
- ingen parallell approvalvy med egen exekveringslogik;
- inget nytt moments-/engagementsystem;
- inga "Vi saknar dig"- eller tomma återkomsnotiser;
- ingen full notispreferenshub i första skivan;
- ingen implementation av senare händelseklasser innan skarpbeviset ovan är
  grönt.

## 11. Definition of done

Etapp 0 är klar först när:

1. alla sex P1-fynd är stängda med facit;
2. ett riktigt `four_eyes_quote` ger en diskret Matte-push endast till
   behörig mottagare;
3. retry ger ingen dubblett;
4. pushen fungerar utan PWA-prenumeration;
5. tap öppnar exakt kort i foreground, background och kallstart;
6. utloggad användare återgår till samma mål efter login;
7. fel person och fel tenant nekas både push och API-data;
8. resolved/expired/deleted visar sann, begriplig fallback;
9. providerfel bokförs aldrig som att användaren informerats;
10. tvåkontos-/färsk-kontobeviset fortfarande är grönt.

Efter det byggs nästa skiva enligt roadmapen: verklig
Mission Control-progress/blockerare. Den ska återanvända exakt samma
transport, mottagarresolver, integritetscopy och mobilparser — men inte
`pending_approvals`, eftersom en teamuppdatering inte är ett beslut.
