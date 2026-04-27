'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { AlertCircle, ChevronRight, FolderKanban, Loader2 } from 'lucide-react'
import PortalThemeProvider from './components/PortalThemeProvider'
import PortalShellHeader from './components/PortalShellHeader'
import PortalBottomNav, { type BottomTab } from './components/PortalBottomNav'
import PortalHome from './components/PortalHome'
import PortalProjectDetail from './components/PortalProjectDetail'
import PortalQuotesList from './components/PortalQuotesList'
import PortalInvoiceDetail from './components/PortalInvoiceDetail'
import PortalDocumentsList from './components/PortalDocumentsList'
import PortalMessagesThread from './components/PortalMessagesThread'
import PortalReviewCTA from './components/PortalReviewCTA'
import PortalContact from './components/PortalContact'
import PortalHandymateAttribution from './components/PortalHandymateAttribution'
import { formatDateTime, getProjectStatusText } from './helpers'
import type {
  BusinessInfo,
  Invoice,
  Message,
  PaymentInfo,
  PortalData,
  Project,
  Quote,
} from './types'

/**
 * Kundportal — orchestrator (Claude Design redesign).
 *
 * Tab-system: bottom-nav 4 flikar (home / project / docs / contact).
 * Sub-routes: quote, invoice, project-detail, messages, review — utan
 * tab-bar, men styrs av samma orchestrator.
 *
 * URL `?tab=review` öppnar review-vyn direkt (från review-SMS).
 */
type SubRoute = 'project-detail' | 'quote' | 'invoice' | 'messages' | 'review' | null

export default function CustomerPortalPage() {
  const params = useParams()
  const token = params?.token as string

  // Initial tab/sub-route från URL
  const initialFromUrl = (() => {
    if (typeof window === 'undefined') return { tab: 'home' as BottomTab, sub: null as SubRoute }
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t === 'review') return { tab: 'home' as BottomTab, sub: 'review' as SubRoute }
    if (t === 'messages') return { tab: 'home' as BottomTab, sub: 'messages' as SubRoute }
    if (t === 'projects' || t === 'project') return { tab: 'project' as BottomTab, sub: null }
    if (t === 'invoices' || t === 'quotes' || t === 'docs') return { tab: 'docs' as BottomTab, sub: null }
    if (t === 'contact') return { tab: 'contact' as BottomTab, sub: null }
    return { tab: 'home' as BottomTab, sub: null }
  })()

  const [tab, setTab] = useState<BottomTab>(initialFromUrl.tab)
  const [subRoute, setSubRoute] = useState<SubRoute>(initialFromUrl.sub)

  const [portal, setPortal] = useState<PortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Per-tab data
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null)
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo>({
    bankgiro: null,
    plusgiro: null,
    swish: null,
    bank_account: null,
    penalty_interest: 8,
    reminder_fee: 60,
  })
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo>({
    name: '',
    org_number: '',
    f_skatt: false,
  })
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingTab, setLoadingTab] = useState(false)

  // Initial load
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/portal/${token}`)
        if (!res.ok) {
          const data = await res.json()
          if (!cancelled) setError(data.error || 'Ogiltig eller utgången länk')
        } else {
          const data = await res.json()
          if (!cancelled) setPortal(data)
        }
      } catch {
        if (!cancelled) setError('Kunde inte ladda portalen')
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [token])

  // Tab/sub-route data fetching
  useEffect(() => {
    if (!portal) return

    async function fetchTabData() {
      setLoadingTab(true)
      try {
        if (tab === 'project' || subRoute === 'project-detail') {
          const res = await fetch(`/api/portal/${token}/projects`)
          const data = await res.json()
          setProjects(data.projects || [])
        }
        if (tab === 'docs' || subRoute === 'quote' || subRoute === 'invoice') {
          const [qRes, iRes] = await Promise.all([
            fetch(`/api/portal/${token}/quotes`).then(r => r.json()).catch(() => ({ quotes: [] })),
            fetch(`/api/portal/${token}/invoices`).then(r => r.json()).catch(() => ({ invoices: [] })),
          ])
          setQuotes(qRes.quotes || [])
          setInvoices(iRes.invoices || [])
          if (iRes.paymentInfo) setPaymentInfo(iRes.paymentInfo)
          if (iRes.business) setBusinessInfo(iRes.business)
        }
        if (subRoute === 'messages') {
          const res = await fetch(`/api/portal/${token}/messages`)
          const data = await res.json()
          setMessages(data.messages || [])
        }
      } catch {
        console.error('Failed to fetch tab data')
      }
      setLoadingTab(false)
    }
    fetchTabData()
  }, [tab, subRoute, portal, token])

  // 30s polling för projekt-detalj (live tracker)
  useEffect(() => {
    if (subRoute !== 'project-detail' || !selectedProject || !portal) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/portal/${token}/projects`)
        const data = await res.json()
        setProjects(data.projects || [])
      } catch {}
    }, 30000)
    return () => clearInterval(interval)
  }, [subRoute, selectedProject, portal, token])

  // Navigation helper for cross-screen jumps
  function navigate(route: 'project' | 'docs' | 'contact' | 'messages' | 'project-detail', payload?: { projectId?: string }) {
    if (route === 'project') { setTab('project'); setSubRoute(null); setSelectedProject(null) }
    else if (route === 'docs') { setTab('docs'); setSubRoute(null); setSelectedInvoice(null) }
    else if (route === 'contact') { setTab('contact'); setSubRoute(null) }
    else if (route === 'messages') setSubRoute('messages')
    else if (route === 'project-detail') {
      setTab('project')
      setSubRoute('project-detail')
      if (payload?.projectId) setSelectedProject(payload.projectId)
    }
  }

  function changeTab(t: BottomTab) {
    setTab(t)
    setSubRoute(null)
    setSelectedProject(null)
    setSelectedInvoice(null)
  }

  if (loading) {
    return (
      <div className="bp-screen" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={32} className="animate-spin" style={{ color: 'var(--bee-700)' }} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bp-screen" style={{ alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <AlertCircle size={48} style={{ color: 'var(--red-600)', margin: '0 auto 12px' }} />
          <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--ink)', marginBottom: 8 }}>{error}</h1>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>
            Kontrollera att länken är korrekt eller kontakta din hantverkare.
          </p>
        </div>
      </div>
    )
  }

  if (!portal) return null

  const selectedProjectData = projects.find(p => p.project_id === selectedProject)
  const selectedInvoiceData = invoices.find(i => i.invoice_id === selectedInvoice)

  // Sub-route renders (full-screen, ingen bottom-nav)
  if (subRoute === 'messages') {
    return (
      <PortalThemeProvider business={portal.business}>
        <PortalMessagesThread
          business={portal.business}
          messages={messages}
          token={token}
          onBack={() => setSubRoute(null)}
          onMessageSent={msg => setMessages(prev => [...prev, msg])}
        />
      </PortalThemeProvider>
    )
  }

  if (subRoute === 'review') {
    return (
      <PortalThemeProvider business={portal.business}>
        <PortalReviewCTA portal={portal} onBack={() => setSubRoute(null)} />
      </PortalThemeProvider>
    )
  }

  if (subRoute === 'project-detail' && selectedProjectData) {
    return (
      <PortalThemeProvider business={portal.business}>
        <PortalProjectDetail
          project={selectedProjectData}
          onBack={() => { setSubRoute(null); setSelectedProject(null) }}
          onAtaSigned={async () => {
            const res = await fetch(`/api/portal/${token}/projects`)
            const data = await res.json()
            setProjects(data.projects || [])
          }}
        />
      </PortalThemeProvider>
    )
  }

  if (subRoute === 'quote') {
    return (
      <PortalThemeProvider business={portal.business}>
        <PortalQuotesList
          quotes={quotes}
          customerName={portal.customer.name || ''}
          onBack={() => setSubRoute(null)}
          onSigned={async () => {
            const res = await fetch(`/api/portal/${token}/quotes`)
            const data = await res.json()
            setQuotes(data.quotes || [])
          }}
        />
      </PortalThemeProvider>
    )
  }

  if (subRoute === 'invoice' && selectedInvoiceData) {
    return (
      <PortalThemeProvider business={portal.business}>
        <PortalInvoiceDetail
          invoice={selectedInvoiceData}
          paymentInfo={paymentInfo}
          onBack={() => { setSubRoute(null); setSelectedInvoice(null) }}
        />
      </PortalThemeProvider>
    )
  }

  // Main tab renders (med bottom-nav)
  return (
    <PortalThemeProvider business={portal.business}>
      {tab === 'home' && (
        <PortalHome
          portal={portal}
          token={token}
          onNavigate={navigate}
        />
      )}

      {tab === 'project' && !selectedProject && (
        <ProjectsListView
          portal={portal}
          projects={projects}
          loadingTab={loadingTab}
          onSelectProject={(id) => {
            setSelectedProject(id)
            setSubRoute('project-detail')
          }}
        />
      )}

      {tab === 'docs' && (
        <PortalDocumentsList
          portal={portal}
          quotes={quotes}
          invoices={invoices}
          onOpenQuote={() => setSubRoute('quote')}
          onOpenInvoice={(id) => { setSelectedInvoice(id); setSubRoute('invoice') }}
        />
      )}

      {tab === 'contact' && (
        <PortalContact
          portal={portal}
          onChat={() => setSubRoute('messages')}
        />
      )}

      <PortalBottomNav active={tab} onChange={changeTab} />
    </PortalThemeProvider>
  )
}

/**
 * Liten lista över projekt på Projekt-tabben (utan selected-project).
 * Klick → visa project-detail som sub-route. Visas bara här eftersom
 * Home-vyn redan visar aktivt projekt — denna lista är för historik
 * + andra projekt.
 */
function ProjectsListView({
  portal,
  projects,
  loadingTab,
  onSelectProject,
}: {
  portal: PortalData
  projects: Project[]
  loadingTab: boolean
  onSelectProject: (id: string) => void
}) {
  return (
    <>
      <PortalShellHeader business={portal.business} unreadMessages={portal.unreadMessages} />
      <div className="bp-body">
        <div className="bp-page-title">
          <h1>Projekt</h1>
          <p>{projects.length === 0 ? 'Inga projekt än' : `${projects.length} totalt`}</p>
        </div>
        {loadingTab && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--bee-700)' }} />
          </div>
        )}
        {!loadingTab && projects.length === 0 ? (
          <div
            style={{
              padding: 24,
              margin: '0 18px',
              background: 'var(--surface)',
              border: '1px dashed var(--border)',
              borderRadius: 'var(--r-md)',
              textAlign: 'center',
              color: 'var(--muted)',
              fontSize: 13,
            }}
          >
            <FolderKanban size={36} style={{ color: 'var(--border-strong)', margin: '0 auto 8px' }} />
            Inga projekt än.
          </div>
        ) : (
          <div style={{ padding: '0 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {projects.map((p, i) => (
              <button
                type="button"
                key={p.project_id}
                onClick={() => onSelectProject(p.project_id)}
                className="bp-card bp-card-tap"
                style={{
                  padding: 14,
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  animation: `bp-slide-up 360ms ${i * 60}ms both`,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 6,
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{p.name}</div>
                  <span
                    className={`bp-badge ${
                      p.status === 'completed'
                        ? 'green'
                        : p.status === 'active' || p.status === 'in_progress'
                          ? 'amber'
                          : 'gray'
                    }`}
                  >
                    {getProjectStatusText(p.status)}
                  </span>
                </div>
                {typeof p.progress === 'number' && (
                  <div style={{ marginBottom: 8 }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: 11,
                        color: 'var(--muted)',
                        marginBottom: 4,
                      }}
                    >
                      <span>Framsteg</span>
                      <span>{p.progress}%</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${p.progress}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, var(--bee-500), var(--bee-600))',
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  </div>
                )}
                {p.nextVisit && (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--bee-700)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    Nästa besök: {formatDateTime(p.nextVisit.start_time)}
                  </div>
                )}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    marginTop: 8,
                    fontSize: 12,
                    color: 'var(--bee-700)',
                  }}
                >
                  Se detaljer <ChevronRight size={14} />
                </div>
              </button>
            ))}
          </div>
        )}
        <PortalHandymateAttribution />
      </div>
    </>
  )
}
