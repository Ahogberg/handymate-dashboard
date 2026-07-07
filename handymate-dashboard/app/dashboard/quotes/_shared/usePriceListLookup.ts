'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { type CustomCategory } from '@/lib/constants/categories'
import type { ProductWithComponents } from './applyProductToItem'

interface PriceItem {
  id: string
  category: string
  name: string
  unit: string
  unit_price: number
}

/**
 * Hämtar produktbanken (products, v67) + custom-kategorier för ett företag.
 * Ersätter döda `price_list` som källa (produktbank-konsolideringen —
 * TILLÄGG 1: products = artikelregistret; price_lists_v2 = kundprissättning,
 * RÖRS EJ). Favoriter först, sedan namn — snabbvals-knapparna visar de 8 första.
 *
 * Returnerar både den bakåtkompatibla PriceItem-mappningen (priceList) och
 * råa produkterna (products) så att snabbval kan gå genom applyProductToItem
 * med full produktdata (linked_product_id, ROT-flaggor, snapshot).
 */
export function usePriceListLookup(businessId: string | undefined | null) {
  const [priceList, setPriceList] = useState<PriceItem[]>([])
  const [products, setProducts] = useState<ProductWithComponents[]>([])
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (!businessId) return
    let mounted = true
    ;(async () => {
      const [productsRes, categoriesRes] = await Promise.all([
        supabase
          .from('products')
          .select('*')
          .eq('business_id', businessId)
          .eq('is_active', true)
          .order('is_favorite', { ascending: false })
          .order('name'),
        supabase
          .from('custom_quote_categories')
          .select('*')
          .eq('business_id', businessId)
          .order('created_at'),
      ])
      if (!mounted) return
      const rows = (productsRes.data as ProductWithComponents[]) || []
      setProducts(rows)
      setPriceList(
        rows.map(p => ({
          id: p.id,
          category: (p as { category?: string }).category ?? '',
          name: p.name,
          unit: p.unit,
          unit_price: p.sales_price,
        })),
      )
      setCustomCategories((categoriesRes.data as CustomCategory[]) || [])
      setHydrated(true)
    })()
    return () => {
      mounted = false
    }
  }, [businessId])

  return { priceList, products, customCategories, hydrated }
}
