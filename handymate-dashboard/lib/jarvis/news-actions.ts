/**
 * Vilken åtgärd en nyhetsrad bär.
 *
 * ═══ FELET SOM RÄTTAS ═══
 *
 * `Ring upp` var hårdkodad till Lisa i JarvisHome. Varje annan agent fick en
 * rad utan väg vidare: Daniel kunde berätta att en lead kommit in utan att
 * man kunde öppna den, Karin att en betalning kommit utan väg till fakturan.
 * Nyheten blev en återvändsgränd — man fick leta upp saken själv i menyn,
 * vilket är precis det Jarvis-vyn finns för att slippa.
 *
 * ═══ REGELN ═══
 *
 * En nyhet är fortfarande INTE ett beslut. Åtgärden är alltid en LÄNK som
 * öppnar något — aldrig en knapp som utför. Skillnaden mellan "berättar" och
 * "föreslår" måste hålla, annars slutar man lita på att raderna utan ram är
 * ofarliga att skumma.
 *
 * Ren funktion — facit i tests/jarvis-news-actions.spec.ts.
 */

export type NyhetsIkon = 'telefon' | 'person' | 'dokument' | 'pengar'

export interface NyhetsAtgard {
  label: string
  href: string
  ikon: NyhetsIkon
}

/**
 * Relaterat objekt vinner alltid över agentens standardåtgärd — en rad om en
 * specifik offert ska öppna den offerten, inte offertlistan.
 */
const PER_AGENT: Record<string, NyhetsAtgard> = {
  // Matte koordinerar teamet i stället för ett eget ärendeslag — hennes väg
  // vidare är därför teamsidan, inte en lista.
  matte:  { label: 'Se teamet',     href: '/dashboard/agent',              ikon: 'person' },
  lisa:   { label: 'Ring upp',      href: '/dashboard/calls',              ikon: 'telefon' },
  daniel: { label: 'Se affären',    href: '/dashboard/pipeline',           ikon: 'person' },
  karin:  { label: 'Se fakturorna', href: '/dashboard/invoices',           ikon: 'pengar' },
  lars:   { label: 'Öppna schemat', href: '/dashboard/schedule',           ikon: 'dokument' },
  hanna:  { label: 'Se kampanjen',  href: '/dashboard/campaigns',          ikon: 'dokument' },
}

export function nyhetsAtgard(
  agentId: string | null | undefined,
  relaterat?: { typ?: string | null; id?: string | null } | null,
): NyhetsAtgard | null {
  const typ = relaterat?.typ
  const id = relaterat?.id
  if (typ && id) {
    if (typ === 'quote')    return { label: 'Öppna offerten', href: `/dashboard/quotes/${id}`,    ikon: 'dokument' }
    if (typ === 'invoice')  return { label: 'Öppna fakturan', href: `/dashboard/invoices/${id}`,  ikon: 'pengar' }
    if (typ === 'project')  return { label: 'Öppna projektet', href: `/dashboard/projects/${id}`, ikon: 'dokument' }
    if (typ === 'customer') return { label: 'Öppna kunden',   href: `/dashboard/customers/${id}`, ikon: 'person' }
  }
  if (!agentId) return null
  return PER_AGENT[agentId] ?? null
}
