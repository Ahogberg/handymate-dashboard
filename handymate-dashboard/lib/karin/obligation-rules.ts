/**
 * Skyldighetsreglerna — Karins bolagskalender (2026-08-07).
 *
 * ═══ VARFÖR REGLERNA ÄR DATA OCH INTE KOD ═══
 *
 * En regel som ändras ska kunna versioneras utan att historiken skrivs om.
 * Samma skäl som gör att offertens `component_snapshot` fryses vid insert:
 * det som redan visats för hantverkaren ska gå att förklara i efterhand, även
 * när regeln sedan ändrats.
 *
 * Därför bär varje regel `version`, `legal_basis` och `source_url`. En
 * materialiserad skyldighet utan dem får inte visas — kan Karin inte säga
 * varför, får hon inte påstå det.
 *
 * ═══ VARFÖR SÄKERHETSGRADEN FINNS ═══
 *
 * Reglerna är olika säkra. Momsdatumet för ett kvartalsbolag är entydigt;
 * inkomstdeklarationens datum beror på om man lämnar digitalt eller på
 * papper, och årsredovisningens på när stämman hålls. Där säkerheten är
 * lägre ska Karin säga det, inte gissa snyggt.
 *
 * En felaktig deadline är värre än ingen deadline. Förseningsavgiften är
 * 625 kr första gången — men skadan är att hantverkaren slutar lita på
 * Karin för allt annat också.
 *
 * ═══ VAD SOM MEDVETET INTE MODELLERAS I V1 ═══
 *
 * - Omsättning över 40 miljoner (då gäller den 26:e i månaden efter för
 *   månadsmoms). Inget hantverksbolag i vår kundbas är i närheten, och att
 *   fråga om det i onboardingen vore att fråga om något som aldrig gäller.
 * - EU-handel, som flyttar helårsmomsens datum. Markeras i stället som lägre
 *   säkerhet på helårsmomsen.
 * - Kvarskatt, som beror på slutskattebeskedet och alltså inte går att
 *   räkna fram ur profilen.
 */

export type VatPeriod = 'month' | 'quarter' | 'year' | 'none'

export interface CompanyProfile {
  /** ab | ef | hb | kb | ekonomisk_forening | annat */
  company_form?: string | null
  /** Räkenskapsårets slutmånad 1–12. 12 = kalenderår. */
  fiscal_year_end_month?: number | null
  vat_period?: VatPeriod | null
  is_employer?: boolean | null
  f_skatt_registered?: boolean | null
}

/**
 * Hur säker Karin är på datumet.
 *
 * `lag` innebär att gränssnittet ska hänvisa till redovisningsbyrån i stället
 * för att påstå ett datum.
 */
export type Confidence = 'hog' | 'medel' | 'lag'

export type ObligationCategory =
  | 'moms'
  | 'arbetsgivare'
  | 'skatt'
  | 'deklaration'
  | 'arsredovisning'
  | 'stamma'

export interface ObligationRule {
  rule_code: string
  title: string
  authority: string
  category: ObligationCategory
  /** Klartext om vem regeln gäller — visas när Karin förklarar sig. */
  applies_to: string
  legal_basis: string
  source_url: string
  version: number
  confidence: Confidence
}

/**
 * Regelbiblioteket. Bumpa `version` när en regels UTRÄKNING ändras — aldrig
 * när bara texten justeras, eftersom versionen är det som gör en gammal
 * materialiserad skyldighet förklarlig i efterhand.
 */
export const OBLIGATION_RULES: Record<string, ObligationRule> = {
  agi: {
    rule_code: 'agi',
    title: 'Arbetsgivardeklaration',
    authority: 'Skatteverket',
    category: 'arbetsgivare',
    applies_to: 'Företag som betalar ut lön',
    legal_basis: 'Skatteförfarandelagen 26 kap. — deklaration och betalning senast den 12:e i månaden efter utbetalningsmånaden, den 17:e i januari och augusti.',
    source_url: 'https://www.skatteverket.se/foretag/arbetsgivare/lamnaarbetsgivardeklaration.4.html',
    version: 1,
    confidence: 'hog',
  },

  arbetsgivaravgifter: {
    rule_code: 'arbetsgivaravgifter',
    title: 'Arbetsgivaravgifter och skatteavdrag',
    authority: 'Skatteverket',
    category: 'arbetsgivare',
    applies_to: 'Företag som betalar ut lön',
    legal_basis: 'Betalas samma dag som arbetsgivardeklarationen lämnas — pengarna ska finnas på skattekontot senast den dagen.',
    source_url: 'https://www.skatteverket.se/foretag/arbetsgivare/arbetsgivaravgifterochskatteavdrag.4.html',
    version: 1,
    confidence: 'hog',
  },

  moms: {
    rule_code: 'moms',
    title: 'Momsdeklaration',
    authority: 'Skatteverket',
    category: 'moms',
    applies_to: 'Momsregistrerade företag',
    legal_basis: 'Månads- och kvartalsmoms: senast den 12:e i andra månaden efter periodens slut. Helårsmoms utan EU-handel: senast den 26:e i andra månaden efter beskattningsårets utgång. Momsen ska vara betald samma dag.',
    source_url: 'https://www.skatteverket.se/foretag/moms/deklareramoms.4.html',
    version: 1,
    confidence: 'hog',
  },

  preliminarskatt: {
    rule_code: 'preliminarskatt',
    title: 'Preliminärskatt',
    authority: 'Skatteverket',
    category: 'skatt',
    applies_to: 'Företag med godkänd F-skatt och debiterad preliminärskatt',
    legal_basis: 'Debiterad preliminärskatt betalas varje månad, senast den 12:e — den 17:e i januari och augusti.',
    source_url: 'https://www.skatteverket.se/foretag/skatterochavdrag/preliminarskatt.4.html',
    version: 1,
    // Medel, inte hög: alla med F-skatt har inte debiterad preliminärskatt,
    // och beloppet framgår av beskedet — inte av profilen.
    confidence: 'medel',
  },

  inkomstdeklaration: {
    rule_code: 'inkomstdeklaration',
    title: 'Inkomstdeklaration',
    authority: 'Skatteverket',
    category: 'deklaration',
    applies_to: 'Alla företag — datumet beror på bolagsform och räkenskapsår',
    legal_basis: 'Aktiebolag: datum styrs av räkenskapsårets slutmånad. Enskild firma redovisas i ägarens inkomstdeklaration, som lämnas i maj.',
    source_url: 'https://www.skatteverket.se/foretag/skatterochavdrag/deklarerasomforetag.4.html',
    version: 1,
    // Medel: pappersdeklaration och digital deklaration har olika datum.
    confidence: 'medel',
  },

  arsredovisning: {
    rule_code: 'arsredovisning',
    title: 'Årsredovisning till Bolagsverket',
    authority: 'Bolagsverket',
    category: 'arsredovisning',
    applies_to: 'Aktiebolag',
    legal_basis: 'Årsredovisningen ska ha kommit in till Bolagsverket senast sju månader efter räkenskapsårets slut.',
    source_url: 'https://bolagsverket.se/foretag/aktiebolag/arsredovisningforaktiebolag.html',
    version: 1,
    confidence: 'hog',
  },

  bolagsstamma: {
    rule_code: 'bolagsstamma',
    title: 'Årsstämma',
    authority: 'Bolagsverket',
    category: 'stamma',
    applies_to: 'Aktiebolag',
    legal_basis: 'Aktiebolagslagen 7 kap. 10 § — årsstämma ska hållas inom sex månader från räkenskapsårets utgång.',
    source_url: 'https://bolagsverket.se/foretag/aktiebolag/arsstamma.html',
    version: 1,
    // Medel: sex månader är yttersta gränsen, inte ett bestämt datum.
    confidence: 'medel',
  },
}

/** Gäller regeln det här företaget alls? */
export function ruleApplies(ruleCode: string, profile: CompanyProfile): boolean {
  const arAB = profile.company_form === 'ab'

  switch (ruleCode) {
    case 'agi':
    case 'arbetsgivaravgifter':
      return profile.is_employer === true
    case 'moms':
      // `none` = ej momsregistrerad. null = vi vet inte, och då påstår vi inget.
      return !!profile.vat_period && profile.vat_period !== 'none'
    case 'preliminarskatt':
      return profile.f_skatt_registered === true
    case 'inkomstdeklaration':
      return !!profile.company_form
    case 'arsredovisning':
    case 'bolagsstamma':
      return arAB
    default:
      return false
  }
}
