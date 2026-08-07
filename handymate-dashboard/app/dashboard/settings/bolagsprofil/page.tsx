'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Calendar, Check, Loader2 } from 'lucide-react'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import { useToast } from '@/components/Toast'
import { checkOrgNumber } from '@/lib/karin/org-number'

/**
 * Inställningar → Bolagsprofil (2026-08-07).
 *
 * ═══ VARFÖR SIDAN FINNS ═══
 *
 * Varje datum i Karins bolagskalender räknas ur de här fälten. Utan en väg
 * att rätta dem hade kalendern varit ett påstående utan invändning — och det
 * första hantverkaren gör när en deadline ser fel ut är att vilja rätta den,
 * inte att lita på den.
 *
 * ═══ ÄGARE OCH ADMINISTRATÖR ═══
 *
 * Samma tre lager som internal-costs: länken döljs i inställningshubben,
 * sidan redirectar, och API:et 403:ar. Admin är i praktiken ofta den som
 * sköter böckerna, så gränsen går där och inte snävare.
 *
 * ═══ HÄRNÄST ═══
 *
 * Här hör ägarens EGNA händelser och återkommande kostnader hemma —
 * försäkringar som förnyas, leasing som löper ut, abonnemang. Kalenderns
 * `CalendarEvent` bär redan `source: 'egen' | 'kostnad'`, så det blir ett
 * tillägg och inte en ombyggnad.
 */

interface Profil {
  business_name: string | null
  org_number: string | null
  company_form: string | null
  fiscal_year_end_month: number | null
  vat_period: string | null
  is_employer: boolean | null
  employee_count: number | null
  f_skatt_registered: boolean | null
  accounting_firm: string | null
  accounting_contact: string | null
  company_profile_source: string | null
}

const FORMER = [
  { v: 'ab', l: 'Aktiebolag' },
  { v: 'ef', l: 'Enskild firma' },
  { v: 'hb', l: 'Handelsbolag' },
  { v: 'kb', l: 'Kommanditbolag' },
  { v: 'ekonomisk_forening', l: 'Ekonomisk förening' },
  { v: 'annat', l: 'Annat' },
]

const MOMSPERIODER = [
  { v: 'quarter', l: 'Varje kvartal' },
  { v: 'month', l: 'Varje månad' },
  { v: 'year', l: 'En gång om året' },
  { v: 'none', l: 'Inte momsregistrerad' },
]

const MANADER = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
]

const FALT_CLS =
  'w-full min-h-[44px] px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-primary-600'

export default function BolagsprofilPage() {
  const router = useRouter()
  const toast = useToast()
  const { isOwnerOrAdmin, loading: userLoading } = useCurrentUser()

  const [profil, setProfil] = useState<Profil | null>(null)
  const [laddar, setLaddar] = useState(true)
  const [sparar, setSparar] = useState(false)
  const [orgFel, setOrgFel] = useState('')

  useEffect(() => {
    if (!userLoading && !isOwnerOrAdmin) router.replace('/dashboard/settings')
  }, [userLoading, isOwnerOrAdmin, router])

  const hamta = useCallback(async () => {
    try {
      const res = await fetch('/api/business-config/company-profile')
      if (!res.ok) throw new Error(String(res.status))
      const d = await res.json()
      setProfil(d.profile)
    } catch {
      toast.error('Kunde inte hämta företagsuppgifterna')
    } finally {
      setLaddar(false)
    }
  }, [toast])

  useEffect(() => { void hamta() }, [hamta])

  const satt = (patch: Partial<Profil>) => setProfil(p => (p ? { ...p, ...patch } : p))

  async function spara() {
    if (!profil) return
    if (profil.org_number) {
      const k = checkOrgNumber(profil.org_number)
      if (!k.valid) {
        setOrgFel(k.error)
        return
      }
    }
    setOrgFel('')
    setSparar(true)
    try {
      const res = await fetch('/api/business-config/company-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profil),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) throw new Error(d?.error || 'fel')
      toast.success('Sparat — Karin räknar om kalendern')
    } catch (e: any) {
      toast.error(e?.message || 'Kunde inte spara')
    } finally {
      setSparar(false)
    }
  }

  if (userLoading || !isOwnerOrAdmin || laddar) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
      </div>
    )
  }

  if (!profil) return null

  const arAB = profil.company_form === 'ab'

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/settings" className="text-slate-400 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 m-0">Bolagsprofil</h1>
          <p className="text-slate-500 text-sm m-0">
            Uppgifterna Karin räknar dina myndighetsdatum ur
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-5">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Organisationsnummer</label>
          <input
            value={profil.org_number || ''}
            onChange={e => { satt({ org_number: e.target.value }); setOrgFel('') }}
            placeholder="556677-8899"
            className={FALT_CLS}
          />
          {orgFel && <p className="text-[13px] text-amber-700 mt-1.5 m-0">{orgFel}</p>}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Bolagsform</label>
          <select
            value={profil.company_form || ''}
            onChange={e => satt({ company_form: e.target.value || null })}
            className={FALT_CLS}
          >
            <option value="">Välj…</option>
            {FORMER.map(f => <option key={f.v} value={f.v}>{f.l}</option>)}
          </select>
          {arAB && (
            <p className="text-xs text-slate-400 mt-1.5 m-0">
              Aktiebolag ska lämna årsredovisning och hålla årsstämma — Karin lägger in båda.
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">Momsperiod</label>
          <select
            value={profil.vat_period || ''}
            onChange={e => satt({ vat_period: e.target.value || null })}
            className={FALT_CLS}
          >
            <option value="">Välj…</option>
            {MOMSPERIODER.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
          <p className="text-xs text-slate-400 mt-1.5 m-0">
            Den här styr både hur ofta och vilket datum momsdeklarationen ska in.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1.5">
            Räkenskapsårets sista månad
          </label>
          <select
            value={profil.fiscal_year_end_month ?? ''}
            onChange={e => satt({ fiscal_year_end_month: e.target.value ? Number(e.target.value) : null })}
            className={FALT_CLS}
          >
            <option value="">Välj…</option>
            {MANADER.map((m, i) => (
              <option key={m} value={i + 1}>{m}{i === 11 ? ' (kalenderår)' : ''}</option>
            ))}
          </select>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <span className="block text-xs font-medium text-slate-500 mb-1.5">Betalar du ut lön?</span>
            <div className="flex gap-2">
              {[{ v: true, l: 'Ja' }, { v: false, l: 'Nej' }].map(o => (
                <button
                  key={String(o.v)}
                  type="button"
                  onClick={() => satt({ is_employer: o.v })}
                  className={`min-h-[44px] px-4 rounded-xl text-sm font-medium border transition-colors ${
                    profil.is_employer === o.v
                      ? 'bg-primary-50 border-primary-700 text-primary-800'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block text-xs font-medium text-slate-500 mb-1.5">Godkänd för F-skatt?</span>
            <div className="flex gap-2">
              {[{ v: true, l: 'Ja' }, { v: false, l: 'Nej' }].map(o => (
                <button
                  key={String(o.v)}
                  type="button"
                  onClick={() => satt({ f_skatt_registered: o.v })}
                  className={`min-h-[44px] px-4 rounded-xl text-sm font-medium border transition-colors ${
                    profil.f_skatt_registered === o.v
                      ? 'bg-primary-50 border-primary-700 text-primary-800'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Redovisningsbyrå</label>
            <input
              value={profil.accounting_firm || ''}
              onChange={e => satt({ accounting_firm: e.target.value })}
              placeholder="Namn på byrån"
              className={FALT_CLS}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Kontaktperson</label>
            <input
              value={profil.accounting_contact || ''}
              onChange={e => satt({ accounting_contact: e.target.value })}
              placeholder="Namn eller telefon"
              className={FALT_CLS}
            />
          </div>
        </div>
        <p className="text-xs text-slate-400 m-0 -mt-2">
          När Karin är osäker på ett datum hänvisar hon hit i stället för att gissa.
        </p>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => void spara()}
            disabled={sparar}
            className="inline-flex items-center gap-2 h-11 px-5 bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60"
          >
            {sparar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Spara
          </button>
          <Link
            href="/dashboard/karin"
            className="inline-flex items-center gap-2 h-11 px-4 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
          >
            <Calendar className="w-4 h-4" />
            Till kalendern
          </Link>
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-400 leading-relaxed">
        Karin är ett beslutsstöd, inte skatterådgivning. Hon räknar datumen ur uppgifterna
        ovan och visar alltid varför — stämmer något inte, ändra här så räknas kalendern om.
      </p>
    </div>
  )
}
