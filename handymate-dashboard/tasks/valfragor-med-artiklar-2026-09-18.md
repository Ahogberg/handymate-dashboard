# Valfrågor som befolkar offerten ur artikelbanken

**Beslut att bygga, 2026-09-18.** Tagen ur sidotråd till huvudtråden och
kontrollerad mot koden innan något byggs.

## Regeln

> **Artikeln bär pris och enhet. Raden bär betydelse. Frågan bär mängd eller val.**

Verbet först, målet sedan. Frågan deklarerar vad svaret *gör*, och målväljaren
rättar sig efter det:

| Svaret ska… | Binder till | Varför |
|---|---|---|
| sätta en mängd | **rader** (som i dag) | två rader kan använda samma artikel med olika betydelse |
| välja vad som ingår | **artiklar ur banken** | det är produkten kunden väljer, inte en förskriven rad |
| kryssa ett tillval | **tillvalsrader** (som i dag) | raden finns redan, den ska bara på eller av |

Att mängdfrågor fortsätter peka på rader är inte försiktighet. *Klinker golv*
och *klinker vägg* kan vara samma artikel — en mängd bunden till artikeln
skulle träffa båda. Det är exakt buggen som revs bort när enhetsmatchningen
ersattes av radbindning, och den skulle komma tillbaka genom bakdörren.

## Vad kontrollen visade

### 1. `choice` är i dag en tom typ — och det gör ändringen billig

`seedIntakeQuestions` (`lib/quotes/intake-questions.ts:319`) emitterar
**aldrig** en `choice`. Den producerar `number` (per mängdrad), `yesno` (per
tillvalsrad) och `text` (branschpaketet, besöken, tidspåverkan).
`applyIntakeAnswers` (rad 413) hanterar bara `number` och `yesno`. `choice`
finns alltså i typen, i validatorn och i editorn — men produceras aldrig och
tillämpas aldrig.

Och mätt i produktionen 2026-09-18: **0 av 14 jobbtyper har sparade
`intake_questions`**, 0 offerter har `intake_answers`.

Slutsatsen är viktig: **att ändra formen på `choices` bryter ingenting som
finns.** Ingen migrering, ingen bakåtkompatibilitet att bära.

### 2. Validatorn måste byta form på `choices`

`validateIntakeQuestions` (rad 123) tar i dag `choices` som **rena strängar**:
`cleanText(c, 60)`, 2–12 stycken, dubblettkollade, och fältlistan är sluten
(`['id','label','kind','targets','unit','choices']` — okända fält kastar).

Formen behöver bli ett alternativ med etikett *och* artikel-id:

```ts
choices?: { label: string; productId?: string }[]
```

`productId` valfritt: ett alternativ utan artikel är ett rent svar som går
vidare som text, precis som i dag.

### 3. Editorn behöver INTE skrivas om

`components/onboarding/JobTypeQuestionsEditor.tsx` är 186 rader och redan
byggd för det här:

- `setKind` (rad 80) nollställer redan `targets` och `unit` vid typbyte —
  "verbet först" finns alltså i embryo.
- `targetPicker` (rad 126) är en egen funktion som **redan grenar på typ**:
  `q.kind === 'number' ? quantityTargets : optionTargets`, med en legend som
  redan säger *"Sätter mängden på"* / *"Kryssar tillvalet"*.
- `Draft`-typen (rad 34) har redan ett editor-eget fält (`choicesText`) med
  `toDraft`/`fromDraft` som söm mellan editorns form och den lagrade. Det är
  exakt där den nya formen går in.

Det svagaste stället är rad 170: alternativen skrivs som en kommaseparerad
sträng. Det är **en** `<label>` som byts mot en rad per alternativ med
artikelväljare. Artiklarna finns via `GET /api/products?search=`.

**Alltså: en eftermiddag för editorn och validatorn.** Den större biten är
tillämpningen.

## Det som faktiskt är en arkitektonisk ändring

`applyIntakeAnswers` mappar i dag över befintliga rader och ändrar dem. Den
**lägger aldrig till**. En valfråga som skapar en rad bryter det antagandet.

Hållet snävt: **bara valfrågor får skapa rader, och högst en rad per fråga.**
Då är radmängden fortfarande härledbar ur upplägget plus frågorna. Fri
påbyggnad ur hela artikelbanken mitt i ett frågeflöde hör hemma i dokumentet,
som sedan rivningen är enda radeditorn.

### Följd 1: två pass

Struktur först (val och tillval avgör *vilka* rader som finns), mängder sedan.
Annars kan en mängdfråga peka på en rad som ännu inte skapats.

### Följd 2: den rena modulen kan inte uppfinna en rad

`applyIntakeAnswers<T extends IntakeRow>(rows: readonly T[]): T[]` — den kan
mappa `T` till `T`, men den kan inte **skapa** ett `T` ur tomma intet.
`IntakeRow` är dessutom ett internt minimigränssnitt (id, item_type,
description, unit, quantity, linked_product_id, option_selected,
option_default) medan den riktiga offertraden bär mer, bland annat `unit_price`.

Därför: **anroparen levererar radbyggaren.**

```ts
applyIntakeAnswers(rows, questions, answers, {
  buildRow?: (article: { id: string; name: string; unit: string; sales_price: number }) => T
})
```

Det löser samtidigt kravet att priset ska hämtas vid tillämpning: uppslaget
bor i byggaren, hos den som har databasen — inte i den rena modulen, som ska
förbli fri från pris- och DB-kunskap.

## Tre fallgropar som avgör om det blir bra eller buggigt

1. **Stabilt rad-id, härlett ur frågans id.** Annars lägger ett omtaget svar
   till ännu en rad i stället för att ersätta den förra. Samma mönster som
   `templateArticleId` (`lib/onboarding/template-articles.ts`) redan använder.
2. **Priset hämtas vid tillämpning, inte när frågan skrevs.** Annars ruttnar
   priserna i frågeflödet medan artikelbanken uppdateras.
3. **`sales_price = 0` betyder "pris saknas"** i den här kodbasen
   (`lib/products/pricing-state.ts`), och alla härledda artiklar är prislösa
   med flit. Ett alternativ som pekar på en sådan får inte tyst ge en
   0 kr-rad — **editorn ska säga ifrån när frågan skrivs.**

## Vakten behöver inte röras

`intakeRowTakesQuantity` (rad 219) kräver `item_type === 'item'` och en ifylld
`linked_product_id`. En rad byggd ur en artikel bär per definition båda och
passerar redan.

## Ordning

1. `choices`-formen i typ + `validateIntakeQuestions` (fältlistan är sluten —
   nya fält måste läggas till där, annars kastar den)
2. Editorns alternativrad med artikelväljare + varning för prislös artikel
3. `applyIntakeAnswers` i två pass, med `buildRow` från anroparen
4. `QuoteBuilder` levererar byggaren och artikeluppslaget
5. Frågeflödets yta: valfrågan visar vad alternativet lägger till, på samma
   sätt som mängdfrågan i dag säger *"Sätter: Klinker golv, Tätskikt"*

## Verifiering

- Facit i `tests/intake-questions.spec.ts`: ett omtaget val **ersätter** raden
  (muteras: ta bort id-härledningen → två rader)
- Två pass bevisat: en mängdfråga som pekar på en rad skapad av en valfråga
  får sin mängd (muteras: kör mängdpasset först → mängden tappas)
- En valfråga mot en artikel med `sales_price = 0` ger fel i editorn, inte en
  tyst 0 kr-rad
- `tests/intake-flow.ui.spec.ts` utökas med en valfråga, renderad i 375 px och
  tittad på
- Ingen SQL: `intake_questions` är jsonb och 0 rader bär sparade frågor
