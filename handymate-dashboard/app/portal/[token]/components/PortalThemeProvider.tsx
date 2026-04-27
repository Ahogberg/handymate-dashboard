'use client'

import { tintFromAccent } from '../lib/tint'
import type { PortalData } from '../types'

interface PortalThemeProviderProps {
  business: PortalData['business']
  children: React.ReactNode
}

/**
 * Wraps portal-trädet med per-business CSS-variabler.
 * Sätter --bee-50 till --bee-700 från business.accentColor — fallback
 * till Claude Designs amber-defaults (--bee-* i portal.css :root).
 */
export default function PortalThemeProvider({ business, children }: PortalThemeProviderProps) {
  const tintVars = tintFromAccent(business.accentColor)
  return (
    <div className="bp-screen" style={tintVars as React.CSSProperties}>
      {children}
    </div>
  )
}
