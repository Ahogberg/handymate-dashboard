/**
 * Centraliserat modell-val för Anthropic Claude-anrop. Använd istället för
 * hårdkodade modell-strängar för att hindra cost-läckor (TD-77-lärdom: vi
 * hittade 21+ Sonnet-användningar varav 4 var rena background-tasks som
 * kostade 10× mer än Haiku räcker till).
 *
 * Modell-strängar (från CLAUDE.md, uppdateras vid model-releases):
 *   - 'claude-sonnet-4-6' (live, kvalitetsviktiga svar)
 *   - 'claude-haiku-4-5-20251001' (background, extraction, low-stakes)
 *   - 'claude-opus-4-7' (när absolut bäst krävs — sällan)
 */

export type ClaudeTaskType =
  /** User väntar på svar i UI/SMS/voice. Sonnet 4.6 ger bäst kvalitet utan att vara för dyr. */
  | 'live-customer'
  /** Cron, batch, post-process, eval — låg-stakes där Haiku räcker. */
  | 'background'
  /** Strukturerad data-extraction från text (JSON-output, classification). Haiku räcker. */
  | 'extraction'
  /** Multi-step reasoning där absolut bäst krävs (analytics, kritiska beslut). Sällan. */
  | 'reasoning-heavy'

export function getClaudeModel(taskType: ClaudeTaskType): string {
  switch (taskType) {
    case 'live-customer':
      return 'claude-sonnet-4-6'
    case 'reasoning-heavy':
      return 'claude-opus-4-7'
    case 'background':
    case 'extraction':
    default:
      return 'claude-haiku-4-5-20251001'
  }
}
