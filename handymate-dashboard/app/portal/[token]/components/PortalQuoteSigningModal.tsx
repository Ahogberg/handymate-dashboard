'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Check, Download, FileText, Loader2, PenTool, Sparkles, X } from 'lucide-react'
import SignatureCanvas, { type SignatureCanvasHandle } from './SignatureCanvas'
import { formatCurrency } from '../helpers'
import type { Quote } from '../types'
import {
  calculatePublicQuoteTotals,
  calculatePublicQuoteTotalsFromBase,
  type PublicStructuredItem,
} from '@/lib/quote-calculations'
import type { QuoteTotals } from '@/lib/types/quote'

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

  // Tillval: rader + moms/rabatt-parametrar hämtas via befintliga publika
  // GET:en. Kundens val är endast visning — servern räknar om totalen själv.
  const [structuredItems, setStructuredItems] = useState<PublicStructuredItem[]>([])
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set())
  const [quoteParams, setQuoteParams] = useState<{ discountPercent: number; vatRate: number }>({
    discountPercent: 0,
    vatRate: 25,
  })
  // Bas-totaler (icke-tillvalsrader) från publika GET:en — i summary/rows-läge
  // är à-priserna strippade och klienten kan inte summera basen själv.
  const [baseTotals, setBaseTotals] = useState<QuoteTotals | null>(null)

  useEffect(() => {
    if (step === 1) setTimeout(() => canvasRef.current?.init(), 100)
  }, [step])

  useEffect(() => {
    if (!quote.sign_token) return
    let cancelled = false
    fetch(`/api/quotes/public/${quote.sign_token}`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled || !data?.quote) return
        const items = (data.quote.structured_items || []) as PublicStructuredItem[]
        setStructuredItems(items)
        setSelectedOptions(
          new Set(
            items
              .filter(i => i.item_type === 'option' && i.option_selected === true)
              .map(i => i.id)
          )
        )
        setQuoteParams({
          discountPercent: data.quote.discount_percent ?? 0,
          vatRate: data.quote.vat_rate ?? 25,
        })
        setBaseTotals(data.quote.base_totals ?? null)
      })
      .catch(() => { /* tillval visas ej — signering fungerar ändå */ })
    return () => { cancelled = true }
  }, [quote.sign_token])

  const optionRows = structuredItems.filter(i => i.item_type === 'option')
  const liveTotals =
    optionRows.length === 0
      ? null
      : baseTotals
        ? calculatePublicQuoteTotalsFromBase(
            baseTotals,
            structuredItems,
            selectedOptions,
            quoteParams.discountPercent,
            quoteParams.vatRate
          )
        : calculatePublicQuoteTotals(
            structuredItems,
            selectedOptions,
            quoteParams.discountPercent,
            quoteParams.vatRate
          )
  const dispTotal = liveTotals ? liveTotals.total : quote.total
  const dispDeduction = liveTotals
    ? liveTotals.rotDeduction + liveTotals.rutDeduction
    : quote.rot_rut_deduction
  const dispToPay = dispDeduction > 0 ? dispTotal - dispDeduction : dispTotal

  function toggleOption(id: string) {
    setSelectedOptions(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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
          selected_option_ids: Array.from(selectedOptions),
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
                  {formatCurrency(dispTotal)}
                </div>
                {quote.rot_rut_type && dispDeduction > 0 && (
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
                    {quote.rot_rut_type.toUpperCase()}-avdrag {formatCurrency(dispDeduction)} ingår
                  </div>
                )}
              </div>

              {optionRows.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--muted)',
                      letterSpacing: '0.08em',
                      marginBottom: 8,
                    }}
                  >
                    TILLVAL — VÄLJ VAD SOM SKA INGÅ
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {optionRows.map(row => {
                      const selected = selectedOptions.has(row.id)
                      return (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => toggleOption(row.id)}
                          aria-pressed={selected}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            width: '100%',
                            padding: '12px 14px',
                            background: selected ? 'var(--bg)' : '#fff',
                            border: `1.5px solid ${selected ? 'var(--bee-600)' : 'var(--border)'}`,
                            borderRadius: 'var(--r-md)',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            textAlign: 'left',
                          }}
                        >
                          <span
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 6,
                              border: `2px solid ${selected ? 'var(--bee-600)' : 'var(--border-strong)'}`,
                              background: selected ? 'var(--bee-600)' : '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              color: '#fff',
                            }}
                          >
                            {selected && <Check size={14} strokeWidth={3} />}
                          </span>
                          <span style={{ flex: 1, fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.4 }}>
                            {row.description}
                          </span>
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: selected ? 'var(--ink)' : 'var(--muted)',
                              flexShrink: 0,
                            }}
                          >
                            {selected ? '' : '+'}{formatCurrency(row.total || 0)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: 10,
                      padding: '10px 14px',
                      background: 'var(--bg)',
                      borderRadius: 'var(--r-md)',
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
                      Att betala
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
                      {formatCurrency(dispToPay)}
                    </span>
                  </div>
                </div>
              )}

              {quote.sign_token && (
                <div style={{ marginBottom: 18 }}>
                  <a
                    className="bp-cta ghost"
                    href={`/api/quotes/pdf?token=${quote.sign_token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <FileText size={18} /> Läs offerten
                  </a>
                  <a
                    className="bp-cta ghost"
                    href={`/api/quotes/pdf?token=${quote.sign_token}&format=pdf`}
                    style={{ marginTop: 10 }}
                  >
                    <Download size={18} /> Ladda ner PDF
                  </a>
                  <p
                    style={{
                      fontSize: 12,
                      color: 'var(--muted)',
                      marginTop: 8,
                      lineHeight: 1.4,
                      textAlign: 'center',
                    }}
                  >
                    Läs igenom hela offerten innan du signerar — den öppnas i en ny flik.
                    Du kan även ladda ner den som PDF.
                  </p>
                </div>
              )}

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
              Signera offert · {formatCurrency(dispTotal)}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
