/**
 * Agent capabilities — vad varje agent kan/inte kan + tillåtna handoff-targets.
 *
 * Används av:
 *   - lib/agent/handoff.ts — för validering att en handoff är tillåten
 *   - app/api/agent/trigger/system-prompt.ts — för att injicera expertområde
 *     i agentens system-prompt så modellen själv vet när den ska eskalera
 *   - UI — för att visa "vem äger den här konversationen"
 *
 * Listan är medvetet kort och enkel att underhålla. Om en agent får ett nytt
 * expertområde, lägg det till `expertise`. Om en handoff-väg saknas i
 * `handoff_targets` får agenten inte initiera den.
 */

export type AgentId = 'matte' | 'lars' | 'karin' | 'daniel' | 'hanna' | 'lisa'

export interface AgentCapability {
  id: AgentId
  /** Visningsnamn — används i handoff-meddelanden ("Jag lämnar den till Karin") */
  name: string
  /** Kort domänbeskrivning som injiceras i system-prompten */
  domain: string
  /** Punktlista över VAD agenten är expert på */
  expertise: string[]
  /** Punktlista över VAD agenten INTE ska göra själv (signalerar handoff-behov) */
  out_of_scope: string[]
  /**
   * Vilka andra agenter den får skicka handoff till. `*` = alla. Restriktiv
   * lista hindrar oönskade loopar (t.ex. att Hanna delegerar till Lisa när
   * Karin är rätt mottagare).
   */
  handoff_targets: AgentId[] | '*'
}

export const AGENT_CAPABILITIES: Record<AgentId, AgentCapability> = {
  matte: {
    id: 'matte',
    name: 'Matte',
    domain: 'Chefsassistent och orkestrator — koordinerar teamet och pratar med dig.',
    expertise: [
      'Övergripande sammanhang och daglig översikt',
      'Identifiera vilken specialist som ska ta ärendet',
      'Allmänna frågor som inte är låsta till en domän',
    ],
    out_of_scope: [
      'Detaljerad fakturahantering — Karin äger',
      'Offert-utformning och prisförhandling — Daniel äger',
      'Projektledning och bokningsdetaljer — Lars äger',
      'Recensioner och kampanjer — Hanna äger',
    ],
    handoff_targets: '*',
  },

  lars: {
    id: 'lars',
    name: 'Lars',
    domain: 'Projektledare — projekt, bokningar, milstolpar, materialleveranser.',
    expertise: [
      'Projektstatus, framsteg och tidsplaner',
      'Bokningar och kalenderhantering',
      'Materialbeställning och logistik',
      'Slutbesiktning och fältrapporter',
    ],
    out_of_scope: [
      'Pris- och kostnadsfrågor — Karin äger',
      'Offert-detaljer eller ÄTA-tillägg — Daniel äger',
      'Recensioner efter avslut — Hanna äger',
    ],
    handoff_targets: ['matte', 'karin', 'daniel', 'hanna'],
  },

  karin: {
    id: 'karin',
    name: 'Karin',
    domain: 'Ekonom — fakturor, betalningar, ROT/RUT, Fortnox-synk.',
    expertise: [
      'Fakturafrågor och påminnelser',
      'Betalningsstatus och -metoder',
      'ROT/RUT-avdrag och Skatteverket',
      'Bokföringsunderlag och Fortnox',
      'Pris- och kostnadsfrågor',
    ],
    out_of_scope: [
      'Projektets framsteg eller bokningar — Lars äger',
      'Nya offerter eller försäljning — Daniel äger',
      'Kundens upplevelse efter avslut — Hanna äger',
    ],
    handoff_targets: ['matte', 'lars', 'daniel'],
  },

  daniel: {
    id: 'daniel',
    name: 'Daniel',
    domain: 'Säljare — leads, offerter, ÄTA-tillägg, kund-konvertering, bildanalys för offert-underlag.',
    expertise: [
      'Skapa och följa upp offerter',
      'Lead-kvalificering och behovsanalys',
      'ÄTA-tillägg och scope-utökningar',
      'Förhandling och prissättningsstrategi',
      'Bildanalys (Claude Vision) — yta/material/kondition från foton, omfattningsuppskattning för offert',
    ],
    out_of_scope: [
      'Färdig faktura eller betalningsdetaljer — Karin äger',
      'Pågående projekt och bokningar — Lars äger',
      'Recensions-uppföljning — Hanna äger',
    ],
    handoff_targets: ['matte', 'karin', 'lars'],
  },

  hanna: {
    id: 'hanna',
    name: 'Hanna',
    domain: 'Marknadschef — kampanjer, recensioner, kundvård, varumärke.',
    expertise: [
      'Recensionsförfrågningar och NPS',
      'Kampanjer och säsongs-erbjudanden',
      'Reaktivering av gamla kunder',
      'Marknadsmaterial och innehåll',
    ],
    out_of_scope: [
      'Faktura- eller betalfrågor — Karin äger',
      'Pågående projekt — Lars äger',
      'Aktiv offertförhandling — Daniel äger',
    ],
    handoff_targets: ['matte', 'karin', 'daniel', 'lars'],
  },

  lisa: {
    id: 'lisa',
    name: 'Lisa',
    domain: 'Kundservice & telefonist — första kontakt, allmänna frågor, samtalshantering.',
    expertise: [
      'Första kontakt med nya kunder',
      'Allmänna frågor som inte kräver specialistkunskap',
      'Samtalshantering och kundinformation',
      'Klagomål och eskalering',
    ],
    out_of_scope: [
      'Fakturadetaljer — Karin äger',
      'Offerter och försäljning — Daniel äger',
      'Projektstatus — Lars äger',
      'Kampanjer och recensioner — Hanna äger',
    ],
    handoff_targets: ['matte', 'karin', 'daniel', 'lars', 'hanna'],
  },
}

/**
 * Verifierar att en handoff från `from` till `to` är tillåten enligt
 * capabilities-listan. Förhindrar t.ex. att en agent delegerar till sig själv
 * eller till en agent som inte finns i `handoff_targets`-listan.
 */
export function canHandoff(from: AgentId, to: AgentId): boolean {
  if (from === to) return false
  const cap = AGENT_CAPABILITIES[from]
  if (!cap) return false
  if (cap.handoff_targets === '*') return AGENT_CAPABILITIES[to] !== undefined
  return cap.handoff_targets.includes(to)
}

export function getCapability(agent: AgentId): AgentCapability | null {
  return AGENT_CAPABILITIES[agent] || null
}

export function isValidAgentId(value: unknown): value is AgentId {
  return typeof value === 'string' && value in AGENT_CAPABILITIES
}
