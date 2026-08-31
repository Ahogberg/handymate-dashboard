'use client'

import QuoteBuilder from '../_shared/QuoteBuilder'

/**
 * Fas 1 (offert-omtaget, 2026-08-31): den fulla orkestratorn (~3000 rader)
 * som tidigare bodde direkt i den här filen flyttade till
 * `app/dashboard/quotes/_shared/QuoteBuilder.tsx` — förberedd för att i
 * Fas 2 återanvändas av `[id]/edit/page.tsx` med `mode="edit"`.
 *
 * `QuoteBuilder` läser sina egna query-parametrar (transcript/customerId/
 * deal_id/lead_id/title/description) via `useSearchParams()` internt —
 * den routen (den här filen) behöver inte tolka eller vidarebefordra dem,
 * `useSearchParams()` ger samma resultat oavsett vilken klientkomponent i
 * routträdet som anropar den.
 */
export default function NewQuotePage() {
  return <QuoteBuilder mode="create" />
}
