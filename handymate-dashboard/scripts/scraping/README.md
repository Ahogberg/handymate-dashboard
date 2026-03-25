# Handymate Outreach Scraper

Scrapar hantverkare från Google Maps + Easoft-kunder via Firecrawl.

## Setup

```bash
# Installera beroenden (redan gjort)
npm install @mendable/firecrawl-js

# Sätt FIRECRAWL_API_KEY i .env.local
FIRECRAWL_API_KEY=fc-xxxxx
```

## Kör

```bash
# Scrapa och exportera till CSV
npx ts-node scripts/scraping/scrape-craftsmen.ts

# Scrapa + importera direkt till Supabase
npx ts-node scripts/scraping/scrape-craftsmen.ts --import
```

## Output

CSV-filer sparas i `scripts/scraping/output/leads-YYYY-MM-DD.csv`

Kolumner:
- `name` — Företagsnamn
- `phone` — Mobilnummer (+46-format)
- `city` — Stad
- `industry` — Bransch
- `source` — google_maps / easoft
- `sms_text` — Personaliserad SMS-text
- `website` — Hemsida
- `reviews_count` — Antal Google-recensioner

## Vad den gör

1. Söker Google Maps efter hantverkare i Stockholm (5 branscher)
2. Söker efter Easoft-kunder (konkurrent-outreach)
3. Filtrerar: bara svenska mobilnummer, inga dubletter
4. Genererar personaliserad SMS per lead
5. Exporterar till CSV
6. (Valfritt) Importerar till Supabase leads-tabell

## Begränsningar

- Max 50 leads per körning
- 2 sekunders delay mellan Firecrawl-anrop
- Bara mobilnummer (07X / +467X)
