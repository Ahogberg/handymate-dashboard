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
} from 'lucide-react'
import PortalShellHeader from './PortalShellHeader'
import PortalHandymateAttribution from './PortalHandymateAttribution'
import { formatCurrency } from '../helpers'
import type { PortalActivity, PortalData, Project } from '../types'

interface PortalHomeProps {
  portal: PortalData
  token: string
  onNavigate: (route: 'project' | 'docs' | 'contact' | 'messages' | 'project-detail', payload?: { projectId?: string }) => void
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
export default function PortalHome({ portal, token, onNavigate }: PortalHomeProps) {
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

  const quickActions = [
    { id: 'project' as const, Icon: FolderKanban,    label: 'Projekt',  color: 'var(--bee-700)',   bg: 'var(--bee-50)' },
    { id: 'docs' as const,    Icon: FileSignature,   label: 'Offerter', color: 'var(--blue-600)',  bg: 'var(--blue-50)' },
    { id: 'docs' as const,    Icon: Receipt,         label: 'Fakturor', color: 'var(--ink)',       bg: 'var(--bg)' },
    { id: 'contact' as const, Icon: Phone,           label: 'Kontakt',  color: 'var(--green-600)', bg: 'var(--green-50)' },
  ]

  return (
    <>
      <PortalShellHeader
        business={portal.business}
        unreadMessages={portal.unreadMessages}
        onNotificationClick={() => onNavigate('messages')}
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
              ? `${activeProject.name} pågår — vi håller dig uppdaterad.`
              : 'Välkommen till din portal.'}
          </p>
        </div>

        {/* Active project status */}
        {activeProject && (
          <div style={{ padding: '0 18px' }}>
            <div
              className="bp-card bp-card-tap"
              onClick={() => onNavigate('project-detail', { projectId: activeProject.project_id })}
              style={{
                padding: 0,
                overflow: 'hidden',
                background: 'linear-gradient(135deg, var(--bee-50) 0%, var(--surface) 60%)',
                borderColor: 'var(--bee-100)',
                position: 'relative',
              }}
            >
              <div style={{ padding: 16, paddingBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--bee-700)', letterSpacing: '0.08em', marginBottom: 4 }}>
                      AKTIVT PROJEKT
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--ink)' }}>
                      {activeProject.name}
                    </div>
                    {activeProject.description && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        {activeProject.description}
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '4px 10px',
                      background: 'var(--green-50)',
                      borderRadius: 'var(--r-pill)',
                      flexShrink: 0,
                    }}
                  >
                    <span className="bp-live-dot" />
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--green-600)' }}>Pågår</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {totalMilestones > 0
                        ? `${completedMilestones} av ${totalMilestones} milstolpar`
                        : 'Framsteg'}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--bee-700)' }}>{progressPct}%</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--bee-100)', borderRadius: 4, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${progressPct}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, var(--bee-500), var(--bee-600))',
                        borderRadius: 4,
                        transformOrigin: 'left',
                        animation: 'bp-grow-x 1.2s cubic-bezier(0.4, 0, 0.2, 1)',
                      }}
                    />
                  </div>
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
                onClick={() => onNavigate(a.id)}
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
                }}
              >
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

        <PortalHandymateAttribution />
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
