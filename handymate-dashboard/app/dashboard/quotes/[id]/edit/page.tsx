'use client'

import { useParams } from 'next/navigation'
import QuoteBuilder from '../../_shared/QuoteBuilder'

/**
 * Fas 2 (offert-omtaget, 2026-08-31): den fulla orkestratorn som tidigare
 * bodde direkt i den här filen (~1467 rader — egen hämtning/autospar/
 * payload-byggnad, en strukturellt separat andra implementation av
 * offertredigering) flyttade in i `app/dashboard/quotes/_shared/
 * QuoteBuilder.tsx` (mode="edit") + `_shared/useQuoteBuilderSave.ts` +
 * `_shared/loadEditQuote.ts` + `_shared/QuoteEditView.tsx` — samma mönster
 * som Fas 1 gav `new/page.tsx`.
 *
 * Denna fil läser bara id:t ur routen och vidarebefordrar det — den hämtar
 * inget, mappar inget och äger ingen autosave-logik. Allt det bor i
 * QuoteBuilder nu.
 */
export default function EditQuotePage() {
  const params = useParams()
  const quoteId = (params as any)?.id as string
  // key={quoteId}: App Router återanvänder annars samma QuoteBuilder-instans
  // vid en klientnavigering mellan två redigera-URL:er (t.ex. en framtida
  // offertväxlare) - dess laddnings-effekt beror bara på business_id, så utan
  // key:n skulle den fortsätta visa/autospara FÖREGÅENDE offertens data mot
  // den nya URL:en. Ingen nuvarande länk navigerar så idag, men key:n gör
  // detta ofarligt att bygga senare.
  return <QuoteBuilder key={quoteId} mode="edit" quoteId={quoteId} />
}
