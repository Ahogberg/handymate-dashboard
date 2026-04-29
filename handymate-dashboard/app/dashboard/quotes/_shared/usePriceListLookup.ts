'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { type CustomCategory } from '@/lib/constants/categories'

interface PriceItem {
  id: string
  category: string
  name: string
  unit: string
  unit_price: number
}

/**
 * Hämtar prislista + custom-kategorier för ett företag. Kapslar in den
 * gemensamma laddningslogiken som både new- och edit-vyerna behöver.
 */
export function usePriceListLookup(businessId: string | undefined | null) {
  const [priceList, setPriceList] = useState<PriceItem[]>([])
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (!businessId) return
    let mounted = true
    ;(async () => {
      const [priceListRes, categoriesRes] = await Promise.all([
        supabase
          .from('price_list')
          .select('*')
          .eq('business_id', businessId)
          .eq('is_active', true),
        supabase
          .from('custom_quote_categories')
          .select('*')
          .eq('business_id', businessId)
          .order('created_at'),
      ])
      if (!mounted) return
      setPriceList(priceListRes.data || [])
      setCustomCategories((categoriesRes.data as CustomCategory[]) || [])
      setHydrated(true)
    })()
    return () => {
      mounted = false
    }
  }, [businessId])

  return { priceList, customCategories, hydrated }
}
