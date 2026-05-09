# Audit — Kund-portalen för ÄTA-flödet

> **Datum:** 2026-05-09
> **Syfte:** Verifiera att hela end-to-end-flödet fungerar (skapa ÄTA → SMS-länk → kund signerar → hantverkaren notifieras) innan mobile-UI för ÄTA byggs (TD-21).
> **Kort sagt:** Backend + portal-rendering finns, men det finns **tre gap** som påverkar UX. Inga blockerare för pilot, men värt att veta innan mobile-implementation.

---

## 1. "Changes"-tab i kund-portalen

### Vad finns

**ÄTA renderas inom Projekt-detaljvyn** ([app/portal/[token]/components/PortalProjectDetail.tsx:318-400+](handymate-dashboard/app/portal/[token]/components/PortalProjectDetail.tsx#L318-L400)) — som en sektion under projektets information. Inte som egen tab.

Fält som visas per ÄTA:
- `ÄTA-{number}: {description}`
- Type-badge (Tillägg / Ändring / Avgående)
- Status-badge (`signed` grön / `sent` amber / annat grå)
- Total-belopp om `> 0`
- Signing-info om signerad: `Signerad av {name}, {date}`

Signing-flow är **inline** i samma komponent — `<SignatureCanvas>` öppnas under ÄTA-raden när kund trycker "Signera". POST mot `/api/ata/sign/${signToken}` (rad 79).

### Gap 1 — Portal-länken pekar på en `tab` som inte finns

`/api/ata/[id]/send/route.ts:49` skapar portal-URL via:
```ts
const portalUrl = await getOrCreatePortalLink(supabase, customerId, 'changes')
```

Men i [app/portal/[token]/page.tsx:273-303](handymate-dashboard/app/portal/[token]/page.tsx#L273-L303) renderar UI:n bara fyra tabs: `home`, `project`, `docs`, `contact`. **Det finns ingen `changes`-tab.**

`PortalTab`-typen i [lib/portal-link.ts:13](handymate-dashboard/lib/portal-link.ts#L13) listar `'changes'` som giltig tab-key — men den är "deklarerad utan implementering". Routen kommer att skapa en länk med `?tab=changes`, men page.tsx renderar då en **tom default-state** (sannolikt fortfarande home).

**Konsekvens:** Kunden klickar SMS-länken → landar i portalen på fel ställe → måste manuellt navigera till "Projekt" → välja rätt projekt → scrolla till ÄTA-sektionen → signera. Friktion men inte broken.

**Enklast fix:** I `/api/ata/[id]/send/route.ts` byt portal-call:
```ts
const portalUrl = await getOrCreatePortalLink(supabase, customerId, 'projects')
```
Då hamnar kunden på Projekt-tabben. Fortfarande inte direkt på ÄTA, men närmare.

**Bättre fix:** Implementera djuplänk till specifikt projekt. `getOrCreatePortalLink` skulle stödja `tab='project'` + `projectId`-parameter, page.tsx routes till `<PortalProjectDetail>` direkt. Då hamnar kunden på rätt vy med ÄTA-sektionen synlig. Större jobb (~30 min) men ger smooth UX.

### Gap 2 — Fallback-URL är en API-endpoint (returnerar JSON, ej UI)

Samma route har fallback om `customer_id` saknas:
```ts
let signUrl = `${baseUrl}/api/ata/sign/${ata.sign_token}`
```

`/api/ata/sign/[token]` är en **API-endpoint** som returnerar JSON ([rad 1-77](handymate-dashboard/app/api/ata/sign/[token]/route.ts)). Om en kund klickar den länken får de en `application/json`-respons i webbläsaren, inte ett signering-UI.

**Praktisk effekt:** Bara relevant när ÄTA skapas utan `customer_id`. Mockuparna implicerar att alla ÄTA är knutna till en kund (via projekt-relation), så det här fallet ska inte hända i Christoffers flöde. Men det är en latent bugg.

**Fix:** Antingen ta bort fallback (returnera 400 om customer_id saknas → tvingar att alla ÄTA har kund) eller skapa en publik signering-page `/sign/ata/[token]` som anropar GET-routen och renderar UI. Inte akut.

---

## 2. Signering-flödet (POST /api/ata/sign/[token])

### Vad routen gör korrekt

[app/api/ata/sign/[token]/route.ts:138-149](handymate-dashboard/app/api/ata/sign/[token]/route.ts#L138-L149):
```ts
.update({
  status: 'signed',
  signed_at: new Date().toISOString(),
  signed_by_name: name,
  signed_by_ip: ip,
  signature_data,
})
```

Alla fyra fält sätts ✅:
- `status='signed'`
- `signed_at` timestamp
- `signed_by_name` från body
- `signature_data` (base64 från SignatureCanvas)
- Bonus: `signed_by_ip` från `x-forwarded-for` / `x-real-ip` headers

Decline-flödet ([rad 113-126](handymate-dashboard/app/api/ata/sign/[token]/route.ts#L113-L126)) sätter `status='declined'`, `declined_at`, `declined_reason` korrekt.

### Gap 3 — Hantverkaren notifieras INTE automatiskt

[Rad 152-161](handymate-dashboard/app/api/ata/sign/[token]/route.ts#L152-L161):
```ts
try {
  const { fireEvent } = await import('@/lib/automation-engine')
  await fireEvent(supabase, 'ata_signed', ata.business_id, {...})
} catch { /* non-blocking */ }
```

`fireEvent('ata_signed')` triggar automation-engine att kolla efter business-rules som matchar event-typen.

**Men:** grep efter `ata_signed` i [lib/automation-engine.ts](handymate-dashboard/lib/automation-engine.ts) ger **noll träffar**. Och inga seed-rules finns för `ata_signed`-event. Det betyder:
- Automation-engine får eventet → letar efter matching rules → hittar inga → returnerar tomt
- **Ingen SMS, ingen email, ingen push, ingen activity-log skapas automatiskt**

Hantverkaren upptäcker signeringen bara om de:
- Manuellt refreshar dashboard-projektsidan (ÄTA-sektionen visar `status='signed'`)
- Pollar `/api/ata?projectId=X` från mobile-vyn

**Ingen activity-feed-entry skapas.** Det betyder Hem-skärmens activity-feed (om det är där notifieringar visas) får ingen alert.

**Tre lösningsförslag:**

**A. Lägg till push-notis direkt i sign-routen** (~10 LOC):
```ts
// Efter UPDATE lyckats, före fireEvent:
fetch(`${baseUrl}/api/push/send`, {
  method: 'POST',
  body: JSON.stringify({
    business_id: ata.business_id,
    title: `ÄTA-${ata.ata_number} signerad`,
    body: `${name} har godkänt tilläggsarbetet (${total} kr)`,
    url: `/dashboard/projects/${ata.project_id}`,
  }),
}).catch(() => {})
```

**B. Skapa pending_approvals-rad** så ÄTA-signering syns i Hem-feed på samma sätt som andra approval-notiser:
```ts
await supabase.from('pending_approvals').insert({
  business_id: ata.business_id,
  approval_type: 'ata_signed_notification',
  title: `ÄTA-${ata.ata_number} signerad av ${name}`,
  description: `${total} kr godkänt på projekt ${ata.project_id}`,
  payload: { change_id: ata.change_id, ... },
  status: 'pending',  // eller 'approved' för att inte kräva action
  risk_level: 'low',
})
```

**C. Lägg till seed-automation-rule i automation-engine** så `fireEvent('ata_signed')` faktiskt gör något. Mest skalbart men kräver ändring i automation-engine + business-config.

**Rekommendation:** A för minimum viable notification (en notis till hantverkaren). B kompletterar med activity-log för dashboard. C tillkommer om vi vill ha konfigurerbart per business.

---

## 3. Test-flow (utan att bygga något)

### Manuell end-to-end via dashboard + mobil

Förutsätter att `cust_joid3zg64` har telefonnummer `0708379552` (din test-kund).

1. **Skapa ÄTA på dashboard:**
   - Gå till `/dashboard/projects/{projectId}` (välj ett projekt knutet till `cust_joid3zg64`)
   - Tab-knapp "ÄTA"
   - Klicka "+ Ny ÄTA" → fyll i description + items + spara
   - ÄTA skapas med `status='draft'` och `sign_token` autogenererad

2. **Skicka ÄTA:**
   - Klicka "Skicka för signering" (eller motsvarande UI-knapp)
   - SMS ska gå till `+46708379552` med text typ:
     > "Hej! Du har fått ÄTA-{N} för {projektnamn} att granska och signera. Klicka här: https://app.handymate.se/portal/{token}?tab=changes"
   - DB: `status='sent'`, `sent_at=NOW()`, `sent_to_phone='+46708379552'`

3. **Klicka SMS-länk på telefonen:**
   - Förväntat (broken pga Gap 1): kunden landar i portalen men på home/default-tab eftersom `tab=changes` inte är implementerad
   - Kunden måste navigera: tab "Projekt" → välj rätt projekt → scrolla till "ÄTA-ändringar"-sektionen
   - Där syns ÄTA-raden med "Signera"-knapp

4. **Signera:**
   - Klicka "Signera" på ÄTA-raden → inline-canvas öppnas
   - Skriv namn + signatur (touch eller mus)
   - Klicka "Bekräfta"
   - POST `/api/ata/sign/{token}` med `{ action: 'sign', name, signature_data }`
   - DB: `status='signed'`, `signed_at`, `signed_by_name`, `signature_data`

5. **Verifiera notifiering (broken pga Gap 3):**
   - Inget SMS, ingen push, ingen email kommer till Christoffer (hantverkaren)
   - Inget activity-feed-entry på Hem-skärmen
   - Christoffer måste manuellt öppna projektet → ÄTA-sektionen → se status-uppdatering till "Signerad"

### Direkt curl-test av sign-routen (utan UI)

För att verifiera signing-logiken isolerad:

```bash
# 1. Hämta ÄTA-data via publik token (ingen auth)
curl https://app.handymate.se/api/ata/sign/<sign_token>

# 2. Signera med fake-signatur
curl -X POST https://app.handymate.se/api/ata/sign/<sign_token> \
  -H "Content-Type: application/json" \
  -d '{
    "action": "sign",
    "name": "Test Andersson",
    "signature_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
  }'

# 3. Verifiera DB-uppdatering via Supabase SQL Editor
SELECT change_id, status, signed_at, signed_by_name
FROM project_change
WHERE sign_token = '<sign_token>';

# 4. Decline-test (separat ÄTA, alternativt nytt sign_token)
curl -X POST https://app.handymate.se/api/ata/sign/<other_token> \
  -H "Content-Type: application/json" \
  -d '{ "action": "decline", "reason": "För dyrt — vi avstår" }'
```

`sign_token` hittas via:
```sql
SELECT change_id, ata_number, sign_token, status
FROM project_change
WHERE business_id = 'biz_al7pjuu5smi'
ORDER BY created_at DESC LIMIT 5;
```

---

## 4. Sammanfattning av gap

| # | Gap | Severitet | Fix-storlek |
|---|---|---|---|
| 1 | Portal `?tab=changes` är dead route — kunden landar på fel state | Friktion (kunden hittar manuellt) | 1 LOC (byta till `'projects'`) eller 30 min (deep-link till projekt) |
| 2 | Fallback `/api/ata/sign/[token]` returnerar JSON som länk-target | Latent — bara aktiv om customer_id saknas | 5 LOC (return 400) eller 2-3h (publik sign-page) |
| 3 | Signering triggar inget för hantverkaren | Friktion (Christoffer ser inte att signering hänt utan att kolla manuellt) | ~10 LOC (push-notis i route) eller 2h (full pending_approvals + activity) |

**Innan mobile-UI byggs:** Gap 1 + Gap 3 påverkar pilot direkt. Gap 2 är latent. Värt att fixa Gap 1 + 3 i en separat commit-serie innan TD-21 implementeras — alternativt acceptera friktionen för pilot v1 och fixa när Christoffer kommenterar.

Mobile-UI (TD-21) påverkas inte av gappen — mobilen renderar sin egen ÄTA-list utan att gå via portalen. Kunden använder portalen, mobilen hanterar hantverkarens sida.

---

## 5. Förslag på följdactions

**Inga ändringar i denna audit** — bara dokumentation.

**Tre möjliga uppföljnings-commits** om du vill plocka upp:

1. **Quick-fix Gap 1:** byt `'changes'` → `'projects'` i `/api/ata/[id]/send/route.ts:49`. 1 LOC. Kunden landar på projekt-tabben istället för tom default.
2. **Quick-fix Gap 3:** Lägg till push-notis i sign-routen efter UPDATE. ~10 LOC. Hantverkaren får alert direkt.
3. **Real fix Gap 1:** Implementera deep-link till projekt + öppna ÄTA-sektion. ~30 min jobb. Smooth UX för kunden.

Säg till vilka du vill ska byggas, eller om vi accepterar gappen för pilot v1.
