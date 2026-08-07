'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { QuoteItem } from '@/lib/types/quote'
import {
  matchReservations,
  appendToSnapshot,
  removeFromSnapshot,
  type ReservationWithTriggers,
  type ReservationSnapshotEntry,
  type ReservationSuggestion,
} from '@/lib/reservations/match'

/**
 * Reservationsmotorns editor-sida — delad av BÅDA offertytorna (new och edit).
 *
 * Byggd som en hook från start eftersom inkopplingen i två sidfiler på ~1300
 * respektive ~2000 rader är den enda verkliga integrationsrisken i etapp 3;
 * själva matchningen är trivial och ren (lib/reservations/match.ts).
 *
 * Biblioteket hämtas EN gång vid mount. Matchningen körs sedan lokalt i en
 * useMemo över raderna — motorn gör aldrig ett serveranrop medan hantverkaren
 * skriver.
 */
export function useReservationSuggestions(items: QuoteItem[], initialSnapshot?: ReservationSnapshotEntry[] | null) {
  const [library, setLibrary] = useState<ReservationWithTriggers[]>([])
  const [snapshot, setSnapshot] = useState<ReservationSnapshotEntry[]>(initialSnapshot || [])
  // Avvisade i den här sessionen — medvetet INTE i databasen. Ett "hoppa över"
  // ska gälla den här offerten, inte tysta reservationen för all framtid; det
  // gör inlärningen (tre avvisningar i rad) i stället.
  const [dismissedIds, setDismissedIds] = useState<string[]>([])
  const [reviewOpen, setReviewOpen] = useState(false)
  const [mutedNotice, setMutedNotice] = useState<{ id: string; title: string } | null>(null)

  useEffect(() => {
    let active = true
    fetch('/api/reservations?include=triggers')
      .then(r => (r.ok ? r.json() : { reservations: [] }))
      .then(data => {
        if (active) setLibrary(data.reservations || [])
      })
      .catch(() => {
        if (active) setLibrary([])
      })
    return () => {
      active = false
    }
  }, [])

  // Ladda om snapshoten när offerten hämtats klart (edit-sidan sätter items
  // och reservations_snapshot asynkront).
  useEffect(() => {
    if (initialSnapshot && initialSnapshot.length > 0) setSnapshot(initialSnapshot)
  }, [initialSnapshot])

  const suggestions: ReservationSuggestion[] = useMemo(
    () => matchReservations(items, library, { alreadyAdded: snapshot, dismissedIds }),
    [items, library, snapshot, dismissedIds],
  )

  /**
   * SPÅR C2 (2026-08-06): hur många förbehåll en artikel skulle dra med sig,
   * innan den lagts till.
   *
   * Motorn kunde redan matcha på artikel-id (match.ts:70) — det som saknades
   * var att köra den i FÖRVÄG och visa svaret där artikeln väljs. Det är exakt
   * det Andreas menar med att förbehållen ska kännas av per automatik.
   *
   * Räknar bara det som faktiskt vore NYTT: reservationer som redan ligger på
   * offerten eller avvisats i den här sessionen räknas inte. "1 förbehåll
   * följer med" om det redan står i offerten hade varit en osanning på den
   * plats där hantverkaren fattar beslutet.
   *
   * Kategoritriggrar kan inte fånga något här, och det är avsiktligt:
   * applyProductToItem sätter ingen `category_slug`, och produktens `category`
   * ('arbete') och offertradens slug ('arbete_el') är olika vokabulärer utan
   * härledbar mappning. Att gissa hade gett en siffra som ser exakt ut men
   * pekar fel. Produkt- och nyckelordstriggrar är de som verkligen utlöser.
   */
  const countForProduct = useCallback(
    (product: { id: string; name: string }) => {
      const hypotetisk = {
        id: `forhandsgranskning_${product.id}`,
        description: product.name,
        linked_product_id: product.id,
        category_slug: null,
        item_type: 'item',
      }
      return matchReservations([hypotetisk], library, {
        alreadyAdded: snapshot,
        dismissedIds,
      }).length
    },
    [library, snapshot, dismissedIds],
  )

  const sendDecisions = useCallback(
    (decisions: Array<{ reservation_id: string; decision: 'accepted' | 'rejected' }>) => {
      if (decisions.length === 0) return
      fetch('/api/reservations/decisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisions }),
      })
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          const mutedId: string | undefined = data?.muted?.[0]
          if (!mutedId) return
          const reservation = library.find(r => r.id === mutedId)
          if (reservation) setMutedNotice({ id: mutedId, title: reservation.title })
        })
        .catch(() => { /* inlärningen är en bekvämlighet — aldrig blockerande */ })
    },
    [library],
  )

  /** Lägger till valda förslag och registrerar utfallet för de övriga. */
  const acceptSuggestions = useCallback(
    (accepted: Array<{ reservation_id: string; title: string; content: string }>, rejectedIds: string[]) => {
      if (accepted.length > 0) {
        setSnapshot(prev => appendToSnapshot(prev, accepted))
      }
      if (rejectedIds.length > 0) {
        setDismissedIds(prev => Array.from(new Set([...prev, ...rejectedIds])))
      }
      sendDecisions([
        ...accepted.map(a => ({ reservation_id: a.reservation_id, decision: 'accepted' as const })),
        ...rejectedIds.map(id => ({ reservation_id: id, decision: 'rejected' as const })),
      ])
      setReviewOpen(false)
    },
    [sendDecisions],
  )

  /** "Hoppa över" — allt i vyn avvisas för den här offerten. */
  const dismissAll = useCallback(() => {
    const ids = suggestions.map(s => s.reservation.id)
    setDismissedIds(prev => Array.from(new Set([...prev, ...ids])))
    sendDecisions(ids.map(id => ({ reservation_id: id, decision: 'rejected' as const })))
    setReviewOpen(false)
  }, [suggestions, sendDecisions])

  const removeReservation = useCallback((index: number) => {
    setSnapshot(prev => removeFromSnapshot(prev, index))
  }, [])

  /** Ångra en automatisk tystning. */
  const unmute = useCallback((reservationId: string) => {
    fetch('/api/reservations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: reservationId, suggest_enabled: true }),
    }).catch(() => { /* icke-blockerande */ })
    setMutedNotice(null)
  }, [])

  return {
    suggestions,
    countForProduct,
    snapshot,
    setSnapshot,
    reviewOpen,
    setReviewOpen,
    acceptSuggestions,
    dismissAll,
    removeReservation,
    mutedNotice,
    dismissMutedNotice: () => setMutedNotice(null),
    unmute,
  }
}
