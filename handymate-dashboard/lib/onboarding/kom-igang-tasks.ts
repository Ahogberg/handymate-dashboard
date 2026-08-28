/**
 * "Teamet behöver detta för att hjälpa dig bättre" (Lager 3 / B7, 2026-08-27).
 *
 * Ersätter den identiska treradiga Kom igång-listan med uppgifter härledda
 * ur kontots RIKTIGA luckor. Varje uppgift säger vilken agent som behöver
 * den, vilket värde den låser upp, ungefär hur lång tid den tar och hur
 * systemet vet att den är klar (klar-regeln är signalen — aldrig ett
 * kryss användaren själv sätter).
 *
 * Fast prioritet: Lisa → Karin → Daniel → Matte → Hanna → push. Max EN
 * primär + två sekundära visas; resten väntar. Pushen föreslås BARA när
 * ett riktigt kort väntar — annars finns inget att få notis om.
 *
 * Ren funktion över signaler; DB-läsningen bor i
 * app/api/onboarding/kom-igang/route.ts.
 */
export interface KomIgangSignals {
  /** Testsamtal genomfört eller minst en inspelning. */
  ring_test: boolean
  /** Fortnox kopplat ELLER minst en faktura. */
  karin_has_invoice_data: boolean
  /** Minst en offert. */
  has_quote: boolean
  /** Minst ett Uppdrag (mission). */
  has_mission: boolean
  /** Antal kunder totalt. */
  customer_count: number
  /** Antal kunder med segment. */
  segmented_customer_count: number
  /** Minst en push-prenumeration. */
  pwa: boolean
  /** Antal väntande riktiga kort (inte team_intro). */
  pending_real_cards: number
  /**
   * Kundinflödet (Block B, 2026-08-28) — ur /api/onboarding/channel-health.
   * Saknas signalen (läsfel) visas ingen uppgift: hellre tyst än gissat.
   *  - any_lead_verified: minst en kanal har en riktig lead OCH affär —
   *    det ENDA som får betyda "kundinflödet fungerar".
   *  - any_channel_verified: en kanal har nåtts (samtal/mejl/widget) —
   *    får bara användas för att säga att kanalen nåtts, inte att inflödet
   *    fungerar.
   *  - fler_jobb: kunden valde "Få in fler jobb" i onboardingen — uppgiften
   *    går då först.
   *  - kanaler: en läsbar rad per kanal ("Telefon: provsamtal mottaget · …").
   */
  kundinflode?: {
    any_lead_verified: boolean
    any_channel_verified: boolean
    fler_jobb: boolean
    kanaler: string
  }
}

export type KomIgangAgent = 'lisa' | 'karin' | 'daniel' | 'matte' | 'hanna'

export interface KomIgangTask {
  key: 'ring' | 'karin_data' | 'daniel_quote' | 'matte_mission' | 'hanna_segment' | 'pwa' | 'kundinflode'
  agent: KomIgangAgent
  label: string
  /** Vad som låses upp — en mening. */
  varde: string
  minuter: number
  href: string
  klar: boolean
}

export const KOM_IGANG_MAX_VISIBLE = 3

/**
 * Etiketterna för ett helt nytt konto (alla luckor öppna) — används av
 * onboardingens mock-dashboard så förhandsvisningen visar exakt det som
 * väntar på riktiga startsidan.
 */
export const KOM_IGANG_DEFAULT_LABELS: ReadonlyArray<string> = [
  'Ring ditt nummer — hör Lisa fånga samtalet',
  'Koppla Fortnox eller skicka din första faktura så Karin kan bevaka betalningarna',
  'Skapa din första offert så Daniel följer upp den',
]

export const KOM_IGANG_HEADING = 'Teamet behöver detta för att hjälpa dig bättre'

export function deriveKomIgangTasks(s: KomIgangSignals): KomIgangTask[] {
  // Kundinflödet: en uppgift som aldrig säger "fungerar" förrän en riktig
  // förfrågan blivit lead + affär (any_lead_verified). Nådd kanal ändrar bara
  // formuleringen. Väljs "Få in fler jobb" går den först, annars efter Lisa.
  const inflode: KomIgangTask | null = s.kundinflode ? {
    key: 'kundinflode', agent: 'hanna',
    label: s.kundinflode.any_lead_verified
      ? 'Kundinflödet är bevisat — en riktig förfrågan blev lead och affär'
      : s.kundinflode.any_channel_verified
        ? 'Kundinflödet är nått men inte bevisat — låt en provförfrågan bli lead och affär'
        : 'Bevisa att nya kunder når dig — skicka en provförfrågan hela vägen',
    varde: s.kundinflode.kanaler || 'Handymate säger aldrig att kundinflödet fungerar förrän en riktig förfrågan blivit lead och affär.',
    minuter: 5, href: '/dashboard/settings/integrations', klar: s.kundinflode.any_lead_verified,
  } : null
  const alla: KomIgangTask[] = [
    ...(inflode && s.kundinflode?.fler_jobb ? [inflode] : []),
    {
      key: 'ring', agent: 'lisa',
      label: 'Ring ditt nummer — hör Lisa fånga samtalet',
      varde: 'Lisa kan svara på missade samtal först när du hört hur det låter.',
      minuter: 2, href: '/dashboard/settings/phone', klar: s.ring_test,
    },
    ...(inflode && !s.kundinflode?.fler_jobb ? [inflode] : []),
    {
      key: 'karin_data', agent: 'karin',
      label: 'Koppla Fortnox eller skicka din första faktura så Karin kan bevaka betalningarna',
      varde: 'Karin hittar förfallna fakturor och föreslår påminnelser — utan fakturadata ser hon ingenting.',
      minuter: 5, href: '/dashboard/settings/integrations', klar: s.karin_has_invoice_data,
    },
    {
      key: 'daniel_quote', agent: 'daniel',
      label: 'Skapa din första offert så Daniel följer upp den',
      varde: 'Daniel påminner kunden när offerten legat obesvarad — du godkänner innan något skickas.',
      minuter: 5, href: '/dashboard/quotes/new', klar: s.has_quote,
    },
    {
      key: 'matte_mission', agent: 'matte',
      label: 'Ge Matte ditt första uppdrag',
      varde: 'Ett mål ("Frigör 50 000 kr före fredag") ger teamet en plan att arbeta efter.',
      minuter: 3, href: '/dashboard', klar: s.has_mission,
    },
    {
      key: 'hanna_segment', agent: 'hanna',
      label: 'Sortera kunderna i segment så Hanna kan återaktivera rätt',
      varde: 'Hanna föreslår återaktivering per kundgrupp — utan segment gissar hon inte.',
      minuter: 5, href: '/dashboard/customers',
      klar: s.customer_count === 0 || s.segmented_customer_count > 0,
    },
    {
      key: 'pwa', agent: 'matte',
      label: 'Lägg appen på hemskärmen så du får notis när ett kort väntar',
      varde: 'Ett kort väntar redan — med notis hinner du besluta innan kunden hinner undra.',
      minuter: 1, href: '/dashboard/help', klar: s.pwa,
    },
  ]
  // Hanna är bara relevant när det finns kunder att sortera; pushen bara
  // när ett riktigt kort väntar — annars finns inget att få notis om.
  return alla.filter(t => {
    if (t.key === 'hanna_segment') return s.customer_count > 0
    if (t.key === 'pwa') return s.pending_real_cards > 0
    return true
  })
}

/** Primär (första öppna) + upp till två sekundära öppna uppgifter. */
export function visibleKomIgangTasks(tasks: KomIgangTask[]): { primary: KomIgangTask | null; secondary: KomIgangTask[] } {
  const oppna = tasks.filter(t => !t.klar)
  return { primary: oppna[0] ?? null, secondary: oppna.slice(1, KOM_IGANG_MAX_VISIBLE) }
}
