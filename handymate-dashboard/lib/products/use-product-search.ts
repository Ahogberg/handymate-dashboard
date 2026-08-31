'use client'

/**
 * Delad produktsökning — NEUTRAL plats (Prisslingan V2 pass 5, UX4a).
 *
 * Flyttad från app/dashboard/quotes/_shared/useProductSearch.ts: hooken
 * delas nu av TVÅ domäner (offertens fyra sökytor + fakturans
 * artikelväljare), och en hook i quotes/_shared som importeras av
 * components/invoices vore fel riktning på beroendet. Gamla filen
 * re-exporterar härifrån — offertytorna är orörda.
 */
import { useEffect, useState } from 'react'
import type { ProductWithComponents } from '@/app/dashboard/quotes/_shared/applyProductToItem'

export function useProductSearch(query: string, opts: { debounceMs?: number; minChars?: number } = {}) {
  const debounceMs = opts.debounceMs ?? 200
  const minChars = opts.minChars ?? 1

  const [results, setResults] = useState<ProductWithComponents[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < minChars) {
      setResults([])
      setLoading(false)
      return
    }

    let active = true
    const timer = setTimeout(() => {
      setLoading(true)
      fetch(`/api/products?search=${encodeURIComponent(trimmed)}&include=components`)
        .then(r => (r.ok ? r.json() : { products: [] }))
        .then(data => {
          if (active) setResults(data.products || [])
        })
        .catch(() => {
          if (active) setResults([])
        })
        .finally(() => {
          if (active) setLoading(false)
        })
    }, debounceMs)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [query, debounceMs, minChars])

  return { results, loading }
}

/** HELA artikelbanken — för bläddring (se ursprungskommentaren i quotes/_shared). */
export function useAllProducts(enabled: boolean) {
  const [products, setProducts] = useState<ProductWithComponents[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled) return
    let active = true
    setLoading(true)
    fetch('/api/products?include=components')
      .then(r => (r.ok ? r.json() : { products: [] }))
      .then(data => {
        if (active) setProducts(data.products || [])
      })
      .catch(() => {
        if (active) setProducts([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [enabled])

  return { products, loading }
}

/** Favoritartiklarna — vanligaste raden ett tryck bort. */
export function useFavoriteProducts(enabled: boolean) {
  const [favorites, setFavorites] = useState<ProductWithComponents[]>([])

  useEffect(() => {
    if (!enabled) return
    let active = true
    fetch('/api/products?favorites=true&include=components')
      .then(r => (r.ok ? r.json() : { products: [] }))
      .then(data => {
        if (active) setFavorites(data.products || [])
      })
      .catch(() => {
        if (active) setFavorites([])
      })
    return () => {
      active = false
    }
  }, [enabled])

  return favorites
}
