'use client'

import { useEffect } from 'react'
import { X, CreditCard } from 'lucide-react'
import type { PaymentPlanEntry } from '@/lib/types/quote'
import { QuoteEditPaymentPlanSection } from '@/app/dashboard/quotes/[id]/edit/components/QuoteEditPaymentPlanSection'

interface PaymentPlanSheetProps {
  open: boolean
  onClose: () => void
  paymentPlan: PaymentPlanEntry[]
  calculatedPaymentPlan: PaymentPlanEntry[]
  paymentPlanValid: boolean
  onAddEntry: () => void
  onUpdateEntry: (index: number, field: keyof PaymentPlanEntry, value: any) => void
  onRemoveEntry: (index: number) => void
  formatCurrency: (n: number) => string
}

/**
 * Betalplanens bottom sheet i det guidade flödet (Del 2, 2026-08-17).
 *
 * Samma overlay-/animationsmönster som ReservationReviewSheet/AddRowSheet
 * (`fixed inset-0`, `rowsheet-fade`/`rowsheet-up`) — rörelsemönstret är redan
 * inlärt från de andra sheetarna i samma flöde. Sheeten monterar
 * `QuoteEditPaymentPlanSection` OFÖRÄNDRAD (gamla editorns radeditor för
 * delbetalningar) — ingen omskriven valideringslogik, bara en ny plats att
 * nå den ifrån. `open`/`setOpen` på den inre komponenten styr bara dess EGEN
 * hopfällbara rubrik (ärvd från "Mer"-panelen där den låg bredvid fem andra
 * flikar) — här är den alltid uppfälld eftersom sheeten själv är
 * öppna/stängd-ytan.
 */
export function PaymentPlanSheet({
  open,
  onClose,
  paymentPlan,
  calculatedPaymentPlan,
  paymentPlanValid,
  onAddEntry,
  onUpdateEntry,
  onRemoveEntry,
  formatCurrency,
}: PaymentPlanSheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[75] flex items-end sm:items-center justify-center">
      <div onClick={onClose} className="absolute inset-0 bg-slate-900/45 rowsheet-fade" aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Betalplan"
        className="relative w-full sm:max-w-xl max-h-[85vh] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col rowsheet-up"
      >
        <div className="flex justify-center pt-2.5 pb-1 shrink-0 sm:hidden" aria-hidden>
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>

        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-primary-700 text-white flex items-center justify-center shrink-0">
              <CreditCard className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="font-heading text-base font-bold text-slate-900">Betalplan</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Dela upp betalningen i flera delbetalningar. Procenten ska summera till 100%.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Stäng"
            className="p-2 -m-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1">
          <QuoteEditPaymentPlanSection
            open={true}
            setOpen={() => {}}
            paymentPlan={paymentPlan}
            calculatedPaymentPlan={calculatedPaymentPlan}
            paymentPlanValid={paymentPlanValid}
            onAddEntry={onAddEntry}
            onUpdateEntry={onUpdateEntry}
            onRemoveEntry={onRemoveEntry}
            formatCurrency={formatCurrency}
          />
        </div>

        <div className="px-5 py-4 border-t border-slate-100 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[44px] px-5 bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            Klar
          </button>
        </div>
      </div>
    </div>
  )
}
