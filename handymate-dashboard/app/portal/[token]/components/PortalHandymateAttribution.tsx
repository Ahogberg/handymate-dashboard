'use client'

import AttributionStamp from '@/components/branding/AttributionStamp'
import type { Attribution } from '@/lib/branding/attribution'

/**
 * Subtil "Skickat via Handymate"-stämpel i botten av varje portalvy
 * (lib/branding/attribution.ts). Ordet Handymate länkar till företagets
 * rekommendationssida när länken är på — underlaget kommer från
 * /api/portal/[token] (PortalData.attribution), laddat en gång per besök.
 * Teal-färg på "Handymate" är ALLTID --hm-700, oavsett business accent.
 */
export default function PortalHandymateAttribution({ attribution }: { attribution?: Attribution | null }) {
  return <AttributionStamp attribution={attribution} className="bp-hm-attr" />
}
