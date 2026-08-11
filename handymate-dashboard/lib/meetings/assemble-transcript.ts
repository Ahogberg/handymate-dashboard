/**
 * Sätter ihop ett helt mötestranskript av rullande 5-minutersegment
 * (Mötesassistenten V2 — segmentrotation, se sql/v119_meeting_v2.sql).
 *
 * VARFÖR: 90-minutersmöten spelas in som separata, självständigt
 * avkodningsbara 5-minutersfiler — inte ett sammanhängande klipp. Varje
 * segment transkriberas för sig via Whisper, och den här rena funktionen
 * (inga sidoeffekter, inget Supabase-beroende) klistrar ihop resultatet
 * med kumulativa tidsoffsets.
 *
 * ÄRLIGHETSREGELN: om ett segment saknar lyckad transkribering (misslyckat,
 * ej klart, eller tomt) ska det synas som ett EXPLICIT hål i texten
 * ("[— avsnitt saknas —]") — mötestiden går vidare (offseten avancerar med
 * segmentets uppmätta längd) men vi låtsas aldrig att texten fanns.
 */

export interface TranscriptSegment {
  seq: number
  status: 'uploaded' | 'transcribed' | 'failed'
  transcript: string | null
  durationSeconds: number | null
  /** Whisper verbose_json-segment: [{ start, end, text }] relativt segmentets egen start. */
  whisperSegments?: Array<{ start: number; end: number; text: string }> | null
}

export interface AssembledTranscript {
  text: string
  timeline: Array<{ offsetSeconds: number; text: string }>
  totalSeconds: number
  missingSegments: number
}

/**
 * Formaterar en offset i sekunder som mm:ss, eller h:mm:ss när offseten är
 * minst en timme (timsiffran är opaddad, minuter/sekunder är alltid två
 * siffror).
 */
export function formatOffset(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')

  if (hours >= 1) {
    return `${hours}:${pad(minutes)}:${pad(secs)}`
  }
  return `${pad(minutes)}:${pad(secs)}`
}

export function assembleTranscript(segments: TranscriptSegment[]): AssembledTranscript {
  // Indataordningen ska inte spela roll — sortera alltid på seq.
  const sorted = [...segments].sort((a, b) => a.seq - b.seq)

  const blocks: string[] = []
  const timeline: Array<{ offsetSeconds: number; text: string }> = []
  let missingSegments = 0
  let totalSeconds = 0
  let cumulativeOffset = 0

  for (const segment of sorted) {
    const offset = cumulativeOffset
    const duration = segment.durationSeconds ?? 0
    totalSeconds += duration

    const marker = `[${formatOffset(offset)}]`
    const transcriptText = segment.transcript?.trim() ?? ''
    const hasTranscript = segment.status === 'transcribed' && transcriptText.length > 0

    if (hasTranscript) {
      blocks.push(`${marker}\n${transcriptText}`)

      if (segment.whisperSegments && segment.whisperSegments.length > 0) {
        for (const whisper of segment.whisperSegments) {
          timeline.push({
            offsetSeconds: Math.round(offset + whisper.start),
            text: whisper.text.trim(),
          })
        }
      } else {
        timeline.push({ offsetSeconds: Math.round(offset), text: transcriptText })
      }
    } else {
      // Misslyckat, ännu ej transkriberat, eller tomt segment — explicit
      // lucka, aldrig ett tyst hål. Mötestiden går ändå vidare.
      blocks.push(`${marker}\n[— avsnitt saknas —]`)
      missingSegments += 1
    }

    cumulativeOffset += duration
  }

  return {
    text: blocks.join('\n\n'),
    timeline,
    totalSeconds,
    missingSegments,
  }
}
