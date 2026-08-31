'use client'

/**
 * StepProductRegister — "Ditt produktregister" (onboarding-steg, efter
 * kundimporten StepImportData).
 *
 * Produktbanken seedas TIDIGT här (POST /api/onboarding/seed-products)
 * i stället för vid onboarding-avslut som tidigare — seedProducts är
 * idempotent, så finalize-anropet i seedAllDefaults blir automatiskt en
 * no-op andra gången. (B2: price_list-seedningen är borttagen — tabellen
 * kunde aldrig ta emot en rad.)
 *
 * Granskningslistan visar bara de redan PRISSATTA startartiklarna
 * (sales_price > 0) — den prislösa långsvansen finns redan i registret
 * och prissätter sig själv vid första användning (lib/products/
 * pricing-state.ts), ingen ny logik för det här.
 *
 * Återanvänder den BEFINTLIGA ProductEditorModal och ProductCsvImportModal
 * (Inställningar → Produkter) rakt av — ingen ny editor byggs.
 * ProductCsvImportModal använder useToast() internt, vilket kräver en
 * <ToastProvider> — den finns bara i app/dashboard/layout.tsx, inte i
 * onboarding-trädet, så den monteras lokalt runt importmodalen här.
 *
 * Bygger på produktregister-onboarding-planen (2026-08-16).
 */

import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, AlertTriangle, Package, Upload } from 'lucide-react'
import OnboardingHeader from './OnboardingHeader'
import { OB_DOTS, OB_DOT_TOTAL } from '../constants'
import { QuickPriceInput } from '@/components/products/QuickPriceInput'
import { JobTypeQuoteSetup } from '@/components/onboarding/JobTypeQuoteSetup'
import { ToastProvider } from '@/components/Toast'
import { ProductEditorModal } from '@/app/dashboard/settings/products/components/ProductEditorModal'
import { ProductCsvImportModal } from '@/app/dashboard/settings/products/components/ProductCsvImportModal'
import { priceLabel } from '@/lib/products/pricing-state'
import type { ComponentPayload, ProductRow } from '@/app/dashboard/settings/products/types'
import type { OnboardingFormData } from '../types-redesign'

interface Props {
  onNext: () => void
  onBack: () => void
  data: OnboardingFormData
  setData: (updater: (d: OnboardingFormData) => OnboardingFormData) => void
}

type View = 'loading' | 'ready'

const CATEGORY_LABELS: Record<string, string> = {
  arbete: 'Arbete',
  material: 'Material',
  hyra: 'Uthyrning',
  övrigt: 'Övrigt',
}

const CATEGORY_ORDER = ['arbete', 'material', 'hyra', 'övrigt']

export default function StepProductRegister({ onNext, onBack, data, setData }: Props) {
  const [view, setView] = useState<View>('loading')
  const [products, setProducts] = useState<ProductRow[]>([])
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [setupRefresh, setSetupRefresh] = useState(0)
  const [setupBusy, setSetupBusy] = useState(false)

  // UX2c (Prisslingan V2): topp-10 PRISLÖSA arbetsartiklar att prissätta
  // direkt — seed-ordningen ÄR prioritetsordningen (vanligaste först).
  const [osatta, setOsatta] = useState<ProductRow[]>([])

  const fetchPriced = useCallback(async () => {
    try {
      const res = await fetch('/api/products?include_inactive=true')
      if (res.ok) {
        const d = await res.json()
        const list: ProductRow[] = d.products || []
        setProducts(list.filter(p => p.is_active !== false && p.sales_price > 0))
        setOsatta(
          list
            .filter(p => p.is_active !== false && !(p.sales_price > 0) && p.category === 'arbete')
            .slice(0, 10),
        )
      } else { throw new Error('Kunde inte läsa artikelregistret.') }
    } catch { setError('Kunde inte läsa artikelregistret. Du kan fortsätta och försöka igen senare.') }
  }, [])

  // Seeda tidigt vid steg-inträde. fail-soft: ett seed-fel visar bara ett
  // tomt register, blockerar aldrig onboardingen.
  useEffect(() => {
    let cancelled = false
    async function seedThenLoad() {
      try {
        const response = await fetch('/api/onboarding/seed-products', { method: 'POST' })
        if (!response.ok) throw new Error('seed failed')
      } catch { if (!cancelled) setError('Startartiklarna kunde inte hämtas. Dina befintliga artiklar påverkas inte.') }
      if (cancelled) return
      await fetchPriced()
      if (!cancelled) setView('ready')
    }
    seedThenLoad()
    return () => { cancelled = true }
  }, [fetchPriced])

  async function handleSave(payload: Record<string, unknown>, components: ComponentPayload[] | null) {
    setSaving(true)
    setError(null)
    try {
      const isEdit = !!payload.id
      const res = await fetch('/api/products', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Kunde inte spara produkten')
        return
      }
      const { product } = await res.json()
      if (components !== null && product?.id) {
        const componentResponse = await fetch(`/api/products/${product.id}/components`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ components }),
        })
        if (!componentResponse.ok) {
          setError('Artikeln sparades, men komponenterna kunde inte sparas. Försök igen.')
          return
        }
      }
      setEditingProduct(null)
      await fetchPriced()
      setSetupRefresh(n => n + 1)
    } catch {
      setError('Kunde inte spara produkten')
    } finally {
      setSaving(false)
    }
  }

  const grouped: Record<string, ProductRow[]> = {}
  for (const p of products) {
    (grouped[p.category] ||= []).push(p)
  }

  return (
    <div className="ob-screen">
      <OnboardingHeader step={OB_DOTS.productRegister} total={OB_DOT_TOTAL} onBack={setupBusy ? null : onBack} onSkip={setupBusy ? null : onNext} />
      <div className="ob-body">
        {view === 'loading' && (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '100%' }}>
            <div className="obi-loadcard">
              <div className="obi-spinner" />
              <div className="obi-load-title">Bygger ditt register…</div>
            </div>
          </div>
        )}

        {view === 'ready' && (
          <>
            <h1 className="ob-headline">Ditt sätt att offerera.</h1>
            <p className="ob-sub">
              Välj en vanlig jobbtyp, koppla en offertmall och sätt priser på dina artiklar.
              Då kan Daniel förbereda nästa offert med ert eget underlag — i stället för att du börjar från noll.
            </p>

            {error && <FallbackNote text={error} />}

            <JobTypeQuoteSetup initialJobTypes={data.quoteJobTypes} initialSelection={data.firstQuoteSelection}
              refreshKey={setupRefresh} onBusyChange={setSetupBusy} onChange={(selection, jobTypes) => setData(d => ({ ...d, quoteJobTypes: jobTypes, firstQuoteSelection: selection }))} />

            <details style={{ marginBottom: 20 }}>
              <summary style={{ cursor: 'pointer', minHeight: 44, color: '#0F766E', fontWeight: 600 }}>Visa mitt övriga artikelregister</summary>

            {products.length === 0 ? (
              <p className="ob-sub">
                Inga prissatta artiklar kunde visas här. Du kan lägga till eller
                prissätta artiklar under Inställningar när du vill.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 18 }}>
                {CATEGORY_ORDER.filter(cat => grouped[cat]?.length).map(cat => (
                  <div key={cat}>
                    <div className="obi-unlock-label">{CATEGORY_LABELS[cat]} · {grouped[cat].length}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                      {grouped[cat].map(p => (
                        <button
                          key={p.id}
                          type="button"
                          className="obi-choice"
                          style={{ padding: '10px 14px' }}
                          onClick={() => setEditingProduct(p)}
                        >
                          <span className="obi-choice-ic soft"><Package size={18} /></span>
                          <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                            <span className="obi-choice-title" style={{ fontSize: 14 }}>{p.name}</span>
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ob-primary-700)' }}>
                            {priceLabel(p.sales_price, p.unit)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* UX2c: frivilligt — max 10, steget blir inte längre. Ett pris
                här är hantverkarens EGET från dag 1; resten "Sätt pris" vid
                användning (pricing-state-filosofin). */}
            {osatta.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div className="obi-unlock-label">10 vanliga att prissätta nu (frivilligt)</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {osatta.map(p => (
                    <div
                      key={p.id}
                      className="obi-choice"
                      style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10 }}
                    >
                      <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <span className="obi-choice-title" style={{ fontSize: 14 }}>{p.name}</span>
                      </span>
                      <QuickPriceInput
                        productId={p.id}
                        unit={p.unit}
                        onSaved={() => { void fetchPriced(); setSetupRefresh(n => n + 1) }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
            </details>

            <button type="button" className="obi-choice" onClick={() => setShowImport(true)}>
              <span className="obi-choice-ic teal"><Upload size={22} strokeWidth={2.2} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="obi-choice-title">Ladda upp min egen prislista</span>
                <span className="obi-choice-sub">Ett tillägg till det redan seedade registret — inte en ersättning.</span>
              </span>
              <span className="obi-choice-arrow"><ArrowRight size={20} /></span>
            </button>

            <button type="button" className="obi-skiplink" style={{ marginTop: 16 }} onClick={onNext} disabled={setupBusy}>
              Hoppa över — jag gör det senare
            </button>
          </>
        )}
      </div>

      <div className="ob-footer">
        {view === 'ready' && (
          <button type="button" className="ob-cta" onClick={onNext} disabled={setupBusy}>
            Fortsätt <ArrowRight size={18} />
          </button>
        )}
      </div>

      {editingProduct && (
        <ProductEditorModal
          product={editingProduct}
          categories={[]}
          saving={saving}
          onSave={handleSave}
          onClose={() => setEditingProduct(null)}
          onError={msg => setError(msg)}
        />
      )}

      {showImport && (
        <ToastProvider>
          <ProductCsvImportModal
            onClose={() => setShowImport(false)}
            onImported={() => { setShowImport(false); fetchPriced(); setSetupRefresh(n => n + 1) }}
          />
        </ToastProvider>
      )}
    </div>
  )
}

function FallbackNote({ text }: { text: string }) {
  return (
    <div
      style={{
        display: 'flex', gap: 10, alignItems: 'flex-start',
        background: '#FFFBEB', border: '1px solid #FDE68A',
        borderRadius: 'var(--ob-r-md)', padding: '12px 14px',
        fontSize: 13, color: 'var(--ob-ink-2)', lineHeight: 1.45, marginBottom: 16,
      }}
    >
      <AlertTriangle size={17} style={{ color: 'var(--ob-amber-600)', flexShrink: 0, marginTop: 1 }} />
      <span>{text}</span>
    </div>
  )
}
