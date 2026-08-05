/**
 * Reservationsmotorns kärna — matchar offertens rader mot reservationsbiblioteket.
 *
 * Idén (Andreas 2026-08-05): i stället för mallar kopplas reservationer till
 * ARTIKELTYPER, så systemet kan föreslå rätt förbehåll medan offerten byggs:
 * "Du har valt de här artiklarna — de här reservationerna hör till dem."
 *
 * Tre triggertyper, alla nödvändiga (se sql/v91_reservations.sql för resonemanget):
 *   product  → radens linked_product_id
 *   category → radens category_slug
 *   keyword  → radens beskrivning innehåller ordet
 *
 * DEDUPE: flera triggers kan peka på samma reservation. Resultatet unionerar
 * per reservation — två artiklar som båda utlöser asbest ger ETT förslag, med
 * båda raderna listade som motivering. Det är hela poängen med att ha
 * triggers i en egen tabell i stället för en text per artikel.
 *
 * Rena funktioner, ingen I/O — facit-testade i tests/reservations.spec.ts.
 */

export interface ReservationTrigger {
  trigger_type: 'product' | 'category' | 'keyword'
  product_id?: string | null
  category_slug?: string | null
  keyword?: string | null
}

export interface ReservationWithTriggers {
  id: string
  title: string
  content: string
  suggest_enabled?: boolean
  is_active?: boolean
  sort_order?: number
  triggers: ReservationTrigger[]
}

/** Den delmängd av en offertrad matchningen behöver. */
export interface MatchableItem {
  id: string
  description?: string | null
  category_slug?: string | null
  linked_product_id?: string | null
  item_type?: string
}

export interface ReservationSuggestion {
  reservation: ReservationWithTriggers
  /** Raderna som utlöste förslaget — visas som motivering i granskningsvyn. */
  triggeredBy: Array<{ itemId: string; description: string }>
}

/** En reservation som redan lagts till på offerten (snapshot-formen). */
export interface ReservationSnapshotEntry {
  reservation_id?: string | null
  title: string
  content: string
}

/**
 * Matchar EN rad mot EN reservations triggers. Exporterad för att kunna
 * facit-testas isolerat — matchningsregeln är den del av motorn som är lättast
 * att få subtilt fel.
 */
export function itemMatchesReservation(item: MatchableItem, reservation: ReservationWithTriggers): boolean {
  const description = (item.description || '').toLowerCase()

  return reservation.triggers.some(trigger => {
    if (trigger.trigger_type === 'product') {
      return !!trigger.product_id && !!item.linked_product_id && trigger.product_id === item.linked_product_id
    }
    if (trigger.trigger_type === 'category') {
      return !!trigger.category_slug && !!item.category_slug && trigger.category_slug === item.category_slug
    }
    if (trigger.trigger_type === 'keyword') {
      const keyword = (trigger.keyword || '').trim().toLowerCase()
      return keyword.length > 0 && description.includes(keyword)
    }
    return false
  })
}

/**
 * Huvudfunktionen: vilka reservationer bör föreslås för de här raderna?
 *
 * Filtrerar bort:
 *   - inaktiva och muted reservationer (inlärningen)
 *   - sådana som redan lagts till på offerten (snapshot)
 *   - sådana hantverkaren avvisat i den här sessionen
 *
 * Rubrik-, fritext-, delsumme- och rabattrader deltar inte i matchningen —
 * de beskriver inget utfört arbete och skulle bara ge falska träffar på
 * nyckelord i en rubriktext.
 */
export function matchReservations(
  items: MatchableItem[],
  library: ReservationWithTriggers[],
  opts: {
    alreadyAdded?: ReservationSnapshotEntry[]
    dismissedIds?: string[]
  } = {},
): ReservationSuggestion[] {
  const addedIds = new Set(
    (opts.alreadyAdded || []).map(entry => entry.reservation_id).filter((id): id is string => !!id),
  )
  const dismissed = new Set(opts.dismissedIds || [])

  const matchableItems = items.filter(item => {
    const type = item.item_type || 'item'
    return type === 'item' || type === 'option'
  })

  const suggestions: ReservationSuggestion[] = []

  for (const reservation of library) {
    if (reservation.is_active === false) continue
    if (reservation.suggest_enabled === false) continue
    if (addedIds.has(reservation.id)) continue
    if (dismissed.has(reservation.id)) continue

    const triggeredBy: Array<{ itemId: string; description: string }> = []
    for (const item of matchableItems) {
      if (itemMatchesReservation(item, reservation)) {
        triggeredBy.push({ itemId: item.id, description: item.description || '' })
      }
    }

    // Union per reservation — det är här dedupen sker.
    if (triggeredBy.length > 0) {
      suggestions.push({ reservation, triggeredBy })
    }
  }

  return suggestions.sort(
    (a, b) =>
      (a.reservation.sort_order ?? 0) - (b.reservation.sort_order ?? 0) ||
      a.reservation.title.localeCompare(b.reservation.title, 'sv'),
  )
}

/**
 * Lägger till valda förslag i offertens snapshot. Texten fryses som den ser ut
 * NU (hantverkaren kan ha redigerat den innan tillägget) — samma princip som
 * component_snapshot: offerten är juridiskt fristående från biblioteket.
 *
 * Idempotent på reservation_id, så dubbeltryck aldrig ger dubbla förbehåll.
 */
export function appendToSnapshot(
  current: ReservationSnapshotEntry[] | null | undefined,
  additions: ReservationSnapshotEntry[],
): ReservationSnapshotEntry[] {
  const result = [...(current || [])]
  for (const addition of additions) {
    const exists = result.some(
      entry =>
        (addition.reservation_id && entry.reservation_id === addition.reservation_id) ||
        (!addition.reservation_id && entry.title === addition.title),
    )
    if (!exists) result.push(addition)
  }
  return result
}

/** Tar bort en reservation ur snapshoten (×-knappen i dokumentet). */
export function removeFromSnapshot(
  current: ReservationSnapshotEntry[] | null | undefined,
  index: number,
): ReservationSnapshotEntry[] {
  const result = [...(current || [])]
  if (index < 0 || index >= result.length) return result
  result.splice(index, 1)
  return result
}

/** Efter hur många avvisningar i rad vi slutar föreslå en reservation. */
export const MUTE_AFTER_CONSECUTIVE_REJECTS = 3

/**
 * Ren regel för inlärningen: ska reservationen tystas efter det här utfallet?
 * Accept nollställer räknaren — en reservation som används ibland ska aldrig
 * försvinna bara för att den avvisats tre gånger utspritt över ett år.
 */
export function shouldMuteAfterDecision(consecutiveRejects: number, decision: 'accepted' | 'rejected'): boolean {
  if (decision === 'accepted') return false
  return consecutiveRejects + 1 >= MUTE_AFTER_CONSECUTIVE_REJECTS
}
