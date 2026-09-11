/** A generated token alone is not evidence that the quote was sent. */
export function signatureLabel(quote: { status: string; sent_at?: string | null }) {
  return quote.sent_at && ['sent', 'opened'].includes(quote.status)
    ? { title: 'Väntar på signering', description: 'Kunden har inte signerat än' }
    : { title: 'Signeringslänk skapad', description: 'En länk är inte en bekräftelse på utskick.' }
}
