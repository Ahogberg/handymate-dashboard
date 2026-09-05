'use client'

import { useCallback, useState, useRef, type Dispatch, type SetStateAction } from 'react'
import type { useRouter } from 'next/navigation'
import type { useToast } from '@/components/Toast'
import type { QuoteItem } from '@/lib/types/quote'
import type { ProductWithComponents } from './applyProductToItem'
import { buildQuotePayload, type QuotePayloadContext } from './buildQuotePayload'

type ToastApi = ReturnType<typeof useToast>
type AppRouter = ReturnType<typeof useRouter>

export interface UseQuoteBuilderSaveParams {
  /** 'create' → POST /api/quotes (new/page.tsx). 'edit' → PUT /api/quotes
      (Fas 2, offert-omtaget 2026-08-31 — [id]/edit/page.tsx). */
  mode: 'create' | 'edit'
  items: QuoteItem[]
  setItems: Dispatch<SetStateAction<QuoteItem[]>>
  products: ProductWithComponents[]
  setLocalPrice: (productId: string, salesPrice: number) => void
  setSendConfirmPending: (v: boolean) => void
  toast: ToastApi
  router: AppRouter
  /** Allt utom `items` som payloaden behöver, hämtat FÄRSKT vid varje
      anrop av `save()`/`performAutoSave()` — items hanteras separat nedan
      eftersom de kan muteras (produktbanks-auto-länkning) innan payloaden
      byggs. Edit-läget sätter ctx.status till offertens LADDADE status
      (idempotent autospar) — se buildQuotePayload.ts. */
  getContext: () => QuotePayloadContext
  /** Krävs när mode==='edit' — quote_id för PUT och navigering. */
  quoteId?: string
  onSaved?: () => void
}

/**
 * Spar-/skicka-/autospar-logiken för offertbyggaren (Fas 1+2, offert-
 * omtaget 2026-08-31) — extraherad ur `new/page.tsx`s `saveQuote` (Fas 1)
 * respektive `[id]/edit/page.tsx`s `saveQuote`/`performAutoSave` (Fas 2).
 *
 * TVÅ sparvägar, en per läge:
 * - `save(send)`: explicit knapptryck (Spara utkast/Skicka). Validerar kund/
 *   betalplan och navigerar efter lyckad sparning till den riktiga
 *   skicka-dialogen. Bara /api/quotes/send får sätta status 'sent'.
 * - `performAutoSave()`: EDIT-LÄGE ENDAST, tyst 5s-debounce-autospar (samma
 *   PUT-väg, ingen navigering/toast, ingen validering) — triggas av en
 *   useEffect i QuoteBuilder.tsx som bevakar exakt samma fält som den gamla
 *   edit-sidans autospar-effekt gjorde.
 *
 * `save()` gör därutöver, ENDAST i create-läget:
 * 1. Auto-länkar/skapar produktbanksartiklar för AI-rader som saknade pris
 *    och som hantverkaren fyllt i (UX1e, "Prisslingan V2") — prisslingans
 *    "priset förtjänas av användning". De transienta `ai_price_missing`-
 *    flaggorna finns aldrig på en redan sparad (laddad) offert, så det här
 *    blocket vore ändå ett no-op i edit-läge — hoppas över explicit för
 *    tydlighetens skull.
 * 2. Skyddar mot att skicka utan kund/beskrivning (beskrivnings-
 *    bekräftelsen är create-egen — edit-sidan hade den aldrig)/en ogiltig
 *    betalplan (delad, båda lägena).
 */
export function useQuoteBuilderSave({
  mode,
  items,
  setItems,
  products,
  setLocalPrice,
  setSendConfirmPending,
  toast,
  router,
  getContext,
  quoteId,
  onSaved,
}: UseQuoteBuilderSaveParams) {
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const save = useCallback(
    async (send: boolean = false, skipDescriptionConfirm: boolean = false) => {
      if (inFlight.current) return
      const ctx = getContext()

      if (send && !ctx.selectedCustomer) {
        toast.warning('Välj en kund först för att skicka offerten')
        return
      }
      // Beskrivnings-bekräftelsen är en create-egen skyddsräcke (ETAPP 1f) —
      // edit-sidans saveQuote(send) hade aldrig detta mellansteg.
      if (mode === 'create' && send && !ctx.description.trim() && !skipDescriptionConfirm) {
        setSendConfirmPending(true)
        return
      }
      setSendConfirmPending(false)
      if (ctx.paymentPlan.length > 0 && !ctx.paymentPlanValid) {
        toast.warning('Betalningsplanens procentsatser måste summera till 100%')
        return
      }

      inFlight.current = true
      setSaving(true)
      try {
        // `workingItems` är en lokal kopia (inte `items`-state) eftersom
        // setState inte reflekteras synkront — linked_product_id måste
        // hinna sättas innan finalItems byggs.
        let workingItems = items
        let registerFailed = false

        if (mode === 'create') {
          // P4 (UX-revision 2026-08-03): AI-rader som saknade pris, som
          // användaren fyllt i och lämnat ikryssade ("Spara i produktbanken",
          // aktivt val — se ItemRow) — auto-POSTas till /api/products HÄR,
          // före offerten sparas, så nästa AI-offert hittar priset.

          // UX1e (Prisslingan V2): LÄNKADE prislösa rader prissätter BANKEN.
          // Med UX1d länkas AI-rader till prislösa artiklar (handtag +
          // productRef) — när hantverkaren fyllt i priset ska det landa på
          // artikeln (PUT), inte skapa en dubblett. Det är hela "priset
          // förtjänas"-loopen.
          const linkedPriceCandidates = workingItems.filter(
            i =>
              i.item_type === 'item' &&
              i.ai_price_missing &&
              i.save_to_products === true &&
              i.unit_price > 0 &&
              !!i.linked_product_id,
          )
          for (const row of linkedPriceCandidates) {
            try {
              const res = await fetch('/api/products', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: row.linked_product_id, sales_price: row.unit_price }),
              })
              if (res.ok) setLocalPrice(row.linked_product_id as string, row.unit_price)
              else registerFailed = true
            } catch (err) {
              registerFailed = true
              console.error('[useQuoteBuilderSave] kunde inte prissätta bankartikeln:', err)
            }
          }

          const autoSaveCandidates = workingItems.filter(
            i =>
              i.item_type === 'item' &&
              i.ai_price_missing &&
              i.save_to_products === true &&
              i.unit_price > 0 &&
              !i.linked_product_id &&
              i.description.trim() !== '',
          )
          if (autoSaveCandidates.length > 0) {
            for (const row of autoSaveCandidates) {
              try {
                // UX1e dubblettvakt: exakt namnmatch (case-okänslig) mot banken
                // FÖRE POST. Träff på prislös artikel → prissätt + länka; träff
                // på prissatt → bara länka. Backend-upserten är huvudskyddet;
                // detta är den billiga klientvakten.
                const träff = products.find(
                  p => p.name.trim().toLowerCase() === row.description.trim().toLowerCase(),
                )
                if (träff) {
                  if (!(träff.sales_price > 0)) {
                    const res = await fetch('/api/products', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ id: träff.id, sales_price: row.unit_price }),
                    })
                    if (res.ok) setLocalPrice(träff.id, row.unit_price)
                    else registerFailed = true
                  }
                  workingItems = workingItems.map(i => (i.id === row.id ? { ...i, linked_product_id: träff.id } : i))
                  continue
                }

                const res = await fetch('/api/products', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    name: row.description,
                    description: null,
                    category: row.category_slug || 'material_bygg',
                    sku: null,
                    unit: row.unit,
                    purchase_price: row.cost_price ?? null,
                    sales_price: row.unit_price,
                    rot_eligible: row.is_rot_eligible,
                    rut_eligible: row.is_rut_eligible,
                    is_favorite: false,
                  }),
                })
                if (!res.ok) registerFailed = true
                if (res.ok) {
                  const data = await res.json()
                  const newId = data.product?.id
                  if (!newId) registerFailed = true
                  if (newId) {
                    workingItems = workingItems.map(i => (i.id === row.id ? { ...i, linked_product_id: newId } : i))
                    // C4 (Prisslingan V2 pass 3): servern kan ha ÅTERANVÄNT en
                    // befintlig artikel (created:false) och prissatt den —
                    // spegla lokalt så väljare/standardpris-erbjudandet ser
                    // rätt pris direkt.
                    if (data.created === false && data.updated_price) {
                      setLocalPrice(newId, row.unit_price)
                    }
                  }
                }
              } catch (err) {
                // Sväljs medvetet — en misslyckad produktbanks-auto-save får
                // aldrig blockera offert-sparandet.
                registerFailed = true
                console.error('[useQuoteBuilderSave] auto-save till produktbanken misslyckades:', err)
              }
            }
          }
          if (linkedPriceCandidates.length > 0 || autoSaveCandidates.length > 0) {
            setItems(workingItems)
          }
        }

        // Skicka betyder här SPARA och öppna den riktiga skicka-dialogen.
        // Den äldre edit-vägen satte status='sent' direkt i PUT och visade
        // "Offert skickad" utan något utskick. Leveranssanningen ägs av
        // /api/quotes/send, precis som i create-läget.
        const payload = buildQuotePayload({
          ...ctx,
          items: workingItems,
          mode,
          quoteId,
        })

        const res = await fetch('/api/quotes', {
          method: mode === 'edit' ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error || 'Kunde inte spara offerten')
        } else if (mode === 'edit') {
          onSaved?.()
          toast.success(send ? 'Offerten är sparad — välj hur den ska skickas' : 'Offert sparad')
          if (send) {
            router.push(`/dashboard/quotes/${quoteId}?send=true`)
          } else {
            setAutoSaveStatus('saved')
            setTimeout(() => setAutoSaveStatus('idle'), 3000)
          }
        } else {
          if (typeof data.quote?.quote_id !== 'string' || !data.quote.quote_id) throw new Error('Quote save was not confirmed')
          onSaved?.()
          toast.success(send ? 'Offert sparad — öppnar skicka-vy' : 'Offert sparad som utkast')
          router.push(
            send
              ? `/dashboard/quotes/${data.quote.quote_id}?send=true`
              : `/dashboard/quotes/${data.quote.quote_id}`,
          )
        }
        if (res.ok && registerFailed) toast.warning('Alla valda priser kunde inte sparas i artikelregistret. Kontrollera dem där.')
      } catch (err) {
        console.error('Save failed:', err)
        toast.error('Kunde inte spara offerten')
      }
      inFlight.current = false
      setSaving(false)
    },
    [mode, items, setItems, products, setLocalPrice, setSendConfirmPending, toast, router, getContext, quoteId, onSaved],
  )

  // EDIT-LÄGE ENDAST: tyst bakgrundsspar, ingen navigering/toast/validering
  // — motsvarar exakt gamla edit-sidans `performAutoSave()`. Triggas av en
  // debounce-useEffect i QuoteBuilder.tsx (samma 5s + samma bevakade fält
  // som förr), INTE härifrån — timern behöver leva där state:et lever.
  const performAutoSave = useCallback(async () => {
    if (mode !== 'edit') return
    setAutoSaveStatus('saving')
    try {
      const ctx = getContext()
      const payload = buildQuotePayload({ ...ctx, items, mode, quoteId })
      const res = await fetch('/api/quotes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        setAutoSaveStatus('saved')
        setTimeout(() => setAutoSaveStatus('idle'), 3000)
      } else {
        setAutoSaveStatus('error')
      }
    } catch {
      setAutoSaveStatus('error')
    }
  }, [mode, items, getContext, quoteId])

  return { saving, save, autoSaveStatus, performAutoSave }
}
