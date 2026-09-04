# Rapportläge i fält — tid, material och ÄTA med rösten

**Beslut Andreas 2026-09-04: ska in före lansering, särskilt i mobilappen.**

## Läget

Kedjan finns redan och fungerar i mobilappen idag för **tid** och **arbetsanteckning**:

`ProjectReportCard` (app/projects/[id].tsx) → `MatteSheet({workReport:true, projectId, workDate})` → `transcribeAudio` → `POST /api/matte/chat` → `loadWorkReportContext` (verifierar `project_assignment`) → Lars med `workReportPrompt` → `filterTools(['log_time','add_work_note'])` → `pendingWorkReport()` signerar token → `MatteConfirmCard` → `confirmMatteAction(token)` → `confirmWorkReport` revaliderar och skriver.

Räcken som redan sitter: bara egen tid (403 annars), bara det öppnade projektet (409), 1 min–24 h, aktiv timer blockerar tid, deterministisk `confirmationId` mot dubbelskrivning, ingen ny modellrunda vid bekräftelse.

**Material och ÄTA blockeras enbart av allowlistor i dashboard-repot.** Verktygen (`log_material`, `create_ata_draft`), utförarna (`tool-router.ts`) och kortrenderingen i appen finns redan. Appen behöver i praktiken bara ny text.

## Vad som byggs (dashboard)

### 1. `lib/matte/work-report.ts`
- `WorkReportTool` = `'log_time' | 'add_work_note' | 'log_material' | 'create_ata_draft'`, `isWorkReportTool` med.
- `prepareWorkReportAction` får två nya grenar med samma låsning som tiden:
  - **`log_material`**: `project_id` tvingas till `ctx.projectId` (409 vid avvikelse). `name` krävs (icke-tom sträng). `quantity` > 0, annars 1. `unit` valfri sträng.
    **Priser gissas ALDRIG.** Bara ett pris användaren själv sagt får med; annars utelämnas `purchase_price` och `markup_percent` helt så `logMaterial` inte fyller i 20 % påslag på ett underlag ingen uppgett. Marginal är ägarens sak.
  - **`create_ata_draft`**: `project_id` tvingas till `ctx.projectId`. `description` krävs. `amount_estimate` skickas bara vidare om användaren sagt ett belopp (aldrig härlett). `customer_id` från `ctx.customerId`.
- `workReportSummary` får text för båda. Material: `Bokför 12 m kabel` + rad om att pris fylls i sedan när inget angetts. ÄTA: `Förslag på tilläggsarbete` + `Skickas inte till kunden — hamnar i din godkännandekö`.
- `workReportPrompt` skrivs om: material och tilläggsarbete tillåts nu; behåll förbudet mot projektavslut, faktura och kundmeddelande; lägg till uttryckligt **gissa aldrig pris, belopp eller att extraarbetet är beställt**; höj "två förslag" till fyra, högst ett av varje typ.
- Behåll `WorkReportError`-mönstret och svenska felmeddelanden.

### 2. `app/api/matte/chat/route.ts`
- Rad ~640: allowlistan blir alla fyra. **Ta bort intersektionen `isToolAllowedForAgent`** i just work-report-grenen och dokumentera varför: `create_ata_draft` ägs av Daniel i `lib/agents/personalities.ts` men rapportläget tvingar Lars. Att i stället ge Lars verktyget skulle vidga hans **autonoma** körningar (cron `agent-observations/lars`) — det vill vi inte. Work-report-allowlistan är strikt smalare än agentlistan och kontrolleras dessutom två gånger till (raden nedan + `prepareWorkReportAction`), så intersektionen tillför ingen säkerhet här.
- Rad ~679: höj taket från 2 till 4 block. Behåll `isWorkReportTool`-kontrollen och kravet på unika typer.
- **Rör inte `CURATED_TOOL_NAMES`.** Vanliga projektchatten saknar projektlåsningen som rapportläget har; att öppna material där är ett eget beslut, inte det här passet.

### 3. `lib/matte/work-report-confirmation.ts`
- `scope.remaining.length > 1` → `> 3`. Kedjan behåller ett klick per åtgärd.

### 4. Facit `tests/work-report.spec.ts` (utöka, 24 test idag)
- Material: fel projekt → 409; namn saknas → 400; **inget pris i utdata när användaren inte sagt något** (uttryckligt test mot påslagsgissning); quantity default 1.
- ÄTA: fel projekt → 409; description krävs; belopp bara när angivet; sammanfattningen säger att det inte går till kunden.
- Taket: fyra unika typer går igenom, en femte eller en dubblett ger 409.
- Prompten: nämner material och tilläggsarbete, förbjuder prisgissning, behåller förbudet mot faktura/kundmeddelande/projektavslut.
- Källskanning: work-report-grenen i chat/route.ts saknar `isToolAllowedForAgent` och har en kommentar som säger varför.

## Vad som byggs (mobil, `/home/user/handymate-mobile`)

Minimalt, appen renderar serverns `summary`/`confirm_label` generiskt:
- `components/ProjectReportCard.tsx` (eller där texten bor): "Rapportera dagens arbete" → nämn tid, material och tilläggsarbete.
- Ev. facit i `__tests__` i husets stil (källskannande, strippar kommentarer).
- Ingen ny skärm, ingen ny endpoint, inget nytt beroende.

## Uttryckligt utanför scope
- `CURATED_TOOL_NAMES` (vanliga chatten).
- Offline-kö i appen.
- Material-UI på projektnivå i appen (manuell lista) — rösten räcker för V1.
- `communication_settings`-buggen (egen sak, se separat).

## Verifiering
- `npx tsc --noEmit`, `npm run test:contracts`, en serial `npx next build` i dashboard.
- `npm test` i mobilrepot.
- Manuellt när det ligger ute: stå i ett projekt i appen, säg "fyra timmar idag, satte tolv meter kabel, kunden vill ha extra uttag i hallen" → tre kort i följd: tid, material, tilläggsarbete. Ett klick var. ÄTA-kortet ska dyka upp i Godkänn-fliken, inte hos kunden.
