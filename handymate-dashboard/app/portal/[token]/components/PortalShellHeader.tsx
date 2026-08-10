'use client'

import { MessageCircle } from 'lucide-react'
import type { PortalData } from '../types'

interface PortalShellHeaderProps {
  business: PortalData['business']
  unreadMessages: number
  onNotificationClick?: () => void
}

/**
 * Sticky portal-header: företagslogo (eller initial) + namn/tagline + notis-klocka.
 * Port av Claude Designs BPHeader. Den B-färgade gradient-square på vänster
 * tonas dynamiskt från --bee-500/--bee-600 (per business).
 */
export default function PortalShellHeader({
  business,
  unreadMessages,
  onNotificationClick,
}: PortalShellHeaderProps) {
  const initial = (business.name || 'H').charAt(0).toUpperCase()
  const subtitle = business.address
    ? `${business.address.split(',').slice(-1)[0]?.trim() || ''}`
    : 'Hantverkare'

  return (
    <div className="bp-header">
      <div className="bp-logo">
        {business.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={business.logoUrl} alt={business.name} />
        ) : (
          initial
        )}
      </div>
      <div className="bp-brand">
        <div className="bp-brand-name">{business.name || 'Handymate'}</div>
        {subtitle && <div className="bp-brand-sub">{subtitle}</div>}
      </div>
      {/* Ikonen ÄR meddelandeingången — en klocka som öppnar chatten läses
          som notiser (2026-08-10). Antalet olästa sägs, inte bara en prick. */}
      <button
        type="button"
        className="bp-icon-btn"
        onClick={onNotificationClick}
        aria-label={unreadMessages > 0 ? `Meddelanden — ${unreadMessages} olästa` : 'Meddelanden'}
        style={{ position: 'relative' }}
      >
        <MessageCircle size={18} />
        {unreadMessages > 0 && (
          <span
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              minWidth: 16,
              height: 16,
              padding: '0 4px',
              borderRadius: 8,
              background: '#EF4444',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            {unreadMessages > 9 ? '9+' : unreadMessages}
          </span>
        )}
      </button>
    </div>
  )
}
