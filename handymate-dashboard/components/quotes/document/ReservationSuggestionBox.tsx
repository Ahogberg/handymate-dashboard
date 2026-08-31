/** @jsxImportSource react */
// Ingen egen 'use client' — komponenten monteras uteslutande som barn av
// QuoteDocument.tsx, som i sin tur bara körs klientsidigt under
// QuotePreviewPanel.tsx (redan 'use client') eller server-/Node-sidigt via
// renderToStaticMarkup (där 'use client' saknar betydelse). Samma mönster
// som components/mission/MissionPanel.tsx och components/agents/
// MissionPlanCard.tsx: pragmat ovan behövs för att JSX:en ska kompileras
// mot RIKTIGA React-element (utan det plockar Playwright test-runnerns
// egen jsx-runtime upp filen i stället, se facit-testens historik).
import { useState } from 'react'
import { describeReservationSuggestionRows } from './format'
import type { ReservationSuggestion } from '@/lib/reservations/match'

interface ReservationSuggestionBoxProps {
  suggestions: ReservationSuggestion[]
  onReview?: () => void
  /** `section('reservationer')`:s resultat, beräknat av QuoteDocument.tsx och
      spreadat in oförändrat, så scrollToSection/dimningen fungerar identiskt
      med resten av dokumentet. Se QuoteDocument.tsx:s kommentar för varför
      rutan MÅSTE bära attributen själv (garanterar ETT
      data-section="reservationer"-element även när den accepterade listan
      är tom). */
  sectionAttrs: Record<string, string | undefined>
}

/**
 * FAS D-uppföljning (adversarial datakorrekthetsgranskning, 2026-09-01):
 * den ORIGINALA ReservationSuggestionBanner:en (borttagen, se
 * app/dashboard/quotes/_shared/ReservationSuggestionBanner.tsx:s historik)
 * hade en egen, ALDRIG-persisterad `useState(false)` för "dölj tills
 * vidare" — dokumenterat i dess eget docblock: "avfärdbar lokalt (aldrig i
 * databasen — nästa offert ska få förslagen igen)". Reservationsmotorns
 * grundregel (samma docblock): "motorn AVBRYTER ALDRIG... hantverkaren
 * öppnar granskningen när han själv vill."
 *
 * Flytten in i dokumentets Reservationer-sektion tappade den affordansen:
 * utan ett lokalt × är enda vägen att tysta rutan att antingen ACCEPTERA
 * (lägger till reservationen på riktigt) eller AVVISA i granskningssheeten
 * — ett avvisande är INTE neutralt, det är ett persisterat beslut
 * (`sendDecisions` → POST /api/reservations/decisions) som föder
 * 3-i-rad-tystningsräknaren i lib/reservations/match.ts. En hantverkare
 * som bara vill skjuta upp beslutet tvingades annars välja mellan att
 * committa till något han inte bestämt sig för, eller putta en reservation
 * mot permanent auto-tystning för hela företaget.
 *
 * `dismissed` nedan är REN UI-state, lokal för just den här
 * komponentinstansen: återställs vid remount (ny offert öppnas, sidladdning
 * o.s.v.), rör ALDRIG `suggestions`/`dismissedIds`/`sendDecisions` i
 * useReservationSuggestions.ts — exakt samma icke-persisterade semantik som
 * originalbannerns egen `useState`, bara flyttad hit.
 *
 * EGEN FIL (i stället för `useState` rakt i QuoteDocument.tsx): den filens
 * eget docblock är explicit — "INGEN 'use client', INGA hooks", eftersom
 * den körs isomorft via renderToStaticMarkup i static-läge (PDF/kundvy).
 * Den här rutan monteras ALDRIG i static-läge (se gaten i QuoteDocument.tsx
 * — dokumentet importerar filen men anropar/monterar komponenten bara när
 * mode==='edit'), så hooken exekverar aldrig där — men att lägga den DIREKT
 * i QuoteDocument.tsx hade ändå brutit den filens egen, uttalade regel.
 * Samma mönster som QuoteDocumentRow.tsx/SignatureCta.tsx: en egen,
 * fristående komponentfil per avgränsat ansvar.
 */
export function ReservationSuggestionBox({ suggestions, onReview, sectionAttrs }: ReservationSuggestionBoxProps) {
  const [dismissed, setDismissed] = useState(false)

  if (suggestions.length === 0 || dismissed) return null

  // Bugg (adversarial review): matchReservations kan producera en
  // triggeredBy-post med description: '' (t.ex. en produkt-/kategori-
  // trigger på en rad utan egen beskrivning). describeReservationSuggestionRows
  // filtrerar bort blanka poster men kan då själv returnera '' — om ALLA
  // träffar över samtliga förslag saknar beskrivning. Klausulen
  // "— följer med raderna X" ska då INTE renderas alls (annars: "N förslag
  // från Daniel — följer med raderna" med efterföljande blanksteg och
  // inga namn — läser som trasigt).
  const rowNames = describeReservationSuggestionRows(
    suggestions.flatMap(s => s.triggeredBy.map(t => t.description)),
  )

  return (
    <div {...sectionAttrs} className="reservation-suggestion-banner">
      <p className="reservation-suggestion-banner__text">
        <strong>{suggestions.length} förslag från Daniel</strong>
        {rowNames ? <> {'—'} följer med raderna {rowNames}</> : null}
      </p>
      <div className="reservation-suggestion-banner__actions">
        <button type="button" onClick={() => onReview?.()} className="reservation-suggestion-banner__cta">
          Ta ställning
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dölj tills vidare"
          title="Dölj tills vidare — förslagen finns kvar, nästa gång du öppnar offerten visas de igen"
          className="reservation-suggestion-banner__dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}
