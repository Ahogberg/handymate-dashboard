'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Calendar,
  MessageSquare,
  FileText,
  Clock,
  CheckCircle,
  Star,
  Plus,
  Edit,
  Trash2,
  Play,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Loader2,
  Send,
  Globe,
  Copy,
  RefreshCw,
  ExternalLink,
  Upload,
  X,
  Save,
  Building2,
  User,
  Home,
  File,
  Image,
  Download,
  CheckSquare,
  CheckCircle2
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { useToast } from '@/components/Toast'
import Link from 'next/link'

interface Customer {
  customer_id: string
  name: string
  phone_number: string
  email: string
  address_line: string
  created_at: string
  customer_type?: 'private' | 'company' | 'brf'
  org_number?: string
  contact_person?: string
  personal_number?: string
  property_designation?: string
  invoice_address?: string
  visit_address?: string
  reference?: string
  apartment_count?: number
}

interface CustomerDocument {
  id: string
  file_name: string
  file_url: string
  file_type: string | null
  file_size: number | null
  category: string
  uploaded_at: string
}

interface Activity {
  activity_id: string
  activity_type: string
  title: string
  description: string
  recording_url?: string
  transcript?: string
  duration_seconds?: number
  metadata: any
  created_at: string
  created_by: string
}

interface Booking {
  booking_id: string
  scheduled_start: string
  scheduled_end: string
  status: string
  job_status: string
  notes: string
  job_notes: string
  customer_rating?: number
  completed_at?: string
}

interface Task {
  id: string
  title: string
  description: string | null
  status: 'pending' | 'in_progress' | 'done'
  priority: 'low' | 'medium' | 'high'
  due_date: string | null
  due_time: string | null
  customer_id: string | null
  deal_id: string | null
  project_id: string | null
  completed_at: string | null
  created_at: string
}

export default function CustomerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const business = useBusiness()
  const customerId = params.id as string

  const tabParam = searchParams.get('tab')
  const initialTab = tabParam === 'documents' ? 'documents' : tabParam === 'bookings' ? 'bookings' : tabParam === 'tasks' ? 'tasks' : 'timeline'

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [documents, setDocuments] = useState<CustomerDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'timeline' | 'bookings' | 'documents' | 'tasks'>(initialTab)

  // Edit mode
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState<Record<string, any>>({})
  const [editSaving, setEditSaving] = useState(false)

  // Documents
  const [uploading, setUploading] = useState(false)
  const [uploadCategory, setUploadCategory] = useState('other')

  // Modals
  const [showLogCallModal, setShowLogCallModal] = useState(false)
  const [showAddNoteModal, setShowAddNoteModal] = useState(false)
  const [showSendSMSModal, setShowSendSMSModal] = useState(false)

  // Tasks
  const [tasks, setTasks] = useState<Task[]>([])
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDueDate, setNewTaskDueDate] = useState('')
  const [taskSaving, setTaskSaving] = useState(false)

  // Portal
  const [portalToken, setPortalToken] = useState<string | null>(null)
  const [portalEnabled, setPortalEnabled] = useState(false)
  const [portalLastVisited, setPortalLastVisited] = useState<string | null>(null)
  const [generatingPortal, setGeneratingPortal] = useState(false)
  const [portalCopied, setPortalCopied] = useState(false)

  useEffect(() => {
    fetchData()
  }, [customerId])

  async function fetchData() {
    // Hämta kund
    const { data: customerData } = await supabase
      .from('customer')
      .select('*')
      .eq('customer_id', customerId)
      .single()

    // Hämta aktiviteter
    const { data: activityData } = await supabase
      .from('customer_activity')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(50)

    // Hämta bokningar
    const { data: bookingData } = await supabase
      .from('booking')
      .select('*')
      .eq('customer_id', customerId)
      .order('scheduled_start', { ascending: false })

    setCustomer(customerData)
    setActivities(activityData || [])
    setBookings(bookingData || [])

    // Load portal fields
    if (customerData) {
      setPortalToken(customerData.portal_token || null)
      setPortalEnabled(customerData.portal_enabled ?? false)
      setPortalLastVisited(customerData.portal_last_visited_at || null)
    }

    // Fetch documents
    try {
      const docRes = await fetch(`/api/customers/${customerId}/documents`, {
        headers: { 'Content-Type': 'application/json' }
      })
      if (docRes.ok) {
        const docData = await docRes.json()
        setDocuments(docData.documents || [])
      }
    } catch {
      // Documents table may not exist yet
    }

    // Fetch tasks
    try {
      const taskRes = await fetch(`/api/tasks?customer_id=${customerId}`)
      if (taskRes.ok) {
        const taskData = await taskRes.json()
        setTasks(taskData.tasks || [])
      }
    } catch {
      // Tasks table may not exist yet
    }

    setLoading(false)
  }

  async function fetchTasks() {
    try {
      const res = await fetch(`/api/tasks?customer_id=${customerId}`)
      if (res.ok) {
        const data = await res.json()
        setTasks(data.tasks || [])
      }
    } catch { /* silent */ }
  }

  async function handleAddTask() {
    if (!newTaskTitle.trim()) return
    setTaskSaving(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTaskTitle.trim(),
          customer_id: customerId,
          due_date: newTaskDueDate || null,
        })
      })
      if (!res.ok) throw new Error()
      setNewTaskTitle('')
      setNewTaskDueDate('')
      fetchTasks()
    } catch {
      // error handling
    } finally {
      setTaskSaving(false)
    }
  }

  async function handleToggleTask(taskId: string, currentStatus: string) {
    const newStatus = currentStatus === 'done' ? 'pending' : 'done'
    try {
      await fetch('/api/tasks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, status: newStatus })
      })
      fetchTasks()
    } catch { /* silent */ }
  }

  async function handleDeleteTask(taskId: string) {
    try {
      await fetch(`/api/tasks?id=${taskId}`, { method: 'DELETE' })
      fetchTasks()
    } catch { /* silent */ }
  }

  // Edit functions
  function startEditing() {
    if (!customer) return
    setEditForm({
      name: customer.name || '',
      phone_number: customer.phone_number || '',
      email: customer.email || '',
      address_line: customer.address_line || '',
      customer_type: customer.customer_type || 'private',
      org_number: customer.org_number || '',
      contact_person: customer.contact_person || '',
      personal_number: customer.personal_number || '',
      property_designation: customer.property_designation || '',
      invoice_address: customer.invoice_address || '',
      visit_address: customer.visit_address || '',
      reference: customer.reference || '',
      apartment_count: customer.apartment_count ? String(customer.apartment_count) : '',
    })
    setIsEditing(true)
  }

  async function saveEdit() {
    if (!editForm.name || !editForm.phone_number) return
    setEditSaving(true)
    try {
      const res = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_customer',
          data: { customerId, ...editForm }
        })
      })
      if (res.ok) {
        setIsEditing(false)
        fetchData()
      }
    } catch {
      // Error
    }
    setEditSaving(false)
  }

  // Document functions
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) {
        continue // Skip files > 10MB
      }

      const fileExt = file.name.split('.').pop()
      const filePath = `${business.business_id}/${customerId}/${Date.now()}_${file.name}`

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('customer-documents')
        .upload(filePath, file)

      if (uploadError) {
        console.error('Upload error:', uploadError)
        continue
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('customer-documents')
        .getPublicUrl(filePath)

      // Save document metadata
      await fetch(`/api/customers/${customerId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_type: file.type,
          file_size: file.size,
          category: uploadCategory,
        })
      })
    }

    setUploading(false)
    e.target.value = ''
    fetchData()
  }

  async function deleteDocument(docId: string) {
    if (!confirm('Ta bort detta dokument?')) return
    await fetch(`/api/customers/${customerId}/documents?docId=${docId}`, {
      method: 'DELETE'
    })
    fetchData()
  }

  function formatFileSize(bytes: number | null) {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  async function generatePortalLink() {
    setGeneratingPortal(true)
    try {
      const res = await fetch(`/api/customers/${customerId}/portal-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: business.business_id })
      })
      if (res.ok) {
        const data = await res.json()
        setPortalToken(data.token)
        setPortalEnabled(true)
      }
    } catch (err) {
      console.error('Failed to generate portal link:', err)
    }
    setGeneratingPortal(false)
  }

  async function copyPortalLink() {
    if (!portalToken) return
    const url = `${window.location.origin}/portal/${portalToken}`
    await navigator.clipboard.writeText(url)
    setPortalCopied(true)
    setTimeout(() => setPortalCopied(false), 2000)
  }

  async function disablePortal() {
    try {
      await fetch(`/api/customers/${customerId}/portal-link`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: business.business_id })
      })
      setPortalToken(null)
      setPortalEnabled(false)
    } catch (err) {
      console.error('Failed to disable portal:', err)
    }
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'call_inbound': return <PhoneIncoming className="w-4 h-4 text-emerald-600" />
      case 'call_outbound': return <PhoneOutgoing className="w-4 h-4 text-blue-400" />
      case 'call_logged': return <PhoneCall className="w-4 h-4 text-blue-600" />
      case 'sms_sent': return <Send className="w-4 h-4 text-cyan-600" />
      case 'sms_received': return <MessageSquare className="w-4 h-4 text-cyan-400" />
      case 'booking_created': return <Calendar className="w-4 h-4 text-amber-400" />
      case 'job_completed': return <CheckCircle className="w-4 h-4 text-emerald-600" />
      case 'note_added': return <FileText className="w-4 h-4 text-gray-500" />
      case 'rating_received': return <Star className="w-4 h-4 text-yellow-400" />
      default: return <Clock className="w-4 h-4 text-gray-500" />
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('sv-SE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getJobStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <span className="px-2 py-1 text-xs rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">Schemalagt</span>
      case 'in_progress':
        return <span className="px-2 py-1 text-xs rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">Pågående</span>
      case 'completed':
        return <span className="px-2 py-1 text-xs rounded-full bg-emerald-100 text-emerald-600 border border-emerald-500/30">Slutfört</span>
      case 'cancelled':
        return <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-600 border border-red-500/30">Avbokat</span>
      default:
        return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-500 border border-gray-300">{status}</span>
    }
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="p-4 sm:p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Kunden hittades inte</div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-50 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/dashboard/customers"
            className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{customer.name}</h1>
              {customer.customer_type === 'company' && (
                <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200 rounded-md">Företag</span>
              )}
              {customer.customer_type === 'brf' && (
                <span className="px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-md">BRF</span>
              )}
            </div>
            <p className="text-sm text-gray-500">Kund sedan {new Date(customer.created_at).toLocaleDateString('sv-SE')}</p>
          </div>
          <button
            onClick={startEditing}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all min-h-[44px]"
          >
            <Edit className="w-4 h-4" />
            <span className="hidden sm:inline">Redigera</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Vänster kolumn - Kundinfo + Snabbåtgärder */}
          <div className="space-y-6">
            {/* Kundinfo */}
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Kontaktinfo</h2>

              <div className="space-y-3">
                {customer.phone_number && (
                  <a href={`tel:${customer.phone_number}`} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all">
                    <Phone className="w-4 h-4 text-emerald-600" />
                    <span className="text-gray-900 text-sm">{customer.phone_number}</span>
                  </a>
                )}

                {customer.email && (
                  <a href={`mailto:${customer.email}`} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all">
                    <Mail className="w-4 h-4 text-blue-400" />
                    <span className="text-gray-900 text-sm truncate">{customer.email}</span>
                  </a>
                )}

                {customer.address_line && (
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <MapPin className="w-4 h-4 text-amber-400" />
                    <span className="text-gray-900 text-sm">{customer.address_line}</span>
                  </div>
                )}

                {(customer.customer_type === 'company' || customer.customer_type === 'brf') && customer.org_number && (
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <Building2 className="w-4 h-4 text-gray-400" />
                    <div>
                      <span className="text-gray-900 text-sm">{customer.org_number}</span>
                      <p className="text-xs text-gray-400">Org.nummer</p>
                    </div>
                  </div>
                )}

                {customer.contact_person && (
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <User className="w-4 h-4 text-gray-400" />
                    <div>
                      <span className="text-gray-900 text-sm">{customer.contact_person}</span>
                      <p className="text-xs text-gray-400">Kontaktperson</p>
                    </div>
                  </div>
                )}

                {customer.personal_number && (
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <User className="w-4 h-4 text-gray-400" />
                    <div>
                      <span className="text-gray-900 text-sm">{customer.personal_number}</span>
                      <p className="text-xs text-gray-400">Personnummer</p>
                    </div>
                  </div>
                )}

                {customer.property_designation && (
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <Home className="w-4 h-4 text-gray-400" />
                    <div>
                      <span className="text-gray-900 text-sm">{customer.property_designation}</span>
                      <p className="text-xs text-gray-400">Fastighetsbeteckning</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Snabbåtgärder */}
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Åtgärder</h2>
              
              <div className="space-y-2">
                <button
                  onClick={() => setShowLogCallModal(true)}
                  className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all text-left"
                >
                  <PhoneCall className="w-4 h-4 text-blue-600" />
                  <span className="text-gray-900 text-sm">Logga samtal</span>
                </button>
                
                <button
                  onClick={() => setShowSendSMSModal(true)}
                  className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all text-left"
                >
                  <MessageSquare className="w-4 h-4 text-cyan-600" />
                  <span className="text-gray-900 text-sm">Skicka SMS</span>
                </button>
                
                <button
                  onClick={() => setShowAddNoteModal(true)}
                  className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all text-left"
                >
                  <FileText className="w-4 h-4 text-cyan-400" />
                  <span className="text-gray-900 text-sm">Lägg till anteckning</span>
                </button>
                
                <Link
                  href="/dashboard/bookings"
                  className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all text-left"
                >
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <span className="text-gray-900 text-sm">Skapa bokning</span>
                </Link>
              </div>
            </div>

            {/* Kundportal */}
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Kundportal</h2>

              {portalToken && portalEnabled ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-sm text-emerald-600 font-medium">Aktiv</span>
                  </div>

                  <div className="p-3 bg-gray-50 rounded-xl">
                    <p className="text-xs text-gray-400 mb-1">Portallänk</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-gray-700 truncate flex-1">
                        {window.location.origin}/portal/{portalToken.substring(0, 8)}...
                      </p>
                      <button
                        onClick={copyPortalLink}
                        className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-all"
                        title="Kopiera länk"
                      >
                        {portalCopied ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                      <a
                        href={`/portal/${portalToken}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-all"
                        title="Öppna portal"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>

                  {portalLastVisited && (
                    <p className="text-xs text-gray-400">
                      Senast besökt: {new Date(portalLastVisited).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={generatePortalLink}
                      disabled={generatingPortal}
                      className="flex-1 flex items-center justify-center gap-2 p-2.5 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all text-sm text-gray-700"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${generatingPortal ? 'animate-spin' : ''}`} />
                      Ny länk
                    </button>
                    <button
                      onClick={disablePortal}
                      className="flex-1 flex items-center justify-center gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl hover:bg-red-100 transition-all text-sm text-red-600"
                    >
                      Inaktivera
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gray-300" />
                    <span className="text-sm text-gray-400">Inaktiv</span>
                  </div>
                  <p className="text-xs text-gray-400">
                    Ge kunden tillgång till projekt, offerter, fakturor och meddelanden via en personlig portallänk.
                  </p>
                  <button
                    onClick={generatePortalLink}
                    disabled={generatingPortal}
                    className="w-full flex items-center justify-center gap-2 p-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all"
                  >
                    {generatingPortal ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Globe className="w-4 h-4" />
                    )}
                    {generatingPortal ? 'Genererar...' : 'Aktivera kundportal'}
                  </button>
                </div>
              )}
            </div>

            {/* Statistik */}
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Statistik</h2>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-gray-50 rounded-xl text-center">
                  <p className="text-xl font-bold text-gray-900">{bookings.length}</p>
                  <p className="text-xs text-gray-400">Bokningar</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl text-center">
                  <p className="text-xl font-bold text-gray-900">{bookings.filter(b => b.job_status === 'completed').length}</p>
                  <p className="text-xs text-gray-400">Slutförda jobb</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl text-center">
                  <p className="text-xl font-bold text-gray-900">{activities.filter(a => a.activity_type.includes('call')).length}</p>
                  <p className="text-xs text-gray-400">Samtal</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl text-center">
                  <p className="text-xl font-bold text-gray-900">{activities.filter(a => a.activity_type.includes('sms')).length}</p>
                  <p className="text-xs text-gray-400">SMS</p>
                </div>
              </div>
            </div>
          </div>

          {/* Höger kolumn - Tidslinje/Bokningar */}
          <div className="lg:col-span-2">
            {/* Tabs */}
            <div className="flex gap-2 mb-4 overflow-x-auto">
              <button
                onClick={() => setActiveTab('timeline')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap min-h-[44px] ${
                  activeTab === 'timeline'
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                    : 'bg-gray-100 text-gray-500 hover:text-gray-900'
                }`}
              >
                Tidslinje
              </button>
              <button
                onClick={() => setActiveTab('bookings')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap min-h-[44px] ${
                  activeTab === 'bookings'
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                    : 'bg-gray-100 text-gray-500 hover:text-gray-900'
                }`}
              >
                Bokningar ({bookings.length})
              </button>
              <button
                onClick={() => setActiveTab('documents')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap min-h-[44px] ${
                  activeTab === 'documents'
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                    : 'bg-gray-100 text-gray-500 hover:text-gray-900'
                }`}
              >
                Dokument ({documents.length})
              </button>
              <button
                onClick={() => setActiveTab('tasks')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap min-h-[44px] ${
                  activeTab === 'tasks'
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                    : 'bg-gray-100 text-gray-500 hover:text-gray-900'
                }`}
              >
                Uppgifter ({tasks.filter(t => t.status !== 'done').length})
              </button>
            </div>

            {/* Timeline */}
            {activeTab === 'timeline' && (
              <div className="bg-white shadow-sm rounded-xl border border-gray-200">
                {activities.length === 0 ? (
                  <div className="p-8 text-center">
                    <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-400">Ingen aktivitet ännu</p>
                    <p className="text-xs text-gray-400 mt-1">Logga ett samtal eller skicka ett SMS för att komma igång</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {activities.map((activity) => (
                      <div key={activity.activity_id} className="p-4 hover:bg-gray-100/30 transition-all">
                        <div className="flex gap-4">
                          <div className="flex-shrink-0 w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                            {getActivityIcon(activity.activity_type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-medium text-gray-900 text-sm">{activity.title}</p>
                              <span className="text-xs text-gray-400 whitespace-nowrap">
                                {formatDate(activity.created_at)}
                              </span>
                            </div>
                            {activity.description && (
                              <p className="text-sm text-gray-500 mt-1">{activity.description}</p>
                            )}
                            {activity.duration_seconds && (
                              <p className="text-xs text-gray-400 mt-1">
                                Längd: {formatDuration(activity.duration_seconds)}
                              </p>
                            )}
                            {activity.transcript && (
                              <details className="mt-2">
                                <summary className="text-xs text-blue-600 cursor-pointer hover:text-blue-500">
                                  Visa transkription
                                </summary>
                                <p className="mt-2 p-3 bg-gray-50 rounded-lg text-xs text-gray-500 whitespace-pre-wrap">
                                  {activity.transcript}
                                </p>
                              </details>
                            )}
                            {activity.recording_url && (
                              <button className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-500">
                                <Play className="w-3 h-3" />
                                Spela upp inspelning
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Bookings */}
            {activeTab === 'bookings' && (
              <div className="bg-white shadow-sm rounded-xl border border-gray-200">
                {bookings.length === 0 ? (
                  <div className="p-8 text-center">
                    <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-400">Inga bokningar</p>
                    <Link href="/dashboard/bookings" className="text-sm text-blue-600 hover:text-blue-500 mt-2 inline-block">
                      Skapa första bokningen →
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {bookings.map((booking) => (
                      <div key={booking.booking_id} className="p-4 hover:bg-gray-100/30 transition-all">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium text-gray-900 text-sm">
                                {new Date(booking.scheduled_start).toLocaleDateString('sv-SE', {
                                  weekday: 'short',
                                  day: 'numeric',
                                  month: 'short'
                                })}
                              </p>
                              <span className="text-gray-400 text-sm">
                                kl {new Date(booking.scheduled_start).toLocaleTimeString('sv-SE', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                            {booking.notes && (
                              <p className="text-sm text-gray-500">{booking.notes}</p>
                            )}
                            {booking.job_notes && (
                              <p className="text-xs text-gray-400 mt-1">📝 {booking.job_notes}</p>
                            )}
                            {booking.customer_rating && (
                              <div className="flex items-center gap-1 mt-1">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <Star
                                    key={star}
                                    className={`w-3 h-3 ${star <= booking.customer_rating! ? 'text-yellow-400 fill-yellow-400' : 'text-gray-400'}`}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            {getJobStatusBadge(booking.job_status || 'scheduled')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Documents */}
            {activeTab === 'documents' && (
              <div className="space-y-4">
                {/* Upload area */}
                <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <select
                      value={uploadCategory}
                      onChange={(e) => setUploadCategory(e.target.value)}
                      className="px-3 py-2.5 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-h-[44px]"
                    >
                      <option value="drawing">Ritning</option>
                      <option value="sketch">Skiss</option>
                      <option value="description">Beskrivning</option>
                      <option value="contract">Kontrakt</option>
                      <option value="photo">Foto</option>
                      <option value="other">Övrigt</option>
                    </select>

                    <label className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white text-sm font-medium hover:opacity-90 cursor-pointer transition-all min-h-[44px]">
                      {uploading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                      {uploading ? 'Laddar upp...' : 'Ladda upp fil'}
                      <input
                        type="file"
                        className="hidden"
                        multiple
                        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                        onChange={handleFileUpload}
                        disabled={uploading}
                      />
                    </label>

                    <p className="text-xs text-gray-400 sm:ml-auto">Max 10 MB per fil</p>
                  </div>
                </div>

                {/* Document list */}
                <div className="bg-white shadow-sm rounded-xl border border-gray-200">
                  {documents.length === 0 ? (
                    <div className="p-8 text-center">
                      <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-400">Inga dokument</p>
                      <p className="text-xs text-gray-400 mt-1">Ladda upp ritningar, skisser, kontrakt med mera</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-200">
                      {documents.map((doc) => (
                        <div key={doc.id} className="p-4 hover:bg-gray-50 transition-all flex items-center gap-4">
                          <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                            {doc.file_type?.startsWith('image/') ? (
                              <Image className="w-5 h-5 text-blue-500" />
                            ) : doc.file_type?.includes('pdf') ? (
                              <FileText className="w-5 h-5 text-red-500" />
                            ) : (
                              <File className="w-5 h-5 text-gray-400" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 text-sm truncate">{doc.file_name}</p>
                            <div className="flex items-center gap-2 text-xs text-gray-400">
                              <span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">
                                {{ drawing: 'Ritning', sketch: 'Skiss', description: 'Beskrivning', contract: 'Kontrakt', photo: 'Foto', other: 'Övrigt' }[doc.category] || doc.category}
                              </span>
                              {doc.file_size && <span>{formatFileSize(doc.file_size)}</span>}
                              <span>{new Date(doc.uploaded_at).toLocaleDateString('sv-SE')}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <a
                              href={doc.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
                              title="Öppna"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                            <button
                              onClick={() => deleteDocument(doc.id)}
                              className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
                              title="Ta bort"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tasks */}
            {activeTab === 'tasks' && (
              <div className="bg-white shadow-sm rounded-xl border border-gray-200">
                <div className="p-4 border-b border-gray-200">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={newTaskTitle}
                      onChange={e => setNewTaskTitle(e.target.value)}
                      placeholder="Ny uppgift..."
                      className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-blue-400 min-h-[44px]"
                      onKeyDown={e => { if (e.key === 'Enter') handleAddTask() }}
                    />
                    <input
                      type="date"
                      value={newTaskDueDate}
                      onChange={e => setNewTaskDueDate(e.target.value)}
                      className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-500 focus:outline-none focus:border-blue-400 min-h-[44px]"
                    />
                    <button
                      onClick={handleAddTask}
                      disabled={!newTaskTitle.trim() || taskSaving}
                      className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px] flex items-center gap-1.5"
                    >
                      {taskSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      Lägg till
                    </button>
                  </div>
                </div>
                {tasks.length === 0 ? (
                  <div className="p-8 text-center">
                    <CheckSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-400">Inga uppgifter ännu</p>
                    <p className="text-xs text-gray-400 mt-1">Skapa en uppgift ovan för att komma igång</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {tasks.map(task => (
                      <div key={task.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group">
                        <button onClick={() => handleToggleTask(task.id, task.status)} className="flex-shrink-0">
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${task.status === 'done' ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-blue-400'}`}>
                            {task.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                          </div>
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${task.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{task.title}</p>
                          {task.due_date && (
                            <p className={`text-xs ${new Date(task.due_date) < new Date() && task.status !== 'done' ? 'text-red-500' : 'text-gray-400'}`}>
                              {new Date(task.due_date).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </p>
                          )}
                        </div>
                        <button onClick={() => handleDeleteTask(task.id)} className="p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 min-h-[44px] flex items-center" title="Ta bort">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Customer Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
          <div className="bg-white border border-gray-200 rounded-t-2xl sm:rounded-2xl p-6 w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Redigera kund</h3>
              <button onClick={() => setIsEditing(false)} className="text-gray-400 hover:text-gray-900">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Customer type selector */}
              <div>
                <label className="block text-sm text-gray-500 mb-2">Kundtyp</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'private', label: 'Privatperson', icon: User },
                    { value: 'company', label: 'Företag', icon: Building2 },
                    { value: 'brf', label: 'BRF', icon: Home },
                  ] as const).map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setEditForm({ ...editForm, customer_type: value })}
                      className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-sm font-medium transition-all min-h-[44px] ${
                        editForm.customer_type === value
                          ? 'bg-blue-50 border-blue-400 text-blue-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">
                  {editForm.customer_type === 'private' ? 'Namn *' : editForm.customer_type === 'company' ? 'Företagsnamn *' : 'Föreningsnamn *'}
                </label>
                <input
                  type="text"
                  value={editForm.name || ''}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              {(editForm.customer_type === 'company' || editForm.customer_type === 'brf') && (
                <>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Organisationsnummer</label>
                    <input type="text" value={editForm.org_number || ''} onChange={(e) => setEditForm({ ...editForm, org_number: e.target.value })} placeholder="XXXXXX-XXXX"
                      className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Kontaktperson</label>
                    <input type="text" value={editForm.contact_person || ''} onChange={(e) => setEditForm({ ...editForm, contact_person: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm text-gray-500 mb-1">Telefon *</label>
                <input type="tel" value={editForm.phone_number || ''} onChange={(e) => setEditForm({ ...editForm, phone_number: e.target.value })} placeholder="+46..."
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">E-post</label>
                <input type="email" value={editForm.email || ''} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Adress</label>
                <input type="text" value={editForm.address_line || ''} onChange={(e) => setEditForm({ ...editForm, address_line: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>

              {(editForm.customer_type === 'company' || editForm.customer_type === 'brf') && (
                <>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Referens / Er märkning</label>
                    <input type="text" value={editForm.reference || ''} onChange={(e) => setEditForm({ ...editForm, reference: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Fakturaadress</label>
                    <input type="text" value={editForm.invoice_address || ''} onChange={(e) => setEditForm({ ...editForm, invoice_address: e.target.value })} placeholder="Om annan än besöksadress"
                      className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                  </div>
                </>
              )}

              {editForm.customer_type === 'brf' && (
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Antal lägenheter</label>
                  <input type="number" value={editForm.apartment_count || ''} onChange={(e) => setEditForm({ ...editForm, apartment_count: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                </div>
              )}

              {editForm.customer_type === 'private' && (
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Personnummer</label>
                  <input type="text" value={editForm.personal_number || ''} onChange={(e) => setEditForm({ ...editForm, personal_number: e.target.value })} placeholder="YYYYMMDD-XXXX"
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                </div>
              )}

              <div>
                <label className="block text-sm text-gray-500 mb-1">Fastighetsbeteckning</label>
                <input type="text" value={editForm.property_designation || ''} onChange={(e) => setEditForm({ ...editForm, property_designation: e.target.value })} placeholder="T.ex. Stockholm Söder 1:23"
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setIsEditing(false)} className="px-4 py-2.5 text-gray-500 hover:text-gray-900 min-h-[44px]">
                Avbryt
              </button>
              <button
                onClick={saveEdit}
                disabled={editSaving}
                className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50 min-h-[44px]"
              >
                {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Spara
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Log Call Modal */}
      {showLogCallModal && (
        <LogCallModal
          customerId={customerId}
          businessId={business.business_id}
          onClose={() => setShowLogCallModal(false)}
          onSaved={() => {
            setShowLogCallModal(false)
            fetchData()
          }}
        />
      )}

      {/* Add Note Modal */}
      {showAddNoteModal && (
        <AddNoteModal
          customerId={customerId}
          businessId={business.business_id}
          onClose={() => setShowAddNoteModal(false)}
          onSaved={() => {
            setShowAddNoteModal(false)
            fetchData()
          }}
        />
      )}

      {/* Send SMS Modal */}
      {showSendSMSModal && (
        <SendSMSModal
          customer={customer}
          businessId={business.business_id}
          businessName={business.business_name}
          onClose={() => setShowSendSMSModal(false)}
          onSaved={() => {
            setShowSendSMSModal(false)
            fetchData()
          }}
        />
      )}
    </div>
  )
}

// Log Call Modal Component
function LogCallModal({ customerId, businessId, onClose, onSaved }: {
  customerId: string
  businessId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('outbound')
  const [duration, setDuration] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    
    const activityId = 'act_' + Math.random().toString(36).substr(2, 9)
    const durationSeconds = duration ? parseInt(duration) * 60 : null

    await supabase.from('customer_activity').insert({
      activity_id: activityId,
      customer_id: customerId,
      business_id: businessId,
      activity_type: direction === 'inbound' ? 'call_inbound' : 'call_outbound',
      title: direction === 'inbound' ? 'Inkommande samtal' : 'Utgående samtal',
      description: notes || null,
      duration_seconds: durationSeconds,
      created_by: 'user'
    })

    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Logga samtal</h2>
        
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-500 mb-2 block">Typ</label>
            <div className="flex gap-2">
              <button
                onClick={() => setDirection('outbound')}
                className={`flex-1 p-3 rounded-xl text-sm font-medium transition-all ${
                  direction === 'outbound'
                    ? 'bg-blue-100 border border-blue-300 text-gray-900'
                    : 'bg-gray-100 border border-gray-300 text-gray-500'
                }`}
              >
                <PhoneOutgoing className="w-4 h-4 mx-auto mb-1" />
                Utgående
              </button>
              <button
                onClick={() => setDirection('inbound')}
                className={`flex-1 p-3 rounded-xl text-sm font-medium transition-all ${
                  direction === 'inbound'
                    ? 'bg-blue-100 border border-blue-300 text-gray-900'
                    : 'bg-gray-100 border border-gray-300 text-gray-500'
                }`}
              >
                <PhoneIncoming className="w-4 h-4 mx-auto mb-1" />
                Inkommande
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-500 mb-2 block">Längd (minuter)</label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="5"
              className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          <div>
            <label className="text-sm text-gray-500 mb-2 block">Anteckningar</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Vad pratade ni om?"
              className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200"
          >
            Avbryt
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Sparar...' : 'Spara'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Add Note Modal Component
function AddNoteModal({ customerId, businessId, onClose, onSaved }: {
  customerId: string
  businessId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!note.trim()) return
    setSaving(true)
    
    const activityId = 'act_' + Math.random().toString(36).substr(2, 9)

    await supabase.from('customer_activity').insert({
      activity_id: activityId,
      customer_id: customerId,
      business_id: businessId,
      activity_type: 'note_added',
      title: 'Anteckning',
      description: note,
      created_by: 'user'
    })

    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Lägg till anteckning</h2>
        
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="Skriv din anteckning..."
          autoFocus
          className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
        />

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200"
          >
            Avbryt
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !note.trim()}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Sparar...' : 'Spara'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Send SMS Modal Component
function SendSMSModal({ customer, businessId, businessName, onClose, onSaved }: {
  customer: Customer
  businessId: string
  businessName: string
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useToast()
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!message.trim() || !customer.phone_number) return
    setSending(true)

    try {
      // Skicka SMS via API
      const response = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: customer.phone_number,
          message: message,
          businessId: businessId,
          businessName: businessName
        })
      })

      if (response.ok) {
        // Logga aktivitet
        const activityId = 'act_' + Math.random().toString(36).substr(2, 9)
        await supabase.from('customer_activity').insert({
          activity_id: activityId,
          customer_id: customer.customer_id,
          business_id: businessId,
          activity_type: 'sms_sent',
          title: 'SMS skickat',
          description: message,
          created_by: 'user'
        })

        onSaved()
      } else {
        toast.error('Kunde inte skicka SMS')
        setSending(false)
      }
    } catch {
      toast.error('Något gick fel')
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Skicka SMS</h2>
        
        <p className="text-sm text-gray-500 mb-4">
          Till: {customer.name} ({customer.phone_number})
        </p>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder="Skriv ditt meddelande..."
          autoFocus
          className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
        />
        
        <p className="text-xs text-gray-400 mt-2">{message.length} tecken</p>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200"
          >
            Avbryt
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !message.trim()}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            {sending ? 'Skickar...' : 'Skicka'}
          </button>
        </div>
      </div>
    </div>
  )
}
