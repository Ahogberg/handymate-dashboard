'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Loader2, PenTool, Sparkles, X } from 'lucide-react'
import SignatureCanvas, { type SignatureCanvasHandle } from './SignatureCanvas'
import { formatCurrency } from '../helpers'
import type { Quote } from '../types'

interface PortalQuoteSigningModalProps {
  quote: Quote
  initialSignerName: string
  onSigned: (quoteId: string) => void
  onClose: () => void
}

/**
 * Bottom-sheet signing-modal (port av Claude Designs BPSignModal).
 * Två-stegs flöde: Granska (med villkors-checkbox) → Signera (canvas + namn).
 *
 * Signing-anrop oförändrat mot /api/quotes/public/[signToken].
 */
export default function PortalQuoteSigningModal({
  quote,
  initialSignerName,
  onSigned,
  onClose,
}: PortalQuoteSigningModalProps) {
  const [step, setStep] = useState<0 | 1>(0)
  const [accept, setAccept] = useState(false)
  const [name, setName] = useState(initialSignerName)
  const [hasSig, setHasSig] = useState(false)
  const [saving, setSaving] = useState(false)
  const canvasRef = useRef<SignatureCanvasHandle>(null)

  useEffect(() => {
    if (step === 1) setTimeout(() => canvasRef.current?.init(), 100)
  }, [step])

  async function sign() {
    if (!quote.sign_token || !name.trim() || !hasSig || saving) return
    setSaving(true)
    try {
      const signatureData = canvasRef.current?.toDataURL()
      if (!signatureData) {
        setSaving(false)
        return
      }
      const res = await fetch(`/api/quotes/public/${quote.sign_token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sign',
          name: name.trim(),
          signature_data: signatureData,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Kunde inte signera offerten')
      } else {
        onSigned(quote.quote_id)
      }
    } catch {
      alert('Kunde inte signera offerten')
    }
    setSaving(false)
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,23,42,0.5)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'flex-end',
        animation: 'bp-fade-in 200ms',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff',
          width: '100%',
          maxWidth: 460,
          margin: '0 auto',
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          maxHeight: '92%',
          display: 'flex',
          flexDirection: 'column',
          animation: 'bp-slide-up 360ms cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div
          style={{
            padding: '14px 18px 10px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>
              {step === 0 ? 'Granska offert' : 'Signera digitalt'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              Steg {step + 1} av 2 · {quote.title || 'Offert'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="bp-icon-btn"
            style={{ background: 'var(--bg)' }}
            aria-label="Stäng"
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 18 }}>
          {step === 0 ? (
            <>
              <div
                style={{
                  padding: 16,
                  background: 'var(--bg)',
                  borderRadius: 'var(--r-lg)',
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--muted)',
                    letterSpacing: '0.08em',
                    marginBottom: 4,
                  }}
                >
                  TOTALT INKL. MOMS
                </div>
                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 700,
                    color: 'var(--ink)',
                    letterSpacing: '-0.02em',
                  }}
                >
                  {formatCurrency(quote.total)}
                </div>
                {quote.rot_rut_type && quote.rot_rut_deduction > 0 && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: '8px 12px',
                      background: 'var(--green-50)',
                      borderRadius: 'var(--r-md)',
                      fontSize: 12,
                      color: 'var(--green-600)',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Sparkles size={14} />
                    {quote.rot_rut_type.toUpperCase()}-avdrag {formatCurrency(quote.rot_rut_deduction)} ingår
                  </div>
                )}
              </div>

              <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Innehåll</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
                {[
                  'Material och förbrukning',
                  'Arbetstid enligt offerten',
                  'Bortforsling och städning',
                  'Garanti enligt branschregler',
                ].map((it, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-md)',
                    }}
                  >
                    <span style={{ color: 'var(--bee-700)' }}>
                      <Check size={16} strokeWidth={2.5} />
                    </span>
                    <span style={{ fontSize: 13 }}>{it}</span>
                  </div>
                ))}
              </div>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  padding: 14,
                  background: 'var(--bg)',
                  borderRadius: 'var(--r-md)',
                  cursor: 'pointer',
                }}
                onClick={() => setAccept(!accept)}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    border: `2px solid ${accept ? 'var(--bee-600)' : 'var(--border-strong)'}`,
                    background: accept ? 'var(--bee-600)' : '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: 1,
                    color: '#fff',
                  }}
                >
                  {accept && <Check size={14} strokeWidth={3} />}
                </span>
                <span style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.4 }}>
                  Jag har läst offerten och godkänner villkoren
                </span>
              </label>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 14 }}>
                <label
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--ink-2)',
                    display: 'block',
                    marginBottom: 8,
                  }}
                >
                  Ditt namn
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Förnamn Efternamn"
                  style={{
                    width: '100%',
                    height: 50,
                    fontSize: 16,
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-md)',
                    padding: '0 14px',
                    fontFamily: 'inherit',
                    outline: 'none',
                  }}
                />
              </div>
              <label
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--ink-2)',
                  display: 'block',
                  marginBottom: 8,
                }}
              >
                Signera med fingret
              </label>
              <div
                style={{
                  position: 'relative',
                  background: 'var(--bg)',
                  border: '1.5px dashed var(--border-strong)',
                  borderRadius: 'var(--r-md)',
                  height: 180,
                  overflow: 'hidden',
                }}
              >
                <SignatureCanvas
                  ref={canvasRef}
                  mode="quote"
                  className="w-full h-full block touch-none cursor-crosshair"
                  onChange={setHasSig}
                />
                {!hasSig && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--subtle)',
                      pointerEvents: 'none',
                    }}
                  >
                    <PenTool size={20} />
                    <span style={{ fontSize: 12, marginTop: 6 }}>Dra för att signera</span>
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => { canvasRef.current?.clear(); setHasSig(false) }}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 12,
                    color: 'var(--muted)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Rensa
                </button>
                <span style={{ fontSize: 11, color: 'var(--subtle)' }}>
                  {new Date().toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })} · {new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </>
          )}
        </div>

        <div style={{ padding: 18, borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
          {step === 0 ? (
            <button
              type="button"
              className="bp-cta bee"
              disabled={!accept}
              onClick={() => setStep(1)}
            >
              Fortsätt till signering <ArrowRight size={18} />
            </button>
          ) : (
            <button
              type="button"
              className="bp-cta bee"
              disabled={!hasSig || !name.trim() || saving}
              onClick={sign}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              Signera offert · {formatCurrency(quote.total)}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
