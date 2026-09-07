'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, FileText, Loader2 } from 'lucide-react'
import type { PortalAta, PortalData, Project } from '../types'
import { formatCurrency, formatDateTime } from '../helpers'
import SignatureCanvas, { type SignatureCanvasHandle } from './SignatureCanvas'
import PortalFooter from './PortalFooter'

/**
 * Tilläggsarbete att godkänna — portalens beslutskort (Design "Kundportal
 * beslut", 2026-09-07). Ett kort, fem zoner: huvud (nummer + status),
 * innehåll (beskrivning + rader), summering (moms, ROT preliminärt,
 * Du betalar), beslut (namn + bindande kryss, eller ritad signatur om
 * firman valt det) och efterläget (mörkt kvitto / avböjt / fakturerat).
 *
 * Primärknappen är alltid mörk; firmans accent syns bara i stegnumren.
 * Signeringen går mot samma /api/ata/sign/[token] som SMS-länken — samma
 * regler, samma kvitto, oavsett var kunden godkände.
 */

const STATUS_CLASS: Record<string, { cls: string; label: string }> = {
  sent: { cls: 'att-godkanna', label: 'Att godkänna' },
  signed: { cls: 'godkand', label: 'Godkänd' },
  approved: { cls: 'godkand', label: 'Godkänd' },
  declined: { cls: 'avbojd', label: 'Avböjd' },
  invoiced: { cls: 'fakturerad', label: 'Fakturerad' },
}

function fornamn(name: string | null | undefined): string {
  return (name || '').trim().split(/\s+/)[0] || ''
}

interface Props {
  portal: PortalData
  ata: PortalAta
  project: Project
  onBack: () => void
  onDecided: () => void | Promise<void>
  onOpenInvoice: () => void
}

export default function PortalAtaDecision({ portal, ata, project, onBack, onDecided, onOpenInvoice }: Props) {
  const business = portal.business
  const drawn = business.ataSignatureMode === 'drawn'
  const canDecide = ata.status === 'sent' && !!ata.sign_token
  const status = STATUS_CLASS[ata.status] ?? { cls: 'forslag', label: 'Förslag' }
  const isApproved = ata.status === 'signed' || ata.status === 'approved' || ata.status === 'invoiced'
  const isDeclined = ata.status === 'declined'

  const [name, setName] = useState('')
  const [terms, setTerms] = useState(false)
  const [hasDrawing, setHasDrawing] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState<'sign' | 'decline' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<SignatureCanvasHandle>(null)

  // Canvasen mäter sig själv först när den ligger i DOM:en.
  useEffect(() => {
    if (!drawn || !canDecide) return
    const t = setTimeout(() => canvasRef.current?.init(), 50)
    return () => clearTimeout(t)
  }, [drawn, canDecide])

  const s = ata.summor
  const rot = s.rotTyp && s.rotAvdrag > 0
  const rotArbeteInklMoms = Math.round(s.rotArbetskostnadExMoms * (1 + (ata.vat_rate ?? 25) / 100))
  const rotLabel = s.rotTyp === 'rut' ? 'RUT-avdrag' : 'ROT-avdrag'

  const ready = name.trim().length > 1 && (drawn ? hasDrawing || terms : terms)

  async function post(body: Record<string, unknown>, kind: 'sign' | 'decline') {
    if (!ata.sign_token) return
    setSaving(kind)
    setError(null)
    try {
      const res = await fetch(`/api/ata/sign/${ata.sign_token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Det gick inte att spara just nu. Försök igen.')
        return
      }
      await onDecided()
    } catch {
      setError('Det gick inte att spara just nu. Försök igen.')
    } finally {
      setSaving(null)
    }
  }

  function sign() {
    if (!ready) return
    const body: Record<string, unknown> = { action: 'sign', name: name.trim(), accepted_terms: true }
    if (drawn && hasDrawing) body.signature_data = canvasRef.current?.toDataURL() || undefined
    post(body, 'sign')
  }

  function decline() {
    post({ action: 'decline', reason: reason.trim() || null }, 'decline')
  }

  return (
    <div className="bp-screen">
      <div className="bp-header">
        <button type="button" className="bp-icon-btn" onClick={onBack} aria-label="Tillbaka">
          <ArrowLeft size={18} />
        </button>
        <div className="bp-brand">
          <div className="bp-brand-name">{business.name}</div>
          <div className="bp-brand-sub">{project.project_number ? `${project.name} · Ärende ${project.project_number}` : project.name}</div>
        </div>
      </div>

      <div className="bp-stack bp-rise">
        {/* Förslag: hantverkaren har inte skickat än — titta, inte besluta. */}
        {!canDecide && !isApproved && !isDeclined && (
          <div className="bp-banner gray">
            <span>
              <strong>Förslag.</strong> {business.name} har inte skickat tilläggsarbetet ännu. Du kan titta, men inte besluta förrän det är skickat.
            </span>
          </div>
        )}

        {/* Efterläge: godkänt */}
        {isApproved && (
          <div className="bp-dark-card">
            <div
              style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'rgba(74,222,128,.18)', color: '#4ade80',
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14,
              }}
            >
              <Check size={24} strokeWidth={2.5} />
            </div>
            <div style={{ fontSize: 23, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.01em' }}>
              Tack{fornamn(ata.signed_by_name || portal.customer.name) ? ` ${fornamn(ata.signed_by_name || portal.customer.name)}` : ''}. Tilläggsarbetet är godkänt.
            </div>
            {ata.signed_at && (
              <div className="sub" style={{ marginTop: 8 }}>
                Godkänt av {ata.signed_by_name || portal.customer.name}, {formatDateTime(ata.signed_at).replace(' ', ' kl ')}.
              </div>
            )}
            <div
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12,
                marginTop: 18, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,.12)',
              }}
            >
              <span className="sub">Du betalar, läggs på slutfakturan</span>
              <span style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(s.attBetala)}</span>
            </div>
          </div>
        )}

        {/* Efterläge: avböjt */}
        {isDeclined && (
          <div className="bp-card bp-rise" style={{ padding: 20 }}>
            <div style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.25, color: 'var(--ink)' }}>
              Du har tackat nej. {fornamn(business.contactName) || business.name} hör av sig.
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--muted)', marginTop: 8, lineHeight: 1.5 }}>
              {ata.declined_at ? `Avböjt ${formatDateTime(ata.declined_at).replace(' ', ' kl ')}. ` : ''}
              Arbetet enligt offerten fortsätter som planerat.
            </div>
            {ata.declined_reason && (
              <div style={{ marginTop: 14 }}>
                <div className="bp-eyebrow" style={{ marginBottom: 6 }}>Ditt meddelande</div>
                <div style={{ background: '#F1F5F9', borderRadius: 12, padding: '12px 14px', fontSize: 14, lineHeight: 1.5, color: '#334155' }}>
                  {ata.declined_reason}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Beslutskortet */}
        <div className="bp-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '18px 18px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>ÄTA-{ata.ata_number} · Tilläggsarbete</span>
              <span className={`bp-status ${status.cls}`}>{status.label}</span>
            </div>
            <h1 style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.25, color: 'var(--ink)', margin: '10px 0 0', letterSpacing: '-0.01em' }}>
              {ata.description || 'Tilläggsarbete'}
            </h1>
          </div>

          {ata.items.length > 0 && (
            <div style={{ padding: '16px 18px 0' }}>
              <div className="bp-rows" style={{ borderTop: '1.5px solid #0F172A' }}>
                {ata.items.map((it, i) => (
                  <div key={i} className="bp-row" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ color: 'var(--ink)' }}>{it.name}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                        {it.quantity} {it.unit} × {formatCurrency(it.unit_price)}
                      </div>
                    </div>
                    <span className="amt">{formatCurrency(it.quantity * it.unit_price)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ padding: '4px 18px 18px' }}>
            <div className="bp-rows">
              <div className="bp-row"><span>Delsumma</span><span className="amt">{formatCurrency(s.delsumma)}</span></div>
              <div className="bp-row"><span>Moms {ata.vat_rate} %</span><span className="amt">{formatCurrency(s.moms)}</span></div>
              <div className="bp-row sum"><span>Totalt inkl. moms</span><span className="amt">{formatCurrency(s.totalt)}</span></div>
              {rot && (
                <div className="bp-row rot">
                  <span>{rotLabel}<span className="bp-pill-prel">preliminärt</span></span>
                  <span className="amt">−{formatCurrency(s.rotAvdrag)}</span>
                </div>
              )}
              <div className="bp-row total"><span>Du betalar</span><span className="amt">{formatCurrency(s.attBetala)}</span></div>
            </div>
            {rot && (
              <p className="bp-micro" style={{ margin: '10px 0 0' }}>
                Avdraget är preliminärt och förutsätter att Skatteverket godkänner det. {s.rotTyp === 'rut' ? 'RUT' : 'ROT'}-berättigat arbete: {formatCurrency(rotArbeteInklMoms)} inkl. moms.
              </p>
            )}
          </div>

          <div className="bp-context">
            <FileText size={16} style={{ flexShrink: 0, marginTop: 1, color: 'var(--muted)' }} />
            <span>
              Läggs på slutfakturan för {project.name}. Du får ingen separat faktura.
              {ata.status === 'invoiced' && (
                <>
                  {' '}
                  <button type="button" className="bp-link-btn" style={{ color: 'var(--bee-700)' }} onClick={onOpenInvoice}>Se fakturan</button>
                </>
              )}
            </span>
          </div>
        </div>

        {/* Beslut */}
        {canDecide && !declining && (
          <div className="bp-card bp-rise" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>Godkänn tilläggsarbetet</div>
            <label className="bp-field">
              Ditt namn
              <input
                className="bp-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Förnamn Efternamn"
                autoComplete="name"
              />
            </label>

            {drawn && (
              <div className="bp-field">
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Rita med fingret</span>
                  <span style={{ color: 'var(--subtle)' }}>Signatur valfritt</span>
                </div>
                <SignatureCanvas ref={canvasRef} mode="ata" className="bp-sig-pad" onChange={setHasDrawing} />
                {hasDrawing && (
                  <button type="button" className="bp-link-btn" onClick={() => canvasRef.current?.clear()}>Rensa</button>
                )}
              </div>
            )}

            <label className="bp-check-row" style={{ position: 'relative' }}>
              <span className={`bp-check${terms ? ' on' : ''}`} aria-hidden="true">
                {terms && <Check size={16} strokeWidth={3} />}
              </span>
              <input
                type="checkbox"
                checked={terms}
                onChange={e => setTerms(e.target.checked)}
                style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
              />
              <span>Jag godkänner tilläggsarbetet enligt ovan. Godkännandet är bindande och ersätter en signatur.</span>
            </label>

            {error && <div role="alert" style={{ fontSize: 13.5, color: 'var(--red-600)' }}>{error}</div>}

            <button type="button" className="bp-btn-primary" disabled={!ready || saving !== null} onClick={sign}>
              {saving === 'sign' ? <Loader2 size={18} className="animate-spin" /> : null}
              Godkänn tilläggsarbetet
            </button>
            <div style={{ textAlign: 'center', fontSize: 13.5, color: 'var(--muted)' }}>
              Vill du inte gå vidare?{' '}
              <button type="button" className="bp-link-btn" onClick={() => setDeclining(true)}>Tacka nej</button>
            </div>
          </div>
        )}

        {canDecide && declining && (
          <div className="bp-card bp-rise" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label className="bp-field">
              Vad vill du göra i stället?
              <textarea
                className="bp-textarea"
                rows={3}
                value={reason}
                onChange={e => setReason(e.target.value.slice(0, 400))}
                placeholder="T.ex. jag vill ha ett annat pris, eller vänta med det här"
              />
            </label>
            {error && <div role="alert" style={{ fontSize: 13.5, color: 'var(--red-600)' }}>{error}</div>}
            <button type="button" className="bp-btn-secondary" disabled={saving !== null} onClick={decline}>
              {saving === 'decline' ? <Loader2 size={18} className="animate-spin" /> : null}
              Skicka och tacka nej
            </button>
            <button type="button" className="bp-link-btn" style={{ alignSelf: 'center' }} onClick={() => { setDeclining(false); setError(null) }}>
              Avbryt
            </button>
          </div>
        )}

        {/* Vad händer nu — efter godkännande */}
        {isApproved && ata.status !== 'invoiced' && (
          <div className="bp-card" style={{ padding: 20 }}>
            <div className="bp-eyebrow" style={{ marginBottom: 12 }}>Vad händer nu</div>
            <div className="bp-steps">
              <div className="bp-step">
                <span className="bp-step-n">1</span>
                <span><strong>{business.name} får besked direkt</strong> och kan börja med tilläggsarbetet.</span>
              </div>
              <div className="bp-step">
                <span className="bp-step-n">2</span>
                <span><strong>Beloppet läggs på slutfakturan.</strong> Du får ingen separat faktura för tilläggsarbetet.</span>
              </div>
            </div>
          </div>
        )}

        {ata.pdf_url && (
          <a href={ata.pdf_url} target="_blank" rel="noopener noreferrer" className="bp-btn-secondary">
            <FileText size={16} /> Ladda ner ÄTA-dokumentet (PDF)
          </a>
        )}

        <PortalFooter business={business} attribution={portal.attribution} />
      </div>
    </div>
  )
}
