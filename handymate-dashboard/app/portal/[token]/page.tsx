'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import {
  FolderKanban,
  FileText,
  Receipt,
  MessageSquare,
  ChevronRight,
  ArrowLeft,
  Clock,
  CheckCircle,
  AlertCircle,
  Send,
  Loader2,
  Calendar,
  Download,
  ExternalLink
} from 'lucide-react'

interface PortalData {
  customer: { name: string; email: string; phone: string; customerId: string }
  business: { name: string; contactName: string; email: string; phone: string }
  unreadMessages: number
}

interface Project {
  project_id: string
  name: string
  status: string
  description: string
  progress: number
  created_at: string
  updated_at: string
  milestones: Array<{ name: string; status: string; sort_order: number }>
  latestLog: { description: string; created_at: string } | null
  nextVisit: { title: string; start_time: string; end_time: string } | null
}

interface Quote {
  quote_id: string
  title: string
  status: string
  total: number
  customer_pays: number
  rot_rut_type: string | null
  rot_rut_deduction: number
  valid_until: string
  created_at: string
  sent_at: string | null
  accepted_at: string | null
  sign_token: string | null
}

interface Invoice {
  invoice_id: string
  invoice_number: string
  status: string
  total: number
  due_date: string
  paid_at: string | null
  created_at: string
  rot_rut_type: string | null
}

interface Message {
  id: string
  direction: 'inbound' | 'outbound'
  message: string
  read_at: string | null
  created_at: string
}

type Tab = 'projects' | 'quotes' | 'invoices' | 'messages'

export default function CustomerPortalPage() {
  const params = useParams()
  const token = params.token as string
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [portal, setPortal] = useState<PortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('projects')

  // Data
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [paymentInfo, setPaymentInfo] = useState<{ bankgiro: string | null; swish: string | null }>({ bankgiro: null, swish: null })
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [loadingTab, setLoadingTab] = useState(false)

  useEffect(() => {
    fetchPortal()
  }, [token])

  useEffect(() => {
    if (portal) {
      fetchTabData(activeTab)
    }
  }, [activeTab, portal])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
        setPaymentInfo(data.paymentInfo || { bankgiro: null, swish: null })
      } else if (tab === 'messages') {
        const res = await fetch(`/api/portal/${token}/messages`)
        const data = await res.json()
        setMessages(data.messages || [])
      }
    } catch {
      console.error('Failed to fetch tab data')
    }
    setLoadingTab(false)
  }

  async function sendMessage() {
    if (!newMessage.trim() || sendingMessage) return
    setSendingMessage(true)
    try {
      const res = await fetch(`/api/portal/${token}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: newMessage })
      })
      if (res.ok) {
        const data = await res.json()
        setMessages([...messages, data.message])
        setNewMessage('')
      }
    } catch {
      console.error('Failed to send message')
    }
    setSendingMessage(false)
  }

  const formatDate = (date: string) => new Date(date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })
  const formatDateTime = (date: string) => new Date(date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const formatCurrency = (n: number) => new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(n)

  const getQuoteStatusText = (s: string) => {
    switch (s) {
      case 'sent': case 'opened': return 'Vantar svar'
      case 'accepted': return 'Godkand'
      case 'declined': return 'Nekad'
      case 'expired': return 'Utgangen'
      default: return s
    }
  }
  const getQuoteStatusColor = (s: string) => {
    switch (s) {
      case 'sent': case 'opened': return 'bg-amber-100 text-amber-700 border-amber-200'
      case 'accepted': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
      case 'declined': return 'bg-red-100 text-red-700 border-red-200'
      case 'expired': return 'bg-gray-100 text-gray-600 border-gray-200'
      default: return 'bg-gray-100 text-gray-600 border-gray-200'
    }
  }

  const getInvoiceStatusText = (s: string) => {
    switch (s) {
      case 'sent': return 'Obetald'
      case 'overdue': return 'Forsenad'
      case 'paid': return 'Betald'
      default: return s
    }
  }
  const getInvoiceStatusColor = (s: string) => {
    switch (s) {
      case 'sent': return 'bg-amber-100 text-amber-700 border-amber-200'
      case 'overdue': return 'bg-red-100 text-red-700 border-red-200'
      case 'paid': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
      default: return 'bg-gray-100 text-gray-600 border-gray-200'
    }
  }

  const getProjectStatusText = (s: string) => {
    switch (s) {
      case 'active': case 'in_progress': return 'Pagaende'
      case 'completed': return 'Avslutat'
      case 'on_hold': return 'Pausat'
      default: return s
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
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
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <p className="text-sm text-blue-700 font-medium">{portal.business.name}</p>
          <h1 className="text-lg font-semibold text-gray-900">
            {selectedProject ? (
              <button onClick={() => setSelectedProject(null)} className="flex items-center gap-2 hover:text-blue-700">
                <ArrowLeft className="w-4 h-4" />
                {selectedProjectData?.name}
              </button>
            ) : (
              `Valkommen, ${portal.customer.name}`
            )}
          </h1>
        </div>
      </header>

      {/* Tabs */}
      {!selectedProject && (
        <div className="bg-white border-b border-gray-200 sticky top-[73px] z-10">
          <div className="max-w-2xl mx-auto px-4 flex">
            {([
              { id: 'projects' as Tab, label: 'Projekt', icon: FolderKanban },
              { id: 'quotes' as Tab, label: 'Offerter', icon: FileText },
              { id: 'invoices' as Tab, label: 'Fakturor', icon: Receipt },
              { id: 'messages' as Tab, label: 'Meddelanden', icon: MessageSquare, badge: portal.unreadMessages }
            ]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.badge ? (
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-blue-500 text-gray-900 rounded-full">{tab.badge}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        {loadingTab ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
          </div>
        ) : (
          <>
            {/* Projects Tab */}
            {activeTab === 'projects' && !selectedProject && (
              <div className="space-y-4">
                {projects.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <FolderKanban className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p>Inga projekt just nu.</p>
                  </div>
                ) : projects.map(p => (
                  <button
                    key={p.project_id}
                    onClick={() => setSelectedProject(p.project_id)}
                    className="w-full bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-blue-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">{p.name}</h3>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        p.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                        p.status === 'active' || p.status === 'in_progress' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {getProjectStatusText(p.status)}
                      </span>
                    </div>

                    {typeof p.progress === 'number' && (
                      <div className="mb-3">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>Framsteg</span>
                          <span>{p.progress}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${p.progress}%` }} />
                        </div>
                      </div>
                    )}

                    {p.nextVisit && (
                      <div className="flex items-center gap-2 text-sm text-blue-700 mb-2">
                        <Calendar className="w-4 h-4" />
                        Nasta besok: {formatDateTime(p.nextVisit.start_time)}
                      </div>
                    )}

                    {p.latestLog && (
                      <p className="text-sm text-gray-500 line-clamp-2">
                        {p.latestLog.description}
                      </p>
                    )}

                    <div className="flex items-center justify-end mt-2 text-sm text-blue-600">
                      Se detaljer <ChevronRight className="w-4 h-4" />
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Project Detail */}
            {activeTab === 'projects' && selectedProject && selectedProjectData && (
              <div className="space-y-6">
                {/* Status + Progress */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-gray-500">Status</span>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      selectedProjectData.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {getProjectStatusText(selectedProjectData.status)}
                    </span>
                  </div>
                  {typeof selectedProjectData.progress === 'number' && (
                    <div>
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Framsteg</span>
                        <span>{selectedProjectData.progress}%</span>
                      </div>
                      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${selectedProjectData.progress}%` }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Next visit */}
                {selectedProjectData.nextVisit && (
                  <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
                    <div className="flex items-center gap-2 text-blue-700 font-medium mb-1">
                      <Calendar className="w-4 h-4" />
                      Kommande besok
                    </div>
                    <p className="text-sm text-blue-700">{formatDateTime(selectedProjectData.nextVisit.start_time)}</p>
                    {selectedProjectData.nextVisit.title && (
                      <p className="text-sm text-blue-600 mt-1">{selectedProjectData.nextVisit.title}</p>
                    )}
                  </div>
                )}

                {/* Milestones */}
                {selectedProjectData.milestones.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h3 className="font-medium text-gray-900 mb-3">Framsteg</h3>
                    <div className="space-y-2">
                      {selectedProjectData.milestones.map((m, i) => (
                        <div key={i} className="flex items-center gap-3">
                          {m.status === 'completed' ? (
                            <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                          ) : m.status === 'in_progress' ? (
                            <div className="w-5 h-5 border-2 border-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                              <div className="w-2 h-2 bg-blue-500 rounded-full" />
                            </div>
                          ) : (
                            <div className="w-5 h-5 border-2 border-gray-300 rounded-full flex-shrink-0" />
                          )}
                          <span className={`text-sm ${m.status === 'completed' ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                            {m.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Description */}
                {selectedProjectData.description && (
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h3 className="font-medium text-gray-900 mb-2">Beskrivning</h3>
                    <p className="text-sm text-gray-600">{selectedProjectData.description}</p>
                  </div>
                )}
              </div>
            )}

            {/* Quotes Tab */}
            {activeTab === 'quotes' && (
              <div className="space-y-4">
                {quotes.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p>Inga offerter just nu.</p>
                  </div>
                ) : quotes.map(q => (
                  <div key={q.quote_id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">{q.title || 'Offert'}</h3>
                      <span className={`text-xs px-2 py-1 rounded-full border ${getQuoteStatusColor(q.status)}`}>
                        {getQuoteStatusText(q.status)}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 mb-3">
                      {q.sent_at ? `Skickad: ${formatDate(q.sent_at)}` : `Skapad: ${formatDate(q.created_at)}`}
                    </div>
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-lg font-semibold text-gray-900">{formatCurrency(q.customer_pays || q.total)}</p>
                        {q.rot_rut_type && q.rot_rut_deduction > 0 && (
                          <p className="text-xs text-emerald-600">efter {q.rot_rut_type.toUpperCase()}-avdrag</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        {q.sign_token && (
                          <a
                            href={`/quote/${q.sign_token}`}
                            className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                          >
                            Visa offert
                          </a>
                        )}
                        {['sent', 'opened'].includes(q.status) && q.sign_token && (
                          <a
                            href={`/quote/${q.sign_token}`}
                            className="px-3 py-2 text-sm bg-blue-500 text-gray-900 rounded-lg hover:bg-blue-600 font-medium"
                          >
                            Godkann
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Invoices Tab */}
            {activeTab === 'invoices' && (
              <div className="space-y-4">
                {invoices.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Receipt className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p>Inga fakturor just nu.</p>
                  </div>
                ) : invoices.map(inv => (
                  <div key={inv.invoice_id} className="bg-white rounded-xl border border-gray-200 p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">Faktura #{inv.invoice_number}</h3>
                      <span className={`text-xs px-2 py-1 rounded-full border ${getInvoiceStatusColor(inv.status)}`}>
                        {getInvoiceStatusText(inv.status)}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 mb-3">
                      {inv.status === 'paid' && inv.paid_at
                        ? `Betald: ${formatDate(inv.paid_at)}`
                        : `Forfaller: ${formatDate(inv.due_date)}`}
                    </div>
                    <p className="text-lg font-semibold text-gray-900 mb-3">{formatCurrency(inv.total)}</p>

                    {inv.status !== 'paid' && (paymentInfo.bankgiro || paymentInfo.swish) && (
                      <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                        {paymentInfo.bankgiro && (
                          <p className="text-gray-600">Bankgiro: <span className="font-medium text-gray-900">{paymentInfo.bankgiro}</span></p>
                        )}
                        {paymentInfo.swish && (
                          <p className="text-gray-600">Swish: <span className="font-medium text-gray-900">{paymentInfo.swish}</span></p>
                        )}
                        <p className="text-gray-600">OCR: <span className="font-medium text-gray-900">{inv.invoice_number}</span></p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Messages Tab */}
            {activeTab === 'messages' && (
              <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 200px)' }}>
                <div className="flex-1 space-y-3 mb-4">
                  {messages.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                      <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                      <p>Inga meddelanden annu.</p>
                      <p className="text-sm mt-1">Skriv ett meddelande till din hantverkare.</p>
                    </div>
                  )}

                  {messages.map(msg => (
                    <div
                      key={msg.id}
                      className={`max-w-[85%] ${msg.direction === 'inbound' ? 'ml-auto' : 'mr-auto'}`}
                    >
                      <div className={`rounded-2xl px-4 py-2.5 ${
                        msg.direction === 'inbound'
                          ? 'bg-blue-500 text-gray-900 rounded-br-md'
                          : 'bg-white border border-gray-200 text-gray-900 rounded-bl-md'
                      }`}>
                        <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                      </div>
                      <p className={`text-xs mt-1 ${msg.direction === 'inbound' ? 'text-right' : ''} text-gray-400`}>
                        {formatDateTime(msg.created_at)}
                      </p>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message input */}
                <div className="sticky bottom-0 bg-gray-50 pt-2 pb-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                      placeholder="Skriv meddelande..."
                      className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-300"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!newMessage.trim() || sendingMessage}
                      className="px-4 py-3 bg-blue-500 text-gray-900 rounded-xl hover:bg-blue-600 disabled:opacity-50 min-w-[48px] flex items-center justify-center"
                    >
                      {sendingMessage ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Footer */}
      {!selectedProject && activeTab !== 'messages' && (
        <footer className="border-t border-gray-200 bg-white mt-8">
          <div className="max-w-2xl mx-auto px-4 py-4 text-center text-sm text-gray-500">
            <p>{portal.business.name}</p>
            <div className="flex items-center justify-center gap-4 mt-1">
              {portal.business.phone && <a href={`tel:${portal.business.phone}`} className="text-blue-600 hover:underline">{portal.business.phone}</a>}
              {portal.business.email && <a href={`mailto:${portal.business.email}`} className="text-blue-600 hover:underline">{portal.business.email}</a>}
            </div>
          </div>
        </footer>
      )}
    </div>
  )
}
