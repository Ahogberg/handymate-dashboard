# Lessons Learned

## business_config.business_id är TEXT, inte UUID
- **Fel 1:** `REFERENCES business_config(id)` → kolumnen heter `business_id`
- **Fel 2:** `business_id UUID REFERENCES business_config(business_id)` → typerna matchar inte (uuid vs text)
- **Rätt:** `business_id TEXT REFERENCES business_config(business_id)`
- **Regel:** business_config har `business_id TEXT` som PK — kontrollera alltid kolumnnamn OCH datatyp innan du skriver REFERENCES/FK
