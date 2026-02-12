'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  FileText,
  Plus,
  Search,
  Filter,
  ClipboardList,
  ClipboardCheck,
  Award,
  ShieldCheck,
  FileCheck,
  File,
  ChevronRight,
  X,
  Loader2,
  Check,
  PenTool,
  Eye,
  Trash2,
  Download,
  Copy,
  FolderOpen,
  ArrowLeft,
  Users,
  FolderKanban,
  Calendar,
  MoreVertical,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react'

// ============================================
// Types
// ============================================

interface TemplateCategory {
  id: string
  name: string
  slug: string
  description: string
  icon: string
  sort_order: number
}

interface TemplateVariable {
  key: string
  label: string
  source: 'auto' | 'input'
  auto_type?: string
  input_type?: string
  options?: string[]
  default?: string
}

interface DocumentTemplate {
  id: string
  business_id: string | null
  category_id: string
  name: string
  description: string
  content: any[]
  variables: TemplateVariable[]
  branch: string | null
  is_system: boolean
  category?: TemplateCategory
}

interface GeneratedDocument {
  id: string
  business_id: string
  template_id: string
  project_id: string | null
  customer_id: string | null
  title: string
  content: any[]
  variables_data: Record<string, any>
  status: 'draft' | 'completed' | 'signed'
  signed_at: string | null
  signed_by_name: string | null
  signature_data: string | null
  customer_signature: string | null
  customer_signed_name: string | null
  customer_signed_at: string | null
  notes: string | null
  created_at: string
  template?: {
    id: string
    name: string
    category_id: string
    category?: TemplateCategory
  }
  customer?: {
    customer_id: string
    name: string
    phone_number: string
    email: string
  }
  project?: {
    project_id: string
    name: string
  }
}

interface CustomerOption {
  customer_id: string
  name: string
}

interface ProjectOption {
  project_id: string
  name: string
}

// ============================================
// Icon helper
// ============================================

function getCategoryIcon(iconName: string, className = 'w-5 h-5') {
  const icons: Record<string, any> = {
    ClipboardList,
    ClipboardCheck,
    Award,
    ShieldCheck,
    FileCheck,
    FileSignature: PenTool,
    File,
    FileText,
  }
  const Icon = icons[iconName] || FileText
  return <Icon className={className} />
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'draft':
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-zinc-800 text-zinc-300 rounded-full">
          <Clock className="w-3 h-3" /> Utkast
        </span>
      )
    case 'completed':
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-violet-500/20 text-violet-300 rounded-full">
          <CheckCircle2 className="w-3 h-3" /> Klar
        </span>
      )
    case 'signed':
      return (
        <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-emerald-500/20 text-emerald-300 rounded-full">
          <PenTool className="w-3 h-3" /> Signerad
        </span>
      )
    default:
      return null
  }
}

// ============================================
// Main Page
// ============================================

export default function DocumentsPage() {
  // Data state
  const [categories, setCategories] = useState<TemplateCategory[]>([])
  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [documents, setDocuments] = useState<GeneratedDocument[]>([])
  const [customers, setCustomers] = useState<CustomerOption[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [loading, setLoading] = useState(true)

  // UI state
  const [view, setView] = useState<'documents' | 'templates'>('documents')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')

  // Create wizard state
  const [showCreate, setShowCreate] = useState(false)
  const [wizardStep, setWizardStep] = useState(1)
  const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null)
  const [createCustomerId, setCreateCustomerId] = useState('')
  const [createProjectId, setCreateProjectId] = useState('')
  const [createTitle, setCreateTitle] = useState('')
  const [variableValues, setVariableValues] = useState<Record<string, any>>({})
  const [creating, setCreating] = useState(false)

  // Document viewer state
  const [viewDoc, setViewDoc] = useState<GeneratedDocument | null>(null)
  const [viewHtml, setViewHtml] = useState('')
  const [loadingHtml, setLoadingHtml] = useState(false)

  // Edit state
  const [editDoc, setEditDoc] = useState<GeneratedDocument | null>(null)
  const [editVars, setEditVars] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)

  // Sign state
  const [signDoc, setSignDoc] = useState<GeneratedDocument | null>(null)
  const [signName, setSignName] = useState('')
  const [signing, setSigning] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)

  // Toast
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })
  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ show: true, message, type })
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000)
  }

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ docId: string; x: number; y: number } | null>(null)

  // ============================================
  // Data fetching
  // ============================================

  async function getAuthHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token || ''}`,
    }
  }

  const fetchData = useCallback(async () => {
    try {
      const headers = await getAuthHeaders()

      const [catRes, tplRes, docRes, custRes, projRes] = await Promise.all([
        fetch('/api/documents/categories', { headers }),
        fetch('/api/documents/templates', { headers }),
        fetch('/api/documents', { headers }),
        fetch('/api/customers', { headers }),
        fetch('/api/projects', { headers }),
      ])

      const [catData, tplData, docData, custData, projData] = await Promise.all([
        catRes.json(),
        tplRes.json(),
        docRes.json(),
        custRes.ok ? custRes.json() : { customers: [] },
        projRes.ok ? projRes.json() : { projects: [] },
      ])

      setCategories(catData.categories || [])
      setTemplates(tplData.templates || [])
      setDocuments(docData.documents || [])
      setCustomers(custData.customers || [])
      setProjects(projData.projects || [])
    } catch (err) {
      console.error('Fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ============================================
  // Create document
  // ============================================

  function startCreate() {
    setShowCreate(true)
    setWizardStep(1)
    setSelectedTemplate(null)
    setCreateCustomerId('')
    setCreateProjectId('')
    setCreateTitle('')
    setVariableValues({})
  }

  function selectTemplate(tpl: DocumentTemplate) {
    setSelectedTemplate(tpl)
    setCreateTitle(tpl.name)
    // Pre-fill defaults
    const defaults: Record<string, any> = {}
    for (const v of tpl.variables || []) {
      if (v.default) defaults[v.key] = v.default
      if (v.input_type === 'checkbox') defaults[v.key] = defaults[v.key] || false
    }
    setVariableValues(defaults)
    setWizardStep(2)
  }

  async function createDocument() {
    if (!selectedTemplate) return
    setCreating(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/documents', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          template_id: selectedTemplate.id,
          title: createTitle || selectedTemplate.name,
          customer_id: createCustomerId || null,
          project_id: createProjectId || null,
          variables_data: variableValues,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setDocuments(prev => [data.document, ...prev])
      setShowCreate(false)
      showToast('Dokument skapat!')

      // Open for editing
      setEditDoc(data.document)
      setEditVars(data.document.variables_data || {})
    } catch (err: any) {
      showToast(err.message || 'Kunde inte skapa dokument', 'error')
    } finally {
      setCreating(false)
    }
  }

  // ============================================
  // View document HTML
  // ============================================

  async function viewDocument(doc: GeneratedDocument) {
    setViewDoc(doc)
    setLoadingHtml(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/documents/${doc.id}?format=html`, { headers })
      const html = await res.text()
      setViewHtml(html)
    } catch {
      setViewHtml('<p>Kunde inte ladda dokumentet</p>')
    } finally {
      setLoadingHtml(false)
    }
  }

  // ============================================
  // Edit document
  // ============================================

  function openEdit(doc: GeneratedDocument) {
    setEditDoc(doc)
    setEditVars(doc.variables_data || {})
  }

  async function saveDocument() {
    if (!editDoc) return
    setSaving(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/documents/${editDoc.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ variables_data: editVars }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setDocuments(prev => prev.map(d => d.id === editDoc.id ? data.document : d))
      setEditDoc(null)
      showToast('Dokument sparat!')
    } catch (err: any) {
      showToast(err.message || 'Kunde inte spara', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function markComplete() {
    if (!editDoc) return
    setSaving(true)
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/documents/${editDoc.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ variables_data: editVars, status: 'completed' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setDocuments(prev => prev.map(d => d.id === editDoc.id ? data.document : d))
      setEditDoc(null)
      showToast('Dokument markerat som klart!')
    } catch (err: any) {
      showToast(err.message || 'Kunde inte uppdatera', 'error')
    } finally {
      setSaving(false)
    }
  }

  // ============================================
  // Delete document
  // ============================================

  async function deleteDocument(docId: string) {
    try {
      const headers = await getAuthHeaders()
      const res = await fetch(`/api/documents/${docId}`, { method: 'DELETE', headers })
      if (!res.ok) throw new Error('Delete failed')
      setDocuments(prev => prev.filter(d => d.id !== docId))
      setContextMenu(null)
      showToast('Dokument borttaget')
    } catch {
      showToast('Kunde inte ta bort', 'error')
    }
  }

  // ============================================
  // Duplicate template
  // ============================================

  async function duplicateTemplate(tpl: DocumentTemplate) {
    try {
      const headers = await getAuthHeaders()
      const res = await fetch('/api/documents/templates', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: `${tpl.name} (kopia)`,
          description: tpl.description,
          category_id: tpl.category_id,
          content: tpl.content,
          variables: tpl.variables,
          branch: tpl.branch,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTemplates(prev => [...prev, data.template])
      showToast('Mall kopierad!')
    } catch (err: any) {
      showToast(err.message || 'Kunde inte kopiera', 'error')
    }
  }

  // ============================================
  // Signature canvas
  // ============================================

  function openSign(doc: GeneratedDocument) {
    setSignDoc(doc)
    setSignName('')
    setSigning(false)
    setTimeout(() => {
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          canvas.width = canvas.offsetWidth
          canvas.height = canvas.offsetHeight
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 2
          ctx.lineCap = 'round'
        }
      }
    }, 100)
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    setIsDrawing(true)
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const x = ('touches' in e) ? e.touches[0].clientX - rect.left : e.clientX - rect.left
    const y = ('touches' in e) ? e.touches[0].clientY - rect.top : e.clientY - rect.top
    ctx.lineTo(x, y)
    ctx.stroke()
  }

  function endDraw() {
    setIsDrawing(false)
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
  }

  async function submitSignature() {
    if (!signDoc || !signName) return
    setSigning(true)
    try {
      const canvas = canvasRef.current
      const signatureData = canvas?.toDataURL('image/png') || null

      const headers = await getAuthHeaders()
      const res = await fetch(`/api/documents/${signDoc.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          signed_by_name: signName,
          signature_data: signatureData,
          status: 'completed',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setDocuments(prev => prev.map(d => d.id === signDoc.id ? data.document : d))
      setSignDoc(null)
      showToast('Dokument signerat!')
    } catch (err: any) {
      showToast(err.message || 'Kunde inte signera', 'error')
    } finally {
      setSigning(false)
    }
  }

  // ============================================
  // Filter logic
  // ============================================

  const filteredDocuments = documents.filter(doc => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const match = doc.title?.toLowerCase().includes(q) ||
        doc.customer?.name?.toLowerCase().includes(q) ||
        doc.project?.name?.toLowerCase().includes(q)
      if (!match) return false
    }
    if (statusFilter && doc.status !== statusFilter) return false
    if (selectedCategory && view === 'documents') {
      if (doc.template?.category?.id !== selectedCategory) return false
    }
    return true
  })

  const filteredTemplates = templates.filter(tpl => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!tpl.name.toLowerCase().includes(q) && !tpl.description?.toLowerCase().includes(q)) return false
    }
    if (selectedCategory && tpl.category_id !== selectedCategory) return false
    return true
  })

  // Close context menu on click outside
  useEffect(() => {
    if (contextMenu) {
      const handler = () => setContextMenu(null)
      window.addEventListener('click', handler)
      return () => window.removeEventListener('click', handler)
    }
  }, [contextMenu])

  // ============================================
  // Render
  // ============================================

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 md:ml-64">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Dokument</h1>
            <p className="text-zinc-400 text-sm mt-1">Mallar, protokoll och intyg</p>
          </div>
          <button
            onClick={startCreate}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 rounded-xl font-medium text-sm transition-all shadow-lg shadow-violet-500/25"
          >
            <Plus className="w-4 h-4" /> Nytt dokument
          </button>
        </div>

        {/* Tabs + Search */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex bg-zinc-900/50 rounded-xl p-1 border border-zinc-800">
            <button
              onClick={() => { setView('documents'); setSelectedCategory(null) }}
              className={`px-4 py-2 text-sm rounded-lg transition-all ${view === 'documents' ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-white'}`}
            >
              Mina dokument ({documents.length})
            </button>
            <button
              onClick={() => { setView('templates'); setSelectedCategory(null) }}
              className={`px-4 py-2 text-sm rounded-lg transition-all ${view === 'templates' ? 'bg-violet-600 text-white' : 'text-zinc-400 hover:text-white'}`}
            >
              Mallar ({templates.length})
            </button>
          </div>

          <div className="flex-1 flex gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Sök dokument..."
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-xl text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-violet-500"
              />
            </div>
            {view === 'documents' && (
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="px-3 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500"
              >
                <option value="">Alla status</option>
                <option value="draft">Utkast</option>
                <option value="completed">Klar</option>
                <option value="signed">Signerad</option>
              </select>
            )}
          </div>
        </div>

        {/* Category sidebar + Content */}
        <div className="flex gap-6">
          {/* Category sidebar */}
          <div className="hidden lg:block w-56 flex-shrink-0">
            <div className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-xl p-3">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  !selectedCategory ? 'bg-violet-500/20 text-violet-300' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                }`}
              >
                <FolderOpen className="w-4 h-4" />
                Alla
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                    selectedCategory === cat.id ? 'bg-violet-500/20 text-violet-300' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                  }`}
                >
                  {getCategoryIcon(cat.icon, 'w-4 h-4')}
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Mobile category filter */}
          <div className="lg:hidden w-full mb-4">
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs transition-all ${
                  !selectedCategory ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                Alla
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs transition-all ${
                    selectedCategory === cat.id ? 'bg-violet-600 text-white' : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {view === 'documents' ? (
              /* Documents list */
              filteredDocuments.length === 0 ? (
                <div className="text-center py-16">
                  <FileText className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                  <p className="text-zinc-400 text-lg mb-2">Inga dokument ännu</p>
                  <p className="text-zinc-500 text-sm mb-6">Skapa ditt första dokument från en mall</p>
                  <button
                    onClick={startCreate}
                    className="px-5 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-xl text-sm font-medium"
                  >
                    <Plus className="w-4 h-4 inline mr-2" /> Nytt dokument
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredDocuments.map(doc => (
                    <div
                      key={doc.id}
                      className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-all group"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 bg-violet-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                          {doc.template?.category ? getCategoryIcon(doc.template.category.icon, 'w-5 h-5 text-violet-400') : <FileText className="w-5 h-5 text-violet-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="text-sm font-medium text-white truncate">{doc.title}</h3>
                            {getStatusBadge(doc.status)}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
                            {doc.template && (
                              <span className="flex items-center gap-1">
                                <FileText className="w-3 h-3" /> {doc.template.name}
                              </span>
                            )}
                            {doc.customer && (
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" /> {doc.customer.name}
                              </span>
                            )}
                            {doc.project && (
                              <span className="flex items-center gap-1">
                                <FolderKanban className="w-3 h-3" /> {doc.project.name}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> {new Date(doc.created_at).toLocaleDateString('sv-SE')}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => viewDocument(doc)}
                            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"
                            title="Förhandsgranska"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {doc.status === 'draft' && (
                            <button
                              onClick={() => openEdit(doc)}
                              className="p-2 text-zinc-400 hover:text-violet-400 hover:bg-zinc-800 rounded-lg transition-all"
                              title="Redigera"
                            >
                              <PenTool className="w-4 h-4" />
                            </button>
                          )}
                          {(doc.status === 'draft' || doc.status === 'completed') && (
                            <button
                              onClick={() => openSign(doc)}
                              className="p-2 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800 rounded-lg transition-all"
                              title="Signera"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setContextMenu({ docId: doc.id, x: e.clientX, y: e.clientY })
                            }}
                            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              /* Templates grid */
              filteredTemplates.length === 0 ? (
                <div className="text-center py-16">
                  <FileText className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                  <p className="text-zinc-400">Inga mallar hittades</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filteredTemplates.map(tpl => (
                    <div
                      key={tpl.id}
                      className="bg-zinc-900/50 backdrop-blur-xl border border-zinc-800 rounded-xl p-5 hover:border-violet-500/50 transition-all group cursor-pointer"
                      onClick={() => { selectTemplate(tpl); setShowCreate(true) }}
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-10 h-10 bg-violet-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                          {tpl.category ? getCategoryIcon(tpl.category.icon, 'w-5 h-5 text-violet-400') : <FileText className="w-5 h-5 text-violet-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-white mb-0.5">{tpl.name}</h3>
                          <p className="text-xs text-zinc-500">{tpl.category?.name}</p>
                        </div>
                        {tpl.is_system ? (
                          <span className="px-2 py-0.5 bg-violet-500/10 text-violet-400 text-xs rounded-full">System</span>
                        ) : (
                          <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 text-xs rounded-full">Egen</span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 mb-3 line-clamp-2">{tpl.description}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-600">{(tpl.variables || []).filter((v: any) => v.source === 'input').length} fält att fylla i</span>
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); duplicateTemplate(tpl) }}
                            className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                            title="Kopiera mall"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-violet-400 transition-colors" />
                        </div>
                      </div>
                      {tpl.branch && (
                        <div className="mt-2 pt-2 border-t border-zinc-800">
                          <span className="text-xs text-zinc-600">
                            {tpl.branch === 'electrician' ? 'Elektriker' :
                             tpl.branch === 'plumber' ? 'Rörmokare' :
                             tpl.branch === 'carpenter' ? 'Snickare' :
                             tpl.branch === 'painter' ? 'Målare' : tpl.branch}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* ==========================================
          Create Wizard Modal
          ========================================== */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Wizard header */}
            <div className="flex items-center justify-between p-6 border-b border-zinc-800">
              <div>
                <h2 className="text-lg font-semibold">
                  {wizardStep === 1 ? 'Välj mall' : wizardStep === 2 ? 'Välj kund & projekt' : 'Fyll i uppgifter'}
                </h2>
                <div className="flex items-center gap-2 mt-2">
                  {[1, 2, 3].map(step => (
                    <div key={step} className={`h-1.5 rounded-full transition-all ${
                      step <= wizardStep ? 'w-12 bg-violet-500' : 'w-8 bg-zinc-700'
                    }`} />
                  ))}
                </div>
              </div>
              <button onClick={() => setShowCreate(false)} className="p-2 text-zinc-400 hover:text-white rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {/* Step 1: Choose template */}
              {wizardStep === 1 && (
                <div className="space-y-3">
                  {categories.map(cat => {
                    const catTemplates = templates.filter(t => t.category_id === cat.id)
                    if (catTemplates.length === 0) return null
                    return (
                      <div key={cat.id}>
                        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">{cat.name}</h3>
                        <div className="space-y-2">
                          {catTemplates.map(tpl => (
                            <button
                              key={tpl.id}
                              onClick={() => selectTemplate(tpl)}
                              className="w-full flex items-center gap-3 p-3 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-800 hover:border-violet-500/50 rounded-xl text-left transition-all"
                            >
                              {getCategoryIcon(cat.icon, 'w-5 h-5 text-violet-400')}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-white">{tpl.name}</p>
                                <p className="text-xs text-zinc-500 truncate">{tpl.description}</p>
                              </div>
                              {tpl.branch && <span className="text-xs text-zinc-600 px-2 py-0.5 bg-zinc-900 rounded-full">{
                                tpl.branch === 'electrician' ? 'El' :
                                tpl.branch === 'plumber' ? 'VVS' :
                                tpl.branch === 'carpenter' ? 'Bygg' :
                                tpl.branch === 'painter' ? 'Måleri' : tpl.branch
                              }</span>}
                              <ChevronRight className="w-4 h-4 text-zinc-600" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Step 2: Customer & Project */}
              {wizardStep === 2 && selectedTemplate && (
                <div className="space-y-5">
                  <div>
                    <label className="text-sm text-zinc-400 mb-1.5 block">Dokumenttitel</label>
                    <input
                      type="text"
                      value={createTitle}
                      onChange={e => setCreateTitle(e.target.value)}
                      className="w-full px-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-zinc-400 mb-1.5 block">Kund (valfritt)</label>
                    <select
                      value={createCustomerId}
                      onChange={e => setCreateCustomerId(e.target.value)}
                      className="w-full px-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500"
                    >
                      <option value="">Ingen kund vald</option>
                      {customers.map(c => (
                        <option key={c.customer_id} value={c.customer_id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-zinc-400 mb-1.5 block">Projekt (valfritt)</label>
                    <select
                      value={createProjectId}
                      onChange={e => setCreateProjectId(e.target.value)}
                      className="w-full px-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500"
                    >
                      <option value="">Inget projekt valt</option>
                      {projects.map(p => (
                        <option key={p.project_id} value={p.project_id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => setWizardStep(1)}
                      className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm text-zinc-300 transition-all"
                    >
                      <ArrowLeft className="w-4 h-4 inline mr-1" /> Tillbaka
                    </button>
                    <button
                      onClick={() => setWizardStep(3)}
                      className="flex-1 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-xl text-sm font-medium transition-all"
                    >
                      Nästa <ChevronRight className="w-4 h-4 inline ml-1" />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Fill variables */}
              {wizardStep === 3 && selectedTemplate && (
                <div className="space-y-5">
                  {/* Only show input variables */}
                  {(selectedTemplate.variables || [])
                    .filter((v: TemplateVariable) => v.source === 'input')
                    .map((v: TemplateVariable) => (
                      <div key={v.key}>
                        <label className="text-sm text-zinc-400 mb-1.5 block">{v.label}</label>
                        {v.input_type === 'textarea' ? (
                          <textarea
                            value={variableValues[v.key] || ''}
                            onChange={e => setVariableValues(prev => ({ ...prev, [v.key]: e.target.value }))}
                            rows={3}
                            className="w-full px-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500 resize-none"
                          />
                        ) : v.input_type === 'checkbox' ? (
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={variableValues[v.key] || false}
                              onChange={e => setVariableValues(prev => ({ ...prev, [v.key]: e.target.checked }))}
                              className="w-4 h-4 accent-violet-500"
                            />
                            <span className="text-sm text-zinc-300">{v.label}</span>
                          </label>
                        ) : v.input_type === 'select' && v.options ? (
                          <select
                            value={variableValues[v.key] || ''}
                            onChange={e => setVariableValues(prev => ({ ...prev, [v.key]: e.target.value }))}
                            className="w-full px-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500"
                          >
                            <option value="">Välj...</option>
                            {v.options.map(opt => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={v.input_type === 'date' ? 'date' : 'text'}
                            value={variableValues[v.key] || ''}
                            onChange={e => setVariableValues(prev => ({ ...prev, [v.key]: e.target.value }))}
                            className="w-full px-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500"
                          />
                        )}
                      </div>
                    ))}

                  <div className="flex gap-3 pt-4">
                    <button
                      onClick={() => setWizardStep(2)}
                      className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm text-zinc-300 transition-all"
                    >
                      <ArrowLeft className="w-4 h-4 inline mr-1" /> Tillbaka
                    </button>
                    <button
                      onClick={createDocument}
                      disabled={creating}
                      className="flex-1 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
                    >
                      {creating ? <Loader2 className="w-4 h-4 inline animate-spin mr-2" /> : <Plus className="w-4 h-4 inline mr-2" />}
                      Skapa dokument
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          Document Viewer Modal
          ========================================== */}
      {viewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <h2 className="text-lg font-semibold">{viewDoc.title}</h2>
              <div className="flex items-center gap-2">
                {getStatusBadge(viewDoc.status)}
                <button onClick={() => setViewDoc(null)} className="p-2 text-zinc-400 hover:text-white rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loadingHtml ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
                </div>
              ) : (
                <div className="bg-white rounded-xl overflow-hidden">
                  <iframe
                    srcDoc={viewHtml}
                    className="w-full min-h-[600px] border-0"
                    title="Document preview"
                  />
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 p-4 border-t border-zinc-800">
              {viewDoc.status === 'draft' && (
                <button
                  onClick={() => { setViewDoc(null); openEdit(viewDoc) }}
                  className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-medium transition-all"
                >
                  <PenTool className="w-4 h-4 inline mr-2" /> Redigera
                </button>
              )}
              {(viewDoc.status === 'draft' || viewDoc.status === 'completed') && (
                <button
                  onClick={() => { setViewDoc(null); openSign(viewDoc) }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-medium transition-all"
                >
                  <Check className="w-4 h-4 inline mr-2" /> Signera
                </button>
              )}
              <button
                onClick={() => {
                  const blob = new Blob([viewHtml], { type: 'text/html' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `${viewDoc.title || 'dokument'}.html`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm text-zinc-300 transition-all"
              >
                <Download className="w-4 h-4 inline mr-2" /> Ladda ner HTML
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          Edit Document Modal
          ========================================== */}
      {editDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-zinc-800">
              <h2 className="text-lg font-semibold">Redigera: {editDoc.title}</h2>
              <button onClick={() => setEditDoc(null)} className="p-2 text-zinc-400 hover:text-white rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Show all variable fields */}
              {editDoc.template && (editDoc.content || []).map((section: any, idx: number) => {
                if (section.type === 'header') return null
                if (section.type === 'signatures') return null
                return (
                  <div key={idx}>
                    {section.title && <h3 className="text-sm font-medium text-violet-400 mb-3">{section.title}</h3>}
                    {section.fields?.map((field: any) => (
                      <div key={field.variable} className="mb-3">
                        <label className="text-xs text-zinc-400 mb-1 block">{field.label}</label>
                        {field.type === 'textarea' ? (
                          <textarea
                            value={editVars[field.variable] || ''}
                            onChange={e => setEditVars(prev => ({ ...prev, [field.variable]: e.target.value }))}
                            rows={2}
                            className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-violet-500 resize-none"
                          />
                        ) : field.type === 'checkbox' ? (
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editVars[field.variable] || false}
                              onChange={e => setEditVars(prev => ({ ...prev, [field.variable]: e.target.checked }))}
                              className="w-4 h-4 accent-violet-500"
                            />
                            <span className="text-sm text-zinc-300">{field.label}</span>
                          </label>
                        ) : (
                          <input
                            type="text"
                            value={editVars[field.variable] || ''}
                            onChange={e => setEditVars(prev => ({ ...prev, [field.variable]: e.target.value }))}
                            className="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-violet-500"
                          />
                        )}
                      </div>
                    ))}
                    {section.items?.map((item: any) => (
                      <label key={item.variable} className="flex items-center gap-2 cursor-pointer mb-2">
                        <input
                          type="checkbox"
                          checked={editVars[item.variable] || false}
                          onChange={e => setEditVars(prev => ({ ...prev, [item.variable]: e.target.checked }))}
                          className="w-4 h-4 accent-violet-500"
                        />
                        <span className="text-sm text-zinc-300">{item.text}</span>
                      </label>
                    ))}
                  </div>
                )
              })}
            </div>
            <div className="flex gap-3 p-6 border-t border-zinc-800">
              <button
                onClick={saveDocument}
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 inline animate-spin mr-2" /> : null}
                Spara utkast
              </button>
              <button
                onClick={markComplete}
                disabled={saving}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4 inline mr-2" /> Markera klar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          Sign Document Modal
          ========================================== */}
      {signDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-zinc-800">
              <h2 className="text-lg font-semibold">Signera dokument</h2>
              <button onClick={() => setSignDoc(null)} className="p-2 text-zinc-400 hover:text-white rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-zinc-400">{signDoc.title}</p>
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Namn</label>
                <input
                  type="text"
                  value={signName}
                  onChange={e => setSignName(e.target.value)}
                  placeholder="Ditt namn"
                  className="w-full px-4 py-2.5 bg-zinc-800/50 border border-zinc-700 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500"
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1.5 block">Signatur</label>
                <div className="relative border border-zinc-700 rounded-xl overflow-hidden bg-zinc-800/50">
                  <canvas
                    ref={canvasRef}
                    className="w-full h-32 cursor-crosshair touch-none"
                    onMouseDown={startDraw}
                    onMouseMove={draw}
                    onMouseUp={endDraw}
                    onMouseLeave={endDraw}
                    onTouchStart={startDraw}
                    onTouchMove={draw}
                    onTouchEnd={endDraw}
                  />
                  <button
                    onClick={clearCanvas}
                    className="absolute top-2 right-2 px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 rounded-lg text-zinc-300"
                  >
                    Rensa
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-zinc-800">
              <button
                onClick={() => setSignDoc(null)}
                className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm text-zinc-300 transition-all"
              >
                Avbryt
              </button>
              <button
                onClick={submitSignature}
                disabled={!signName || signing}
                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
              >
                {signing ? <Loader2 className="w-4 h-4 inline animate-spin mr-2" /> : <PenTool className="w-4 h-4 inline mr-2" />}
                Signera
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-[60] bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            onClick={() => {
              const doc = documents.find(d => d.id === contextMenu.docId)
              if (doc) viewDocument(doc)
              setContextMenu(null)
            }}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-all"
          >
            <Eye className="w-4 h-4" /> Förhandsgranska
          </button>
          <button
            onClick={() => {
              const doc = documents.find(d => d.id === contextMenu.docId)
              if (doc) openEdit(doc)
              setContextMenu(null)
            }}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 transition-all"
          >
            <PenTool className="w-4 h-4" /> Redigera
          </button>
          <div className="border-t border-zinc-800 my-1" />
          <button
            onClick={() => deleteDocument(contextMenu.docId)}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-zinc-800 transition-all"
          >
            <Trash2 className="w-4 h-4" /> Ta bort
          </button>
        </div>
      )}

      {/* Toast */}
      {toast.show && (
        <div className={`fixed bottom-6 right-6 z-[70] px-5 py-3 rounded-xl shadow-xl text-sm font-medium ${
          toast.type === 'success'
            ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300'
            : 'bg-red-500/20 border border-red-500/30 text-red-300'
        }`}>
          {toast.type === 'success' ? <Check className="w-4 h-4 inline mr-2" /> : <AlertCircle className="w-4 h-4 inline mr-2" />}
          {toast.message}
        </div>
      )}
    </div>
  )
}
