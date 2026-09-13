# Rapportkontinuitet per företag

`WORK_REPORT_CONTINUITY_BUSINESS_IDS` är en kommaseparerad lista med exakta business_id. När listan är icke-tom gäller funktionen endast dessa företag, oavsett den globala flaggans värde. Identiteten kommer från autentiseringen, aldrig från klientens body eller query.

Utan lista gäller den befintliga `WORK_REPORT_CONTINUITY_ENABLED=true` för global aktivering. Produktionens globala flagga ska vara av under pilotperioden. Avsluta piloten genom att ta bort listan medan globalflaggan är av och deploya på nytt.

Grinden gäller läsning, återupptagning, skapande och återhämtning av planer samt godkännande av redan signerade beständiga rapportdelar. Vanliga rapportförslag utan återupptagning påverkas inte. Befintliga rapporter raderas inte när piloten stängs.
