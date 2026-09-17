---
name: databasen-ar-facit
description: Slå upp tabeller, kolumner, defaultvärden och verkliga rader i produktionsdatabasen innan du skriver kod eller drar en slutsats. Använd vid all SQL, nya eller ändrade queries, migrationer, schemafrågor ("finns kolumnen?"), rapporter och statistik, och när ett resultat är tomt, noll eller oväntat.
---

# Repots deklarerade schema är inte facit. Databasen är facit.

`sql/`-filerna säger vad vi *tänkte*. Produktionsdatabasen säger vad som
*finns*. De har gått isär förr, och varje gång kostade det en funktion som
tyst inte fungerade: `checklist_template` saknade `category` i en månad
eftersom ett `CREATE TABLE IF NOT EXISTS` blev en tyst no-op mot en
handbyggd tabell, och demons återställning föll på det varje natt.

Claude har stående tillstånd för all SQL via Supabase MCP (projekt
`pktaqedooyzgvzwipslu`) — fråga inte om lov, kör. Men:

## Regler

1. **Gissa aldrig.** Före en query mot en tabell du inte nyss läst:
   ```sql
   select column_name, data_type, column_default, is_nullable
   from information_schema.columns
   where table_schema='public' and table_name='<tabell>' order by ordinal_position;
   ```
   Gäller även kolumner du "vet" finns. `business_config` har ingen
   `name`-kolumn, `business_id` är TEXT och inte UUID, och `businesses` i
   dokumentationen heter `business_config` i verkligheten.

2. **Migrationsfilen först, sedan körningen.** `sql/vNNN_<vad>.sql` ligger i
   git innan den körs, med ett filhuvud som säger varför och vad som
   verifierades läsande. Destruktivt (DELETE/DROP/TRUNCATE) körs också utan
   att fråga, men avgränsat med WHERE på `business_id` eller motsvarande.

3. **Verifiera med en SELECT direkt efteråt** och skriv i chatten vad som
   kördes och vad det gav. En `UPDATE` utan efterkontroll är ett påstående.

4. **En oläst `.error` är en förlorad skrivning.** Destrukturera alltid, och
   var särskilt vaksam på UPDATE med flera kolumner: en fantomkolumn gör att
   *hela* skrivningen försvinner, inte bara den kolumnen.

## En nolla är inte ett svar

Det här är regeln som kostat oss mest. En tom SELECT ser **exakt likadan ut**
oavsett om verkligheten är tyst eller frågan är fel.

Innan du rapporterar noll som en nyhet:

```sql
select count(*) as totalt, max(created_at) as senaste from <tabell>;
```

- **Totalt 0 rader någonsin** = mätfel eller en okopplad väg. Inte en tyst
  natt. Säg vilket.
- **Rader finns men inte i ditt fönster** = verkligheten är tyst. Det är ett
  riktigt svar.

Morgonrapporten frågade i tre dagar efter `agent_runs` med `agent_id='lisa'`
och `trigger_type='phone_call'`. Den kombinationen har aldrig funnits — samtal
ligger i `call_recording`. Rapporten svarade "0 samtal" varje morgon, vilket
lästes som "Lisa gjorde inget".

## Testa mot riktig SQL när det går

`tests/helpers/job-standard-db.ts` kör riktig PostgreSQL i processen (PGlite)
med schemat läst ur `sql/`-filerna. Den fångar det en mock aldrig kan: CHECK-
villkor, partiella unika index, triggerprivilegier, FK per tenant. Lägger du
en ny migration som testerna berör: lägg till `readFileSync` för den i
helpern, annars testar du mot ett gammalt schema.

Trigger- och RLS-ändringar provas med **källtabellens verkliga skrivroller** —
`authenticated` INSERT/UPDATE, inte bara ägare och `service_role`.
