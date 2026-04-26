'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { AlertCircle, Loader2 } from 'lucide-react'
import PortalHeader from './components/PortalHeader'
import PortalTabs from './components/PortalTabs'
import ProjectsList from './components/ProjectsList'
import ProjectDetail from './components/ProjectDetail'
import QuotesList from './components/QuotesList'
import InvoicesList from './components/InvoicesList'
import InvoiceDetail from './components/InvoiceDetail'
import MessagesThread from './components/MessagesThread'
import FieldReportsList from './components/FieldReportsList'
import ChangesList from './components/ChangesList'
import ReviewCTA from './components/ReviewCTA'
import type {
  BusinessInfo,
  FieldReport,
  Invoice,
  Message,
  PaymentInfo,
  PortalData,
  Project,
  Quote,
  Tab,
} from './types'

/**
 * Kundportal — orchestrator.
 *
 * Splittad i komponenter 2026-04-26 (refactor utan visuell ändring).
 * Varje flik äger sin egen UI; denna fil sköter bara token-laddning,
 * tab-routing, data-fetching per flik, och 30s-polling för projects.
 */
export default function CustomerPortalPage() {
  const params = useParams()
  const token = params?.token as string

  // Läs ?tab= från URL för att öppna rätt flik automatiskt
  const initialTab = (typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('tab') as Tab
    : null) || 'projects'

  const [portal, setPortal] = useState<PortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)

  // Per-tab data
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null)
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo>({
    bankgiro: null, plusgiro: null, swish: null, bank_account: null,
    penalty_interest: 8, reminder_fee: 60,
  })
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo>({ name: '', org_number: '', f_skatt: false })
  const [messages, setMessages] = useState<Message[]>([])
  const [reports, setReports] = useState<FieldReport[]>([])
  const [loadingTab, setLoadingTab] = useState(false)

  useEffect(() => {
    fetchPortal()
  }, [token])

  useEffect(() => {
    if (portal) {
      fetchTabData(activeTab)
    }
  }, [activeTab, portal])

  // Poll project data every 30s for live tracker updates
  useEffect(() => {
    if (activeTab !== 'projects' || !selectedProject || !portal) return
    const interval = setInterval(() => {
      fetchTabData('projects')
    }, 30000)
    return () => clearInterval(interval)
  }, [activeTab, selectedProject, portal])

  async function fetchPortal() {
    try {
      const res = await fetch(`/api/portal/${token}`)
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Ogiltig eller utgangen lank')
        setLoading(false)
        return
      }
      const data = await res.json()
      setPortal(data)
    } catch {
      setError('Kunde inte ladda portalen')
    }
    setLoading(false)
  }

  async function fetchTabData(tab: Tab) {
    setLoadingTab(true)
    try {
      if (tab === 'projects') {
        const res = await fetch(`/api/portal/${token}/projects`)
        const data = await res.json()
        setProjects(data.projects || [])
      } else if (tab === 'quotes') {
        const res = await fetch(`/api/portal/${token}/quotes`)
        const data = await res.json()
        setQuotes(data.quotes || [])
      } else if (tab === 'invoices') {
        const res = await fetch(`/api/portal/${token}/invoices`)
        const data = await res.json()
        setInvoices(data.invoices || [])
        setPaymentInfo(data.paymentInfo || { bankgiro: null, plusgiro: null, swish: null, bank_account: null, penalty_interest: 8, reminder_fee: 60 })
        if (data.business) setBusinessInfo(data.business)
      } else if (tab === 'messages') {
        const res = await fetch(`/api/portal/${token}/messages`)
        const data = await res.json()
        setMessages(data.messages || [])
      } else if (tab === 'reports') {
        const res = await fetch(`/api/portal/${token}/reports`)
        const data = await res.json()
        setReports(data.reports || [])
      } else if (tab === 'changes') {
        // ÄTA-data ligger nästad under projekt — hämta projects
        const res = await fetch(`/api/portal/${token}/projects`)
        const data = await res.json()
        setProjects(data.projects || [])
      }
    } catch {
      console.error('Failed to fetch tab data')
    }
    setLoadingTab(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-sky-700 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-3" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">{error}</h1>
          <p className="text-gray-500">Kontrollera att lanken ar korrekt eller kontakta din hantverkare.</p>
        </div>
      </div>
    )
  }

  if (!portal) return null

  const selectedProjectData = projects.find(p => p.project_id === selectedProject)

  return (
    <div className="min-h-screen bg-gray-50">
      <PortalHeader
        businessName={portal.business.name}
        customerName={portal.customer.name}
        selectedProjectId={selectedProject}
        selectedProjectName={selectedProjectData?.name}
        onBackToProjects={() => setSelectedProject(null)}
      />

      {!selectedProject && (
        <PortalTabs
          activeTab={activeTab}
          unreadMessages={portal.unreadMessages}
          onTabChange={(t) => { setActiveTab(t); setSelectedInvoice(null) }}
        />
      )}

      <main className="max-w-2xl mx-auto px-4 py-6">
        {loadingTab ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-sky-700 animate-spin" />
          </div>
        ) : (
          <>
            {activeTab === 'projects' && !selectedProject && (
              <ProjectsList projects={projects} onSelectProject={setSelectedProject} />
            )}

            {activeTab === 'projects' && selectedProject && selectedProjectData && (
              <ProjectDetail
                project={selectedProjectData}
                onAtaSigned={() => fetchTabData('projects')}
              />
            )}

            {activeTab === 'quotes' && (
              <QuotesList
                quotes={quotes}
                customerName={portal.customer.name || ''}
                onSigned={() => fetchTabData('quotes')}
              />
            )}

            {activeTab === 'invoices' && !selectedInvoice && (
              <InvoicesList invoices={invoices} onSelectInvoice={setSelectedInvoice} />
            )}

            {activeTab === 'invoices' && selectedInvoice && (() => {
              const inv = invoices.find(i => i.invoice_id === selectedInvoice)
              if (!inv) return null
              return (
                <InvoiceDetail
                  invoice={inv}
                  paymentInfo={paymentInfo}
                  businessInfo={businessInfo}
                  onBack={() => setSelectedInvoice(null)}
                />
              )
            })()}

            {activeTab === 'changes' && (
              <ChangesList
                projects={projects}
                onOpenAta={(projectId) => {
                  setSelectedProject(projectId)
                  setActiveTab('projects')
                }}
              />
            )}

            {activeTab === 'reports' && (
              <FieldReportsList reports={reports} />
            )}

            {activeTab === 'review' && (
              <ReviewCTA
                customerFirstName={portal.customer.name?.split(' ')[0] || ''}
                businessName={portal.business.name}
                googleReviewUrl={portal.business.googleReviewUrl}
                onGoToPortal={() => setActiveTab('projects')}
              />
            )}

            {activeTab === 'messages' && (
              <MessagesThread
                messages={messages}
                token={token}
                onMessageSent={(msg) => setMessages(prev => [...prev, msg])}
              />
            )}
          </>
        )}
      </main>

      {!selectedProject && activeTab !== 'messages' && (
        <footer className="border-t border-gray-200 bg-white mt-8">
          <div className="max-w-2xl mx-auto px-4 py-4 text-center text-sm text-gray-500">
            <p>{portal.business.name}</p>
            <div className="flex items-center justify-center gap-4 mt-1">
              {portal.business.phone && <a href={`tel:${portal.business.phone}`} className="text-sky-700 hover:underline">{portal.business.phone}</a>}
              {portal.business.email && <a href={`mailto:${portal.business.email}`} className="text-sky-700 hover:underline">{portal.business.email}</a>}
            </div>
          </div>
        </footer>
      )}
    </div>
  )
}
