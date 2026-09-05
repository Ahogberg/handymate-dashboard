import { TEMPLATES, type Preparation } from './contract'

/** Only reviewed, server-loaded answers can become quote input. No public tokens or expiring image URLs. */
export function preparationQuoteInput(row: Preparation): string {
  if (row.status !== 'reviewed') throw new Error('Granska kundunderlaget först.')
  return [
    `Kundunderlag ${row.id} · ${TEMPLATES[row.template].label}`,
    `Arbete: ${row.context}`,
    ...TEMPLATES[row.template].questions.map(question => `${question.label}\n${row.answers[question.id] || 'Inget svar'}`),
    'Kundens uppgifter är underlag, inte verifierade tekniska förutsättningar. Okända uppgifter behöver stämmas av.',
    row.images.length ? `${row.images.length} bilder finns på kundkortet. Bilderna har inte överförts till offertens AI-underlag eller bilagor.` : '',
  ].filter(Boolean).join('\n\n')
}
