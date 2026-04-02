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
  ExternalLink,
  PenTool,
  Eraser,
  FileText as FileSignature,
} from 'lucide-react'

interface PortalData {
  customer: { name: string; email: string; phone: string; customerId: string }
  business: { name: string; contactName: string; email: string; phone: string }
  unreadMessages: number
}

interface PortalAta {
  change_id: string
  ata_number: number
  change_type: string
  description: string
  items: Array<{ name: string; quantity: number; unit: string; unit_price: number }>
  total: number
  status: string
  sign_token: string | null
  signed_at: string | null
  signed_by_name: string | null
  created_at: string
}

interface TrackerStage {
  stage: string
  label: string
  completed_at: string | null
  completed_by: string | null
  note: string | null
}

interface ProjectPhoto {
  id: string
  url: string
  caption: string | null
  type: string
  uploaded_at: string
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
  atas: PortalAta[]
  tracker_stages?: TrackerStage[]
  photos?: ProjectPhoto[]
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
  invoice_type?: string
  status: string
  items?: any[]
  subtotal?: number
  vat_rate?: number
  vat_amount?: number
  total: number
  rot_rut_type: string | null
  rot_rut_deduction?: number | null
  customer_pays?: number | null
  invoice_date?: string
  due_date: string
  paid_at: string | null
  created_at: string
  ocr_number?: string
  our_reference?: string | null
  your_reference?: string | null
  is_credit_note?: boolean
  reminder_count?: number
  introduction_text?: string | null
  conclusion_text?: string | null
}

interface PaymentInfo {
  bankgiro: string | null
  plusgiro: string | null
  swish: string | null
  bank_account: string | null
  penalty_interest: number
  reminder_fee: number
}

interface BusinessInfo {
  name: string
  org_number: string
  f_skatt: boolean
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
  const token = params?.token as string
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Läs ?tab= från URL för att öppna rätt flik automatiskt
  const initialTab = (typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('tab') as Tab
    : null) || 'projects'

  const [portal, setPortal] = useState<PortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)

  // Data
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [selectedInvoice, setSelectedInvoice] = useState<string | null>(null)
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo>({ bankgiro: null, plusgiro: null, swish: null, bank_account: null, penalty_interest: 8, reminder_fee: 60 })
  const [businessInfo, setBusinessInfo] = useState<BusinessInfo>({ name: '', org_number: '', f_skatt: false })
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [loadingTab, setLoadingTab] = useState(false)

  // ÄTA signing state
  const [signingAtaId, setSigningAtaId] = useState<string | null>(null)
  const [signerName, setSignerName] = useState('')
  const [signingSaving, setSigningSaving] = useState(false)
  const ataCanvasRef = useRef<HTMLCanvasElement>(null)
  const [ataDrawing, setAtaDrawing] = useState(false)

  // Quote signing state
  const [signingQuoteId, setSigningQuoteId] = useState<string | null>(null)
  const [quoteSignerName, setQuoteSignerName] = useState('')
  const [quoteSigningSaving, setQuoteSigningSaving] = useState(false)
  const [quoteSignatureDrawn, setQuoteSignatureDrawn] = useState(false)
  const [quoteTermsAccepted, setQuoteTermsAccepted] = useState(false)
  const [quoteSignSuccess, setQuoteSignSuccess] = useState<string | null>(null)
  const quoteCanvasRef = useRef<HTMLCanvasElement>(null)
  const quoteDrawingRef = useRef(false)
  const quoteLastPointRef = useRef<{ x: number; y: number } | null>(null)

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

  // ÄTA canvas drawing helpers
  function initAtaCanvas(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * 2
    canvas.height = rect.height * 2
    ctx.scale(2, 2)
    ctx.strokeStyle = '#1E293B'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }

  function clearAtaCanvas() {
    const canvas = ataCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  function handleAtaCanvasPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    setAtaDrawing(true)
    const canvas = ataCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.beginPath()
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top)
  }

  function handleAtaCanvasPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!ataDrawing) return
    const canvas = ataCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top)
    ctx.stroke()
  }

  function handleAtaCanvasPointerUp() {
    setAtaDrawing(false)
  }

  async function signAta(signToken: string) {
    if (!signerName.trim()) return
    const canvas = ataCanvasRef.current
    if (!canvas) return
    const signatureData = canvas.toDataURL('image/png')

    setSigningSaving(true)
    try {
      const res = await fetch(`/api/ata/sign/${signToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sign',
          name: signerName.trim(),
          signature_data: signatureData,
        })
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Kunde inte signera')
      } else {
        setSigningAtaId(null)
        setSignerName('')
        // Refresh project data
        fetchTabData('projects')
      }
    } catch {
      alert('Kunde inte signera ÄTA')
    }
    setSigningSaving(false)
  }

  // Quote signing functions
  function initQuoteCanvas() {
    setTimeout(() => {
      const canvas = quoteCanvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * 2
      canvas.height = rect.height * 2
      ctx.scale(2, 2)
      ctx.strokeStyle = '#1a1a1a'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
    }, 100)
  }

  function quoteCanvasPointerDown(e: React.PointerEvent) {
    const canvas = quoteCanvasRef.current
    if (!canvas) return
    quoteDrawingRef.current = true
    const rect = canvas.getBoundingClientRect()
    quoteLastPointRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    canvas.setPointerCapture(e.pointerId)
  }

  function quoteCanvasPointerMove(e: React.PointerEvent) {
    if (!quoteDrawingRef.current) return
    const canvas = quoteCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx || !quoteLastPointRef.current) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    ctx.beginPath()
    ctx.moveTo(quoteLastPointRef.current.x, quoteLastPointRef.current.y)
    ctx.lineTo(x, y)
    ctx.stroke()
    quoteLastPointRef.current = { x, y }
    setQuoteSignatureDrawn(true)
  }

  function quoteCanvasPointerUp() {
    quoteDrawingRef.current = false
    quoteLastPointRef.current = null
  }

  function clearQuoteCanvas() {
    const canvas = quoteCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setQuoteSignatureDrawn(false)
  }

  async function signQuote(signToken: string) {
    if (!quoteSignerName.trim() || !quoteSignatureDrawn || !quoteTermsAccepted) return
    setQuoteSigningSaving(true)
    try {
      const canvas = quoteCanvasRef.current
      if (!canvas) return
      const signatureData = canvas.toDataURL('image/png')
      const res = await fetch(`/api/quotes/public/${signToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sign',
          name: quoteSignerName.trim(),
          signature_data: signatureData,
        })
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Kunde inte signera offerten')
      } else {
        setQuoteSignSuccess(signingQuoteId)
        setSigningQuoteId(null)
        setQuoteSignerName('')
        setQuoteSignatureDrawn(false)
        setQuoteTermsAccepted(false)
        fetchTabData('quotes')
      }
    } catch {
      alert('Kunde inte signera offerten')
    }
    setQuoteSigningSaving(false)
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
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <p className="text-sm text-primary-700 font-medium">{portal.business.name}</p>
          <h1 className="text-lg font-semibold text-gray-900">
            {selectedProject ? (
              <button onClick={() => setSelectedProject(null)} className="flex items-center gap-2 hover:text-primary-700">
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
                onClick={() => { setActiveTab(tab.id); setSelectedInvoice(null) }}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-all ${
                  activeTab === tab.id
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.badge ? (
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary-700 text-gray-900 rounded-full">{tab.badge}</span>
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
            <Loader2 className="w-6 h-6 text-sky-700 animate-spin" />
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
                    className="w-full bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-primary-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold text-gray-900">{p.name}</h3>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        p.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                        p.status === 'active' || p.status === 'in_progress' ? 'bg-primary-100 text-primary-700' :
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
                          <div className="h-full bg-primary-700 rounded-full transition-all" style={{ width: `${p.progress}%` }} />
                        </div>
                      </div>
                    )}

                    {p.nextVisit && (
                      <div className="flex items-center gap-2 text-sm text-primary-700 mb-2">
                        <Calendar className="w-4 h-4" />
                        Nasta besok: {formatDateTime(p.nextVisit.start_time)}
                      </div>
                    )}

                    {p.latestLog && (
                      <p className="text-sm text-gray-500 line-clamp-2">
                        {p.latestLog.description}
                      </p>
                    )}

                    <div className="flex items-center justify-end mt-2 text-sm text-sky-700">
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
                      'bg-primary-100 text-primary-700'
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
                        <div className="h-full bg-primary-700 rounded-full transition-all" style={{ width: `${selectedProjectData.progress}%` }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Project Tracker */}
                {selectedProjectData.tracker_stages && selectedProjectData.tracker_stages.length > 0 && (
                  <ProjectTracker
                    stages={selectedProjectData.tracker_stages}
                    photos={selectedProjectData.photos || []}
                  />
                )}

                {/* Next visit */}
                {selectedProjectData.nextVisit && (
                  <div className="bg-primary-50 rounded-xl border border-primary-200 p-4">
                    <div className="flex items-center gap-2 text-primary-700 font-medium mb-1">
                      <Calendar className="w-4 h-4" />
                      Kommande besok
                    </div>
                    <p className="text-sm text-primary-700">{formatDateTime(selectedProjectData.nextVisit.start_time)}</p>
                    {selectedProjectData.nextVisit.title && (
                      <p className="text-sm text-sky-700 mt-1">{selectedProjectData.nextVisit.title}</p>
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
                            <div className="w-5 h-5 border-2 border-primary-600 rounded-full flex items-center justify-center flex-shrink-0">
                              <div className="w-2 h-2 bg-primary-700 rounded-full" />
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

                {/* ÄTA (Change Orders) */}
                {selectedProjectData.atas && selectedProjectData.atas.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-medium text-gray-900">Ändringar (ÄTA)</h3>
                    {selectedProjectData.atas.map(ata => (
                      <div key={ata.change_id} className="bg-white rounded-xl border border-gray-200 p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900">ÄTA-{ata.ata_number}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${
                              ata.change_type === 'addition' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                              ata.change_type === 'change' ? 'bg-amber-50 text-amber-600 border-amber-200' :
                              'bg-red-50 text-red-600 border-red-200'
                            }`}>
                              {ata.change_type === 'addition' ? 'Tillägg' : ata.change_type === 'change' ? 'Ändring' : 'Avgående'}
                            </span>
                          </div>
                          {ata.status === 'signed' && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 border border-primary-200">
                              Signerad
                            </span>
                          )}
                          {ata.status === 'approved' && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                              Godkänd
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-gray-600 mb-3">{ata.description}</p>

                        {/* Items */}
                        {ata.items && ata.items.length > 0 && (
                          <div className="border-t border-gray-100 pt-2 mb-3">
                            {ata.items.map((item, idx) => (
                              <div key={idx} className="flex justify-between text-sm py-1">
                                <span className="text-gray-700">{item.name} ({item.quantity} {item.unit})</span>
                                <span className="text-gray-900 font-medium">{formatCurrency(item.quantity * item.unit_price)}</span>
                              </div>
                            ))}
                            <div className="flex justify-between text-sm font-semibold pt-2 border-t border-gray-100 mt-1">
                              <span>Totalt</span>
                              <span>{formatCurrency(ata.total)}</span>
                            </div>
                          </div>
                        )}

                        {/* Signed info */}
                        {ata.signed_at && ata.signed_by_name && (
                          <div className="flex items-center gap-2 text-xs text-primary-700 mt-2">
                            <CheckCircle className="w-3.5 h-3.5" />
                            Signerad av {ata.signed_by_name}, {formatDate(ata.signed_at)}
                          </div>
                        )}

                        {/* Sign button for "sent" status */}
                        {ata.status === 'sent' && ata.sign_token && (
                          <div className="mt-3">
                            {signingAtaId === ata.change_id ? (
                              <div className="space-y-3 border-t border-gray-100 pt-3">
                                <div>
                                  <label className="text-xs text-gray-500 mb-1 block">Ditt namn</label>
                                  <input
                                    type="text"
                                    value={signerName}
                                    onChange={e => setSignerName(e.target.value)}
                                    placeholder="Förnamn Efternamn"
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-primary-600"
                                  />
                                </div>
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <label className="text-xs text-gray-500">Signatur</label>
                                    <button onClick={clearAtaCanvas} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                                      <Eraser className="w-3 h-3" /> Rensa
                                    </button>
                                  </div>
                                  <canvas
                                    ref={ataCanvasRef}
                                    className="w-full h-24 border border-gray-300 rounded-lg bg-white cursor-crosshair touch-none"
                                    onPointerDown={handleAtaCanvasPointerDown}
                                    onPointerMove={handleAtaCanvasPointerMove}
                                    onPointerUp={handleAtaCanvasPointerUp}
                                    onPointerLeave={handleAtaCanvasPointerUp}
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => { setSigningAtaId(null); setSignerName('') }}
                                    className="flex-1 px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                                  >
                                    Avbryt
                                  </button>
                                  <button
                                    onClick={() => signAta(ata.sign_token!)}
                                    disabled={!signerName.trim() || signingSaving}
                                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm text-white bg-primary-700 rounded-lg hover:bg-primary-800 disabled:opacity-50"
                                  >
                                    {signingSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PenTool className="w-3.5 h-3.5" />}
                                    Signera
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => {
                                  setSigningAtaId(ata.change_id)
                                  setTimeout(() => {
                                    if (ataCanvasRef.current) initAtaCanvas(ataCanvasRef.current)
                                  }, 100)
                                }}
                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-700 text-white rounded-lg text-sm font-medium hover:bg-primary-800 transition-colors"
                              >
                                <PenTool className="w-4 h-4" />
                                Granska och signera
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
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
                        {quoteSignSuccess === q.quote_id ? 'Signerad!' : getQuoteStatusText(q.status)}
                      </span>
                    </div>
                    <div className="text-sm text-gray-500 mb-3">
                      {q.sent_at ? `Skickad: ${formatDate(q.sent_at)}` : `Skapad: ${formatDate(q.created_at)}`}
                      {q.valid_until && (
                        <span className="ml-2">· Giltig till: {formatDate(q.valid_until)}</span>
                      )}
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
                            href={`/api/quotes/pdf?token=${q.sign_token}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-1"
                          >
                            <Download className="w-3.5 h-3.5" />
                            PDF
                          </a>
                        )}
                        {['sent', 'opened'].includes(q.status) && q.sign_token && (
                          <button
                            onClick={() => { setSigningQuoteId(q.quote_id); setQuoteSignerName(portal?.customer.name || ''); initQuoteCanvas() }}
                            className="px-3 py-2 text-sm bg-primary-700 text-white rounded-lg hover:bg-primary-800 font-medium flex items-center gap-1"
                          >
                            <PenTool className="w-3.5 h-3.5" />
                            Godkänn och signera
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Inline signing */}
                    {signingQuoteId === q.quote_id && q.sign_token && (
                      <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
                        <h4 className="font-semibold text-gray-900 text-sm">Signera offerten</h4>

                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Ditt namn</label>
                          <input
                            type="text"
                            value={quoteSignerName}
                            onChange={e => setQuoteSignerName(e.target.value)}
                            placeholder="Förnamn Efternamn"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-600/50"
                          />
                        </div>

                        <div>
                          <label className="text-xs text-gray-500 block mb-1">Din signatur</label>
                          <div className="relative border border-gray-200 rounded-lg overflow-hidden bg-white">
                            <canvas
                              ref={quoteCanvasRef}
                              className="w-full h-28 cursor-crosshair touch-none"
                              onPointerDown={quoteCanvasPointerDown}
                              onPointerMove={quoteCanvasPointerMove}
                              onPointerUp={quoteCanvasPointerUp}
                              onPointerLeave={quoteCanvasPointerUp}
                            />
                            {!quoteSignatureDrawn && (
                              <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-gray-300 text-sm">
                                Rita din signatur här
                              </div>
                            )}
                          </div>
                          {quoteSignatureDrawn && (
                            <button
                              onClick={clearQuoteCanvas}
                              className="mt-1 text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                            >
                              <Eraser className="w-3 h-3" />
                              Rensa
                            </button>
                          )}
                        </div>

                        <label className="flex items-start gap-2 text-sm text-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={quoteTermsAccepted}
                            onChange={e => setQuoteTermsAccepted(e.target.checked)}
                            className="mt-0.5 rounded border-gray-300"
                          />
                          Jag godkänner offerten och dess villkor
                        </label>

                        <div className="flex gap-2">
                          <button
                            onClick={() => signQuote(q.sign_token!)}
                            disabled={!quoteSignerName.trim() || !quoteSignatureDrawn || !quoteTermsAccepted || quoteSigningSaving}
                            className="flex-1 py-2.5 bg-primary-700 text-white rounded-lg text-sm font-semibold hover:bg-primary-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {quoteSigningSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                            {quoteSigningSaving ? 'Signerar...' : 'Godkänn offert'}
                          </button>
                          <button
                            onClick={() => { setSigningQuoteId(null); setQuoteTermsAccepted(false); setQuoteSignatureDrawn(false) }}
                            className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-500 hover:bg-gray-50"
                          >
                            Avbryt
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Invoices Tab */}
            {activeTab === 'invoices' && !selectedInvoice && (
              <div className="space-y-4">
                {invoices.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <Receipt className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p>Inga fakturor just nu.</p>
                  </div>
                ) : invoices.map(inv => {
                  const amountToPay = inv.customer_pays || inv.total
                  const daysUntilDue = Math.ceil((new Date(inv.due_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                  return (
                    <button
                      key={inv.invoice_id}
                      onClick={() => setSelectedInvoice(inv.invoice_id)}
                      className="w-full bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-primary-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-semibold text-gray-900">Faktura #{inv.invoice_number}</h3>
                          {inv.is_credit_note && (
                            <span className="text-xs text-red-600 font-medium">Kreditfaktura</span>
                          )}
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full border ${getInvoiceStatusColor(inv.status)}`}>
                          {getInvoiceStatusText(inv.status)}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 mb-2">
                        {inv.status === 'paid' && inv.paid_at
                          ? `Betald: ${formatDate(inv.paid_at)}`
                          : inv.status === 'overdue'
                            ? `${Math.abs(daysUntilDue)} dagar forsenad`
                            : `Forfaller: ${formatDate(inv.due_date)}`
                        }
                        {inv.reminder_count ? ` | ${inv.reminder_count} paminnelse${inv.reminder_count > 1 ? 'r' : ''}` : ''}
                      </div>
                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-lg font-semibold text-gray-900">{formatCurrency(amountToPay)}</p>
                          {inv.rot_rut_type && inv.rot_rut_deduction && (
                            <p className="text-xs text-emerald-600">efter {inv.rot_rut_type.toUpperCase()}-avdrag ({formatCurrency(inv.rot_rut_deduction)})</p>
                          )}
                        </div>
                        <span className="text-sm text-sky-700 flex items-center gap-1">
                          Detaljer <ChevronRight className="w-4 h-4" />
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {/* Invoice Detail View */}
            {activeTab === 'invoices' && selectedInvoice && (() => {
              const inv = invoices.find(i => i.invoice_id === selectedInvoice)
              if (!inv) return null
              const amountToPay = inv.customer_pays || inv.total
              const ocrNumber = inv.ocr_number || inv.invoice_number
              const dueDate = new Date(inv.due_date)
              const now = new Date()
              const daysOverdue = inv.status === 'overdue' ? Math.max(0, Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))) : 0
              const penaltyAmount = daysOverdue > 0 ? Math.round(amountToPay * (paymentInfo.penalty_interest / 100) * (daysOverdue / 365) * 100) / 100 : 0
              const reminderFeeAmount = inv.reminder_count && inv.reminder_count > 0 ? paymentInfo.reminder_fee : 0
              const totalWithFees = amountToPay + penaltyAmount + reminderFeeAmount
              const swishPayAmount = Math.round(inv.status === 'overdue' ? totalWithFees : amountToPay)
              const swishUrl = paymentInfo.swish ? (() => {
                const data = { version: 1, payee: { value: paymentInfo.swish!.replace(/\D/g, '') }, amount: { value: swishPayAmount }, message: { value: inv.invoice_number } }
                return `swish://payment?data=${encodeURIComponent(JSON.stringify(data))}`
              })() : null
              const swishQrUrl = paymentInfo.swish ? `/api/swish-qr?number=${encodeURIComponent(paymentInfo.swish)}&amount=${swishPayAmount}&message=${encodeURIComponent(inv.invoice_number)}` : null

              return (
                <div className="space-y-4">
                  {/* Back button */}
                  <button
                    onClick={() => setSelectedInvoice(null)}
                    className="flex items-center gap-2 text-sm text-sky-700 hover:text-primary-700 mb-2"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Tillbaka till fakturor
                  </button>

                  {/* Status header */}
                  <div className={`rounded-xl p-4 ${
                    inv.status === 'paid' ? 'bg-emerald-50 border border-emerald-200' :
                    inv.status === 'overdue' ? 'bg-red-50 border border-red-200' :
                    'bg-primary-50 border border-primary-200'
                  }`}>
                    <div className="flex items-center gap-3">
                      {inv.status === 'paid' ? (
                        <CheckCircle className="w-6 h-6 text-emerald-600" />
                      ) : inv.status === 'overdue' ? (
                        <AlertCircle className="w-6 h-6 text-red-600" />
                      ) : (
                        <Clock className="w-6 h-6 text-sky-700" />
                      )}
                      <div>
                        <h3 className={`font-semibold ${
                          inv.status === 'paid' ? 'text-emerald-700' :
                          inv.status === 'overdue' ? 'text-red-700' :
                          'text-primary-700'
                        }`}>
                          {inv.status === 'paid' ? 'Betald' :
                           inv.status === 'overdue' ? `Forsenad - ${daysOverdue} dagar` :
                           'Vantar pa betalning'}
                        </h3>
                        <p className={`text-sm ${
                          inv.status === 'paid' ? 'text-emerald-600' :
                          inv.status === 'overdue' ? 'text-red-600' :
                          'text-sky-700'
                        }`}>
                          {inv.status === 'paid' && inv.paid_at
                            ? `Betalades ${formatDate(inv.paid_at)}`
                            : `Forfallodag: ${formatDate(inv.due_date)}`
                          }
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Invoice details card */}
                  <div className="bg-white rounded-xl border border-gray-200 p-4">
                    <h3 className="font-semibold text-gray-900 mb-3">Faktura #{inv.invoice_number}</h3>

                    {inv.introduction_text && (
                      <p className="text-sm text-gray-600 mb-3">{inv.introduction_text}</p>
                    )}

                    {/* Meta info */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-400 mb-0.5">Fakturadatum</p>
                        <p className="text-sm font-medium text-gray-900">{formatDate(inv.invoice_date || inv.created_at)}</p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-400 mb-0.5">Forfallodag</p>
                        <p className={`text-sm font-medium ${inv.status === 'overdue' ? 'text-red-600' : 'text-gray-900'}`}>
                          {formatDate(inv.due_date)}
                        </p>
                      </div>
                      <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-400 mb-0.5">OCR-nummer</p>
                        <p className="text-sm font-mono font-semibold text-gray-900">{ocrNumber}</p>
                      </div>
                      {inv.our_reference && (
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-400 mb-0.5">Er referens</p>
                          <p className="text-sm font-medium text-gray-900">{inv.our_reference}</p>
                        </div>
                      )}
                    </div>

                    {/* Items */}
                    {inv.items && inv.items.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-xs text-gray-400 uppercase tracking-wider mb-2">Rader</h4>
                        <div className="space-y-1.5">
                          {inv.items.filter((item: any) => item.item_type !== 'heading' && item.item_type !== 'text').map((item: any, i: number) => (
                            <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-900 truncate">{item.description}</p>
                                <p className="text-xs text-gray-400">{item.quantity} {item.unit} x {formatCurrency(item.unit_price)}</p>
                              </div>
                              <p className="text-sm font-medium text-gray-900 ml-4">{formatCurrency(item.total)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Totals */}
                    <div className="border-t border-gray-200 pt-3 space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Delsumma</span>
                        <span className="text-gray-900">{formatCurrency(inv.subtotal || 0)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Moms ({inv.vat_rate || 25}%)</span>
                        <span className="text-gray-900">{formatCurrency(inv.vat_amount || 0)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-semibold border-t border-gray-100 pt-1.5">
                        <span className="text-gray-900">Totalt</span>
                        <span className="text-gray-900">{formatCurrency(inv.total)}</span>
                      </div>
                      {inv.rot_rut_type && inv.rot_rut_deduction && (
                        <>
                          <div className="flex justify-between text-sm text-emerald-600">
                            <span>{inv.rot_rut_type.toUpperCase()}-avdrag</span>
                            <span>-{formatCurrency(inv.rot_rut_deduction)}</span>
                          </div>
                          <div className="flex justify-between text-base font-bold bg-emerald-50 rounded-lg px-3 py-2 -mx-1">
                            <span className="text-gray-900">Att betala</span>
                            <span className="text-gray-900">{formatCurrency(amountToPay)}</span>
                          </div>
                        </>
                      )}
                    </div>

                    {inv.conclusion_text && (
                      <p className="text-sm text-gray-500 mt-3 pt-3 border-t border-gray-100">{inv.conclusion_text}</p>
                    )}
                  </div>

                  {/* Overdue fees */}
                  {inv.status === 'overdue' && (penaltyAmount > 0 || reminderFeeAmount > 0) && (
                    <div className="bg-red-50 rounded-xl border border-red-200 p-4">
                      <h4 className="font-medium text-red-700 mb-2">Forsent betalad</h4>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between">
                          <span className="text-red-600">Fakturabelopp</span>
                          <span className="text-red-700">{formatCurrency(amountToPay)}</span>
                        </div>
                        {reminderFeeAmount > 0 && (
                          <div className="flex justify-between">
                            <span className="text-red-600">Paminnelseavgift</span>
                            <span className="text-red-700">{formatCurrency(reminderFeeAmount)}</span>
                          </div>
                        )}
                        {penaltyAmount > 0 && (
                          <div className="flex justify-between">
                            <span className="text-red-600">Drojsmalsranta ({paymentInfo.penalty_interest}%, {daysOverdue} dgr)</span>
                            <span className="text-red-700">{formatCurrency(penaltyAmount)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold border-t border-red-200 pt-1.5">
                          <span className="text-red-700">Att betala nu</span>
                          <span className="text-red-700">{formatCurrency(totalWithFees)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Payment info */}
                  {inv.status !== 'paid' && (
                    <div className="bg-gray-900 rounded-xl p-4 text-white">
                      <h4 className="text-xs text-gray-400 uppercase tracking-wider mb-3">Betalningsinformation</h4>
                      <div className="grid grid-cols-2 gap-3">
                        {paymentInfo.bankgiro && (
                          <div>
                            <p className="text-xs text-gray-400">Bankgiro</p>
                            <p className="text-base font-semibold text-primary-600">{paymentInfo.bankgiro}</p>
                          </div>
                        )}
                        {paymentInfo.plusgiro && (
                          <div>
                            <p className="text-xs text-gray-400">Plusgiro</p>
                            <p className="text-base font-semibold text-primary-600">{paymentInfo.plusgiro}</p>
                          </div>
                        )}
                        {paymentInfo.swish && (
                          <div>
                            <p className="text-xs text-gray-400">Swish</p>
                            <p className="text-base font-semibold text-primary-600">{paymentInfo.swish}</p>
                          </div>
                        )}
                        {paymentInfo.bank_account && (
                          <div>
                            <p className="text-xs text-gray-400">Bankkonto</p>
                            <p className="text-base font-semibold text-primary-600">{paymentInfo.bank_account}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs text-gray-400">OCR-nummer</p>
                          <p className="text-base font-mono font-semibold text-primary-600">{ocrNumber}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Att betala</p>
                          <p className="text-base font-semibold text-primary-600">
                            {formatCurrency(inv.status === 'overdue' ? totalWithFees : amountToPay)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Swish section with QR + deeplink */}
                  {inv.status !== 'paid' && paymentInfo.swish && (
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-5">
                      <p className="text-sm font-medium text-gray-700 mb-3">Betala med Swish</p>
                      <div className="flex items-center gap-4 mb-4">
                        {swishQrUrl && (
                          <SwishQRImage src={swishQrUrl} />
                        )}
                        <div>
                          <p className="text-lg font-semibold text-gray-900">{paymentInfo.swish}</p>
                          <p className="text-sm text-gray-500 mt-1">Märk: {inv.invoice_number}</p>
                          <p className="text-xl font-bold text-gray-900 mt-2">
                            {formatCurrency(inv.status === 'overdue' ? totalWithFees : amountToPay)}
                          </p>
                        </div>
                      </div>
                      <a
                        href={swishUrl || '#'}
                        className="flex items-center justify-center gap-2 w-full py-3 bg-[#6A3E9E] hover:bg-[#5A2E8E] text-white rounded-xl font-semibold text-sm transition-colors"
                      >
                        Öppna Swish
                      </a>
                    </div>
                  )}

                  {/* Paid confirmation */}
                  {inv.status === 'paid' && (
                    <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4 text-center">
                      <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                      <p className="font-semibold text-emerald-700">Fakturan ar betald</p>
                      {inv.paid_at && (
                        <p className="text-sm text-emerald-600">Betalning mottagen {formatDate(inv.paid_at)}</p>
                      )}
                    </div>
                  )}

                  {/* Business footer */}
                  {businessInfo.name && (
                    <div className="text-center text-xs text-gray-400 pt-2">
                      <p>{businessInfo.name}{businessInfo.org_number ? ` | Org.nr: ${businessInfo.org_number}` : ''}</p>
                      {businessInfo.f_skatt && <p>Godkand for F-skatt</p>}
                    </div>
                  )}
                </div>
              )
            })()}

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
                          ? 'bg-primary-700 text-gray-900 rounded-br-md'
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
                      className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/50 focus:border-primary-300"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!newMessage.trim() || sendingMessage}
                      className="px-4 py-3 bg-primary-700 text-gray-900 rounded-xl hover:bg-primary-800 disabled:opacity-50 min-w-[48px] flex items-center justify-center"
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
              {portal.business.phone && <a href={`tel:${portal.business.phone}`} className="text-sky-700 hover:underline">{portal.business.phone}</a>}
              {portal.business.email && <a href={`mailto:${portal.business.email}`} className="text-sky-700 hover:underline">{portal.business.email}</a>}
            </div>
          </div>
        </footer>
      )}
    </div>
  )
}

// ─── Swish QR Image Sub-component ────────────────────────────

function SwishQRImage({ src }: { src: string }) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    fetch(src)
      .then(r => r.json())
      .then(data => { if (data.qr) setQrDataUrl(data.qr) })
      .catch(() => {})
  }, [src])

  if (!qrDataUrl) return <div className="w-20 h-20 bg-purple-100 rounded-xl animate-pulse" />

  return (
    <div className="bg-white p-2 rounded-xl border border-purple-200 shrink-0">
      <img src={qrDataUrl} alt="Swish QR" width={80} height={80} />
    </div>
  )
}

// ─── Project Tracker Sub-component ───────────────────────────

const TRACKER_STAGES = [
  { key: 'quote_accepted', label: 'Offert godkänd', icon: '✅' },
  { key: 'material', label: 'Material förbereds', icon: '📦' },
  { key: 'work_started', label: 'Arbete pågår', icon: '🔨' },
  { key: 'inspection', label: 'Slutbesiktning', icon: '🔍' },
  { key: 'done', label: 'Klart!', icon: '🎉' },
]

function ProjectTracker({
  stages,
  photos,
}: {
  stages: TrackerStage[]
  photos: ProjectPhoto[]
}) {
  const completedKeys = stages.filter(s => s.completed_at).map(s => s.stage)
  const currentIndex = TRACKER_STAGES.findIndex(s => !completedKeys.includes(s.key))
  const progressPct = currentIndex < 0
    ? 100
    : Math.round((currentIndex / (TRACKER_STAGES.length - 1)) * 100)

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="font-medium text-gray-900 mb-1">Projektstatus</h3>
      <p className="text-xs text-gray-400 mb-5">Uppdateras i realtid</p>

      {/* Step indicator */}
      <div className="relative pl-5">
        {/* Background line */}
        <div className="absolute left-[19px] top-5 bottom-5 w-0.5 bg-gray-200" />
        {/* Progress line */}
        <div
          className="absolute left-[19px] top-5 w-0.5 bg-primary-500 transition-all duration-1000"
          style={{ height: `${progressPct}%` }}
        />

        <div className="space-y-5">
          {TRACKER_STAGES.map((step, i) => {
            const isCompleted = completedKeys.includes(step.key)
            const isCurrent = i === currentIndex
            const stageData = stages.find(s => s.stage === step.key)

            return (
              <div key={step.key} className="flex items-start gap-3">
                {/* Circle */}
                <div
                  className={`relative z-10 w-9 h-9 rounded-full flex items-center justify-center text-sm flex-shrink-0 border-2 transition-all ${
                    isCompleted
                      ? 'bg-primary-500 border-primary-600 text-white'
                      : isCurrent
                        ? 'bg-white border-primary-600'
                        : 'bg-white border-gray-200'
                  } ${isCurrent ? 'animate-pulse' : ''}`}
                >
                  {isCompleted ? '✓' : step.icon}
                </div>

                {/* Info */}
                <div className="flex-1 pt-1">
                  <p
                    className={`text-sm font-medium ${
                      isCompleted
                        ? 'text-gray-900'
                        : isCurrent
                          ? 'text-primary-700'
                          : 'text-gray-400'
                    }`}
                  >
                    {step.label}
                  </p>
                  {stageData?.completed_at && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(stageData.completed_at).toLocaleDateString('sv-SE', {
                        day: 'numeric',
                        month: 'short',
                      })}
                      {stageData.note && ` · ${stageData.note}`}
                    </p>
                  )}
                  {isCurrent && !isCompleted && (
                    <p className="text-xs text-primary-700 mt-0.5">Pågår nu...</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Photos */}
      {photos.length > 0 && (
        <div className="mt-5 pt-5 border-t border-gray-100">
          <p className="text-sm font-medium text-gray-700 mb-3">
            Foton från jobbet
          </p>
          <div className="grid grid-cols-3 gap-2">
            {photos.map(photo => (
              <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden">
                <img
                  src={photo.url}
                  alt={photo.caption || 'Projektfoto'}
                  className="w-full h-full object-cover"
                />
                {photo.type === 'after' && (
                  <span className="absolute top-1 right-1 text-[10px] bg-primary-500 text-white px-1.5 py-0.5 rounded-full">
                    Klart
                  </span>
                )}
                {photo.type === 'before' && (
                  <span className="absolute top-1 right-1 text-[10px] bg-gray-700 text-white px-1.5 py-0.5 rounded-full">
                    Före
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
