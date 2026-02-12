'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Zap,
  Plus,
  Loader2,
  Check,
  Copy,
  Building2,
  User,
  Phone,
  Mail,
  MapPin,
  RefreshCw,
  LogIn,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle
} from 'lucide-react'

const BRANCHES = [
  { value: 'electrician', label: 'Elektriker' },
  { value: 'plumber', label: 'Rörmokare' },
  { value: 'carpenter', label: 'Snickare' },
  { value: 'painter', label: 'Målare' },
  { value: 'hvac', label: 'VVS' },
  { value: 'locksmith', label: 'Låssmed' },
  { value: 'cleaning', label: 'Städ' },
  { value: 'other', label: 'Annat' },
]

interface Pilot {
  businessId: string
  businessName: string
  contactName: string
  contactEmail: string
  phone: string
  branch: string
  serviceArea: string | null
  assignedPhoneNumber: string | null
  subscriptionStatus: string
  subscriptionPlan: string
  trialEndsAt: string | null
  isPilot: boolean
  createdAt: string
  onboardingCompleted: boolean
  callMode: string
  userEmail: string
}

interface CreateResult {
  success: boolean
  businessId: string
  email: string
  password: string
  assignedPhoneNumber: string | null
  phoneError: string | null
  message: string
}

export default function AdminOnboardPage() {
  const router = useRouter()
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [copied, setCopied] = useState(false)

  const [pilots, setPilots] = useState<Pilot[]>([])
  const [stats, setStats] = useState<any>(null)
  const [createResult, setCreateResult] = useState<CreateResult | null>(null)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    businessName: '',
    contactName: '',
    phone: '',
    email: '',
    branch: 'electrician',
    serviceArea: '',
  })

  // Check admin status on mount
  useEffect(() => {
    checkAdmin()
  }, [])

  async function checkAdmin() {
    try {
      const response = await fetch('/api/admin/pilots')
      if (response.status === 403) {
        setIsAdmin(false)
        router.push('/login?error=admin_required')
        return
      }
      if (response.ok) {
        setIsAdmin(true)
        const data = await response.json()
        setPilots(data.pilots || [])
        setStats(data.stats || null)
      }
    } catch (err) {
      console.error('Admin check error:', err)
      setIsAdmin(false)
    }
    setLoading(false)
  }

  async function fetchPilots() {
    setRefreshing(true)
    try {
      const response = await fetch('/api/admin/pilots')
      if (response.ok) {
        const data = await response.json()
        setPilots(data.pilots || [])
        setStats(data.stats || null)
      }
    } catch (err) {
      console.error('Fetch pilots error:', err)
    }
    setRefreshing(false)
  }

  const formatPhoneNumber = (value: string) => {
    let digits = value.replace(/\D/g, '')
    if (digits.startsWith('0')) {
      digits = '46' + digits.substring(1)
    }
    if (!digits.startsWith('46') && digits.length > 0) {
      digits = '46' + digits
    }
    if (digits.length === 0) return ''
    if (digits.length <= 2) return '+' + digits
    if (digits.length <= 4) return '+' + digits.substring(0, 2) + ' ' + digits.substring(2)
    if (digits.length <= 7) return '+' + digits.substring(0, 2) + ' ' + digits.substring(2, 4) + ' ' + digits.substring(4)
    return '+' + digits.substring(0, 2) + ' ' + digits.substring(2, 4) + ' ' + digits.substring(4, 7) + ' ' + digits.substring(7, 9) + ' ' + digits.substring(9, 11)
  }

  const getCleanPhone = (phone: string) => {
    return '+' + phone.replace(/\D/g, '')
  }

  const handleCreate = async () => {
    setError('')
    setCreateResult(null)

    if (!form.businessName || !form.contactName || !form.phone || !form.email || !form.branch) {
      setError('Alla obligatoriska fält måste fyllas i')
      return
    }

    const cleanPhone = getCleanPhone(form.phone)
    if (cleanPhone.length < 12) {
      setError('Ange ett giltigt telefonnummer')
      return
    }

    setCreating(true)

    try {
      const response = await fetch('/api/admin/create-pilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: form.businessName,
          contactName: form.contactName,
          phone: cleanPhone,
          email: form.email,
          branch: form.branch,
          serviceArea: form.serviceArea || null,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Kunde inte skapa pilot')
      }

      setCreateResult(result)
      setForm({
        businessName: '',
        contactName: '',
        phone: '',
        email: '',
        branch: 'electrician',
        serviceArea: '',
      })
      fetchPilots()

    } catch (err: any) {
      setError(err.message)
    }

    setCreating(false)
  }

  const handleImpersonate = async (businessId: string) => {
    try {
      const response = await fetch(`/api/admin/impersonate/${businessId}`, {
        method: 'POST',
      })

      const result = await response.json()

      if (!response.ok) {
        alert(result.error || 'Kunde inte logga in som användare')
        return
      }

      if (result.method === 'token' && result.impersonationUrl) {
        window.open(result.impersonationUrl, '_blank')
      } else {
        alert(`Logga in manuellt med: ${result.userEmail}`)
      }
    } catch (err) {
      console.error('Impersonate error:', err)
      alert('Något gick fel')
    }
  }

  const generatePilotMessage = () => {
    if (!createResult) return ''

    const branchLabel = BRANCHES.find(b => b.value === form.branch)?.label || form.branch

    return `Hej ${createResult.email?.split('@')[0] || 'där'}!

Välkommen till Handymate! Här är dina inloggningsuppgifter:

🔐 INLOGGNING
Webbadress: https://handymate-dashboard.vercel.app
E-post: ${createResult.email}
Lösenord: ${createResult.password}

${createResult.assignedPhoneNumber ? `📞 DITT HANDYMATE-NUMMER
${createResult.assignedPhoneNumber}

Detta är numret dina kunder ska ringa. AI-assistenten svarar och bokar jobb åt dig.

📲 STÄLL IN VIDAREKOPPLING
För att koppla samtal till din mobil när AI:n inte hinner svara, ställ in vidarekoppling vid "ej svar" hos din operatör:

Telia: Ring **61*${createResult.assignedPhoneNumber.replace(/\s/g, '')}#
Tele2: Ring **61*${createResult.assignedPhoneNumber.replace(/\s/g, '')}#
Tre: Ring **61*${createResult.assignedPhoneNumber.replace(/\s/g, '')}#
Telenor: Ring **61*${createResult.assignedPhoneNumber.replace(/\s/g, '')}#

Kontakta din operatör om du behöver hjälp.` : '(Telefonnummer kunde inte skapas automatiskt - vi fixar det!)'}

Din provperiod är på 14 dagar. Har du frågor? Svara på detta meddelande!

/Handymate-teamet`
  }

  const copyToClipboard = async () => {
    const message = generatePilotMessage()
    await navigator.clipboard.writeText(message)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const getStatusBadge = (pilot: Pilot) => {
    const now = new Date()
    const trialEnd = pilot.trialEndsAt ? new Date(pilot.trialEndsAt) : null

    if (pilot.subscriptionStatus === 'active') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-emerald-100 text-emerald-600 border border-emerald-500/30">
          <CheckCircle className="w-3 h-3" />
          Aktiv
        </span>
      )
    }

    if (trialEnd && trialEnd < now) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-red-100 text-red-600 border border-red-500/30">
          <XCircle className="w-3 h-3" />
          Trial utgången
        </span>
      )
    }

    if (!pilot.assignedPhoneNumber) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
          <AlertCircle className="w-3 h-3" />
          Ej konfigurerat
        </span>
      )
    }

    if (pilot.subscriptionStatus === 'trial') {
      const daysLeft = trialEnd ? Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : 0
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
          <Clock className="w-3 h-3" />
          Trial ({daysLeft}d)
        </span>
      )
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-500 border border-gray-300">
        {pilot.subscriptionStatus}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Åtkomst nekad</h1>
          <p className="text-gray-500">Du har inte admin-behörighet.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-50 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Admin - Pilot Onboarding</h1>
              <p className="text-gray-500">Skapa och hantera pilotkonton</p>
            </div>
          </div>

          {stats && (
            <div className="hidden sm:flex items-center gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                <p className="text-xs text-gray-400">Totalt</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-400">{stats.trial}</p>
                <p className="text-xs text-gray-400">Trial</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-emerald-600">{stats.active}</p>
                <p className="text-xs text-gray-400">Aktiva</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{stats.withPhone}</p>
                <p className="text-xs text-gray-400">Med nummer</p>
              </div>
            </div>
          )}
        </div>

        {/* Create Form */}
        <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5 text-blue-600" />
            Onboarda ny pilot
          </h2>

          {/* Success Result */}
          {createResult && createResult.success && (
            <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <Check className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="font-medium text-emerald-600">Konto skapat!</p>
                  <div className="mt-2 space-y-1 text-sm">
                    <p className="text-gray-700">E-post: <code className="text-gray-900 bg-gray-100 px-1 rounded">{createResult.email}</code></p>
                    <p className="text-gray-700">Lösenord: <code className="text-gray-900 bg-gray-100 px-1 rounded">{createResult.password}</code></p>
                    {createResult.assignedPhoneNumber && (
                      <p className="text-gray-700">Telefonnummer: <code className="text-gray-900 bg-gray-100 px-1 rounded">{createResult.assignedPhoneNumber}</code></p>
                    )}
                    {createResult.phoneError && (
                      <p className="text-amber-400">OBS: {createResult.phoneError}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Copy message block */}
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-gray-500">Meddelande till piloten:</p>
                  <button
                    onClick={copyToClipboard}
                    className="flex items-center gap-1 px-3 py-1 text-sm text-blue-600 hover:text-blue-500 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4" />
                        Kopierat!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Kopiera
                      </>
                    )}
                  </button>
                </div>
                <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono bg-white rounded p-3 max-h-48 overflow-y-auto">
                  {generatePilotMessage()}
                </pre>
              </div>

              <button
                onClick={() => setCreateResult(null)}
                className="mt-4 text-sm text-gray-500 hover:text-gray-900"
              >
                Skapa en till →
              </button>
            </div>
          )}

          {/* Form */}
          {!createResult && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <Building2 className="w-4 h-4" />
                  Företagsnamn *
                </label>
                <input
                  type="text"
                  value={form.businessName}
                  onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                  placeholder="Elexperten Stockholm AB"
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <User className="w-4 h-4" />
                  Kontaktperson *
                </label>
                <input
                  type="text"
                  value={form.contactName}
                  onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                  placeholder="Johan Svensson"
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <Phone className="w-4 h-4" />
                  Mobilnummer *
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: formatPhoneNumber(e.target.value) })}
                  placeholder="+46 70 123 45 67"
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <Mail className="w-4 h-4" />
                  E-post *
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="johan@foretag.se"
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              <div>
                <label className="text-sm text-gray-500 mb-2 block">
                  Bransch *
                </label>
                <select
                  value={form.branch}
                  onChange={(e) => setForm({ ...form, branch: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  {BRANCHES.map(b => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <MapPin className="w-4 h-4" />
                  Tjänsteområde
                </label>
                <input
                  type="text"
                  value={form.serviceArea}
                  onChange={(e) => setForm({ ...form, serviceArea: e.target.value })}
                  placeholder="Stockholm, Solna, Sundbyberg"
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              <div className="md:col-span-2">
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="w-full py-4 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-semibold text-white hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {creating ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Skapar konto...
                    </>
                  ) : (
                    <>
                      <Plus className="w-5 h-5" />
                      Skapa konto
                    </>
                  )}
                </button>
              </div>

              {error && (
                <div className="md:col-span-2 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-600 text-sm">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pilots List */}
        <div className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Alla piloter ({pilots.length})</h2>
            <button
              onClick={fetchPilots}
              disabled={refreshing}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Uppdatera
            </button>
          </div>

          {pilots.length === 0 ? (
            <div className="p-12 text-center">
              <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">Inga piloter ännu</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-100/30">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Företag</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Kontakt</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Mobil</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">AI-nummer</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Skapad</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Åtgärd</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {pilots.map((pilot) => (
                    <tr key={pilot.businessId} className="hover:bg-gray-100/30 transition-colors">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-900">{pilot.businessName}</p>
                          <p className="text-xs text-gray-400">{pilot.branch}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-gray-900">{pilot.contactName}</p>
                          <p className="text-xs text-gray-400">{pilot.contactEmail}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-sm">
                        {pilot.phone}
                      </td>
                      <td className="px-4 py-3">
                        {pilot.assignedPhoneNumber ? (
                          <code className="text-sm text-blue-600 bg-blue-50 px-2 py-1 rounded">
                            {pilot.assignedPhoneNumber}
                          </code>
                        ) : (
                          <span className="text-gray-400 text-sm">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(pilot)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-sm">
                        {new Date(pilot.createdAt).toLocaleDateString('sv-SE')}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleImpersonate(pilot.businessId)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-500 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                        >
                          <LogIn className="w-3 h-3" />
                          Logga in som
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
