'use client'

import { useCallback } from 'react'
import type { InvoiceItem, InvoiceItemType } from '@/lib/types/invoice'
import { createDefaultInvoiceItem, recalculateItems } from '@/lib/invoice-calculations'

/**
 * ETAPP 6c (offert-masterplan.md, faktura-sprinten): id-baserade
 * item-handlers för fakturans canvas — speglar app/dashboard/quotes/
 * _shared/useQuoteItems.ts's mönster (id istället för index, så
 * QuoteDocumentHandlers.onItemChange/onItemRemove/onItemRotRutCycle kan
 * återanvändas rakt av för docType='invoice'). LineItemEditor.tsx (Listvyn)
 * fortsätter mutera `items` direkt via sin egen index-baserade onChange —
 * båda vägarna skriver till SAMMA items/setItems-state hos anroparen, ingen
 * konflikt.
 */
export function useInvoiceItems(
  items: InvoiceItem[],
  setItems: React.Dispatch<React.SetStateAction<InvoiceItem[]>>,
) {
  const addItem = useCallback(
    (type: InvoiceItemType = 'item') => {
      const newItem = createDefaultInvoiceItem(type, items.length)
      setItems(prev => recalculateItems([...prev, newItem]))
    },
    [items.length, setItems],
  )

  const updateItem = useCallback(
    (id: string, patch: Partial<InvoiceItem>) => {
      setItems(prev => recalculateItems(prev.map(item => (item.id === id ? { ...item, ...patch } : item))))
    },
    [setItems],
  )

  const removeItem = useCallback(
    (id: string) => {
      setItems(prev => recalculateItems(prev.filter(item => item.id !== id)))
    },
    [setItems],
  )

  return { addItem, updateItem, removeItem }
}
