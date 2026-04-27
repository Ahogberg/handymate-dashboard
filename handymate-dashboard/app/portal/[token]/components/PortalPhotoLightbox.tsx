'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import type { ProjectPhoto } from '../types'

interface PortalPhotoLightboxProps {
  photos: ProjectPhoto[]
  index: number
  onClose: () => void
  onChange: (index: number) => void
}

/**
 * Fullscreen photo lightbox med swipe-navigation, ESC och pil-knappar.
 * Port av Claude Designs BPLightbox.
 */
export default function PortalPhotoLightbox({
  photos,
  index,
  onClose,
  onChange,
}: PortalPhotoLightboxProps) {
  const [touchX, setTouchX] = useState<number | null>(null)
  const photo = photos[index]
  if (!photo) return null

  const onStart = (e: React.TouchEvent) => setTouchX(e.touches[0].clientX)
  const onEnd = (e: React.TouchEvent) => {
    if (touchX === null) return
    const dx = e.changedTouches[0].clientX - touchX
    if (dx > 50 && index > 0) onChange(index - 1)
    else if (dx < -50 && index < photos.length - 1) onChange(index + 1)
    setTouchX(null)
  }

  return (
    <div
      onClick={onClose}
      onTouchStart={onStart}
      onTouchEnd={onEnd}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.9)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'bp-fade-in 200ms',
      }}
    >
      <button
        type="button"
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'inherit',
        }}
        aria-label="Stäng"
      >
        <X size={20} />
      </button>

      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '85%',
          maxWidth: 600,
          aspectRatio: '1',
          borderRadius: 'var(--r-lg)',
          position: 'relative',
          overflow: 'hidden',
          background: '#0F172A',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.url}
          alt={photo.caption || 'Projektbild'}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div style={{ position: 'absolute', bottom: 16, left: 16, right: 16, color: '#fff' }}>
          {photo.caption && <div style={{ fontSize: 16, fontWeight: 700 }}>{photo.caption}</div>}
          <div style={{ fontSize: 12, opacity: 0.8, marginTop: 2 }}>
            {new Date(photo.uploaded_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            padding: '4px 10px',
            background: 'rgba(0,0,0,0.5)',
            color: '#fff',
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 'var(--r-pill)',
            backdropFilter: 'blur(4px)',
          }}
        >
          {index + 1} / {photos.length}
        </div>
      </div>

      {index > 0 && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onChange(index - 1) }}
          style={{
            position: 'absolute',
            left: 12,
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Föregående"
        >
          <ChevronLeft size={20} />
        </button>
      )}
      {index < photos.length - 1 && (
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onChange(index + 1) }}
          style={{
            position: 'absolute',
            right: 12,
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.15)',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label="Nästa"
        >
          <ChevronRight size={20} />
        </button>
      )}
    </div>
  )
}
