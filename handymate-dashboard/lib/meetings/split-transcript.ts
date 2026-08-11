/**
 * Delar upp ett sammansatt mötestranskript (lib/meetings/assemble-transcript.ts)
 * i mindre bitar för map-reduce-analysen av långa möten
 * (app/api/voice/analyze/route.ts).
 *
 * VARFÖR: ett 90-minutersmöte kan bli ett transkript på tiotusentals tecken
 * — för stort för att skicka i ett enda Claude-anrop utan att antingen
 * trunkera (tyst dataförlust) eller sprängja context-fönstret. Lösningen är
 * map-reduce: dela transkriptet i bitar, extrahera kandidatfynd per bit,
 * slå ihop. Den här filen är DELEN — ren funktion, inget AI-anrop, inget
 * Supabase-beroende.
 *
 * Delningen sker på de tidsstämplade markörraderna som assembleTranscript
 * producerar (`[mm:ss]` eller `[h:mm:ss]`, ensamma på sin rad) — aldrig
 * mitt i en menings text. Ett enskilt block som ändå är större än
 * maxChunkChars (extremt långt sammanhängande tal) delas hårt vid
 * teckengränsen — annars skulle det blocket aldrig få plats i en chunk.
 *
 * LOSSLESS: `chunks.join('') === text` alltid — inget tecken tappas eller
 * läggs till, delningen ändrar bara var gränserna mellan bitarna går.
 * Deterministisk: samma indata ger alltid samma utdata.
 */

/** Över denna teckengräns körs map-reduce i stället för ett enda AI-anrop. */
export const MAP_REDUCE_TROSKEL_TECKEN = 24000

const DEFAULT_MAX_CHUNK_CHARS = 8000

// Markörrad, t.ex. "[05:00]" eller "[1:00:00]" — ensam på sin rad (se
// formatOffset i assemble-transcript.ts för exakt format).
const MARKER_LINE = /^\[(?:\d+:)?\d{2}:\d{2}\]$/gm

export function splitTranscript(text: string, maxChunkChars: number = DEFAULT_MAX_CHUNK_CHARS): string[] {
  if (!text) return []

  // ── 1. Hitta var varje markörblock börjar ──────────────────────────
  const markerStarts: number[] = []
  MARKER_LINE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = MARKER_LINE.exec(text)) !== null) {
    markerStarts.push(match.index)
    // Nollbreddsmatchning är omöjlig här (mönstret kräver tecken), men
    // gardera ändå mot en oändlig loop.
    if (match[0].length === 0) MARKER_LINE.lastIndex++
  }

  // Text innan första markören (bör normalt inte förekomma, men förlorar
  // vi den aldrig — den blir ett eget inledande block).
  const blockStarts = markerStarts.length > 0 && markerStarts[0] !== 0
    ? [0, ...markerStarts]
    : markerStarts.length > 0
      ? markerStarts
      : [0]

  const blocks: string[] = blockStarts.map((start, i) => {
    const end = i + 1 < blockStarts.length ? blockStarts[i + 1] : text.length
    return text.slice(start, end)
  })

  // ── 2. Packa block girigt i chunkar ≤ maxChunkChars ────────────────
  const chunks: string[] = []
  let current = ''

  for (const block of blocks) {
    if (block.length > maxChunkChars) {
      // Ett enskilt block är för stort för att någonsin få plats — dela
      // hårt vid teckengränsen. Det som redan samlats ihop flushas först
      // så ordningen bevaras.
      if (current) {
        chunks.push(current)
        current = ''
      }
      for (let i = 0; i < block.length; i += maxChunkChars) {
        chunks.push(block.slice(i, i + maxChunkChars))
      }
      continue
    }

    if (current.length + block.length > maxChunkChars) {
      chunks.push(current)
      current = block
    } else {
      current += block
    }
  }

  if (current) chunks.push(current)

  return chunks
}
