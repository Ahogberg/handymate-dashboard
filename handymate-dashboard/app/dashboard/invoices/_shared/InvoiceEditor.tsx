'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Send, User, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { QUOTE_SURFACE_BUSINESS_SELECT, logBusinessConfigError } from '@/lib/business/quote-surface-select'
import QuoteDocument, { type QuoteDocumentHandlers } from '@/components/quotes/document/QuoteDocument'
import { DocumentScaler } from '@/components/quotes/document/DocumentScaler'
import { useIsMobileViewport } from '@/components/quotes/document/useIsMobileViewport'
import { QuoteStylePicker } from '@/components/quotes/QuoteStylePicker'
import type { QuoteTemplateItem } from '@/lib/quote-templates/types'
import type { InvoiceTemplateData } from '@/lib/invoice-templates/types'
import LineItemEditor from '@/components/invoices/LineItemEditor'
import InvoiceSummary from '@/components/invoices/InvoiceSummary'
import { InvoiceRowEditSheet } from './InvoiceRowEditSheet'
import { InvoiceRotMomsSection } from './InvoiceRotMomsSection'
import { InvoiceTextsSection } from './InvoiceTextsSection'
import { useInvoiceItems } from './useInvoiceItems'
import { calculateInvoiceTotals, recalculateItems } from '@/lib/invoice-calculations'
import type { InvoiceItem } from '@/lib/types/invoice'

export interface InvoiceEditorCustomer {
  customer_id: string
  name: string
  phone_number: string
  email: string | null
  address_line: string | null
  personal_number?: string
  property_designation?: string
}

export type InvoiceStyle = 'modern' | 'premium' | 'friendly'

/**
 * ETAPP 2b (offert-masterplan.md), speglat i 6c: stängningsknapp för
 * "Mer"-radens paneler — samma UX som offertskaparens MerPanelClose.
 */
function MerPanelClose({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Stäng"
      className="absolute right-3 top-3 z-10 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
    >
      <X className="w-4 h-4" />
    </button>
  )
}

/** Fakturans historiska enhetsnamn ('timmar'/'h') → dokumentmotorns
    UNIT_OPTIONS-värde ('tim') — annars visar canvasens enhets-dropdown en
    tom/omatchad select för alla arbetsrader (den vanligaste radtypen).
    Rent visningslager: det STARADE värdet i items-state rörs aldrig av
    denna funktion, bara vad canvasen skickar vidare till QuoteDocumentRow. */
function normalizeUnitForCanvas(unit: string): string {
  const map: Record<string, string> = { timmar: 'tim', h: 'tim', hour: 'tim', styck: 'st' }
  return map[(unit || '').toLowerCase()] || unit || 'st'
}

function formatDateLongSv(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })
}

export interface InvoiceEditorProps {
  mode: 'new' | 'edit'
  /** Endast 'edit' — styr Slutdesign-iframens (premium/friendly) src och
      stilväljarens förhandsgranskningslänk. */
  invoiceId?: string
  /** Endast 'edit' — visas i dokumentets header. Utelämnad (new) → "Utkast". */
  invoiceNumber?: string
  /** Endast 'edit' — visas i den statiska Slutdesign-previewn. */
  ocrNumber?: string

  customers: InvoiceEditorCustomer[]
  customerId: string
  setCustomerId: (id: string) => void

  items: InvoiceItem[]
  setItems: React.Dispatch<React.SetStateAction<InvoiceItem[]>>

  vatRate: number
  setVatRate: (n: number) => void
  rotRutType: string
  setRotRutType: (s: string) => void
  personalNumber: string
  setPersonalNumber: (s: string) => void
  propertyDesignation: string
  setPropertyDesignation: (s: string) => void

  /** ISO-datum (yyyy-mm-dd). */
  invoiceDate: string
  setInvoiceDate: (s: string) => void
  /** ISO-datum (yyyy-mm-dd) — ABSOLUT (till skillnad från offertens
      "giltig i N dagar") så samma state driver både kortet och
      dokumentets EditableDate utan omräkning. */
  dueDate: string
  setDueDate: (s: string) => void

  ourReference: string
  setOurReference: (s: string) => void
  yourReference: string
  setYourReference: (s: string) => void
  introductionText: string
  setIntroductionText: (s: string) => void
  conclusionText: string
  setConclusionText: (s: string) => void

  templateStyle: InvoiceStyle | null
  setTemplateStyle: (s: InvoiceStyle | null) => void

  saving: boolean
  onSave: () => void
  saveLabel: string
  savingLabel: string

  /** Visas överst i assistentkolumnen — new-sidans "importerad från
      offert/tidrapport"-info. Utelämnad i edit-läget. */
  sourceInfo?: React.ReactNode
}

/**
 * InvoiceEditor — ETAPP 6c (offert-masterplan.md, faktura-sprinten): den
 * delade canvas-first-editorytan för både app/dashboard/invoices/new och
 * app/dashboard/invoices/[id]/edit. Speglar offertens ETAPP 2b-layout: smal
 * assistentkolumn (kund & datum, summering, spara-CTA) + dokumentet som
 * huvudyta med en "Mer"-verktygsrad (Stil/Moms & ROT/Referenser & texter)
 * och en Dokument/Listvy-toggle. LineItemEditor.tsx (Listvyn) rörs
 * MEDVETET inte — se rapporten för fältparitets-kartläggningen.
 *
 * Kontrollerad komponent: allt redigeringsbart state ägs av anroparen
 * (new/edit-sidorna) — samma mönster som QuoteItemsSection/QuotePreviewPanel
 * redan använder på offertsidan. InvoiceEditor äger bara UI-lokalt state
 * (vilken Mer-panel/vy som är aktiv, mobil-sheetens öppna rad,
 * business_config-hämtningen för live-canvasen).
 */
export function InvoiceEditor({
  mode,
  invoiceId,
  invoiceNumber,
  ocrNumber,
  customers,
  customerId,
  setCustomerId,
  items,
  setItems,
  vatRate,
  setVatRate,
  rotRutType,
  setRotRutType,
  personalNumber,
  setPersonalNumber,
  propertyDesignation,
  setPropertyDesignation,
  invoiceDate,
  setInvoiceDate,
  dueDate,
  setDueDate,
  ourReference,
  setOurReference,
  yourReference,
  setYourReference,
  introductionText,
  setIntroductionText,
  conclusionText,
  setConclusionText,
  templateStyle,
  setTemplateStyle,
  saving,
  onSave,
  saveLabel,
  savingLabel,
  sourceInfo,
}: InvoiceEditorProps) {
  const business = useBusiness()
  const isMobile = useIsMobileViewport()

  const [businessConfig, setBusinessConfig] = useState<{
    business_name: string | null
    contact_name: string | null
    contact_email: string | null
    phone_number: string | null
    address: string | null
    org_number: string | null
    f_skatt_registered: boolean | null
    bankgiro: string | null
    plusgiro: string | null
    swish_number: string | null
    vat_number: string | null
    accent_color: string | null
    logo_url: string | null
    tagline: string | null
    service_area: string | null
  } | null>(null)
  const [businessDefaultStyle, setBusinessDefaultStyle] = useState<InvoiceStyle>('modern')

  const [activePanel, setActivePanel] = useState<null | 'stil' | 'rot' | 'texter'>(null)
  const [mainView, setMainView] = useState<'document' | 'list'>('document')
  const [sheetItemId, setSheetItemId] = useState<string | null>(null)

  useEffect(() => {
    if (!business.business_id) return
    supabase
      .from('business_config')
      // '*' är MEDVETET — se lib/business/quote-surface-select.ts.
      .select(QUOTE_SURFACE_BUSINESS_SELECT)
      .eq('business_id', business.business_id)
      .single()
      .then(({ data, error }: { data: any; error: any }) => {
        logBusinessConfigError('InvoiceEditor', error)
        if (!data) return
        const style = data.quote_template_style as InvoiceStyle | undefined
        if (style && ['modern', 'premium', 'friendly'].includes(style)) setBusinessDefaultStyle(style)
        setBusinessConfig(data as any)
      })
  }, [business.business_id])

  const { addItem, updateItem, removeItem } = useInvoiceItems(items, setItems)

  const totals = useMemo(() => calculateInvoiceTotals(items, 0, vatRate), [items, vatRate])
  const hasRotRut = rotRutType === 'rot' || rotRutType === 'rut'
  const selectedCustomerObj = useMemo(
    () => customers.find(c => c.customer_id === customerId) || null,
    [customers, customerId],
  )
  const sheetItem = useMemo(() => items.find(i => i.id === sheetItemId) ?? null, [items, sheetItemId])

  const effectiveStyle: InvoiceStyle = templateStyle || businessDefaultStyle
  const canLiveEdit = effectiveStyle === 'modern'

  // ── Live-dokumentdata (ETAPP 6c) ─────────────────────────────────────
  // Byggs klientsidan precis som offertens quoteTemplateData — motsvarar
  // INTE buildInvoiceTemplateData (den kör bara server-side mot en sparad
  // DB-rad). Kända medvetna förenklingar mot den statiska/PDF-vägen:
  // ingen Swish-QR (kräver server-anrop), ingen kreditfaktura-hantering
  // (utanför denna etapps scope), title hårdkodad till samma fallback
  // ('Utfört arbete') som data-builder.ts alltid facto producerar idag
  // (invoice.description-kolumnen den läser är aldrig satt av någon UI).
  const liveTemplateData = useMemo((): InvoiceTemplateData & { docType: 'invoice' } => {
    // Samma formel som InvoiceSummary.tsx (assistentkolumnens "Kund
    // betalar"-box) — inte total-deduction rakt av, som skulle divergera
    // från den befintliga komponentens rotCustomerPays/rutCustomerPays-
    // kant-fall (0 kr när ingen rad ännu är avdragsmärkt, se rapporten).
    // Två ytor som visar samma summa samtidigt måste visa SAMMA summa.
    const amountToPay = rotRutType === 'rot'
      ? totals.rotCustomerPays
      : rotRutType === 'rut'
        ? totals.rutCustomerPays
        : totals.total

    return {
      docType: 'invoice',
      business: {
        name: businessConfig?.business_name || business.business_name || 'Företag',
        orgNumber: businessConfig?.org_number || '',
        address: businessConfig?.address || '',
        contactName: businessConfig?.contact_name || business.contact_name || '',
        phone: businessConfig?.phone_number || '',
        email: businessConfig?.contact_email || business.contact_email || '',
        website: null,
        bankgiro: businessConfig?.bankgiro || null,
        plusgiro: businessConfig?.plusgiro || null,
        swish: businessConfig?.swish_number || null,
        fSkatt: !!businessConfig?.f_skatt_registered,
        momsRegnr: businessConfig?.vat_number || null,
        accentColor: businessConfig?.accent_color || '#0F766E',
        logoUrl: businessConfig?.logo_url || null,
        tagline: businessConfig?.tagline || businessConfig?.service_area || null,
      },
      customer: {
        name: selectedCustomerObj?.name || 'Kund',
        address: selectedCustomerObj?.address_line || null,
        postalCode: null,
        city: null,
        phone: selectedCustomerObj?.phone_number || null,
        email: selectedCustomerObj?.email || null,
        personnummer: personalNumber || null,
        reference: yourReference || null,
      },
      invoice: {
        number: invoiceNumber || 'Utkast',
        invoiceDate: formatDateLongSv(invoiceDate) || 'Idag',
        dueDate: formatDateLongSv(dueDate) || '—',
        dueDateISO: dueDate || undefined,
        paidDate: null,
        status: 'unpaid',
        daysOverdue: 0,
        ocrNumber: ocrNumber || 'Tilldelas vid skapande',
        title: 'Utfört arbete',
        description: introductionText || null,
        items: recalculateItems(items).map((i): QuoteTemplateItem => {
          const itemType = (i.item_type || 'item') as QuoteTemplateItem['itemType']
          return {
            itemType,
            id: i.id,
            name: i.description || '',
            description: null,
            quantity: Number(i.quantity || 0),
            unit: normalizeUnitForCanvas(i.unit),
            unitPrice: Number(i.unit_price || 0),
            total: itemType === 'discount' ? -Math.abs(Number(i.total || 0)) : Number(i.total || 0),
            isRotEligible: !!i.is_rot_eligible,
            isRutEligible: !!i.is_rut_eligible,
            performedByName: i.performed_by_name ?? null,
          }
        }),
        subtotalExVat: totals.subtotal,
        vatAmount: totals.vat,
        vatRate,
        totalIncVat: totals.total,
        rotDeduction: rotRutType === 'rot' && totals.rotDeduction > 0 ? totals.rotDeduction : undefined,
        rutDeduction: rotRutType === 'rut' && totals.rutDeduction > 0 ? totals.rutDeduction : undefined,
        rotRutType: hasRotRut ? (rotRutType as 'rot' | 'rut') : null,
        amountToPay,
        // invoice.payment_terms_text finns INTE som kolumn (verifierat mot
        // sql/ — se rapporten) — samma fallback som data-builder.ts
        // (config?.default_invoice_terms), utan konfig-hämtning här.
        paymentTerms: '30 dagar netto',
        introductionText: introductionText || null,
        conclusionText: conclusionText || null,
        quoteReference: null,
        ourReference: ourReference || null,
        yourReference: yourReference || null,
        bankgiro: null,
        plusgiro: null,
        isCreditNote: false,
        creditReason: null,
        originalInvoiceId: null,
      },
      swishQrDataUrl: null,
    }
  }, [
    businessConfig, business, selectedCustomerObj, personalNumber, yourReference,
    invoiceNumber, ocrNumber, invoiceDate, dueDate, introductionText, items, totals, vatRate,
    rotRutType, hasRotRut, conclusionText, ourReference,
  ])

  // ── liveHandlers (ETAPP 6c) ──────────────────────────────────────────
  const liveHandlers: QuoteDocumentHandlers = useMemo(
    () => ({
      onTitleChange: () => {},
      onDescriptionChange: () => {},
      onDueDateChange: (iso: string) => setDueDate(iso),
      onOurReferenceChange: setOurReference,
      onYourReferenceChange: setYourReference,
      onItemChange: (id, patch) => {
        const fieldPatch: Partial<InvoiceItem> = {}
        if (patch.name !== undefined) fieldPatch.description = patch.name
        if (patch.quantity !== undefined) fieldPatch.quantity = patch.quantity
        if (patch.unit !== undefined) fieldPatch.unit = patch.unit
        if (patch.unitPrice !== undefined) fieldPatch.unit_price = patch.unitPrice
        updateItem(id, fieldPatch)
      },
      onItemAdd: () => addItem('item'),
      onItemRemove: id => removeItem(id),
      // Fakturan har EN global avdragstyp (rotRutType) — till skillnad
      // från offertens fria rot/rut/grön-cykel per rad. Ett klick växlar
      // raden PÅ/AV för den typ som redan är vald; om ingen typ är vald
      // ännu sätts den globalt till ROT först (samma väg som togglen i
      // InvoiceRotMomsSection, bara triggad från dokumentet istället).
      onItemRotRutCycle: id => {
        const activeType = rotRutType === 'rot' || rotRutType === 'rut' ? rotRutType : 'rot'
        if (!rotRutType) setRotRutType('rot')
        const item = items.find(i => i.id === id)
        if (!item) return
        const currentlyOn = activeType === 'rot' ? item.is_rot_eligible : item.is_rut_eligible
        updateItem(id, activeType === 'rot'
          ? { is_rot_eligible: !currentlyOn, is_rut_eligible: false }
          : { is_rut_eligible: !currentlyOn, is_rot_eligible: false })
      },
      // Fakturan har aldrig 'option'-rader (InvoiceTemplateItemType
      // exkluderar 'option') — handlern anropas därför aldrig, men
      // QuoteDocumentHandlers kräver den (no-op).
      onOptionDefaultToggle: () => {},
    }),
    [setDueDate, setOurReference, setYourReference, updateItem, addItem, removeItem, rotRutType, setRotRutType, items],
  )

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,380px)_1fr] gap-5 items-start">
        {/* ── Assistentkolumnen ────────────────────────────────────── */}
        <div className="flex flex-col gap-4">
          {sourceInfo}

          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
                <User className="w-4.5 h-4.5" />
              </div>
              <h2 className="font-heading text-base font-bold text-slate-900 tracking-tight">Kund &amp; fakturadatum</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                  Kund <span className="text-red-600 normal-case font-medium">*</span>
                </label>
                <select
                  value={customerId}
                  onChange={e => setCustomerId(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors"
                >
                  <option value="">Välj kund…</option>
                  {customers.map(c => (
                    <option key={c.customer_id} value={c.customer_id}>{c.name} — {c.phone_number}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Fakturadatum</label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={e => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Förfallodatum</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>

          <InvoiceSummary
            totals={totals}
            vatRate={vatRate}
            rotRutType={rotRutType || undefined}
            personalNumber={personalNumber}
            propertyDesignation={propertyDesignation}
            onFieldChange={(field, value) => {
              if (field === 'personalNumber') setPersonalNumber(value)
              if (field === 'propertyDesignation') setPropertyDesignation(value)
            }}
          />

          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
            <button
              type="button"
              onClick={onSave}
              disabled={saving || !customerId || items.length === 0}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-primary-700 hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 shadow-sm"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {saving ? savingLabel : saveLabel}
            </button>
            {!customerId && <p className="mt-2 text-xs text-slate-500 text-center">Välj kund först</p>}
            {customerId && items.length === 0 && <p className="mt-2 text-xs text-slate-500 text-center">Lägg till minst en rad</p>}
          </div>
        </div>

        {/* ── Dokumentpanelen ───────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-2 flex flex-wrap items-center gap-1.5">
            <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Mer</span>
            {(
              [
                { key: 'stil', label: 'Stil' },
                { key: 'rot', label: 'Moms & ROT' },
                { key: 'texter', label: 'Referenser & texter' },
              ] as const
            ).map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => setActivePanel(activePanel === p.key ? null : p.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  activePanel === p.key
                    ? 'bg-primary-700 text-white'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setMainView('document')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  mainView === 'document' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Dokument
              </button>
              <button
                type="button"
                onClick={() => setMainView('list')}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  mainView === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Listvy
              </button>
            </div>
          </div>

          {activePanel === 'stil' && (
            <div className="relative">
              <MerPanelClose onClose={() => setActivePanel(null)} />
              <QuoteStylePicker
                kind="invoice"
                invoiceId={invoiceId}
                value={templateStyle}
                onChange={setTemplateStyle}
                businessDefaultStyle={businessDefaultStyle}
                accentColor={businessConfig?.accent_color}
              />
            </div>
          )}

          {activePanel === 'rot' && (
            <InvoiceRotMomsSection
              vatRate={vatRate}
              setVatRate={setVatRate}
              rotRutType={rotRutType}
              setRotRutType={setRotRutType}
              personalNumber={personalNumber}
              setPersonalNumber={setPersonalNumber}
              propertyDesignation={propertyDesignation}
              setPropertyDesignation={setPropertyDesignation}
            />
          )}

          {activePanel === 'texter' && (
            <InvoiceTextsSection
              ourReference={ourReference}
              setOurReference={setOurReference}
              yourReference={yourReference}
              setYourReference={setYourReference}
              introductionText={introductionText}
              setIntroductionText={setIntroductionText}
              conclusionText={conclusionText}
              setConclusionText={setConclusionText}
            />
          )}

          {mainView === 'list' ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
              <LineItemEditor
                items={items}
                onChange={setItems}
                rotRutType={rotRutType || undefined}
              />
            </div>
          ) : (
            <div className="lg:sticky lg:top-[5.5rem] lg:h-[calc(100vh-7rem)]">
              {canLiveEdit ? (
                <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-auto h-full p-4">
                  <DocumentScaler>
                    <QuoteDocument
                      data={liveTemplateData}
                      mode="edit"
                      handlers={liveHandlers}
                      sheetMode={isMobile}
                      onRowTap={setSheetItemId}
                    />
                  </DocumentScaler>
                </div>
              ) : mode === 'edit' && invoiceId ? (
                <iframe
                  src={`/api/invoices/pdf?invoiceId=${invoiceId}&format=html&style=${effectiveStyle}`}
                  className="w-full h-full bg-white rounded-2xl border border-slate-200"
                  title="Fakturaförhandsgranskning"
                />
              ) : (
                <div className="bg-white rounded-2xl border border-slate-200 h-full flex items-center justify-center p-8 text-center">
                  <p className="text-sm text-slate-500 max-w-xs">
                    {effectiveStyle === 'premium' ? 'Premium' : 'Friendly'}-stilen visas som förhandsgranskning först när
                    fakturan är sparad. Välj Modern för att redigera direkt i dokumentet redan nu.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <InvoiceRowEditSheet
        item={sheetItem}
        rotRutType={rotRutType}
        onUpdate={updateItem}
        onRemove={removeItem}
        onClose={() => setSheetItemId(null)}
      />
    </>
  )
}
