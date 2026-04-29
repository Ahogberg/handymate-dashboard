'use client'

import { useCallback } from 'react'
import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { createDefaultItem, generateItemId } from '@/lib/quote-calculations'
import { getCategoryRotRut, type CustomCategory } from '@/lib/constants/categories'
import type { QuoteItem, RotRutType } from '@/lib/types/quote'
import type { SelectedProduct } from '@/lib/suppliers/types'

interface PriceItem {
  id: string
  category: string
  name: string
  unit: string
  unit_price: number
}

/** Normalize legacy unit values to the new set */
export function normalizeUnit(unit: string): string {
  const map: Record<string, string> = {
    hour: 'tim',
    timmar: 'tim',
    h: 'tim',
    piece: 'st',
    styck: 'st',
  }
  return map[unit.toLowerCase()] || unit
}

/**
 * Items-state-handlers + drag-and-drop. Tar items + setter som argument
 * (state förvaltas i orchestrator) så hook:en kan användas i både
 * new- och edit-vyerna utan tvång på state-design.
 */
export function useQuoteItems(
  items: QuoteItem[],
  setItems: React.Dispatch<React.SetStateAction<QuoteItem[]>>,
  customCategories: CustomCategory[],
  pricingHydrated: boolean = true,
) {
  const addItem = useCallback(
    (type: QuoteItem['item_type']) => {
      const sortOrder = items.length
      const newItem = createDefaultItem(type, sortOrder)
      if (type === 'item' && pricingHydrated) {
        newItem.unit_price = 0
        newItem.quantity = 1
      }
      setItems(prev => [...prev, newItem])
    },
    [items.length, pricingHydrated, setItems],
  )

  const updateItem = useCallback(
    (id: string, field: keyof QuoteItem, value: any) => {
      setItems(prev =>
        prev.map(item => {
          if (item.id !== id) return item
          const updated = { ...item, [field]: value }
          // Recalc line total for normal items and discounts
          if (updated.item_type === 'item') {
            updated.total = updated.quantity * updated.unit_price
          } else if (updated.item_type === 'discount') {
            updated.total = -(Math.abs(updated.quantity) * Math.abs(updated.unit_price))
          }
          // Category auto-detection: set ROT/RUT based on category
          if (field === 'category_slug' && value) {
            const catRotRut = getCategoryRotRut(value, customCategories)
            if (catRotRut.rot) {
              updated.is_rot_eligible = true
              updated.is_rut_eligible = false
              updated.rot_rut_type = 'rot'
            } else if (catRotRut.rut) {
              updated.is_rot_eligible = false
              updated.is_rut_eligible = true
              updated.rot_rut_type = 'rut'
            }
          }
          // Sync rot_rut_type with boolean flags
          if (field === 'rot_rut_type') {
            updated.rot_rut_type = (value || null) as RotRutType
            updated.is_rot_eligible = value === 'rot'
            updated.is_rut_eligible = value === 'rut'
          }
          if (field === 'is_rot_eligible' && value === true) {
            updated.is_rut_eligible = false
            updated.rot_rut_type = 'rot'
          }
          if (field === 'is_rut_eligible' && value === true) {
            updated.is_rot_eligible = false
            updated.rot_rut_type = 'rut'
          }
          return updated
        }),
      )
    },
    [customCategories, setItems],
  )

  const removeItem = useCallback(
    (id: string) => {
      setItems(prev => prev.filter(item => item.id !== id))
    },
    [setItems],
  )

  const moveItem = useCallback(
    (index: number, direction: 'up' | 'down') => {
      setItems(prev => {
        const newArr = [...prev]
        const targetIdx = direction === 'up' ? index - 1 : index + 1
        if (targetIdx < 0 || targetIdx >= newArr.length) return prev
        ;[newArr[index], newArr[targetIdx]] = [newArr[targetIdx], newArr[index]]
        return newArr.map((item, i) => ({ ...item, sort_order: i }))
      })
    },
    [setItems],
  )

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor),
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      setItems(prev => {
        const oldIndex = prev.findIndex(i => i.id === active.id)
        const newIndex = prev.findIndex(i => i.id === over.id)
        if (oldIndex === -1 || newIndex === -1) return prev
        const newArr = [...prev]
        const [moved] = newArr.splice(oldIndex, 1)
        newArr.splice(newIndex, 0, moved)
        return newArr.map((item, i) => ({ ...item, sort_order: i }))
      })
    },
    [setItems],
  )

  const addFromGrossist = useCallback(
    (product: SelectedProduct) => {
      const newItem: QuoteItem = {
        id: generateItemId(),
        item_type: 'item',
        description: product.name,
        article_number: product.sku,
        quantity: 1,
        unit: normalizeUnit(product.unit),
        unit_price: product.sell_price,
        cost_price: product.purchase_price,
        total: product.sell_price,
        is_rot_eligible: false,
        is_rut_eligible: false,
        sort_order: 0,
      }
      setItems(prev => {
        newItem.sort_order = prev.length
        return [...prev, newItem]
      })
    },
    [setItems],
  )

  const addFromPriceList = useCallback(
    (priceItem: PriceItem) => {
      const newItem: QuoteItem = {
        id: generateItemId(),
        item_type: 'item',
        description: priceItem.name,
        quantity: 1,
        unit: normalizeUnit(priceItem.unit),
        unit_price: priceItem.unit_price,
        total: priceItem.unit_price,
        is_rot_eligible: priceItem.category === 'labor',
        is_rut_eligible: false,
        sort_order: 0,
      }
      setItems(prev => {
        newItem.sort_order = prev.length
        return [...prev, newItem]
      })
    },
    [setItems],
  )

  return {
    addItem,
    updateItem,
    removeItem,
    moveItem,
    dndSensors,
    handleDragEnd,
    addFromGrossist,
    addFromPriceList,
  }
}
