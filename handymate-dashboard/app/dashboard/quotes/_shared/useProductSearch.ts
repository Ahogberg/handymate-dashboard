'use client'

/**
 * FLYTTAD (Prisslingan V2 pass 5, UX4a): hooken delas nu av offert- OCH
 * faktura-domänen och bor i lib/products/use-product-search.ts. Denna fil
 * är en ren re-export så offertens fyra sökytor slipper röras.
 */
export { useProductSearch, useAllProducts, useFavoriteProducts } from '@/lib/products/use-product-search'
