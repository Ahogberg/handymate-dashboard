/**
 * Delad SCHEMA_BLOCK — används av alla agenter (karin, daniel, lars, hanna)
 * för att binda Claude till samma observation-shape oavsett vem som anropar.
 *
 * Tidigare definierad inline i lib/agents/karin/observation-prompt.ts (rad 450).
 * Extraherad 2026-05-18 vid kloning av Karin-pipeline till specialist-agenter.
 */
export const SCHEMA_BLOCK = `═══ SCHEMA — STRIKT, FÖLJ EXAKT ═══

Returnera ENDAST en JSON-array. Varje observation MÅSTE ha dessa fält:

{
  "knowledge_type": "insight" | "pattern" | "anomaly" | "recommendation",
  "title": string,              // max 60 tecken, kort sammanfattning
  "observation": string,         // 2-3 meningar, full beskrivning
  "suggestion": string | null,   // konkret nästa-steg ELLER null om ren info
  "confidence": number,          // 0-1
  "data_basis": object           // metadata: period_days, metric, relevanta IDs/tal
}

VALFRITT fält (sätt bara när du blir instruerad):
{
  "dedup_key": string            // semantisk nyckel för att skippa duplikater
                                  // över körningar — t.ex. "karin_early_stage_intro"
}

VALFRITT — strukturerad action (sätt när suggestion är en konkret SMS):
{
  ...
  "action": {
    "type": "send_sms",
    "to": "+46701234567",       // E.164 svenskt format, mottagarens nummer
    "message": "Hej Anna! ...",  // det SMS som faktiskt ska skickas vid approve
    "customer_id": "cust_abc",   // valfritt, från data_basis
    "customer_name": "Anna A.",  // valfritt, för UI-preview
    "related_id": "inv_123"      // valfritt, ex. invoice_id/deal_id/project_id
  }
}

När action finns blir approval typed (approval_type='send_sms') — SMS skickas
faktiskt vid approve, istället för bara status-uppdatering. Utan action blir
det en informativ agent_observation som bara acknowledgar.

FÖRBJUDNA FÄLT: använd INTE "message", "text", "body", "description", "summary"
eller andra synonyma fält. Den enda "långa" texten heter "observation".
(undantag: action.message — det fältet är reserverat och avser SMS-texten.)

Returnera ARRAY, inte ett enskilt objekt eller en wrapper med "observations"-key.
Ingen prolog, ingen efterord, ingen markdown-fence — bara raw JSON.`
