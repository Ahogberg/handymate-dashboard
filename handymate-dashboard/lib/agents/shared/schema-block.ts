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

FÖRBJUDNA FÄLT: använd INTE "message", "text", "body", "description", "summary"
eller andra synonyma fält. Den enda "långa" texten heter "observation".

Returnera ARRAY, inte ett enskilt objekt eller en wrapper med "observations"-key.
Ingen prolog, ingen efterord, ingen markdown-fence — bara raw JSON.`
