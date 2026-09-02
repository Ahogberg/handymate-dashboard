/**
 * Branschledningen — EN sanning för branschnycklar, alias och svenska
 * etiketter (Branschförståelse steg 1, 2026-09-02).
 *
 * Bakgrund: onboardingen skriver `business_config.branch` (engelska ID:n ur
 * app/onboarding/constants.ts), medan fem AI-vägar läste den föråldrade
 * kolumnen `industry` (= 'hantverkare' på samtliga prod-konton) och tre
 * prompt-byggare hade var sin ofullständig kopia av etikettkartan. Resultatet
 * var att elektrikern presenterades som "hantverkare" eller "Bygg" för
 * modellen. Den här modulen är det enda stället som får översätta råvärden
 * ur databasen till en bransch — alla prompt- och biblioteksytor importerar
 * härifrån (facit: tests/branschledningen.spec.ts).
 *
 * Nyckelrymden = UNIONEN av onboardingens åtta val och bibliotekens (produkt-,
 * kunskaps-, checklist-, formulär-) tretton nycklar. Att en nyckel finns här
 * betyder INTE att det finns ett branschpaket för den — det är steg 2–4 i
 * programmet (se memory branschforstaelse).
 */

export const BRANCH_IDS = [
  'electrician',
  'plumber',
  'hvac',
  'construction',
  'carpenter',
  'painter',
  'roofing',
  'flooring',
  'groundworks',
  'general_contractor',
  'gardening',
  'locksmith',
  'cleaning',
  'moving',
  'other',
] as const

export type BranchId = (typeof BRANCH_IDS)[number]

export interface BranchDefinition {
  id: BranchId
  /** Kort branschetikett, samma stil som onboardingens brickor ("El", "VVS"). */
  label: string
  /** Yrkesrollen i singular ("Elektriker") — för "du hjälper en elektriker". */
  worker: string
  /** Företagsformen ("elföretag") — för "ett elföretag i Uppsala". */
  company: string
  /**
   * Exakta alias (gemener) som ska tolkas som den här branschen: gamla
   * nycklar ur äldre kod, svenska ord, fritext från onboarding-versioner
   * före 2026-06. Kanoniska ID:t behöver inte listas.
   */
  aliases: string[]
  /**
   * Ordbörjor som fångar fritext ("Elektriker AB", "Snickarns i Nacka").
   * Matchas per ord, aldrig som substräng i ett längre ord — därför
   * matchar "måleri" inte "el".
   */
  prefixes: string[]
}

const DEFINITIONS: readonly BranchDefinition[] = [
  {
    id: 'electrician',
    label: 'El',
    worker: 'Elektriker',
    company: 'elföretag',
    aliases: ['el', 'elektriker', 'elektricist', 'elinstallatör', 'elinstallator', 'elfirma', 'electrical', 'electric'],
    prefixes: ['elektr', 'elinst', 'elfirm'],
  },
  {
    id: 'plumber',
    label: 'VVS',
    worker: 'Rörmokare',
    company: 'VVS-företag',
    aliases: ['vvs', 'rörmokare', 'rormokare', 'rörmokeri', 'vvs-montör', 'vvs-montor', 'plumbing', 'rör', 'ror'],
    prefixes: ['rörmok', 'rormok', 'vvs'],
  },
  {
    id: 'hvac',
    label: 'Värme, ventilation och kyla',
    worker: 'Kyl- och ventilationstekniker',
    company: 'ventilations- och kylföretag',
    aliases: ['hvac', 'ventilation', 'kyl', 'kyla', 'kylteknik', 'värmepumpar', 'varmepumpar'],
    prefixes: ['ventil', 'kylte', 'kylfi'],
  },
  {
    id: 'construction',
    label: 'Bygg',
    worker: 'Byggare',
    company: 'byggföretag',
    aliases: ['bygg', 'byggare', 'byggfirma', 'byggnads', 'byggentreprenör', 'byggentreprenor', 'building', 'builder'],
    prefixes: ['bygg'],
  },
  {
    id: 'carpenter',
    label: 'Snickeri',
    worker: 'Snickare',
    company: 'snickeriföretag',
    aliases: ['snickeri', 'snickare', 'snickarn', 'carpentry', 'finsnickeri'],
    prefixes: ['snick'],
  },
  {
    id: 'painter',
    label: 'Måleri',
    worker: 'Målare',
    company: 'måleriföretag',
    aliases: ['maleri', 'måleri', 'målare', 'malare', 'målerifirma', 'painting'],
    prefixes: ['måler', 'maler', 'målar', 'malar'],
  },
  {
    id: 'roofing',
    label: 'Tak',
    worker: 'Takläggare',
    company: 'takföretag',
    aliases: ['tak', 'takläggare', 'taklaggare', 'takläggning', 'plåt', 'plat', 'plåtslagare', 'platslagare', 'plåtslageri', 'roofer', 'roof'],
    prefixes: ['takl', 'takfi', 'plåtsl', 'platsl'],
  },
  {
    id: 'flooring',
    label: 'Golv',
    worker: 'Golvläggare',
    company: 'golvföretag',
    aliases: ['golv', 'golvläggare', 'golvlaggare', 'golvläggning', 'floor'],
    prefixes: ['golvl'],
  },
  {
    id: 'groundworks',
    label: 'Mark',
    worker: 'Markentreprenör',
    company: 'markentreprenad',
    aliases: ['mark', 'markarbeten', 'markentreprenad', 'markentreprenör', 'markentreprenor', 'anläggning', 'anlaggning', 'anläggare', 'anlaggare', 'schakt', 'gräv', 'grav', 'grävmaskinist', 'gravmaskinist'],
    prefixes: ['markarb', 'markent', 'anlägg', 'anlagg', 'schakt', 'grävm', 'gravm'],
  },
  {
    id: 'general_contractor',
    label: 'Totalentreprenad',
    worker: 'Totalentreprenör',
    company: 'totalentreprenadföretag',
    aliases: ['totalentreprenad', 'totalentreprenör', 'totalentreprenor', 'generalentreprenad', 'generalentreprenör', 'generalentreprenor'],
    prefixes: ['totalentr', 'generalentr'],
  },
  {
    id: 'gardening',
    label: 'Trädgård',
    worker: 'Trädgårdsanläggare',
    company: 'trädgårdsföretag',
    aliases: ['trädgård', 'tradgard', 'trädgårdsskötsel', 'tradgardsskotsel', 'trädgårdsanläggning', 'garden'],
    prefixes: ['trädg', 'tradg'],
  },
  {
    id: 'locksmith',
    label: 'Lås',
    worker: 'Låssmed',
    company: 'låssmedsföretag',
    aliases: ['lås', 'las', 'låssmed', 'lassmed', 'låssmeder'],
    prefixes: ['låssm', 'lassm'],
  },
  {
    id: 'cleaning',
    label: 'Städ',
    worker: 'Städare',
    company: 'städföretag',
    aliases: ['städ', 'stad', 'städning', 'stadning', 'städfirma', 'stadfirma', 'clean'],
    prefixes: ['städ', 'stadn', 'stadf'],
  },
  {
    id: 'moving',
    label: 'Flytt',
    worker: 'Flyttare',
    company: 'flyttfirma',
    aliases: ['flytt', 'flyttfirma', 'flyttjänster', 'flyttjanster', 'move'],
    prefixes: ['flytt'],
  },
  {
    id: 'other',
    label: 'Allround',
    worker: 'Allroundhantverkare',
    company: 'hantverksföretag',
    // 'hantverkare' = det gamla default-värdet i business_config.industry
    // på VARJE konto — får aldrig tolkas som något mer specifikt än allround.
    aliases: ['hantverkare', 'hantverk', 'allround', 'annat', 'övrigt', 'ovrigt', 'handyman', 'general'],
    prefixes: ['hantverk', 'allround'],
  },
]

const BY_ID: Record<BranchId, BranchDefinition> = Object.fromEntries(
  DEFINITIONS.map(d => [d.id, d]),
) as Record<BranchId, BranchDefinition>

const ALIAS_INDEX: Map<string, BranchId> = (() => {
  const m = new Map<string, BranchId>()
  for (const d of DEFINITIONS) {
    m.set(d.id, d.id)
    for (const a of d.aliases) m.set(a, d.id)
  }
  return m
})()

export function isBranchId(value: unknown): value is BranchId {
  return typeof value === 'string' && (BRANCH_IDS as readonly string[]).includes(value)
}

/**
 * Råvärde → kanoniskt bransch-ID. Tar kanoniska ID:n, kända alias och
 * fritext. Okänt/tomt → 'other' — aldrig ett kastat fel, funktionen sitter
 * i prompt-vägar som inte får falla på skräpdata.
 */
export function normalizeBranch(raw: string | null | undefined): BranchId {
  if (!raw) return 'other'
  const lower = raw.trim().toLowerCase()
  if (!lower) return 'other'

  const exact = ALIAS_INDEX.get(lower)
  if (exact) return exact

  // Fritext: dela upp i ord och pröva alias + ordbörjor per ord. Ordvis
  // matchning är poängen — säsongsmodulens gamla `includes('el')` gjorde
  // varje måleri- och totalentreprenadfirma till elektriker.
  const words = lower.split(/[^a-zåäöéü]+/).filter(Boolean)
  for (const word of words) {
    const hit = ALIAS_INDEX.get(word)
    if (hit) return hit
  }
  for (const word of words) {
    for (const d of DEFINITIONS) {
      if (d.prefixes.some(p => word.startsWith(p))) return d.id
    }
  }
  return 'other'
}

export function getBranchDefinition(id: BranchId): BranchDefinition {
  return BY_ID[id]
}

/** "El", "VVS", "Bygg" … — kort etikett för listor och kortare promptrader. */
export function branchLabel(raw: string | null | undefined): string {
  return BY_ID[normalizeBranch(raw)].label
}

/** "Elektriker", "Rörmokare" … — yrkesrollen. */
export function branchWorker(raw: string | null | undefined): string {
  return BY_ID[normalizeBranch(raw)].worker
}

/** "elföretag", "VVS-företag" … — "ett ${company} i Uppsala". */
export function branchCompanyNoun(raw: string | null | undefined): string {
  return BY_ID[normalizeBranch(raw)].company
}

export interface ResolvedBusinessBranch {
  primary: BranchId
  secondary: BranchId[]
  /** Råvärdet som faktiskt låg i business_config.branch (för loggar). */
  raw: string | null
}

/**
 * Läser branschen ur en business_config-rad. `branch` är kanonisk;
 * `industry` är den föråldrade kolumnen och används BARA om branch saknas
 * (den är 'hantverkare' = allround på alla konton som aldrig valde annat).
 * Dubbletter mot huvudbranschen tas bort ur sekundärlistan.
 */
export function resolveBusinessBranch(row: {
  branch?: string | null
  industry?: string | null
  secondary_branches?: string[] | null
} | null | undefined): ResolvedBusinessBranch {
  const rawBranch = row?.branch?.trim() || null
  const primary = normalizeBranch(rawBranch || row?.industry || null)
  const secondary: BranchId[] = []
  for (const extra of row?.secondary_branches ?? []) {
    if (!extra) continue
    const id = normalizeBranch(extra)
    if (id === primary || id === 'other' || secondary.includes(id)) continue
    secondary.push(id)
  }
  return { primary, secondary, raw: rawBranch }
}

/**
 * Text för prompter: "El (+ VVS, Bygg)". Yrkesform valfritt:
 * describeBranches(r, 'worker') → "Elektriker (+ Rörmokare)".
 */
export function describeBranches(
  resolved: Pick<ResolvedBusinessBranch, 'primary' | 'secondary'>,
  form: 'label' | 'worker' | 'company' = 'label',
): string {
  const pick = (id: BranchId) => BY_ID[id][form]
  const head = pick(resolved.primary)
  if (resolved.secondary.length === 0) return head
  return `${head} (+ ${resolved.secondary.map(pick).join(', ')})`
}

/** Alla definitioner i kanonisk ordning (för UI-listor och facit). */
export function listBranchDefinitions(): readonly BranchDefinition[] {
  return DEFINITIONS
}
