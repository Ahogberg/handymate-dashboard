'use client'

import { useState } from 'react'
import { ArrowLeft, ArrowUpRight, Check, Loader2, Star } from 'lucide-react'
import type { PortalData, PortalDecisions } from '../types'
import { formatDate } from '../helpers'
import { REVIEW_TAGS, REVIEW_COMMENT_MAX, isLowRating } from '@/lib/portal/review'
import PortalFooter from './PortalFooter'

interface PortalReviewCTAProps {
  portal: PortalData
  token: string
  review: PortalDecisions['review'] | null
  onBack: () => void
  onSubmitted?: () => void | Promise<void>
}

const STAR_LABELS = ['Inte bra', 'OK', 'Bra', 'Mycket bra', 'Fantastiskt!']

function fornamn(name: string | null | undefined): string {
  return (name || '').trim().split(/\s+/)[0] || ''
}

/**
 * "Hur blev det?" — portalens beslutskort (Design 2026-09-07).
 *
 * Ett kompakt kort: fem stjärnor och en etikett. Betyget styr vägen:
 *   1–3 → "Vad blev inte bra?" — meddelandet går direkt till hantverkaren
 *         (POST /api/portal/[token]/review → tråden). Inget Google.
 *   4–5 → etiketter + frivillig text → "Skicka omdöme" → mörkt tack-kort +
 *         "Vill du dela på Google?" när firman har en länk. Texten kopieras
 *         så kunden kan klistra in den.
 * Ett omdöme per kund: finns det redan visas bara "Tack för ditt omdöme".
 */
export default function PortalReviewCTA({ portal, token, review, onBack, onSubmitted }: PortalReviewCTAProps) {
  const business = portal.business
  const kund = fornamn(portal.customer.name)
  const hantverkare = fornamn(business.contactName) || business.name

  const [stars, setStars] = useState(0)
  const [tags, setTags] = useState<Set<string>>(new Set())
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<{ low: boolean; googleReviewUrl: string | null } | null>(null)
  const [alreadyAt, setAlreadyAt] = useState<string | null>(review?.left_at ?? null)
  const [copiedToClipboard, setCopiedToClipboard] = useState(false)

  const low = stars > 0 && isLowRating(stars)

  function toggleTag(t: string) {
    setTags(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }

  async function submit() {
    if (!stars || saving) return
    if (low && !comment.trim()) {
      setError('Berätta kort vad som inte blev bra så kan det rättas till.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/portal/${token}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: stars, tags: Array.from(tags), comment: comment.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409 && data?.left_at) {
        setAlreadyAt(data.left_at)
        return
      }
      if (!res.ok) {
        setError(data?.error || 'Det gick inte att skicka just nu. Försök igen.')
        return
      }
      setSent({ low: !!data.low, googleReviewUrl: data.googleReviewUrl || business.googleReviewUrl || null })
      // Kundens egna ord i urklipp så Google-recensionen blir ett klistra in.
      if (!data.low && comment.trim() && navigator.clipboard) {
        navigator.clipboard.writeText(comment.trim()).then(() => setCopiedToClipboard(true)).catch(() => {})
      }
      await onSubmitted?.()
    } catch {
      setError('Det gick inte att skicka just nu. Försök igen.')
    } finally {
      setSaving(false)
    }
  }

  function googleClicked() {
    fetch(`/api/portal/${token}/review`, { method: 'PATCH' }).catch(() => {})
  }

  const header = (
    <div className="bp-header">
      <button type="button" onClick={onBack} className="bp-icon-btn" aria-label="Tillbaka">
        <ArrowLeft size={18} />
      </button>
      <div className="bp-brand">
        <div className="bp-brand-name">{business.name}</div>
        <div className="bp-brand-sub">Hur blev det?</div>
      </div>
    </div>
  )

  // ── Redan lämnat ──
  if (alreadyAt && !sent) {
    return (
      <div className="bp-screen">
        {header}
        <div className="bp-stack bp-rise">
          <div className="bp-card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 26, height: 26, borderRadius: '50%', background: '#f0fdf4', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Check size={15} strokeWidth={3} />
            </span>
            <span style={{ fontSize: 14, color: 'var(--ink)' }}>Tack för ditt omdöme, lämnat {formatDate(alreadyAt)}.</span>
          </div>
          <PortalFooter business={business} attribution={portal.attribution} />
        </div>
      </div>
    )
  }

  // ── Skickat ──
  if (sent) {
    return (
      <div className="bp-screen">
        {header}
        <div className="bp-stack">
          {sent.low ? (
            <div className="bp-card bp-rise" style={{ padding: 20 }}>
              <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.25, color: 'var(--ink)' }}>
                Tack{kund ? ` ${kund}` : ''}. {hantverkare} har fått ditt meddelande.
              </div>
              <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
                Hör av sig så snart det går. Omdömet stannar mellan dig och {business.name}.
              </div>
            </div>
          ) : (
            <>
              <div className="bp-dark-card">
                <div style={{ display: 'flex', gap: 2, color: 'var(--bee-500)', marginBottom: 12 }}>
                  {[1, 2, 3, 4, 5].map(n => <Star key={n} size={20} fill="currentColor" strokeWidth={0} />)}
                </div>
                <div style={{ fontSize: 23, fontWeight: 700, lineHeight: 1.2 }}>Tack{kund ? ` ${kund}` : ''}!</div>
                <div className="sub" style={{ marginTop: 6 }}>Ditt omdöme är skickat till {business.name}.</div>
              </div>
              {sent.googleReviewUrl && (
                <div className="bp-card bp-rise" style={{ padding: 20 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>Vill du dela på Google?</div>
                  <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>
                    Det betyder mycket för en liten firma.{copiedToClipboard ? ' Din text är kopierad så du kan klistra in den.' : ''}
                  </div>
                  <a
                    href={sent.googleReviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bp-btn-primary"
                    style={{ height: 50, marginTop: 14 }}
                    onClick={googleClicked}
                  >
                    Recensera på Google <ArrowUpRight size={18} />
                  </a>
                </div>
              )}
            </>
          )}
          <PortalFooter business={business} attribution={portal.attribution} />
        </div>
      </div>
    )
  }

  // ── Formuläret ──
  return (
    <div className="bp-screen">
      {header}
      <div className="bp-stack bp-rise">
        <div className="bp-card" style={{ padding: 18 }}>
          <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--ink)' }}>Hur blev det?</div>
          <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 4 }}>
            {kund ? `${kund}, hur` : 'Hur'} upplevde du jobbet med {business.name}?
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 2, marginTop: 14 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                className={`bp-star${n <= stars ? ' on' : ''}`}
                onClick={() => { setStars(n); setError(null) }}
                aria-label={`${n} av 5`}
                aria-pressed={n <= stars}
              >
                <Star size={30} fill={n <= stars ? 'currentColor' : 'none'} strokeWidth={n <= stars ? 0 : 1.5} />
              </button>
            ))}
          </div>
          <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 600, color: '#334155', minHeight: 20, marginTop: 4 }}>
            {stars > 0 ? STAR_LABELS[stars - 1] : ''}
          </div>

          {stars > 0 && (
            <div className="bp-rise" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
              {low ? (
                <>
                  <div className="bp-banner gray">
                    Berätta vad som inte blev bra. {hantverkare} får meddelandet direkt och kan rätta till det.
                  </div>
                  <label className="bp-field">
                    Vad blev inte bra?
                    <textarea
                      className="bp-textarea"
                      rows={4}
                      value={comment}
                      onChange={e => setComment(e.target.value.slice(0, REVIEW_COMMENT_MAX))}
                      placeholder="Berätta vad som hände"
                    />
                  </label>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {REVIEW_TAGS.map(t => (
                      <button key={t} type="button" className={`bp-tag${tags.has(t) ? ' on' : ''}`} onClick={() => toggleTag(t)} aria-pressed={tags.has(t)}>
                        {t}
                      </button>
                    ))}
                  </div>
                  <label className="bp-field">
                    <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Vill du skriva något?</span>
                      <span style={{ color: 'var(--subtle)' }}>{comment.length}/{REVIEW_COMMENT_MAX}</span>
                    </span>
                    <textarea
                      className="bp-textarea"
                      rows={3}
                      value={comment}
                      onChange={e => setComment(e.target.value.slice(0, REVIEW_COMMENT_MAX))}
                      placeholder="T.ex. vad du var mest nöjd med"
                    />
                  </label>
                </>
              )}

              {error && <div role="alert" style={{ fontSize: 13.5, color: 'var(--red-600)' }}>{error}</div>}

              <button type="button" className="bp-btn-primary" disabled={saving || (low && !comment.trim())} onClick={submit}>
                {saving ? <Loader2 size={18} className="animate-spin" /> : null}
                {low ? `Skicka till ${hantverkare}` : 'Skicka omdöme'}
              </button>
            </div>
          )}
        </div>

        <PortalFooter business={business} attribution={portal.attribution} />
      </div>
    </div>
  )
}
