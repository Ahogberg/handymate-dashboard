'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { AlertCircle, Loader2, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { buildInvoiceTemplateData } from '@/lib/invoice-templates/data-builder'
import type { InvoiceTemplateData } from '@/lib/invoice-templates/types'
import { InvoiceHeader } from './components/InvoiceHeader'
import { InvoiceDocumentPanel } from './components/InvoiceDocumentPanel'
import { InvoiceStatusTimeline } from './components/InvoiceStatusTimeline'
import { InvoicePaymentModal, type PaymentData } from './components/InvoicePaymentModal'
import { InvoiceCreditModal } from './components/InvoiceCreditModal'
import type { Invoice, InvoiceReminder } from './types'

// businessConfig hämtas brett (select *) — buildInvoiceTemplateData läser
// en rad fält (bankgiro/plusgiro/swish/reminder_fee/penalty_interest/
// f_skatt m.fl.) och en smal kolumnlista (som quotes/[id]/page.tsx
// använder) skulle riskera att missa ett fält motorn faktiskt behöver.
type BusinessConfig = Record<string, any>

/**
 * ETAPP 6d (offert-masterplan.md, faktura-sprinten) — "Fakturarummet".
 * Speglar app/dashboard/quotes/[id]/page.tsx:s uppdelning (Offertrummet,
 * ETAPP 4): dokumentet i centrum via samma motor, en åtgärdshierarki i
 * headern, en VERKLIG händelselogg, och de två tyngsta modalerna (betalning,
 * kreditering) brutna ut som egna komponenter. Krediterings-/betalnings-
 * LOGIKEN nedan är rakt av flyttad ur den gamla filen (tidigare 1113 rader,
 * 18 useState i en enda komponent) — ingen ändring i vad som skickas till
 * API:erna, bara var JSX:en och statet bor.
 */
export default function InvoiceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const invoiceId = (params as any)?.id as string

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [sendingReminder, setSendingReminder] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentData, setPaymentData] = useState<PaymentData>({
    paid_at: new Date().toISOString().split('T')[0],
    payment_method: 'swish',
    paid_amount: 0,
  })
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [fortnoxConnected, setFortnoxConnected] = useState(false)
  const [sendingViaFortnox, setSendingViaFortnox] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })
  const [showCreditModal, setShowCreditModal] = useState(false)
  const [creditReason, setCreditReason] = useState('')
  const [creditType, setCreditType] = useState<'full' | 'partial'>('full')
  const [creditItemChecked, setCreditItemChecked] = useState<Record<number, boolean>>({})
  const [creditItemQuantity, setCreditItemQuantity] = useState<Record<number, number>>({})
  const [creatingCredit, setCreatingCredit] = useState(false)
  const [reminders, setReminders] = useState<InvoiceReminder[]>([])

  // ETAPP 6d, punkt 1: businessConfig — oberoende av invoice, samma mönster
  // som quotes/[id]/page.tsx (hämtas när business_id är känt).
  const [businessConfig, setBusinessConfig] = useState<BusinessConfig | null>(null)

  useEffect(() => {
    fetchInvoice()
    fetchReminders()
    fetchFortnoxStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId])

  useEffect(() => {
    if (!invoice?.business_id) return
    supabase
      .from('business_config')
      .select('*')
      .eq('business_id', invoice.business_id)
      .single()
      .then(({ data }: { data: any }) => {
        if (data) setBusinessConfig(data)
      })
  }, [invoice?.business_id])

  async function fetchFortnoxStatus() {
    try {
      const res = await fetch('/api/integrations/fortnox/status')
      if (res.ok) {
        const data = await res.json()
        setFortnoxConnected(!!data.connected)
      }
    } catch { /* non-blocking */ }
  }

  const handleSendViaFortnox = async () => {
    setSendingViaFortnox(true)
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/send-via-fortnox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const result = await response.json()
      if (response.ok && result.success) {
        showToast(result.message || 'Skickad till Fortnox!', 'success')
        fetchInvoice()
      } else {
        showToast(result.message || result.error || 'Kunde inte skicka via Fortnox', 'error')
      }
    } catch (err: any) {
      showToast(err.message || 'Något gick fel', 'error')
    } finally {
      setSendingViaFortnox(false)
    }
  }

  useEffect(() => {
    if (invoice) {
      setPaymentData(prev => ({
        ...prev,
        paid_amount: invoice.customer_pays || invoice.total,
      }))
    }
  }, [invoice])

  async function fetchInvoice() {
    const { data, error } = await supabase
      .from('invoice')
      .select(`
        *,
        customer:customer_id (
          customer_id,
          name,
          phone_number,
          email,
          address_line,
          personal_number,
          property_designation
        )
      `)
      .eq('invoice_id', invoiceId)
      .single()

    if (!error && data) {
      setInvoice(data)
    }
    setLoading(false)
  }

  async function fetchReminders() {
    const { data } = await supabase
      .from('invoice_reminders')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('reminder_number', { ascending: true })

    if (data) {
      setReminders(data)
    }
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  const handleSend = async (method: 'email' | 'sms' | 'both') => {
    setSending(true)
    try {
      const response = await fetch('/api/invoices/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoiceId,
          send_email: method === 'email' || method === 'both',
          send_sms: method === 'sms' || method === 'both',
        }),
      })

      if (!response.ok) throw new Error('Kunde inte skicka')

      const result = await response.json()
      if (result.success) {
        showToast('Faktura skickad!', 'success')
        fetchInvoice()
      } else {
        showToast(result.errors?.join(', ') || 'Något gick fel', 'error')
      }
    } catch {
      showToast('Något gick fel', 'error')
    } finally {
      setSending(false)
    }
  }

  const handleMarkPaid = async () => {
    setUpdatingStatus(true)
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'paid',
          paid_at: paymentData.paid_at,
          payment_method: paymentData.payment_method,
          paid_amount: paymentData.paid_amount,
        }),
      })

      if (!response.ok) throw new Error('Kunde inte uppdatera')

      showToast('Faktura markerad som betald!', 'success')
      setShowPaymentModal(false)
      fetchInvoice()
    } catch {
      showToast('Något gick fel', 'error')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleSendReminder = async () => {
    setSendingReminder(true)
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/reminder`, {
        method: 'POST',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Kunde inte skicka påminnelse')
      }

      showToast(`Påminnelse skickad! (${result.reminderCount} totalt)`, 'success')
      fetchInvoice()
      fetchReminders()
    } catch (err: any) {
      showToast(err.message || 'Något gick fel', 'error')
    } finally {
      setSendingReminder(false)
    }
  }

  const handleCreateCreditNote = async () => {
    if (!creditReason.trim() || !invoice) return
    setCreatingCredit(true)
    try {
      // Build partial items if partial credit
      let partialItems = undefined
      if (creditType === 'partial') {
        const selectedItems = items
          .map((item, index) => {
            if (!creditItemChecked[index]) return null
            const qty = creditItemQuantity[index] ?? item.quantity
            return {
              ...item,
              quantity: qty,
              total: qty * item.unit_price,
            }
          })
          .filter(Boolean)

        if (selectedItems.length === 0) {
          showToast('Välj minst en rad för delkredit', 'error')
          setCreatingCredit(false)
          return
        }
        partialItems = selectedItems
      }

      const response = await fetch('/api/invoices/credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          original_invoice_id: invoiceId,
          credit_type: creditType,
          items: partialItems,
          credit_reason: creditReason,
        }),
      })

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error || 'Kunde inte skapa kreditfaktura')
      }

      const result = await response.json()
      showToast('Kreditfaktura skapad!', 'success')
      setShowCreditModal(false)
      setCreditReason('')
      setCreditType('full')
      setCreditItemChecked({})
      setCreditItemQuantity({})
      router.push(`/dashboard/invoices/${result.invoice.invoice_id}`)
    } catch (err: any) {
      showToast(err.message || 'Något gick fel', 'error')
    } finally {
      setCreatingCredit(false)
    }
  }

  const items = invoice?.items || []

  // ETAPP 6d, punkt 1: stilval — samma precedens som /api/invoices/pdf
  // (invoice.template_style > business default > modern).
  const templateStyle = useMemo<'modern' | 'premium' | 'friendly'>(() => {
    const style = invoice?.template_style || businessConfig?.quote_template_style
    return style === 'premium' || style === 'friendly' ? style : 'modern'
  }, [invoice?.template_style, businessConfig?.quote_template_style])

  // Modern: byggs inline genom SAMMA dokumentmotor som PDF:en/kundvyn
  // (buildInvoiceTemplateData, lib/invoice-templates/data-builder.ts).
  // Ingen Swish-QR här (kräver server-genererad data-URI) — samma
  // medvetna förenkling som fakturaskaparens liveTemplateData (ETAPP 6c)
  // gör: den nedladdade PDF:en/kundportalen har alltid rätt QR, den här
  // inline-vyn behöver den inte för att vara korrekt.
  const templateData: (InvoiceTemplateData & { docType: 'invoice' }) | null = useMemo(() => {
    if (!invoice || !businessConfig) return null
    return buildInvoiceTemplateData(invoice, businessConfig, null)
  }, [invoice, businessConfig])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">Faktura hittades inte</div>
      </div>
    )
  }

  const amountDue = invoice.customer_pays || invoice.total

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
      {toast.show && (
        <div
          className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-xl border text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="relative max-w-[1600px] mx-auto">
        <InvoiceHeader
          invoice={invoice}
          invoiceId={invoiceId}
          fortnoxConnected={fortnoxConnected}
          sending={sending}
          sendingReminder={sendingReminder}
          sendingViaFortnox={sendingViaFortnox}
          onSend={handleSend}
          onSendReminder={handleSendReminder}
          onOpenPaymentModal={() => setShowPaymentModal(true)}
          onOpenCreditModal={() => setShowCreditModal(true)}
          onSendViaFortnox={handleSendViaFortnox}
        />

        {/* Banderoller — bevarade oförändrade ur den gamla sidan, bara
            flyttade hit (ovanför dokumentet snarare än actions). Inte
            "åtgärder" i hierarkins mening, bara information som annars
            skulle tappas. */}
        {invoice.is_credit_note && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-3">
              <RotateCcw className="w-5 h-5 text-red-500" />
              <div>
                <p className="text-red-700 font-medium">Kreditfaktura</p>
                <p className="text-sm text-red-600">
                  Krediterar faktura {invoice.original_invoice_id ? (
                    <Link href={`/dashboard/invoices/${invoice.original_invoice_id}`} className="underline hover:no-underline">
                      original
                    </Link>
                  ) : 'okänd'}
                  {invoice.credit_reason && ` — ${invoice.credit_reason}`}
                </p>
              </div>
            </div>
          </div>
        )}

        {invoice.status === 'credited' && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-orange-500" />
              <div>
                <p className="text-orange-700 font-medium">Denna faktura har krediterats</p>
                <p className="text-sm text-orange-600">En kreditfaktura har skapats som motbokar denna faktura.</p>
              </div>
            </div>
          </div>
        )}

        {invoice.reminder_count >= 3 && (invoice.status === 'overdue' || invoice.status === 'sent') && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <div>
                <p className="text-amber-700 font-medium">Max antal påminnelser nått</p>
                <p className="text-sm text-amber-600">
                  {invoice.reminder_count} påminnelser har skickats. Inkassohantering eller annan åtgärd rekommenderas.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ETAPP 6d, punkt 1: dokumentet i centrum — bred vänsterkolumn för
            A4-dokumentet (samma motor/iframe som PDF:en/kundportalen), smal
            sticky sidopanel med händelseloggen. */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(320px,380px)] gap-6 items-start">
          <div className="min-w-0">
            <InvoiceDocumentPanel data={templateData} style={templateStyle} invoiceId={invoiceId} />
          </div>

          <div className="space-y-6 lg:sticky lg:top-6">
            <InvoiceStatusTimeline invoice={invoice} reminders={reminders} />
          </div>
        </div>
      </div>

      <InvoicePaymentModal
        show={showPaymentModal}
        paymentData={paymentData}
        setPaymentData={setPaymentData}
        amountDue={amountDue}
        updatingStatus={updatingStatus}
        onClose={() => setShowPaymentModal(false)}
        onConfirm={handleMarkPaid}
      />

      <InvoiceCreditModal
        show={showCreditModal}
        invoiceNumber={invoice.invoice_number}
        invoiceTotal={invoice.total}
        items={items}
        creditReason={creditReason}
        setCreditReason={setCreditReason}
        creditType={creditType}
        setCreditType={setCreditType}
        creditItemChecked={creditItemChecked}
        setCreditItemChecked={setCreditItemChecked}
        creditItemQuantity={creditItemQuantity}
        setCreditItemQuantity={setCreditItemQuantity}
        creatingCredit={creatingCredit}
        onClose={() => setShowCreditModal(false)}
        onConfirm={handleCreateCreditNote}
      />
    </div>
  )
}
