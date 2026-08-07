/**
 * Lanseringssynlighet — vad kunden får hitta vid lansering (2026-08-07).
 *
 * ═══ VARFÖR DEN INTE ÄR SAMMA SAK SOM featureGate ═══
 *
 * `featureGate` (lib/feature-gates.ts) svarar på **"ingår detta i din plan?"**. Den
 * renderar hänglås och texten "Ingår i Professional/Business" — alltså ett erbjudande:
 * betala mer så låses det upp.
 *
 * Den här filen svarar på en annan fråga: **"har vi skeppat detta?"**. Att blanda ihop
 * dem ger ett falskt löfte — en funktion som inte är byggd får inte se ut som ett betalt
 * tillval, för då kan kunden uppgradera och ändå inte få något.
 *
 * `Utskick (Leads)` låg tidigare bakom `featureGate: 'leads_outbound'` och gjorde precis
 * det. Den ligger nu här i stället, som `soon`.
 *
 * ═══ TVÅ TILLSTÅND ═══
 *
 * - `hidden` — finns i koden men ska inte gå att upptäcka. Länken bort, och routen
 *   omdirigeras (se middleware.ts) så en sparad URL inte landar i en halvfärdig vy.
 * - `soon` — syns, men märkt "Kommer snart" och utan hänglås. Routen grindas också;
 *   markeringen är ett löfte om framtiden, inte en ingång.
 *
 * ═══ ATT DÖLJA MENYLÄNKEN RÄCKER INTE ═══
 *
 * En dold meny med kvarvarande knapp är sämre än att inte dölja alls — kunden hamnar i
 * en halvfärdig vy utan väg tillbaka. Grossistfunktionen har ingångar både i
 * offertskaparen och i projektvyn utöver inställningslänken. Alla ska läsa samma nyckel
 * härifrån.
 */

export type LaunchState = 'hidden' | 'soon'

/**
 * Nyckel → tillstånd. Nyckeln används av sidomenyn, inställningshubben och av knappar
 * inne i offerter och projekt, så att en funktion inte kan vara dold på ett ställe och
 * synlig på ett annat.
 */
export const LAUNCH_GATES: Record<string, LaunchState> = {
  // Andreas beslut 2026-08-07: ur lanseringsnavigationen.
  my_website: 'hidden',
  website_widget: 'hidden',

  // "Övrigt"-gruppen. Båda är påbörjade men inte färdiga för kund.
  vehicles: 'hidden',
  inventory: 'hidden',

  // Grossist: prislista, kopplingar, materialbeställningar och underleverantörer.
  // Har ingångar utanför menyn — se filhuvudet.
  wholesaler: 'hidden',
  subcontractors: 'hidden',

  // Teknisk vy, aldrig avsedd för kund.
  system_health: 'hidden',

  // Byggd men inte redo. Märks "Kommer snart" i stället för hänglås.
  leads_outbound: 'soon',
}

export function launchState(key: string | undefined | null): LaunchState | null {
  if (!key) return null
  return LAUNCH_GATES[key] ?? null
}

/** Dold för kund — länken ska inte renderas alls. */
export function isLaunchHidden(key: string | undefined | null): boolean {
  return launchState(key) === 'hidden'
}

/** Syns men är inte klar — rendera "Kommer snart", aldrig hänglås. */
export function isComingSoon(key: string | undefined | null): boolean {
  return launchState(key) === 'soon'
}

/**
 * Etiketten som visas vid `soon`.
 *
 * Ordvalet är inte hittepå: den nativa appen använder redan exakt "Kommer snart." för
 * Integrationer och Fakturering (handymate-mobile app/(tabs)/profile.tsx). Samma ord på
 * alla ytor — kunden ska inte möta tre formuleringar för samma sak.
 */
export const COMING_SOON_LABEL = 'Kommer snart'

/**
 * Rutter som grindas, längsta prefix först.
 *
 * Läses av middleware.ts. Ordningen spelar roll: `/dashboard/settings/website-widget`
 * måste matcha före en eventuell kortare `/dashboard/settings`-regel.
 */
const GATED_ROUTES: Array<{ prefix: string; key: string }> = [
  { prefix: '/dashboard/settings/website-widget', key: 'website_widget' },
  { prefix: '/dashboard/settings/pricelist', key: 'wholesaler' },
  { prefix: '/dashboard/settings/inventory', key: 'inventory' },
  { prefix: '/dashboard/settings/system-health', key: 'system_health' },
  { prefix: '/dashboard/planning/inventory', key: 'inventory' },
  { prefix: '/dashboard/subcontractors', key: 'subcontractors' },
  { prefix: '/dashboard/orders', key: 'wholesaler' },
  { prefix: '/dashboard/vehicles', key: 'vehicles' },
  { prefix: '/dashboard/website', key: 'my_website' },
  { prefix: '/dashboard/marketing/leads', key: 'leads_outbound' },
]

/**
 * Vilken lanseringsnyckel grindar den här sökvägen? `null` = fri väg.
 *
 * Både `hidden` och `soon` grindas. En "Kommer snart"-markering som ändå går att klicka
 * sig förbi vore samma osanning som hänglåset den ersatte.
 */
export function launchGateForPath(pathname: string): string | null {
  for (const r of GATED_ROUTES) {
    if (pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)) return r.key
  }
  return null
}
