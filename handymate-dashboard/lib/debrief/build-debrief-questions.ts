/**
 * Debrief-frågorna byggs deterministiskt ur efterkalkyl-deltat — ingen AI.
 * Samma siffror som redan ligger frusna i project_outcome
 * (lib/efterkalkyl/freeze-outcome.ts) styr vilka frågor som känns relevanta
 * att ställa. Ägarens svar är sanningen; frågorna är bara en fingervisning
 * om VAD som blev annorlunda.
 *
 * Ren funktion — inga sidoeffekter, inget nätverksanrop — så den kan testas
 * isolerat (tests/project-debrief.spec.ts).
 */

export interface DebriefDelta {
  hours_diff_pct: number | null
  amount_diff_pct: number | null
}

export function byggDebriefFragor(delta: DebriefDelta): string[] {
  const fragor: string[] = []

  fragor.push(
    delta.hours_diff_pct !== null && delta.hours_diff_pct > 10
      ? 'Vad tog längre tid än planerat?'
      : 'Stämde tidsuppskattningen?',
  )

  fragor.push(
    delta.amount_diff_pct !== null && delta.amount_diff_pct < -10
      ? 'Vad åt av marginalen?'
      : 'Stämde materialåtgången med offerten?',
  )

  fragor.push('Något att göra annorlunda nästa gång?')

  return fragor
}
