/**
 * Hallucinationsvakten — Whisper hittar på text ur tystnad.
 *
 * Mätt av fltman/kundkoll (docs/VERIFIERAD-STACK.md): "5 s ren tystnad, utan
 * VAD → ' Tack.'". De löste det med Silero VAD före varje motor. Vi har ingen
 * VAD-infrastruktur i en serverless-miljö, men vi kan känna igen utfallet.
 *
 * Varför det är allvarligare hos oss än hos dem: deras text hamnar i en
 * anteckning. Vår går vidare till POST /api/voice/analyze, som föder
 * godkännandekort — ÄTA, byggdagbok, deal-kort, customer_fact. Ett tyst eller
 * obesvarat samtal kunde alltså producera ett beslutsunderlag byggt på
 * ingenting.
 *
 * Regeln är konservativ med avsikt: hellre släppa igenom ett kort men äkta
 * samtal än tappa det. Ett avvisat transkript sparas aldrig som transkript och
 * startar aldrig en analys — men det sparas som en ÄRLIG anledning, så ytan kan
 * säga "inget tal hittades" i klartext. Samma hållning som assembleTranscript
 * och buildScanRows: tystnad som betyder "vi vet inte" får aldrig se ut som
 * tystnad som betyder "det fanns inget".
 */

/**
 * Fraser Whisper producerar ur tystnad eller brus. Matchas mot HELA det
 * normaliserade transkriptet — aldrig som delsträng, så ett riktigt samtal som
 * slutar med "tack" aldrig kastas.
 */
const ARTEFAKTER: readonly string[] = [
  'tack',
  'tack.',
  'tack!',
  'tack för att du tittade',
  'tack för att du tittade!',
  'tack för att ni tittade',
  'hej då',
  'hejdå',
  'undertexter från amara.org',
  'undertexter av amara.org',
  'textning av amara.org',
  'svensktextning.se',
  'thanks for watching',
  'thank you',
  'you',
  '.',
  '...',
]

/**
 * Under så här många tecken per ljudsekund är texten orimligt kort för att
 * vara tal. Normal svensk talhastighet ligger kring 12–15 tecken/sekund; 1,0
 * är alltså en tiondel av det och träffar bara nära-tomma transkript.
 */
const MIN_TECKEN_PER_SEKUND = 1.0

/**
 * Under den här ljudlängden tillämpas inte täthetsregeln alls. Ett fem
 * sekunder kort samtal kan mycket väl vara "Hej, det är Anders" och ändå vara
 * äkta.
 */
const KORTASTE_LJUD_FOR_TATHET = 15

export type AvvisningsSkal = 'artefakt' | 'tomt' | 'for_gles'

export interface GuardResultat {
  ok: boolean
  skal?: AvvisningsSkal
  /** Svensk mening som kan visas i gränssnittet rakt av. */
  meddelande?: string
}

function normalisera(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Ren funktion: avgör om ett transkript ska släppas vidare.
 *
 * @param text          Whispers svar
 * @param ljudSekunder  Känd ljudlängd. 0/okänd ⇒ täthetsregeln hoppas över.
 */
export function granskaTranskript(
  text: string | null | undefined,
  ljudSekunder: number,
): GuardResultat {
  const ratt = typeof text === 'string' ? text.trim() : ''
  if (!ratt) {
    return { ok: false, skal: 'tomt', meddelande: 'Inget tal kunde transkriberas.' }
  }

  const normaliserad = normalisera(ratt)
  if (ARTEFAKTER.includes(normaliserad)) {
    return {
      ok: false,
      skal: 'artefakt',
      meddelande: 'Inget tal hittades i inspelningen — bara tystnad eller bakgrundsljud.',
    }
  }

  const sekunder = Number(ljudSekunder) || 0
  if (sekunder >= KORTASTE_LJUD_FOR_TATHET) {
    const tathet = ratt.length / sekunder
    if (tathet < MIN_TECKEN_PER_SEKUND) {
      return {
        ok: false,
        skal: 'for_gles',
        meddelande: 'Inget sammanhängande tal hittades i inspelningen.',
      }
    }
  }

  return { ok: true }
}

/** Exporteras för facit — listan är en del av kontraktet, inte en detalj. */
export const _ARTEFAKTER = ARTEFAKTER
export const _MIN_TECKEN_PER_SEKUND = MIN_TECKEN_PER_SEKUND
export const _KORTASTE_LJUD_FOR_TATHET = KORTASTE_LJUD_FOR_TATHET
