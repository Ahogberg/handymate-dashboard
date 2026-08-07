'use client'

import { useEffect, useState } from 'react'
import type { ProductWithComponents } from './applyProductToItem'

/**
 * Delad produktsökning för offert-editorns fyra sökytor: QuoteAddRowCombo
 * (listvyn), QuoteRowProductCombo (inline i raden), AddRowSheet och
 * RowEditSheet (mobilen).
 *
 * Låg sina egna kopior i varje komponent tidigare — samma debounce, samma
 * fetch, samma felhantering skriven fyra gånger. En delad hook betyder också
 * att en förbättring av sökningen (synonymer, rankning) slår igenom överallt
 * samtidigt.
 *
 * `include=components` alltid: raden ska kunna byggas med fryst
 * component_snapshot direkt vid val, utan en extra rundtur.
 */
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

/**
 * HELA artikelbanken — underlaget för att BLÄDDRA, inte söka (spår B2).
 *
 * AddRowSheet visade tidigare favoriterna och ett sökfält. Sökning som enda
 * väg in förutsätter att hantverkaren vet vad artikeln HETER; bläddring gör
 * det inte, och efter utökningen 2026-08-06 (95 artiklar för el, 84 för bygg)
 * är det skillnaden mellan en bank han använder och en han gissar sig förbi.
 *
 * Utan `search` sätter GET /api/products ingen limit, så ett anrop räcker —
 * och `include=components` gör att raden kan byggas med fryst
 * component_snapshot direkt vid val, utan en extra rundtur.
 *
 * Favoriterna plockas ur samma svar (`is_favorite`) i stället för ett eget
 * anrop: två hämtningar av samma tabell kunde dessutom hinna gå isär.
 */
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

/**
 * Favoritartiklarna — det hantverkaren når oftast. Visas överst i AddRowSheet
 * innan något sökts, så vanligaste raden är ett tryck bort.
 */
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
