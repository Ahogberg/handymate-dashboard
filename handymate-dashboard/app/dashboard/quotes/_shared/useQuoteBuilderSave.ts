'use client'

import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'
import type { useRouter } from 'next/navigation'
import type { useToast } from '@/components/Toast'
import type { QuoteItem } from '@/lib/types/quote'
import type { ProductWithComponents } from './applyProductToItem'
import { buildQuotePayload, type QuotePayloadContext } from './buildQuotePayload'

type ToastApi = ReturnType<typeof useToast>
type AppRouter = ReturnType<typeof useRouter>

export interface UseQuoteBuilderSaveParams {
  /** Bara 'create' används idag (new/page.tsx). Strukturen är förberedd så
      Fas 2 kan lägga till ett 'edit'-läge (PUT i stället för POST) utan en
      omskrivning av anroparen. */
  mode: 'create'
  items: QuoteItem[]
  setItems: Dispatch<SetStateAction<QuoteItem[]>>
  products: ProductWithComponents[]
  setLocalPrice: (productId: string, salesPrice: number) => void
  setSendConfirmPending: (v: boolean) => void
  toast: ToastApi
  router: AppRouter
  /** Allt utom `items` som payloaden behöver, hämtat FÄRSKT vid varje
      anrop av `save()` — items hanteras separat nedan eftersom de kan
      muteras (produktbanks-auto-länkning) innan payloaden byggs. */
  getContext: () => QuotePayloadContext
}

/**
 * Spar-/skicka-logiken för offertskaparen (Fas 1, offert-omtaget
 * 2026-08-31) — extraherad ur `new/page.tsx`s `saveQuote`.
 *
 * Gör TVÅ saker utöver själva POST:en:
 * 1. Auto-länkar/skapar produktbanksartiklar för AI-rader som saknade pris
 *    och som hantverkaren fyllt i (UX1e, "Prisslingan V2") — prisslingans
 *    "priset förtjänas av användning".
 * 2. Skyddar mot att skicka utan kund/beskrivning/en ogiltig betalplan.
 */
export function useQuoteBuilderSave({
  items,
  setItems,
  products,
  setLocalPrice,
  setSendConfirmPending,
  toast,
  router,
  getContext,
}: UseQuoteBuilderSaveParams) {
  const [saving, setSaving] = useState(false)

  const save = useCallback(
    async (send: boolean = false, skipDescriptionConfirm: boolean = false) => {
      const ctx = getContext()

      if (send && !ctx.selectedCustomer) {
        toast.warning('Välj en kund först för att skicka offerten')
        return
      }
      if (send && !ctx.description.trim() && !skipDescriptionConfirm) {
        setSendConfirmPending(true)
        return
      }
      setSendConfirmPending(false)
      if (ctx.paymentPlan.length > 0 && !ctx.paymentPlanValid) {
        toast.warning('Betalningsplanens procentsatser måste summera till 100%')
        return
      }

      setSaving(true)
      try {
        // P4 (UX-revision 2026-08-03): AI-rader som saknade pris, som
        // användaren fyllt i och lämnat ikryssade ("Spara i produktbanken",
        // default PÅ — se ItemRow) — auto-POSTas till /api/products HÄR,
        // före offerten sparas, så nästa AI-offert hittar priset.
        // `workingItems` är en lokal kopia (inte `items`-state) eftersom
        // setState inte reflekteras synkront — linked_product_id måste
        // hinna sättas innan finalItems byggs.
        let workingItems = items

        // UX1e (Prisslingan V2): LÄNKADE prislösa rader prissätter BANKEN.
        // Med UX1d länkas AI-rader till prislösa artiklar (handtag +
        // productRef) — när hantverkaren fyllt i priset ska det landa på
        // artikeln (PUT), inte skapa en dubblett. Det är hela "priset
        // förtjänas"-loopen.
        const linkedPriceCandidates = workingItems.filter(
          i =>
            i.item_type === 'item' &&
            i.ai_price_missing &&
            i.save_to_products !== false &&
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
          } catch (err) {
            console.error('[useQuoteBuilderSave] kunde inte prissätta bankartikeln:', err)
          }
        }

        const autoSaveCandidates = workingItems.filter(
          i =>
            i.item_type === 'item' &&
            i.ai_price_missing &&
            i.save_to_products !== false &&
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
              if (res.ok) {
                const data = await res.json()
                const newId = data.product?.id
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
              console.error('[useQuoteBuilderSave] auto-save till produktbanken misslyckades:', err)
            }
          }
        }
        if (linkedPriceCandidates.length > 0 || autoSaveCandidates.length > 0) {
          setItems(workingItems)
        }

        const payload = buildQuotePayload({ ...ctx, items: workingItems })

        const res = await fetch('/api/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error || 'Kunde inte spara offerten')
        } else {
          toast.success(send ? 'Offert sparad — öppnar skicka-vy' : 'Offert sparad som utkast')
          router.push(
            send
              ? `/dashboard/quotes/${data.quote.quote_id}?send=true`
              : `/dashboard/quotes/${data.quote.quote_id}`,
          )
        }
      } catch (err) {
        console.error('Save failed:', err)
        toast.error('Kunde inte spara offerten')
      }
      setSaving(false)
    },
    [items, setItems, products, setLocalPrice, setSendConfirmPending, toast, router, getContext],
  )

  return { saving, save }
}
