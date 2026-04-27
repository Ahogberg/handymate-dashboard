'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle,
  FileSignature,
  Hammer,
  Loader2,
  PenTool,
  Shield,
  Truck,
} from 'lucide-react'
import SignatureCanvas, {
  ClearSignatureButton,
  type SignatureCanvasHandle,
} from './SignatureCanvas'
import { formatCurrency, formatDate } from '../helpers'
import type { Project } from '../types'

interface PortalProjectDetailProps {
  project: Project
  onBack: () => void
  onAtaSigned: () => void
}

/**
 * Projektdetalj-vy (port av bp-project.jsx).
 * Inkluderar milstolpe-tracker (5 stegs-ikoner), foto-galleri (öppnar
 * lightbox), och inline ÄTA-signering med shared SignatureCanvas.
 *
 * Bevarar exakt befintlig signing-logik mot /api/ata/sign/[token].
 */
const MILESTONE_DEFAULTS = [
  { id: 'plan',  name: 'Planering',     Icon: FileSignature, status: 'done' as const },
  { id: 'prep',  name: 'Förberedelse',  Icon: Truck,         status: 'done' as const },
  { id: 'work',  name: 'Pågående',      Icon: Hammer,        status: 'active' as const },
  { id: 'done',  name: 'Slutfört',      Icon: CheckCircle,   status: 'pending' as const },
  { id: 'warr',  name: 'Garanti',       Icon: Shield,        status: 'pending' as const },
]

export default function PortalProjectDetail({
  project,
  onBack,
  onAtaSigned,
}: PortalProjectDetailProps) {
  const [animPct, setAnimPct] = useState(0)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const [signingAtaId, setSigningAtaId] = useState<string | null>(null)
  const [signerName, setSignerName] = useState('')
  const [signingSaving, setSigningSaving] = useState(false)
  const ataCanvasRef = useRef<SignatureCanvasHandle>(null)

  const photos = project.photos || []
  const milestones = project.milestones && project.milestones.length > 0
    ? project.milestones.map((m, i) => ({
        id: `m-${i}`,
        name: m.name,
        Icon: MILESTONE_DEFAULTS[i % MILESTONE_DEFAULTS.length].Icon,
        status: (m.status as 'done' | 'active' | 'pending') || (i === 0 ? 'active' : 'pending'),
      }))
    : MILESTONE_DEFAULTS

  const completed = milestones.filter(m => m.status === 'done').length
  const targetPct = Math.min(100, Math.round((completed / Math.max(1, milestones.length - 1)) * 100))

  useEffect(() => {
    const t = setTimeout(() => setAnimPct(targetPct), 200)
    return () => clearTimeout(t)
  }, [targetPct])

  async function signAta(signToken: string) {
    if (!signerName.trim()) return
    const signatureData = ataCanvasRef.current?.toDataURL()
    if (!signatureData) return

    setSigningSaving(true)
    try {
      const res = await fetch(`/api/ata/sign/${signToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sign',
          name: signerName.trim(),
          signature_data: signatureData,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error || 'Kunde inte signera')
      } else {
        setSigningAtaId(null)
        setSignerName('')
        onAtaSigned()
      }
    } catch {
      alert('Kunde inte signera ÄTA')
    }
    setSigningSaving(false)
  }

  // PhotoLightbox lazy import — undviker circular import om vi nån gång
  // återanvänder från flera ställen.
  const Lightbox = require('./PortalPhotoLightbox').default

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
          <div className="bp-brand-name">{project.name}</div>
          <div className="bp-brand-sub">Projekt #{project.project_id.substring(0, 6)}</div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            background: 'var(--green-50)',
            borderRadius: 'var(--r-pill)',
          }}
        >
          <span className="bp-live-dot" />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--green-600)' }}>LIVE</span>
        </div>
      </div>

      <div className="bp-body">
        {/* Milestone tracker */}
        <div style={{ padding: '20px 18px 8px' }}>
          <div style={{ position: 'relative', padding: '6px 0 0' }}>
            <div
              style={{
                position: 'absolute',
                top: 24,
                left: 22,
                right: 22,
                height: 3,
                background: 'var(--border)',
                borderRadius: 2,
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 24,
                left: 22,
                height: 3,
                borderRadius: 2,
                width: `calc((100% - 44px) * ${animPct / 100})`,
                background: 'linear-gradient(90deg, var(--bee-500), var(--bee-600))',
                transition: 'width 1.4s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative' }}>
              {milestones.map((m, i) => {
                const done = m.status === 'done'
                const active = m.status === 'active'
                return (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                      flex: 1,
                      animation: `bp-pop-in 400ms ${i * 120}ms both`,
                    }}
                  >
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        background: done ? 'var(--bee-600)' : active ? '#fff' : 'var(--surface)',
                        border: `2.5px solid ${done ? 'var(--bee-600)' : active ? 'var(--bee-500)' : 'var(--border-strong)'}`,
                        color: done ? '#fff' : active ? 'var(--bee-700)' : 'var(--subtle)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: active ? '0 0 0 6px rgba(245,158,11,0.15)' : 'none',
                        zIndex: 2,
                      }}
                    >
                      <m.Icon size={18} strokeWidth={2.4} />
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: done || active ? 'var(--ink)' : 'var(--muted)',
                        }}
                      >
                        {m.name}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Description */}
        {project.description && (
          <div style={{ padding: '18px' }}>
            <div
              className="bp-card"
              style={{ background: 'linear-gradient(135deg, var(--bee-50), #fff)', borderColor: 'var(--bee-100)' }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--bee-700)',
                  letterSpacing: '0.08em',
                  marginBottom: 6,
                }}
              >
                JUST NU
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>
                {project.name}
              </div>
              <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>{project.description}</p>
            </div>
          </div>
        )}

        {/* Photo gallery */}
        {photos.length > 0 && (
          <div style={{ padding: '0 18px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
              }}
            >
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Bilder från jobbet</h3>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{photos.length} bilder</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {photos.map((p, i) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setLightboxIdx(i)}
                  style={{
                    aspectRatio: '1',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    borderRadius: 'var(--r-md)',
                    overflow: 'hidden',
                    position: 'relative',
                    animation: `bp-pop-in 360ms ${i * 60}ms both`,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={p.caption || 'Projektbild'}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  {p.type === 'after' && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        padding: '2px 6px',
                        background: 'var(--bee-500)',
                        color: '#fff',
                        fontSize: 9,
                        fontWeight: 600,
                        borderRadius: 4,
                      }}
                    >
                      Klart
                    </span>
                  )}
                  {p.type === 'before' && (
                    <span
                      style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        padding: '2px 6px',
                        background: 'rgba(15,23,42,0.7)',
                        color: '#fff',
                        fontSize: 9,
                        fontWeight: 600,
                        borderRadius: 4,
                      }}
                    >
                      Före
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ÄTA changes */}
        {project.atas && project.atas.length > 0 && (
          <div style={{ padding: '24px 18px 0' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>ÄTA-ändringar</h3>
            <div className="bp-card" style={{ padding: 0 }}>
              {project.atas.map((ata, i) => (
                <div
                  key={ata.change_id}
                  style={{
                    padding: 14,
                    borderBottom: i < project.atas.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                        ÄTA-{ata.ata_number}: {ata.description}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        {ata.change_type === 'addition' ? 'Tillägg' : ata.change_type === 'change' ? 'Ändring' : 'Avgående'}
                        {ata.total > 0 && ` · ${formatCurrency(ata.total)}`}
                      </div>
                    </div>
                    <span
                      className={`bp-badge ${
                        ata.status === 'signed' ? 'green' : ata.status === 'sent' ? 'amber' : 'gray'
                      }`}
                    >
                      {ata.status === 'signed' ? 'Signerad' : ata.status === 'sent' ? 'Att signera' : ata.status}
                    </span>
                  </div>

                  {ata.signed_at && ata.signed_by_name && (
                    <div style={{ fontSize: 11, color: 'var(--green-600)', marginTop: 4 }}>
                      Signerad av {ata.signed_by_name}, {formatDate(ata.signed_at)}
                    </div>
                  )}

                  {ata.status === 'sent' && ata.sign_token && (
                    <div style={{ marginTop: 12 }}>
                      {signingAtaId === ata.change_id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                          <div>
                            <label style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4, display: 'block' }}>
                              Ditt namn
                            </label>
                            <input
                              type="text"
                              value={signerName}
                              onChange={e => setSignerName(e.target.value)}
                              placeholder="Förnamn Efternamn"
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--r-md)',
                                fontSize: 14,
                                fontFamily: 'inherit',
                                outline: 'none',
                              }}
                            />
                          </div>
                          <div>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: 4,
                              }}
                            >
                              <label style={{ fontSize: 11, color: 'var(--muted)' }}>Signatur</label>
                              <ClearSignatureButton
                                variant="corner"
                                onClick={() => ataCanvasRef.current?.clear()}
                              />
                            </div>
                            <SignatureCanvas
                              ref={ataCanvasRef}
                              mode="ata"
                              className="w-full h-24 border border-gray-300 rounded-lg bg-white cursor-crosshair touch-none"
                            />
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              type="button"
                              onClick={() => { setSigningAtaId(null); setSignerName('') }}
                              style={{
                                flex: 1,
                                padding: '10px 12px',
                                background: 'var(--bg)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--r-md)',
                                fontSize: 13,
                                color: 'var(--muted)',
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                              }}
                            >
                              Avbryt
                            </button>
                            <button
                              type="button"
                              onClick={() => signAta(ata.sign_token!)}
                              disabled={!signerName.trim() || signingSaving}
                              className="bp-cta bee"
                              style={{ flex: 1, height: 40, fontSize: 13, gap: 6 }}
                            >
                              {signingSaving ? <Loader2 size={14} className="animate-spin" /> : <PenTool size={14} />}
                              Signera
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setSigningAtaId(ata.change_id)
                            setTimeout(() => ataCanvasRef.current?.init(), 100)
                          }}
                          className="bp-cta bee"
                          style={{ height: 40, fontSize: 13 }}
                        >
                          <PenTool size={14} /> Granska och signera
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ height: 24 }} />
      </div>

      {lightboxIdx !== null && (
        <Lightbox
          photos={photos}
          index={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onChange={setLightboxIdx}
        />
      )}
    </>
  )
}
