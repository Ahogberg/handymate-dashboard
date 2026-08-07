/**
 * Agentens tre röstlägen — och vilka knappar varje läge får ha (2026-08-07).
 *
 * ═══ VARFÖR RÖSTEN BÄRS AV VERBET ═══
 *
 * En agent kan göra tre olika saker, och hantverkaren måste kunna se vilket
 * på en halv sekund:
 *
 *   berättar  — något har hänt. Inget att göra.
 *   föreslår  — något är förberett. Godkänn, ändra eller avvisa.
 *   frågar    — systemet vet inte. Välj ett av flera likvärdiga svar.
 *
 * Skillnaden bärs av VERBET i bylinen och av kortets ANATOMI, aldrig av färg.
 * Det fungerar även för färgblinda och i solljus på ett tak — och det är
 * samma princip som designsystemets agentavsnitt
 * (docs/HANDYMATE_DESIGN_SYSTEM.md, avsnitt 4b).
 *
 * ═══ DEN REGEL SOM ÄR VÄRD EN MODUL ═══
 *
 * **Ett kort som FRÅGAR får aldrig ha en Godkänn-knapp.**
 *
 * Godkänn betyder "gör det du föreslår". Frågar systemet betyder det att det
 * inte har ett förslag — och en Godkänn-knapp där skulle godkänna ingenting,
 * eller värre: det första alternativet, utan att hantverkaren valt det.
 *
 * Regeln är lätt att bryta i JSX om ett kort byggs om senare. Därför byggs
 * knappraden av en ren funktion i stället, och invarianten facit-testas.
 *
 * Rena funktioner — tests/jarvis-voice.spec.ts.
 */

export type Voice =
  /** Något har hänt. Platt rad, ingen ram, inga knappar. */
  | 'berattar'
  /** Något är förberett. Kort med ram, Godkänn/Ändra/Avvisa. */
  | 'foreslar'
  /** Systemet vet inte. Kort med ram, likvärdiga svar, ALDRIG Godkänn. */
  | 'fragar'

/** Verbet som står efter agentens namn och roll i bylinen. */
export function voiceVerb(voice: Voice): string {
  if (voice === 'fragar') return 'frågar'
  if (voice === 'foreslar') return 'föreslår'
  return ''
}

/** Får läget ha en Godkänn-knapp? */
export function allowsApproval(voice: Voice): boolean {
  return voice === 'foreslar'
}

/** Renderas läget som ett kort med ram, eller som en platt rad? */
export function isFramed(voice: Voice): boolean {
  return voice !== 'berattar'
}

export type ActionKind =
  /** Fylld teal. Högst en per kort. */
  | 'primar'
  /** Vit med ram. Flera tillåtna. */
  | 'sekundar'
  /** Ingen bakgrund, ingen ram. */
  | 'diskret'

export interface CardAction {
  id: string
  label: string
  kind: ActionKind
  /** Utför handlingen faktiskt ett godkännande? Facit vaktar den här. */
  approves: boolean
  /** lucide-ikonens namn, eller null. */
  icon: 'check' | 'x' | null
}

export interface ActionInput {
  /** Texten på Godkänn-knappen. Varierar med typ: "Skicka påminnelsen" m.fl. */
  approveLabel?: string
  /** Går kortets text att ändra inline? Styr om Ändra-knappen visas. */
  editable?: boolean
  /** Svarsalternativen i 'fragar'-läget, i ordning. */
  alternatives?: Array<{ id: string; label: string }>
}

/**
 * Bygger knappraden för ett kort.
 *
 * 'fragar' returnerar ENBART alternativ — inget av dem godkänner något, och
 * det första är inte mer förvalt än det andra. Att ge det första en primär
 * fyllning hade gjort det till ett default systemet inte har täckning för;
 * men två helt lika knappar bredvid varandra är svårlästa, så det första
 * alternativet får den fyllda formen medan `approves` förblir false. Det är
 * en läsbarhetsfråga, inte ett förval — och skillnaden är exakt vad testet
 * vaktar.
 */
export function cardActions(voice: Voice, input: ActionInput = {}): CardAction[] {
  if (voice === 'berattar') return []

  if (voice === 'fragar') {
    const alts = input.alternatives || []
    return alts.map((a, i) => ({
      id: a.id,
      label: a.label,
      kind: i === 0 ? ('primar' as const) : ('sekundar' as const),
      approves: false,
      icon: null,
    }))
  }

  const actions: CardAction[] = [
    {
      id: 'approve',
      label: input.approveLabel || 'Godkänn',
      kind: 'primar',
      approves: true,
      icon: 'check',
    },
  ]
  if (input.editable) {
    actions.push({ id: 'edit', label: 'Läs & ändra', kind: 'sekundar', approves: false, icon: null })
  }
  actions.push({ id: 'reject', label: 'Avvisa', kind: 'diskret', approves: false, icon: 'x' })
  return actions
}
