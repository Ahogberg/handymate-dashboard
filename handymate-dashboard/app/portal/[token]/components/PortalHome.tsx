'use client'

import { useEffect, useState } from 'react'
import {
  CheckCircle,
  ChevronRight,
  FileSignature,
  FolderKanban,
  Image as ImageIcon,
  MessageCircle,
  Phone,
  Receipt,
  RotateCw,
  Sun,
  MapPin,
  Package,
} from 'lucide-react'
import PortalShellHeader from './PortalShellHeader'
import PortalHandymateAttribution from './PortalHandymateAttribution'
import PortalAgreements from './PortalAgreements'
import { formatCurrency } from '../helpers'
import type { PortalInstallation, PortalJobbpassSummary, PortalActivity, PortalData, PortalDecisions, Project } from '../types'
import { groupBostad, formatDatum, formatManad } from './bostad'

interface PortalHomeProps {
  portal: PortalData
  token: string
  /** Fastighetspasset steg 1/3: kundens publicerade jobbpass → "Min bostad". */
  passes?: PortalJobbpassSummary[]
  /** Fastighetspasset steg 3: bekräftade installationer → "Min bostad". */
  installations?: PortalInstallation[]
  /** Portalens beslutskort (2026-09-07): det som väntar på kunden. */
  decisions?: PortalDecisions | null
  onNavigate: (
    route: 'project' | 'docs' | 'contact' | 'messages' | 'project-detail' | 'jobbpass' | 'ata' | 'invoice' | 'review',
    payload?: { projectId?: string; docsSection?: 'quotes' | 'invoices'; changeId?: string; invoiceId?: string },
  ) => void
}

/** "Förfaller 21 sep" — kort datum utan år för väntar-raden. */
function kortDatum(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' }).replace('.', '')
}

const ICON_MAP: Record<string, typeof ImageIcon> = {
  Image: ImageIcon,
  FileSignature: FileSignature,
  MessageCircle: MessageCircle,
  Receipt: Receipt,
  CheckCircle: CheckCircle,
}

/**
 * Hem-vy (port av bp-home.jsx).
 * Hämtar aktivt projekt + aktivitetsfeed.
 */
export default function PortalHome({ portal, token, passes = [], installations = [], decisions = null, onNavigate }: PortalHomeProps) {
  const bostad = groupBostad(passes, installations)
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [activity, setActivity] = useState<PortalActivity[]>([])
  const [polling, setPolling] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const [projectsRes, activityRes] = await Promise.all([
        fetch(`/api/portal/${token}/projects`).then(r => r.ok ? r.json() : { projects: [] }).catch(() => ({ projects: [] })),
        fetch(`/api/portal/${token}/activity`).then(r => r.ok ? r.json() : { activity: [] }).catch(() => ({ activity: [] })),
      ])
      if (cancelled) return
      const active = (projectsRes.projects || []).find((p: Project) => p.status === 'active' || p.status === 'in_progress') || (projectsRes.projects || [])[0] || null
      setActiveProject(active)
      setActivity(activityRes.activity || [])
    }

    load()
    const tick = setInterval(async () => {
      setPolling(true)
      await load()
      setTimeout(() => setPolling(false), 900)
    }, 30000)

    return () => {
      cancelled = true
      clearInterval(tick)
    }
  }, [token])

  const greeting = (() => {
    const hour = new Date().getHours()
    if (hour < 10) return 'God morgon'
    if (hour < 18) return 'Hej'
    return 'God kväll'
  })()
  const firstName = portal.customer.name?.split(' ')[0] || 'där'
  const today = new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()

  const completedMilestones = activeProject?.milestones?.filter(m => m.status === 'completed').length || 0
  const totalMilestones = activeProject?.milestones?.length || 0
  const progressPct = activeProject?.progress ?? (totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0)

  // Deep-links (2026-08-10): Offerter och Fakturor gick båda till samma
  // ofiltrerade dokumentlista — nu landar klicket på rätt sektion.
  // Beslutskorten (2026-09-07): räknaren på Fakturor = öppna fakturor ur
  // /decisions. Offerter får ingen räknare — portalen laddar inte offert-
  // antalet på Hem och vi hittar inte på siffror.
  const openInvoices = decisions?.invoices.length ?? 0
  const quickActions = [
    { id: 'project' as const, Icon: FolderKanban,    label: 'Projekt',  color: 'var(--bee-700)',   bg: 'var(--bee-50)',   payload: undefined, count: 0 },
    { id: 'docs' as const,    Icon: FileSignature,   label: 'Offerter', color: 'var(--blue-600)',  bg: 'var(--blue-50)',  payload: { docsSection: 'quotes' as const }, count: 0 },
    { id: 'docs' as const,    Icon: Receipt,         label: 'Fakturor', color: 'var(--ink)',       bg: 'var(--bg)',       payload: { docsSection: 'invoices' as const }, count: openInvoices },
    { id: 'contact' as const, Icon: Phone,           label: 'Kontakt',  color: 'var(--green-600)', bg: 'var(--green-50)', payload: undefined, count: 0 },
  ]

  // "Väntar på dig" — en rad per beslut, i den ordning kunden bör ta dem:
  // tilläggsarbeten först (jobbet står annars stilla), sedan fakturor,
  // sist omdömet. Inget väntar → kortet finns inte.
  type WaitingRow = { key: string; title: string; sub: string; red: boolean; go: () => void }
  const waiting: WaitingRow[] = []
  for (const a of decisions?.atas ?? []) {
    waiting.push({
      key: `ata-${a.change_id}`,
      title: 'Tilläggsarbete att godkänna',
      sub: `ÄTA-${a.ata_number} · ${formatCurrency(a.att_betala)}`,
      red: false,
      go: () => onNavigate('ata', { changeId: a.change_id }),
    })
  }
  for (const inv of decisions?.invoices ?? []) {
    if (inv.claimed_at) continue
    const datum = kortDatum(inv.due_date)
    waiting.push({
      key: `inv-${inv.invoice_id}`,
      title: 'Faktura att betala',
      sub: inv.overdue
        ? `${datum ? `Förföll ${datum} · ` : ''}${formatCurrency(inv.amount)}`
        : `${datum ? `Förfaller ${datum} · ` : ''}${formatCurrency(inv.amount)}`,
      red: inv.overdue,
      go: () => onNavigate('invoice', { invoiceId: inv.invoice_id }),
    })
  }
  if (decisions?.review.pending) {
    waiting.push({ key: 'review', title: 'Hur blev det?', sub: 'Lämna ett omdöme', red: false, go: () => onNavigate('review') })
  }

  // Statuschippen följer projektets FAKTISKA läge (2026-08-10): kortet
  // faller tillbaka på första projektet när inget är aktivt, och den gamla
  // hårdkodade "Pågår"-chippen med puls gjorde ett avslutat projekt till
  // ett pågående. Pulsen är reserverad för det som faktiskt pågår.
  const arPagaende = activeProject?.status === 'active' || activeProject?.status === 'in_progress'
  // Beslutskorten (2026-09-07): Pågår/Klart bär Designs .bp-status-klasser,
  // Pausat/Planeras behåller sina egna färger.
  const statusChip = arPagaende
    ? { text: 'Pågår', bg: '#DBEAFE', color: '#1E40AF', cls: 'pagar', puls: true }
    : activeProject?.status === 'completed'
      ? { text: 'Klart', bg: '#DCFCE7', color: '#166534', cls: 'klart', puls: false }
      : activeProject?.status === 'paused'
        ? { text: 'Pausat', bg: '#FEF3C7', color: '#92400E', cls: '', puls: false }
        : { text: 'Planeras', bg: 'var(--bg)', color: 'var(--muted)', cls: '', puls: false }

  return (
    <>
      <PortalShellHeader
        business={portal.business}
        unreadMessages={portal.unreadMessages}
        onNotificationClick={() => onNavigate('messages')}
        subtitle={`Hej ${firstName}`}
      />

      <div className="bp-body">
        {/* Greeting */}
        <div className="bp-page-title">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <Sun size={14} style={{ color: 'var(--bee-500)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', letterSpacing: '0.04em' }}>
              {today}
            </span>
          </div>
          <h1>{greeting} {firstName},</h1>
          <p>
            {activeProject
              ? arPagaende
                ? `${activeProject.name} pågår — vi håller dig uppdaterad.`
                : activeProject.status === 'completed'
                  ? `${activeProject.name} är klart — hör av dig om du undrar något.`
                  : `${activeProject.name} är planerat — vi hör av oss inför start.`
              : 'Välkommen till din portal.'}
          </p>
        </div>

        {/* Väntar på dig (portalens beslutskort, 2026-09-07): allt kunden
            har att ta ställning till, en rad per beslut, rakt in i beslutet.
            Finns inget renderas ingenting — aldrig en tom rubrik. */}
        {waiting.length > 0 && (
          <div style={{ padding: '0 18px 16px' }}>
            <div className="bp-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 8px' }}>
                <span className="bp-eyebrow">Väntar på dig</span>
                <span className="bp-counter">{waiting.length}</span>
              </div>
              {waiting.map(row => (
                <button key={row.key} type="button" className="bp-waiting-row" onClick={row.go}>
                  <span className={`bp-dot${row.red ? ' red' : ''}`} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: 'var(--ink)' }}>{row.title}</span>
                    <span style={{ display: 'block', fontSize: 12.5, color: row.red ? 'var(--red-600)' : 'var(--muted)', marginTop: 1 }}>{row.sub}</span>
                  </span>
                  <ChevronRight size={18} style={{ color: '#94A3B8', flexShrink: 0 }} />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Active project status */}
        {activeProject && (
          <div style={{ padding: '0 18px' }}>
            <div
              className="bp-card bp-card-tap"
              onClick={() => onNavigate('project-detail', { projectId: activeProject.project_id })}
              style={{ padding: 0, overflow: 'hidden', position: 'relative' }}
            >
              <div style={{ padding: 16, paddingBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--ink)' }}>
                      {activeProject.name}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                      {portal.business.name}
                      {activeProject.project_number ? <> · Ärende {activeProject.project_number}</> : null}
                    </div>
                    {activeProject.description && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        {activeProject.description}
                      </div>
                    )}
                  </div>
                  <div
                    className={`bp-status${statusChip.cls ? ` ${statusChip.cls}` : ''}`}
                    style={{ gap: 6, background: statusChip.bg, color: statusChip.color, flexShrink: 0 }}
                  >
                    {statusChip.puls && <span className="bp-live-dot" />}
                    <span>{statusChip.text}</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {totalMilestones > 0
                        ? `${completedMilestones} av ${totalMilestones} milstolpar`
                        : 'Framsteg'}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)' }}>{progressPct}%</span>
                  </div>
                  <div style={{ height: 6, background: '#F1F5F9', borderRadius: 3, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${progressPct}%`,
                        height: '100%',
                        background: 'var(--bee-500)',
                        borderRadius: 3,
                        transformOrigin: 'left',
                        animation: 'bp-grow-x 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      }}
                    />
                  </div>
                </div>

                {activeProject.latestLog?.description && (
                  <div style={{ fontSize: 13.5, color: 'var(--ink-2)', marginTop: 12, lineHeight: 1.45 }}>
                    {activeProject.latestLog.description}
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 12, fontSize: 13.5, fontWeight: 600, color: '#334155' }}>
                  Se projektet <ChevronRight size={16} />
                </div>
              </div>

              {/* Next visit strip */}
              {activeProject.nextVisit && (
                <div
                  style={{
                    padding: '10px 16px',
                    borderTop: '1px solid var(--bee-100)',
                    background: 'rgba(255,255,255,0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <ImageIcon size={14} style={{ color: 'var(--bee-700)' }} />
                  <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>
                    Nästa besök{' '}
                    <strong>
                      {new Date(activeProject.nextVisit.start_time).toLocaleDateString('sv-SE', {
                        weekday: 'short', day: 'numeric', month: 'short',
                      })}{' '}
                      ·{' '}
                      {new Date(activeProject.nextVisit.start_time).toLocaleTimeString('sv-SE', {
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </strong>
                  </span>
                  <span style={{ marginLeft: 'auto', color: 'var(--bee-700)' }}>
                    <ChevronRight size={16} />
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quick actions grid */}
        <div style={{ padding: '20px 18px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {quickActions.map((a, i) => (
              <button
                type="button"
                key={i}
                className="bp-card-tap"
                onClick={() => onNavigate(a.id, a.payload)}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-lg)',
                  padding: 14,
                  textAlign: 'left',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  minHeight: 96,
                  fontFamily: 'inherit',
                  position: 'relative',
                }}
              >
                {a.count > 0 && <span className="bp-counter red">{a.count}</span>}
                <div
                  style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: a.bg, color: a.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <a.Icon size={18} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{a.label}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Min bostad (Fastighetspasset steg 3, 2026-08-27): det som sitter i
            kundens bostad och det som gjorts där — grupperat per plats
            (installationens adressögonblicksbild; kunden kan ha flera
            fastigheter). Bara bekräftade installationer och publicerade
            jobbpass. Visas bara när något finns; aldrig en tom rubrik. */}
        {bostad.length > 0 && (
          <div style={{ padding: '24px 18px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Min bostad</h3>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                {installations.length > 0 ? `${installations.length} installation${installations.length === 1 ? '' : 'er'} · ` : ''}{passes.length} jobb dokumenterade
              </span>
            </div>
            {bostad.map(group => (
              <div key={group.key} style={{ marginBottom: 14 }}>
                {group.label && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', margin: '6px 0 8px' }}>
                    <MapPin size={14} /> {group.label}
                  </div>
                )}
                {group.installations.length > 0 && (
                  <div className="bp-card" style={{ padding: 14, marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.06em', marginBottom: 8 }}>DET HÄR SITTER HOS DIG</div>
                    {group.installations.map((inst, i) => {
                      const produkt = [inst.manufacturer, inst.model].filter(Boolean).join(' ')
                      const rad = [inst.placement, inst.installed_at ? `installerad ${formatDatum(inst.installed_at)}` : null].filter(Boolean).join(' · ')
                      return (
                        <div key={inst.installation_id} style={{ paddingTop: i > 0 ? 10 : 0, marginTop: i > 0 ? 10 : 0, borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                            <Package size={16} style={{ color: 'var(--green-600)', flexShrink: 0, marginTop: 2 }} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{inst.name}{produkt ? ` · ${produkt}` : ''}</div>
                              {rad && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{rad}</div>}
                              {inst.next_service_at && inst.service_source_label && (
                                <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 4 }}>Nästa service omkring {formatManad(inst.next_service_at)} — {inst.service_source_label}</div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {group.passes.map(pass => (
                    <button
                      key={pass.project_id}
                      type="button"
                      className="bp-card bp-card-tap"
                      onClick={() => onNavigate('jobbpass', { projectId: pass.project_id })}
                      style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer', width: '100%', fontFamily: 'inherit' }}
                    >
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--green-50)', color: 'var(--green-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <CheckCircle size={20} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.01em' }}>{pass.project_name}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                          Jobbpass{pass.completed_at ? ` · klart ${formatDatum(pass.completed_at)}` : ''} · omfattning, egenkontroll, bilder
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Serviceavtal (Motor 2, Etapp 2) — visas bara vid aktiva avtal */}
        <PortalAgreements token={token} />

        {/* Latest activity */}
        <div style={{ padding: '24px 18px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Senaste händelser</h3>
            {polling && (
              <RotateCw size={14} style={{ color: 'var(--muted)', animation: 'bp-spin 1s linear infinite' }} />
            )}
          </div>

          {activity.length === 0 ? (
            <div
              style={{
                padding: 18,
                background: 'var(--surface)',
                border: '1px dashed var(--border)',
                borderRadius: 'var(--r-md)',
                textAlign: 'center',
                color: 'var(--muted)',
                fontSize: 13,
              }}
            >
              Inga händelser än — kommer in när jobbet startar.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activity.map((it, i) => {
                const Icon = ICON_MAP[it.icon] || ImageIcon
                return (
                  <div
                    key={it.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-md)',
                      animation: `bp-slide-up 400ms ${i * 80}ms both`,
                      cursor: it.link ? 'pointer' : 'default',
                    }}
                    onClick={() => {
                      if (it.link?.route === 'project') onNavigate('project')
                      if (it.link?.route === 'docs') onNavigate('docs')
                      if (it.link?.route === 'messages') onNavigate('messages')
                    }}
                  >
                    <div
                      style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: it.bg, color: it.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={16} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{it.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>
                        {it.sub} · {timeAgo(it.created_at)}
                      </div>
                    </div>
                    {it.link && (
                      <span style={{ color: 'var(--subtle)' }}>
                        <ChevronRight size={16} />
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <PortalHandymateAttribution attribution={portal.attribution} />
      </div>
    </>
  )
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'nyss'
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min sedan`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} h sedan`
  if (ms < 7 * 86_400_000) return `${Math.floor(ms / 86_400_000)} d sedan`
  return new Date(iso).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}
