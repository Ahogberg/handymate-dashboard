'use client'

import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle,
  FileSignature,
  FileText,
  Hammer,
  Truck,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react'
import { formatCurrency, formatDate } from '../helpers'
import type { PortalAta, PortalReport, Project } from '../types'
import { ataKundStatusLabel, ataTypLabel } from '@/lib/ata/labels'

interface PortalProjectDetailProps {
  project: Project
  onBack: () => void
  /** Portalens beslutskort (2026-09-07): ÄTA-kortet öppnar beslutsvyn
      (PortalAtaDecision) — signeringen bor inte längre inline här. */
  onOpenAta: (changeId: string) => void
  /** Fastighetspasset steg 1: finns ett publicerat jobbpass för projektet? */
  jobbpassAvailable?: boolean
  onOpenJobbpass?: () => void
  /** Projektets fältrapporter (rutten fanns, anropades av ingen). */
  reports?: PortalReport[]
}

/**
 * Projektdetalj-vy (port av bp-project.jsx).
 * Inkluderar milstolpe-tracker (5 stegs-ikoner), foto-galleri (öppnar
 * lightbox) och ÄTA-korten — varje kort är tryckbart och leder till
 * beslutsvyn där kunden godkänner eller tackar nej.
 */
const MILESTONE_DEFAULTS = [
  { id: 'plan',  name: 'Planering',     Icon: FileSignature, status: 'done' as const },
  { id: 'prep',  name: 'Förberedelse',  Icon: Truck,         status: 'done' as const },
  { id: 'work',  name: 'Pågående',      Icon: Hammer,        status: 'active' as const },
  { id: 'done',  name: 'Slutfört',      Icon: CheckCircle,   status: 'pending' as const },
]

export default function PortalProjectDetail({
  project,
  onBack,
  onOpenAta,
  jobbpassAvailable = false,
  onOpenJobbpass,
  reports = [],
}: PortalProjectDetailProps) {
  const [animPct, setAnimPct] = useState(0)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)

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
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: project.project_number ? 2 : 10 }}>
                {project.name}
              </div>
              {project.project_number && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Ärende {project.project_number}</div>
              )}
              <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>{project.description}</p>
            </div>
          </div>
        )}

        {/* Jobbpasset (Fastighetspasset steg 1): sammanställningen av vad som
            gjordes — omfattning, tillägg, egenkontroll, bilder. Bara när ägaren publicerat. */}
        {jobbpassAvailable && onOpenJobbpass && (
          <div style={{ padding: '0 18px' }}>
            <button
              type="button"
              className="bp-card bp-card-tap"
              onClick={onOpenJobbpass}
              style={{ width: '100%', padding: 14, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', background: 'linear-gradient(135deg, var(--green-50), #fff)' }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--green-50)', color: 'var(--green-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ShieldCheck size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Jobbpasset — vad som gjordes hos dig</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Omfattning, tillägg, egenkontroll och bilder på ett ställe.</div>
              </div>
              <ChevronRight size={18} style={{ color: 'var(--muted)', flexShrink: 0 }} />
            </button>
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

        {/* Fältrapporter (Fastighetspasset steg 1): rutten /reports fanns sedan
            tidigare men anropades aldrig — nu visas projektets rapporter här. */}
        {reports.length > 0 && (
          <div style={{ padding: '24px 18px 0' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>Fältrapporter</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {reports.map(r => (
                <div key={r.id} className="bp-card" style={{ padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{r.title || (r.report_number ? `Rapport ${r.report_number}` : 'Fältrapport')}</div>
                    <span className={`bp-badge ${r.signed_at ? 'green' : 'gray'}`}>{r.signed_at ? 'Godkänd' : 'Skickad'}</span>
                  </div>
                  {r.work_performed && <p style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5, marginTop: 6, whiteSpace: 'pre-line' }}>{r.work_performed}</p>}
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                    {new Date(r.created_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {r.signed_by ? ` · godkänd av ${r.signed_by}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ÄTA changes */}
        {project.atas && project.atas.length > 0 && (
          <div style={{ padding: '24px 18px 0' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>Tilläggsarbeten</h3>
            <div className="bp-card" style={{ padding: 0, overflow: 'hidden' }}>
              {project.atas.map((ata, i) => {
                const attGodkanna = ata.status === 'sent' && !!ata.sign_token
                const statusCls = ata.status === 'signed' || ata.status === 'approved'
                  ? 'godkand'
                  : ata.status === 'declined'
                    ? 'avbojd'
                    : ata.status === 'invoiced'
                      ? 'fakturerad'
                      : attGodkanna ? 'att-godkanna' : 'forslag'
                return (
                  <div
                    key={ata.change_id}
                    role="button"
                    tabIndex={0}
                    className="bp-card-tap"
                    onClick={() => onOpenAta(ata.change_id)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenAta(ata.change_id) } }}
                    style={{
                      padding: 14,
                      cursor: 'pointer',
                      borderBottom: i < project.atas.length - 1 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                          ÄTA-{ata.ata_number}: {ata.description}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                          {ataTypLabel(ata.change_type)}
                          {ata.sent_at ? ` · skickad ${formatDate(ata.sent_at)}` : ''}
                        </div>
                      </div>
                      {/* Etiketten kommer från backend (lib/ata/labels.ts) — aldrig rå status. */}
                      <span className={`bp-status ${statusCls}`}>
                        {ata.status_label || ataKundStatusLabel(ata.status)}
                      </span>
                      <ChevronRight size={16} style={{ color: '#94A3B8', flexShrink: 0 }} />
                    </div>

                    <AtaRaderOchSummor ata={ata} />

                    {ata.signed_by_name && ata.signed_at && (
                      <div style={{ fontSize: 11, color: 'var(--green-600)', marginTop: 4 }}>
                        Godkänd av {ata.signed_by_name}, {formatDate(ata.signed_at)}
                      </div>
                    )}
                    {ata.status === 'declined' && (
                      <div style={{ fontSize: 11, color: 'var(--red-600)', marginTop: 4 }}>
                        Du tackade nej{ata.declined_at ? ` ${formatDate(ata.declined_at)}` : ''}.
                      </div>
                    )}

                    {attGodkanna && (
                      <div style={{ marginTop: 12 }}>
                        <span className="bp-btn-primary" style={{ height: 44, fontSize: 14 }}>
                          Granska och godkänn
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
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

/**
 * ÄTA-dokumentet i portalen: rader, moms, ROT-avdrag och PDF-länk.
 * Summorna räknas av backend (lib/ata/totals.ts) — samma siffror som i
 * PDF:en och på fakturan. Avgående ÄTA visas med minus.
 */
function AtaRaderOchSummor({ ata }: { ata: PortalAta }) {
  const rader = Array.isArray(ata.items) ? ata.items : []
  const s = ata.summor
  const rad = (label: string, belopp: number, opts?: { fet?: boolean; grön?: boolean }) => (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 8,
        fontSize: opts?.fet ? 14 : 12,
        fontWeight: opts?.fet ? 700 : 400,
        color: opts?.grön ? 'var(--green-600)' : opts?.fet ? 'var(--ink)' : 'var(--ink-2)',
      }}
    >
      <span>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(Math.round(belopp))}</span>
    </div>
  )

  return (
    <div style={{ marginTop: 6 }}>
      {rader.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                <th style={{ fontWeight: 500, padding: '4px 0' }}>Benämning</th>
                <th style={{ fontWeight: 500, padding: '4px 0', textAlign: 'right', whiteSpace: 'nowrap' }}>Antal</th>
                <th style={{ fontWeight: 500, padding: '4px 0', textAlign: 'right', whiteSpace: 'nowrap' }}>Summa</th>
              </tr>
            </thead>
            <tbody>
              {rader.map((r, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 8px 6px 0', color: 'var(--ink)' }}>{r.name}</td>
                  <td style={{ padding: '6px 0', textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>
                    {r.quantity} {r.unit}
                  </td>
                  <td style={{ padding: '6px 0', textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(Math.round(r.quantity * r.unit_price))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {s && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
          {rad('Delsumma', s.delsumma)}
          {rad(`Moms ${ata.vat_rate} %`, s.moms)}
          {rad('Totalt inkl. moms', s.totalt, { fet: !s.rotTyp })}
          {s.rotTyp && s.rotAvdrag > 0 && (
            <>
              {rad(`${s.rotTyp === 'rot' ? 'ROT' : 'RUT'}-avdrag (prel.)`, -s.rotAvdrag, { grön: true })}
              {rad('Att betala', s.attBetala, { fet: true })}
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                Avdraget är preliminärt och förutsätter att Skatteverket godkänner det.
              </div>
            </>
          )}
        </div>
      )}

      {ata.pdf_url && (
        <a
          href={ata.pdf_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 10,
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--bee-700)',
            textDecoration: 'none',
          }}
        >
          <FileText size={14} /> Öppna ÄTA-dokumentet (PDF)
        </a>
      )}
    </div>
  )
}
