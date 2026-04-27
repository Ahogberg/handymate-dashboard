'use client'

import { useState } from 'react'
import { ArrowLeft, ExternalLink, Send, Star } from 'lucide-react'
import type { PortalData } from '../types'

interface PortalReviewCTAProps {
  portal: PortalData
  onBack: () => void
}

const TAG_OPTIONS = [
  'Punktlig',
  'Snyggt utfört',
  'Ren & städad',
  'Bra kommunikation',
  'Värd pengarna',
  'Skulle anlita igen',
]

const STAR_LABELS: Record<number, string> = {
  1: 'Inte bra',
  2: 'OK',
  3: 'Bra',
  4: 'Mycket bra',
  5: 'Fantastiskt!',
}

/**
 * Recensions-CTA (port av bp-review.jsx).
 * Stars + tags + kommentar + Google-CTA + confetti vid submit.
 *
 * Notering: vi sparar INTE recensionen i DB i denna iteration —
 * den är bara ett konvertering-steg som leder kunden till Google.
 * Att samla feedback internt kräver ny review-tabell (framtida).
 */
export default function PortalReviewCTA({ portal, onBack }: PortalReviewCTAProps) {
  const [stars, setStars] = useState(0)
  const [hover, setHover] = useState(0)
  const [tags, setTags] = useState<Set<string>>(new Set())
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [confettiOn, setConfettiOn] = useState(false)

  const customerFirstName = portal.customer.name?.split(' ')[0] || ''

  function toggleTag(t: string) {
    setTags(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  function submit() {
    if (!stars) return
    setSubmitted(true)
    setConfettiOn(true)
    setTimeout(() => setConfettiOn(false), 2400)
  }

  if (submitted) {
    return (
      <div
        className="bp-body"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 24px',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
          minHeight: '70vh',
        }}
      >
        {/* Confetti */}
        {confettiOn &&
          Array.from({ length: 28 }).map((_, i) => {
            const colors = ['#F59E0B', '#FBBF24', '#16A34A', '#2563EB', '#DC2626']
            return (
              <span
                key={i}
                style={{
                  position: 'absolute',
                  top: '40%',
                  left: `${10 + i * 3}%`,
                  width: 8,
                  height: 12,
                  background: colors[i % colors.length],
                  borderRadius: 2,
                  animation: `bp-confetti 2.2s ${i * 40}ms forwards`,
                  transform: `rotate(${i * 23}deg)`,
                }}
              />
            )
          })}

        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--bee-400), var(--bee-600))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            marginBottom: 22,
            animation: 'bp-pop-in 540ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            boxShadow: '0 10px 30px rgba(217,119,6,0.35)',
          }}
        >
          <Star size={40} fill="currentColor" />
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 8 }}>
          Tack {customerFirstName}!
        </h1>
        <p
          style={{
            fontSize: 14,
            color: 'var(--muted)',
            marginBottom: 24,
            maxWidth: 280,
            lineHeight: 1.5,
          }}
        >
          Din recension hjälper {portal.business.name} att fortsätta leverera kvalitet.
        </p>

        {stars >= 4 && portal.business.googleReviewUrl && (
          <div
            className="bp-card"
            style={{
              padding: 16,
              width: '100%',
              maxWidth: 320,
              marginBottom: 16,
              animation: 'bp-slide-up 480ms 240ms both',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--ink)' }}>
              Vill du dela på Google?
            </div>
            <a
              href={portal.business.googleReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bp-cta bee"
              style={{ height: 44, fontSize: 14, textDecoration: 'none' }}
            >
              <Star size={16} /> Recensera på Google <ExternalLink size={14} />
            </a>
            <p
              style={{
                fontSize: 11,
                color: 'var(--subtle)',
                marginTop: 10,
                lineHeight: 1.4,
              }}
            >
              Hjälper andra hitta bra hantverkare.
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={onBack}
          className="bp-cta ghost"
          style={{ maxWidth: 320 }}
        >
          Klar
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="bp-header">
        <button
          type="button"
          onClick={onBack}
          className="bp-icon-btn"
          style={{ background: 'transparent', border: 'none' }}
          aria-label="Tillbaka"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="bp-brand">
          <div className="bp-brand-name">Recensera jobbet</div>
          <div className="bp-brand-sub">{portal.business.name}</div>
        </div>
      </div>

      <div className="bp-body" style={{ padding: '8px 18px 100px' }}>
        {/* Hero */}
        <div
          style={{
            background: 'linear-gradient(135deg, var(--bee-50), var(--bee-100))',
            borderRadius: 'var(--r-xl)',
            padding: '24px 20px',
            textAlign: 'center',
            marginTop: 12,
            border: '1px solid var(--bee-100)',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--bee-500), var(--bee-700))',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 22,
              margin: '0 auto 14px',
            }}
          >
            {(portal.business.contactName || portal.business.name || 'H').charAt(0).toUpperCase()}
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', marginBottom: 6 }}>
            Hur var {portal.business.contactName || portal.business.name}?
          </h2>
          <p
            style={{
              fontSize: 13,
              color: 'var(--muted)',
              maxWidth: 280,
              margin: '0 auto',
              lineHeight: 1.5,
            }}
          >
            Din feedback hjälper oss bli bättre — och hjälper andra hitta bra hantverkare.
          </p>
        </div>

        {/* Stars */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '28px 0 8px' }}>
          {[1, 2, 3, 4, 5].map(n => {
            const filled = n <= (hover || stars)
            return (
              <button
                type="button"
                key={n}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                onClick={() => setStars(n)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: filled ? 'var(--bee-500)' : 'var(--border-strong)',
                  padding: 4,
                  transform: stars === n ? 'scale(1.15)' : 'scale(1)',
                  transition: 'all 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                  fontFamily: 'inherit',
                }}
              >
                <Star size={42} strokeWidth={1.5} fill={filled ? 'currentColor' : 'none'} />
              </button>
            )
          })}
        </div>

        <div
          style={{
            textAlign: 'center',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--ink-2)',
            minHeight: 20,
            marginBottom: 24,
          }}
        >
          {stars === 0 ? <span style={{ color: 'var(--subtle)' }}>Tryck för att betygsätta</span> : STAR_LABELS[stars]}
        </div>

        {/* Tag chips */}
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: 10,
          }}
        >
          Vad var bäst?
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          {TAG_OPTIONS.map(t => {
            const on = tags.has(t)
            return (
              <button
                type="button"
                key={t}
                onClick={() => toggleTag(t)}
                style={{
                  padding: '8px 14px',
                  border: on ? '1.5px solid var(--bee-500)' : '1px solid var(--border)',
                  background: on ? 'var(--bee-50)' : 'var(--surface)',
                  color: on ? 'var(--bee-700)' : 'var(--ink-2)',
                  borderRadius: 'var(--r-pill)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all var(--t-fast)',
                  fontFamily: 'inherit',
                }}
              >
                {t}
              </button>
            )
          })}
        </div>

        {/* Comment */}
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: 10,
          }}
        >
          Kommentar (valfritt)
        </div>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Berätta gärna om upplevelsen…"
          maxLength={400}
          rows={4}
          style={{
            width: '100%',
            resize: 'none',
            padding: 14,
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
            background: 'var(--surface)',
            fontFamily: 'inherit',
            fontSize: 14,
            lineHeight: 1.5,
            color: 'var(--ink)',
            outline: 'none',
          }}
        />
        <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--subtle)', marginTop: 4 }}>
          {comment.length} / 400
        </div>
      </div>

      {/* Sticky submit */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '12px 18px 22px',
          background: 'rgba(255,255,255,0.96)',
          backdropFilter: 'blur(12px)',
          borderTop: '1px solid var(--border)',
        }}
      >
        <button type="button" onClick={submit} disabled={!stars} className="bp-cta bee">
          <Send size={16} /> Skicka recension
        </button>
      </div>
    </>
  )
}
