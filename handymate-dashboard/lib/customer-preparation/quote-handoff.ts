import { TEMPLATES, type Preparation } from './contract'

/** Only reviewed, server-loaded answers can become quote input. No public tokens or expiring image URLs. */
export function preparationQuoteInput(row: Preparation): string {
  if (row.status !== 'reviewed') throw new Error('Granska kundunderlaget först.')
  return [
    `Kundunderlag · ${TEMPLATES[row.template].label}`,
    `Arbete: ${row.context}`,
    ...TEMPLATES[row.template].questions.map(question => `${question.label}\n${row.answers[question.id] || 'Inget svar'}`),
    'Kundens uppgifter är underlag, inte verifierade tekniska förutsättningar. Okända uppgifter behöver stämmas av.',
    row.images.length ? `${row.images.length} bilder finns på kundkortet. Bilderna har inte överförts till offertens AI-underlag eller bilagor.` : '',
  ].filter(Boolean).join('\n\n')
}

/**
 * `?preparation_id` på offertstarten (rivningen A3, 2026-09-17). Panelen
 * "Använd granskat kundunderlag" är borta: länken "Använd i ny offert" på
 * kundkortet pekar redan ut EN granskad rad, så texten läggs direkt i
 * intagets ruta i stället för bakom en andra knapp. Samma regler som
 * panelen hade: bara den utpekade raden, bara om den är granskad, aldrig
 * bildvägar. Ett läsfel är ett fel med hantverkarens ord — anroparen visar
 * det, aldrig en tom ruta som ser avsiktlig ut.
 */
export async function loadPreparationQuoteInput(customerId: string, preparationId: string, fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<string> {
  const response = await fetcher(`/api/customer-preparation?customer_id=${encodeURIComponent(customerId)}`, { cache: 'no-store', signal })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(response.status === 403 ? 'Kundunderlag kräver ägar- eller administratörsbehörighet.' : 'Kunde inte läsa kundunderlaget.')
  if (!data || !Array.isArray(data.preparations)) throw new Error('Kunde inte läsa kundunderlaget.')
  const row = (data.preparations as Preparation[]).find(r => r && r.id === preparationId)
  if (!row) throw new Error('Inget granskat underlag hittades. Öppna kundkortet för att granska svaret.')
  return preparationQuoteInput(row)
}
