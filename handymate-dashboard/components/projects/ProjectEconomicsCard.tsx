'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import { ProjectCostModal } from './ProjectCostModal'
import { MarginalCard } from './economy/MarginalCard'
import { HeroKpi } from './economy/HeroKpi'
import { IntaktCard } from './economy/IntaktCard'
import { KostnadCard } from './economy/KostnadCard'
import { FaktureringsstatusCard } from './economy/FaktureringsstatusCard'
import { AtaCard } from './economy/AtaCard'
import { EfterkalkylCard } from './economy/EfterkalkylCard'

/**
 * ProjectEconomicsCard (Etapp 2.2, v53 2026-05-21).
 *
 * Self-contained ekonomi-vy för ett projekt. Fetchar från
 * /api/projects/[id]/profitability (som backendmässigt kallar
 * computeProjectEconomics från lib/projects/compute-economics.ts).
 *
 * Designkontrakt: tar bara projectId + onRefreshExternal som props.
 * Inga andra externa state-beroenden. Kan placeras var som helst —
 * överlever Etapp 4 meny-redesign.
 *
 * Kritiskt: om arbetskostnad_konfigurerad = false visas ALDRIG marginal-
 * siffra. Istället en CTA till inställningar (endast owner/admin).
 * Detta förhindrar falskt hög marginal när intern timkostnad saknas.
 */

interface ProjectEconomics {
  project_id: string
  business_id: string
  intakter: {
    budget_amount: number
    ata_signerat_kr: number
    ata_pending_kr: number
    fakturerat_kr: number
    betalt_kr: number
    forvantad_intakt_kr: number
  }
  kostnader: {
    arbete_kr: number | null
    arbete_timmar: number
    material_inkop_kr: number
    material_billable_kr: number
    extra_kr: number
    extra_per_kategori: Record<string, number>
    total_kr: number | null
  }
  marginal: {
    arbetskostnad_konfigurerad: boolean
    timrader_utan_kostnad: number
    marginal_kr: number | null
    marginal_pct: number | null
    är_tomt: boolean
    kostnad_sannolikt_komplett: boolean
    kostnad_completeness_pct: number | null
  }
  meta: {
    computed_at: string
    invoice_count: number
    ata_count: number
    time_entry_count: number
    supplier_invoice_count: number
    extra_cost_count: number
  }
}

interface ProjectEconomicsCardProps {
  projectId: string
  /** Externt-triggad refresh — när parent ändrar något som påverkar
      ekonomin (t.ex. statusbyte eller ny tid) öka denna. */
  refreshKey?: number
  /** Triggas när användaren klickar 'Fakturera projekt' (kvar att
      fakturera > 0). Parent ansvarar för att öppna faktura-modal/-route. */
  onInvoiceProject?: () => void
}

export function ProjectEconomicsCard({ projectId, refreshKey = 0, onInvoiceProject }: ProjectEconomicsCardProps) {
  const [data, setData] = useState<ProjectEconomics | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [costModalOpen, setCostModalOpen] = useState(false)

  const fetchData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/projects/${projectId}/profitability`)
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j?.error || `HTTP ${res.status}`)
        }
        const payload = (await res.json()) as ProjectEconomics
        setData(payload)
      } catch (err: any) {
        setError(err.message || 'Kunde inte hämta ekonomidata')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [projectId],
  )

  useEffect(() => {
    fetchData()
  }, [fetchData, refreshKey])

  if (loading && !data) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
        <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">{error || 'Kunde inte ladda ekonomidata'}</p>
        <button
          type="button"
          onClick={() => fetchData()}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:text-primary-600"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Försök igen
        </button>
      </div>
    )
  }

  const { intakter, kostnader, meta } = data

  // VAT default 25% — kommer från quote-context om vi vill ha exakt
  // värde per offert. Senare 4b-steg kan utöka.
  const VAT_RATE = 25
  const intaktInklMoms = Math.round(intakter.forvantad_intakt_kr * (1 + VAT_RATE / 100))
  const kostnadInklMoms =
    kostnader.total_kr != null
      ? Math.round(kostnader.total_kr * (1 + VAT_RATE / 100))
      : null

  return (
    <div className="space-y-4">
      {/* Hero-rad: 3 KPI-cards (Intäkt + Kostnad + Marginal) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <HeroKpi
          label="Intäkt"
          value={intakter.forvantad_intakt_kr}
          inklMoms={intaktInklMoms}
          vatRate={VAT_RATE}
          variant="teal"
          icon="trendUp"
          footnote={
            intakter.forvantad_intakt_kr > 0
              ? `Offert + ${meta.ata_count} signerad${meta.ata_count === 1 ? '' : 'a'} ÄTA`
              : 'Ingen offert kopplad än'
          }
        />
        <HeroKpi
          label="Kostnad"
          value={kostnader.total_kr ?? 0}
          inklMoms={kostnadInklMoms}
          vatRate={VAT_RATE}
          variant="slate"
          icon="bag"
          footnote={
            kostnader.total_kr && kostnader.total_kr > 0
              ? `${meta.time_entry_count} timrad${meta.time_entry_count === 1 ? '' : 'er'} · ${meta.supplier_invoice_count} lev.faktura${meta.supplier_invoice_count === 1 ? '' : 'or'}`
              : 'Inga kostnader registrerade än'
          }
        />
        <MarginalCard economics={data} size="hero" />
      </div>

      {/* Two-col detail grid: vänster = Intäkt + ÄTA, höger = Kostnad + Fakturering */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="flex flex-col gap-4">
          <IntaktCard economics={data} vatRate={VAT_RATE} />
          <AtaCard projectId={projectId} />
        </div>
        <div className="flex flex-col gap-4">
          <KostnadCard
            economics={data}
            onAddManualCost={() => setCostModalOpen(true)}
          />
          <FaktureringsstatusCard
            economics={data}
            vatRate={VAT_RATE}
            onInvoiceProject={onInvoiceProject}
          />
        </div>
      </div>

      {/* Efterkalkyl: offererat vs utfall, självförsörjande — visar sig
          bara när projektet är completed OCH en frusen outcome-rad finns. */}
      <EfterkalkylCard projectId={projectId} />

      {/* Footer: uppdaterad-tidstämpel + refresh */}
      <div className="flex items-center justify-end gap-2 text-[10px] text-slate-400">
        <button
          type="button"
          onClick={() => fetchData(true)}
          disabled={refreshing}
          title="Uppdatera"
          className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
        Uppdaterad {new Date(meta.computed_at).toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })}
      </div>

      {costModalOpen && (
        <ProjectCostModal
          projectId={projectId}
          onClose={() => setCostModalOpen(false)}
          onSaved={() => {
            setCostModalOpen(false)
            fetchData(true)
          }}
        />
      )}
    </div>
  )
}
