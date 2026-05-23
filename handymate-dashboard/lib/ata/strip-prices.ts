/**
 * Pris-stripping för ÄTA (project_change) — gemensam helper.
 *
 * Bakgrund (TD-77, 2026-05-23): Etapp 4b steg 2 lade till see_financials-
 * gate på /api/projects/[id]/changes GET. Verifiering avslöjade att
 * ÄTA-belopp läcker via TVÅ andra endpoints utan stripping:
 *   - /api/projects/[id] (huvud) → data.changes
 *   - /api/ata GET → atas
 *   - /api/ata/[id] GET → enskild ÄTA
 *
 * För att inte lämna bakdörrar bryts strippnings-logiken ut hit och
 * appliceras KONSEKVENT i alla read-endpoints. Lärdom: gate ALLA
 * vägar, inte bara den nyaste.
 *
 * Strippas INTE:
 * - /api/ata/sign/[token] — publik kund-vy med sign_token, kunden
 *   ska se sin egen ÄTA inkl. belopp
 * - POST/PUT/DELETE — skapa/redigera-flöden, body-data inte read-läckage
 * - lib/agents/* — server-side aggregation med service-role, läcker inte
 *   till klient direkt
 *
 * Pris-fält som strippas:
 * - amount, total (top-level)
 * - items[].unit_price, items[].total (radnivå om items JSONB finns)
 *
 * Bevaras (INTE känsligt — arbetsinstruktion + metadata):
 * - description, change_type, ata_number, items[].name/description/quantity/unit
 * - status, signed_at, sent_at, declined_at, created_at, etc
 */

import type { NextRequest } from 'next/server'
import { getCurrentUser, hasPermission } from '@/lib/permissions'

export interface AtaWithPrices {
  amount?: number | null
  total?: number | null
  items?: any[] | null
  [key: string]: any
}

/**
 * Avgör om current user får se ÄTA-priser. Wrapper runt
 * hasPermission(user, 'see_financials').
 */
export async function canSeeAtaPrices(request: NextRequest): Promise<boolean> {
  const currentUser = await getCurrentUser(request)
  if (!currentUser) return false
  return hasPermission(currentUser, 'see_financials')
}

/**
 * Strippa pris-fält från en lista av ÄTA-rader. Mutativ INTE — returnerar
 * nya objekt så användare aldrig får oavsiktligt skrivbar referens.
 */
export function stripAtaPrices<T extends AtaWithPrices>(atas: T[]): T[] {
  return atas.map(a => ({
    ...a,
    amount: 0,
    total: 0,
    items: Array.isArray(a.items)
      ? a.items.map(item => ({
          ...(item as object),
          unit_price: 0,
          total: 0,
        }))
      : a.items,
  }))
}

/**
 * Strippa en enskild ÄTA. Returnerar nytt objekt.
 */
export function stripSingleAtaPrices<T extends AtaWithPrices>(ata: T): T {
  return stripAtaPrices([ata])[0]
}

/**
 * Convenience-wrapper för API-routes: kollar see_financials, returnerar
 * { atas, prices_redacted }-respons med strippade priser för icke-behörig.
 *
 * Användning i en GET-route:
 *   const result = await maybeStripAtaList(request, rawAtas)
 *   return NextResponse.json({ changes: result.atas, ...result.flag })
 */
export async function maybeStripAtaList<T extends AtaWithPrices>(
  request: NextRequest,
  atas: T[],
): Promise<{ atas: T[]; flag: { prices_redacted?: true } }> {
  const canSee = await canSeeAtaPrices(request)
  if (canSee) {
    return { atas, flag: {} }
  }
  return { atas: stripAtaPrices(atas), flag: { prices_redacted: true } }
}
