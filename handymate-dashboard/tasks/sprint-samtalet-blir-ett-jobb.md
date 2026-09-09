# Sprint: Samtalet som blir ett jobb

Förslag skrivet natten till 2026-09-10, efter att kärnlöftet mättes för första
gången. Andreas invändning mot nattens arbetsordning var riktig: fem leveranser
om autentisering och larm gör produkten *ärlig*, men de flyttar inte
värdepropositionen. Det här är förslaget som gör det.

## Loopen

En hantverkare står på ett tak. Telefonen ringer. Han kan inte svara.

**Idag** (efter nattens rättningar): kunden får ett SMS, han får en notis. Sedan
måste han ringa upp, fråga vad de vill, skriva ner det, leta upp kunden eller
lägga in en ny, och börja på en offert. Fångsten är gjord, men allt arbete
återstår.

**Efter den här sprinten**: kunden svarar på SMS:et med vad de behöver. När han
klättrat ner ligger det ett kort:

> **Anna Andersson, Solvägen 12** vill byta proppskåp i villa.
> *"Hej, proppskåpet är från 70-talet och en säkring går hela tiden. Villa,
> byggd 1974. Kan ni titta?"*
> Kunden är ny — jag har lagt in henne.
> **Gör offert** · Ring upp · Avvisa

Han gjorde ingen intag. Han svarade på en fråga.

Det är propositionen ordagrant: *agentteamet gör förarbetet, du bestämmer*. Och
det är den kortaste vägen från fångat samtal till vunnet jobb — den enda kedjan
som tar in pengar.

## Varför just den här, och inte något annat

Fyra kandidater vägdes:

| Kandidat | Varför inte först |
|---|---|
| **Offerten skriver sig själv** — rätt rader ur firmans egen prislista | Starkt, men kräver att underlaget kommer in strukturerat. Den här sprinten är förutsättningen. |
| **Dagens kvitto** — vad teamet gjorde, vad som väntar | Högt upplevt värde, låg risk, men det *rapporterar* arbete i stället för att ta bort det. |
| **Ingen förfrågan tappas** — synlig journal över allt inkommande | Viktigt (Codex L04), men defensivt. Det gör oss pålitliga, inte värdefulla. |
| **Samtalet blir ett jobb** ← | Tar bort arbete, kortast väg till intäkt, och ~70 % är byggt. |

Och ett skäl som väger tyngre än alla fyra: **vi lovar det redan.** Det SMS som
går ut dygnet runt sedan i natt säger ordagrant *"Svara på detta SMS med vad du
behöver hjälp med, så återkommer vi direkt"*. Inkommande SMS har aldrig fungerat
— noll rader i hela databasens historia. Vi ber alltså kunden om något som
går rakt ner i ett svart hål. Det är den mest konkreta lucka mellan löfte och
produkt som finns just nu.

## Vad som redan finns

- **Utgående fångst-SMS**: seedad regel, dygnet runt sedan `e9db9e12`. Fungerar,
  bevisat med riktigt samtal 2026-09-09 22:16.
- **Golden path**: `lib/leads/golden-path.ts` `createLeadAndDeal` — skapar kund,
  lead och affär med dedup på telefonnummer. Testad och använd.
- **Kundmatchning**: `lib/voice/find-customer-by-phone.ts`.
- **Klassificering**: `app/api/voice/analyze` med allowlist i
  `lib/voice/analysis-scope.ts` (`quote | follow_up | callback | reminder |
  reschedule | customer_fact | ata`).
- **Offertutkast**: `lib/quotes/suggest-quote-draft.ts`, som redan skapar
  godkännandekort.
- **Inkommande SMS-rutt**: `app/api/sms/incoming/route.ts` finns, med
  tenantupplösning som avstår vid tvetydig avsändare (bra) — men har aldrig
  tagit emot ett anrop.

## Vad som saknas — fyra saker, alla små

1. **Inkommande SMS måste nå fram.** Nattens grindfix (`lib/elks-webhook-auth.ts`)
   är förutsättningen. Kvar: bevisa den med ett riktigt SMS, och koppla svaret
   till det missade samtalet det svarar på (matcha på avsändarnummer inom ett
   tidsfönster) så kontexten hamnar rätt.

2. **Okänd avsändare ska bli kund.** `createLeadAndDeal` är inkopplad i
   `app/api/voice/incoming/route.ts:98` men ligger inuti onboardingens armerade
   ringtest-fönster (`isTestCallArmed`, rad 91). Lyft ut den till den generella
   vägen — både för samtal och för SMS-svar. Dedup finns redan.

3. **Svaret ska bli kontext, inte bara en rad.** Kör SMS-texten genom samma
   klassificering som samtalsanalysen, och fäst resultatet som `customer_fact`
   på kunden med den ordagranna texten som `evidence_quote`. Kolumnen finns
   (v122).

4. **Ett kort, inte fem.** Ett `lead_review`-kort som bär kundens ord, vad vi
   tror de vill, om kunden är ny eller känd, och en direktväg till offert.
   Kortformen finns; det som saknas är att fylla den från den här vägen.

## Hur vi bevisar den

Två personer, två telefoner, en eftermiddag. Inga utvecklarverktyg.

1. Christopher ringer firmans nummer från ett nummer som inte finns i registret.
   Ingen svarar.
2. Han får fångst-SMS:et och svarar med en verklig förfrågan i fritext.
3. Andreas tittar i appen: finns kunden, finns kortet, står kundens egna ord
   där, och leder **Gör offert** till ett utkast som stämmer?
4. Samma sak igen från ett nummer som *finns* i registret — då ska det landa på
   den befintliga kunden, inte skapa en dubblett.
5. Och en gång där Christopher svarar något obegripligt — då ska kortet säga att
   vi inte förstod, aldrig gissa ett jobb.

Godkänt är att Andreas inte behöver förklara någon knapp, och att ingen av oss
rör databasen.

## Vad den gör med pitchen

Idag säljer vi *"vi fångar missade samtal"*. Det är en telefonsvarare med SMS.

Efter sprinten säljer vi *"du får jobbet färdigt att prissätta innan du kommit
ner från taket"*. Det är en annan produkt, och det är den produkt hemsidan
egentligen beskriver.

## Avgränsning

Ingen agent som svarar och för ett samtal — Lisa som samtalspartner är ett
senare bygge (beslut Andreas 2026-09-09). Ingen transkribering i den här
sprinten; den kräver inspelning, som kräver consent-fixen, och den är punkt 17.
Den här sprinten går enbart på text, vilket är billigare och räcker för loopen.

## Förhållande till Codex tre kundresor

Det här *är* första halvan av hans kundresa 2, byggd och bevisad i stället för
kartlagd. Hans metod är riktig — kör resorna, låt avbrotten styra. Invändningen
är att tre kompletta resor mot verkliga externa system inte är ett femdagarsarbete,
och att en resa bevisad slår tre resor inventerade när det är sex dagar till
lansering.
