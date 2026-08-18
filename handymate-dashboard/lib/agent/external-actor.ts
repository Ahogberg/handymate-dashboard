/**
 * V1-gräns för Lisa Voice steg 1b (tasks/lisa-voice-plan.md, korrigering 1;
 * plan: C:\Users\Gaming\.claude\plans\jaunty-pondering-hummingbird.md,
 * Etapp S).
 *
 * external_customer = OIDENTIFIERAD extern uppringare/chattare. Ett
 * telefonnummer kopplat till ett företag bevisar INTE vem som ringer — det
 * bevisar bara att numret finns i kundregistret. Före ett riktigt
 * verifieringskoncept (V2, se röstplanens leveransplan) får en extern aktör
 * ALDRIG nå kundpost-scopade, skrivande eller ekonomiska verktyg.
 *
 * AUDIT (2026-08-18) av samtliga 45 verktyg i app/api/agent/trigger/
 * tool-definitions.ts (facit över hela genomgången: tests/external-actor.spec.ts,
 * EXTERNAL_DENIED_TOOLS): inget av dem är rent identitetsneutralt. De som
 * ser läsande ut visade sig vid granskning ändå läcka tenant-data eller
 * intern affärsinformation till en oautentiserad uppringare:
 *   - check_calendar berikar bokningar med KUNDNAMN (tool-router.ts,
 *     checkCalendar: "2. Enrich with customer names") — kundpost-scopat,
 *     trots att det ser ut som en ren "lediga tider"-fråga.
 *   - get_automation_settings, get_daily_stats, check_pending_approvals,
 *     get_agent_messages m.fl. exponerar interna affärsnyckeltal/policyer
 *     (intäkter, godkännandekrav, minsta jobbvärde) — inte avsett för en
 *     extern part, även om det inte är kund-PII.
 *   - Alla övriga är antingen kundpost-scopade (get_customer,
 *     search_customers, get_quotes, get_lead, get_communication_trail, …)
 *     eller skrivande/ekonomiska (create_*, update_*, send_*, log_time,
 *     trigger_fortnox_sync, confirm_mission, …).
 * Det finns i dagsläget INGEN dedikerad "öppettider"/"lediga tider utan
 * kunddata"-läsning i verktygslistan. Resultatet är en medvetet TOM
 * vitlista — hellre det än att gissa fel (Codex S-skärpning 1, ANTAGEN;
 * "hellre tom lista än generös").
 *
 * När ett riktigt identitetsneutralt läsverktyg byggs (t.ex. en framtida
 * ren "öppettider"-fråga som INTE går via check_calendar och inte rör
 * kunddata) läggs det till i EXTERNAL_SAFE_TOOLS nedan EXPLICIT, med egen
 * motiveringsrad — och tests/external-actor.spec.ts uppdateras i samma
 * ändring (annars fallerar täckningstestet).
 *
 * DUBBELGRIND (Codex S-skärpning 2, ANTAGEN — mirrorar chattens
 * per-agent-gränser, se app/api/matte/chat/route.ts isToolAllowedForAgent
 * och tests/agent-tool-boundaries.spec.ts P0.2):
 *   1. lib/agent/agents/shared.ts filterTools() — modellen ser aldrig ett
 *      icke-vitlistat verktyg för en extern aktör.
 *   2. app/api/agent/trigger/tool-router.ts executeTool() — även om
 *      modellen ändå hallucinerar/injicerar ett verktygsnamn nekas
 *      exekveringen HÄR, före switchen, oavsett vilken specialists
 *      allowedTools-lista (lib/agents/personalities.ts) verktyget annars
 *      tillhör.
 * Denna fil är den ENDA källan till sanning för klassificeringen — båda
 * grindarna anropar isToolAllowedForActor().
 *
 * V1-GRÄNS: ingen runtime-väg sätter actorType: 'external_customer' än —
 * inget UI eller API är kopplat. Det här är ren groundwork (avriskning) för
 * Lisa Voice V2 (verifieringskonceptet + kundscopade verktyg).
 */

export type ActorType = 'internal_user' | 'external_customer'

/**
 * Sluten vitlista. Se filhuvudet för varför den är tom i V1 — varje
 * framtida tillägg måste vara identitetsneutralt, icke-skrivande och fritt
 * från kundpost-data, med en egen kommentarsrad som förklarar varför just
 * det verktyget klarar granskningen.
 */
export const EXTERNAL_SAFE_TOOLS: ReadonlySet<string> = new Set<string>([])

/**
 * Neutral svensk avvisningstext — avslöjar aldrig verktygsnamn eller
 * interna förmågor för en extern part.
 */
export const EXTERNAL_TOOL_DENIED_MESSAGE = 'Det här verktyget är inte tillgängligt i det här läget.'

/**
 * Sant om verktyget får nås av den här aktören.
 *
 * Intern/odefinierad aktör (actorType saknas eller är 'internal_user') =
 * dagens obegränsade beteende — den här funktionen lägger INGEN ny
 * begränsning på interna vägar. Bara per-agent-allowlistan i
 * personalities.ts gäller där, precis som förut.
 *
 * Extern aktör ('external_customer') får ENBART det som står i
 * EXTERNAL_SAFE_TOOLS, oavsett vilken agent-allowlista verktyget annars
 * tillhör — identiteten är den snävare gränsen.
 */
export function isToolAllowedForActor(toolName: string, actorType?: ActorType): boolean {
  if (actorType !== 'external_customer') return true
  return EXTERNAL_SAFE_TOOLS.has(toolName)
}
