'use client'

import type { Dispatch, SetStateAction } from 'react'
import ProductSearchModal from '@/components/ProductSearchModal'
import type { TemplatePreviewPayload } from '@/components/quotes/TemplatePreviewFrame'
import type { QuoteTemplateData } from '@/lib/quote-templates/types'
import type { QuoteDocumentHandlers } from '@/components/quotes/document/QuoteDocument'
import { RowEditSheet } from '@/components/quotes/document/RowEditSheet'
import { AddRowSheet } from '@/components/quotes/document/AddRowSheet'
import type {
  DetailLevel,
  PaymentPlanEntry,
  QuoteItem,
  QuoteStandardText,
} from '@/lib/types/quote'
import type { QuoteSection, SectionSummary } from '@/lib/quotes/quote-completeness'
import { QuoteStylePicker } from '@/components/quotes/QuoteStylePicker'
import { ProductModal, type ProductInitialValues, type ProductSavePayload } from '@/components/products/ProductModal'
import type { CustomCategory } from '@/lib/constants/categories'

import { useReservationSuggestions } from './useReservationSuggestions'
import { ReservationSuggestionBanner, ReservationMutedNotice } from './ReservationSuggestionBanner'
import { ReservationReviewSheet } from './ReservationReviewSheet'
import { QuoteMarginCard } from './QuoteMarginCard'
import { QuotePreviewPanel } from './QuotePreviewPanel'
import { QuoteItemsSection } from './QuoteItemsSection'
import { QuoteRotSection } from './QuoteRotSection'
import { QuoteStandardTextsSection } from './QuoteStandardTextsSection'
import { QuotePaymentPlanSection } from './QuotePaymentPlanSection'
import { QuoteDisplaySettingsSection } from './QuoteDisplaySettingsSection'
import { QuoteTotalsSection } from './QuoteTotalsSection'
import { QuoteSaveTemplateModal } from './QuoteSaveTemplateModal'
import { QuoteBuilderHeader } from './QuoteBuilderHeader'
import { QuoteEditCustomerSection } from './QuoteEditCustomerSection'
import type { ProductWithComponents } from './applyProductToItem'
import type { useQuoteCalculations } from './useQuoteCalculations'
import { QuoteNewAttachmentsCard } from '../new/components/QuoteNewAttachmentsCard'

interface Customer {
  customer_id: string
  name: string
  phone_number: string
  email: string
  address_line: string
  personal_number?: string
  property_designation?: string
}

/**
 * Offertredigerarens EGNA layout (Fas 2, offert-omtaget 2026-08-31) —
 * extraherad, i det närmaste ordagrant, ur den gamla `[id]/edit/page.tsx`s
 * render-JSX. Ren presentation: allt state/alla handlers ägs av
 * QuoteBuilder.tsx (`mode="edit"`) och skickas in som props, exakt samma
 * modell som create-lägets state.
 *
 * VARFÖR EN EGEN FIL (inte inline i QuoteBuilder.tsx):
 * `tests/quotes-mer-i-flodet.spec.ts` låser att de sex delade
 * "Mer"-panelerna (QuoteStylePicker/QuoteStandardTextsSection/
 * QuotePaymentPlanSection/QuoteDisplaySettingsSection/
 * QuoteNewAttachmentsCard/QuoteRotSection) monteras EXAKT EN GÅNG i
 * `QuoteBuilder.tsx` — de monteras redan där för create-lägets "Mer"-rad.
 * Om edit-lägets JSX (som VISAR alla sex permanent, ingen "Mer"-rad) låg
 * inline i samma fil hade mount-räkningen blivit två för varje panel.
 * Edit-läget har dessutom en helt annan layout (klassisk tvåkolumn, ingen
 * Snabboffert/canvas-first "Mer"-rad) — att tvinga in det i samma
 * returstatement som create-lägets ~250 rader kanvas-JSX hade gjort
 * QuoteBuilder.tsx svårläst utan att vinna något.
 */
export interface QuoteEditViewProps {
  quoteId: string
  quoteNumber: string
  /** Completeness-remsan (Fas 1, offert-omtaget 2026-08-31) — samma
      sammanfattning som create-läget beräknar (sectionSummary/SECTION_ORDER
      i lib/quotes/quote-completeness.ts), ägd av QuoteBuilder.tsx eftersom
      den här komponenten är ren presentation (se docblock ovan). Renderas
      som header-RAD 2 i QuoteBuilderHeader. */
  completenessSummaries: Record<QuoteSection, SectionSummary>
  onSelectSection: (section: QuoteSection) => void
  autoSaveStatus: 'idle' | 'saving' | 'saved' | 'error'
  saving: boolean
  onSendQuote: () => void
  onSaveDraft: () => void
  onSaveTemplate: () => void
  hasItems: boolean

  businessDefaultStyle: 'modern' | 'premium' | 'friendly'
  templateStyle: 'modern' | 'premium' | 'friendly' | null
  setTemplateStyle: (s: 'modern' | 'premium' | 'friendly' | null) => void

  reservations: ReturnType<typeof useReservationSuggestions>

  recalculated: QuoteItem[]

  customers: Customer[]
  selectedCustomer: string
  setSelectedCustomer: (id: string) => void
  validDays: number
  setValidDays: (n: number) => void
  title: string
  setTitle: (s: string) => void
  description: string
  setDescription: (s: string) => void

  items: QuoteItem[]
  setItems: Dispatch<SetStateAction<QuoteItem[]>>
  allCategories: { slug: string; label: string; rot: boolean; rut: boolean }[]
  localCustomCategories: CustomCategory[]
  products: ProductWithComponents[]
  onSaveAsStandard: (productId: string, price: number) => void
  dndSensors: any
  handleDragEnd: (event: any) => void
  addItem: (type: QuoteItem['item_type']) => void
  updateItem: (id: string, field: keyof QuoteItem, value: any) => void
  removeItem: (id: string) => void
  moveItem: (index: number, direction: 'up' | 'down') => void
  moveItemById: (id: string, direction: 'up' | 'down') => void
  addFromProduct: (product: ProductWithComponents, quantity?: number) => void
  applyProductToExistingRow: (itemId: string, product: ProductWithComponents) => void
  addBlankRowWithDescription: (description: string) => void
  setShowGrossistSearch: (b: boolean) => void
  createCustomCategory: (label: string, itemId: string) => void
  showNewCategoryInput: string | null
  setShowNewCategoryInput: (v: string | null) => void
  newCategoryLabel: string
  setNewCategoryLabel: (v: string) => void
  setProductModalRow: (row: QuoteItem | null) => void

  hasRotItems: boolean
  hasRutItems: boolean
  personnummer: string
  setPersonnummer: (v: string) => void
  fastighetsbeteckning: string
  setFastighetsbeteckning: (v: string) => void

  showStandardTexts: boolean
  setShowStandardTexts: (b: boolean) => void
  textsByType: Record<string, QuoteStandardText[]>
  referencePerson: string
  setReferencePerson: (v: string) => void
  customerReference: string
  setCustomerReference: (v: string) => void
  projectAddress: string
  setProjectAddress: (v: string) => void
  notIncluded: string
  setNotIncluded: (v: string) => void
  ataTerms: string
  setAtaTerms: (v: string) => void
  paymentTermsText: string
  setPaymentTermsText: (v: string) => void
  termsText: string
  setTermsText: (v: string) => void

  showPaymentPlan: boolean
  setShowPaymentPlan: (b: boolean) => void
  paymentPlan: PaymentPlanEntry[]
  calculatedPaymentPlan: PaymentPlanEntry[]
  paymentPlanValid: boolean
  addPaymentPlanEntry: () => void
  updatePaymentPlanEntry: (index: number, field: keyof PaymentPlanEntry, value: any) => void
  removePaymentPlanEntry: (index: number) => void
  formatCurrency: (amount: number) => string

  attachments: Array<{ name: string; url: string; size?: number; path?: string }>
  setAttachments: Dispatch<SetStateAction<Array<{ name: string; url: string; size?: number; path?: string }>>>
  uploadingFile: boolean
  onFileUpload: (file: File) => Promise<void>

  showDisplaySettings: boolean
  setShowDisplaySettings: (b: boolean) => void
  detailLevel: DetailLevel
  setDetailLevel: (d: DetailLevel) => void
  showUnitPrices: boolean
  setShowUnitPrices: (b: boolean) => void
  showQuantities: boolean
  setShowQuantities: (b: boolean) => void

  totals: ReturnType<typeof useQuoteCalculations>['totals']
  vatRate: number
  discountPercent: number
  setDiscountPercent: (n: number) => void

  showPreviewPanel: boolean
  setShowPreviewPanel: (b: boolean) => void
  previewMode: 'live' | 'design'
  setPreviewMode: (m: 'live' | 'design') => void
  liveAvailable: boolean
  quoteTemplateData: QuoteTemplateData
  liveHandlers: QuoteDocumentHandlers
  setSheetItemId: (id: string | null) => void
  addRowSheetOpen: boolean
  setAddRowSheetOpen: (b: boolean) => void
  templatePreviewPayload: TemplatePreviewPayload

  sheetItem: QuoteItem | null

  showGrossistSearch: boolean
  businessId: string
  addFromGrossist: (p: any) => void

  productModalRow: QuoteItem | null
  savingProduct: boolean
  saveItemToProducts: (payload: ProductSavePayload) => void
  buildProductInitialValues: (row: QuoteItem) => ProductInitialValues

  showSaveTemplateModal: boolean
  setShowSaveTemplateModal: (b: boolean) => void
  templateName: string
  setTemplateName: (s: string) => void
  savingTemplate: boolean
  saveAsTemplate: () => void
}

export function QuoteEditView(props: QuoteEditViewProps) {
  const {
    quoteId, quoteNumber, completenessSummaries, onSelectSection,
    autoSaveStatus, saving, onSendQuote, onSaveDraft, onSaveTemplate, hasItems,
    businessDefaultStyle, templateStyle, setTemplateStyle,
    reservations, recalculated,
    customers, selectedCustomer, setSelectedCustomer, validDays, setValidDays, title, setTitle, description, setDescription,
    items, setItems, allCategories, localCustomCategories, products, onSaveAsStandard, dndSensors, handleDragEnd,
    addItem, updateItem, removeItem, moveItem, moveItemById, addFromProduct, applyProductToExistingRow,
    addBlankRowWithDescription, setShowGrossistSearch, createCustomCategory, showNewCategoryInput,
    setShowNewCategoryInput, newCategoryLabel, setNewCategoryLabel, setProductModalRow,
    hasRotItems, hasRutItems, personnummer, setPersonnummer, fastighetsbeteckning, setFastighetsbeteckning,
    showStandardTexts, setShowStandardTexts, textsByType, referencePerson, setReferencePerson,
    customerReference, setCustomerReference, projectAddress, setProjectAddress, notIncluded, setNotIncluded,
    ataTerms, setAtaTerms, paymentTermsText, setPaymentTermsText, termsText, setTermsText,
    showPaymentPlan, setShowPaymentPlan, paymentPlan, calculatedPaymentPlan, paymentPlanValid,
    addPaymentPlanEntry, updatePaymentPlanEntry, removePaymentPlanEntry, formatCurrency,
    attachments, setAttachments, uploadingFile, onFileUpload,
    showDisplaySettings, setShowDisplaySettings, detailLevel, setDetailLevel, showUnitPrices, setShowUnitPrices,
    showQuantities, setShowQuantities,
    totals, vatRate, discountPercent, setDiscountPercent,
    showPreviewPanel, setShowPreviewPanel, previewMode, setPreviewMode, liveAvailable, quoteTemplateData,
    liveHandlers, setSheetItemId, addRowSheetOpen, setAddRowSheetOpen, templatePreviewPayload, sheetItem,
    showGrossistSearch, businessId, addFromGrossist,
    productModalRow, savingProduct, saveItemToProducts, buildProductInitialValues,
    showSaveTemplateModal, setShowSaveTemplateModal, templateName, setTemplateName, savingTemplate, saveAsTemplate,
  } = props

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4 sm:py-6">
        <QuoteBuilderHeader
          mode="edit"
          quoteNumber={quoteNumber}
          title={title}
          completenessSummaries={completenessSummaries}
          onSelectSection={onSelectSection}
          autoSaveStatus={autoSaveStatus}
          saving={saving}
          canSend={!!selectedCustomer}
          hasItems={hasItems}
          onSendQuote={onSendQuote}
          onSaveDraft={onSaveDraft}
          onSaveTemplate={onSaveTemplate}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(620px,46%)] gap-5 items-start">
          {/* ── Left Column — Form ─────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            <QuoteStylePicker
              quoteId={quoteId}
              value={templateStyle}
              onChange={setTemplateStyle}
              businessDefaultStyle={businessDefaultStyle}
            />

            {/* Reservationsmotorn: tyst räknare, aldrig en avbrytande dialog. */}
            <ReservationSuggestionBanner
              count={reservations.suggestions.length}
              onReview={() => reservations.setReviewOpen(true)}
            />
            {reservations.mutedNotice && (
              <ReservationMutedNotice
                title={reservations.mutedNotice.title}
                onUndo={() => reservations.unmute(reservations.mutedNotice!.id)}
                onClose={reservations.dismissMutedNotice}
              />
            )}

            {/* Marginalen medan priset sätts — samma kort som new-sidan. */}
            <QuoteMarginCard items={recalculated} />

            <QuoteEditCustomerSection
              customers={customers}
              selectedCustomer={selectedCustomer}
              setSelectedCustomer={setSelectedCustomer}
              validDays={validDays}
              setValidDays={setValidDays}
              title={title}
              setTitle={setTitle}
              description={description}
              setDescription={setDescription}
            />

            <QuoteItemsSection
              items={items}
              recalculated={recalculated}
              allCategories={allCategories}
              customCategories={localCustomCategories}
              products={products}
              onSaveAsStandard={onSaveAsStandard}
              dndSensors={dndSensors}
              onDragEnd={handleDragEnd}
              onAddItem={addItem}
              onUpdateItem={updateItem}
              onRemoveItem={removeItem}
              onMoveItem={moveItem}
              onSelectProduct={(product, quantity) => { void addFromProduct(product, quantity) }}
              onSelectProductForRow={(itemId, product) => { void applyProductToExistingRow(itemId, product) }}
              onAddBlankRow={addBlankRowWithDescription}
              onOpenGrossistSearch={() => setShowGrossistSearch(true)}
              onCreateCategory={createCustomCategory}
              showNewCategoryInput={showNewCategoryInput}
              setShowNewCategoryInput={setShowNewCategoryInput}
              newCategoryLabel={newCategoryLabel}
              setNewCategoryLabel={setNewCategoryLabel}
              onSaveToProducts={row => setProductModalRow(row)}
            />

            <QuoteRotSection
              items={items}
              setItems={setItems}
              hasRotItems={hasRotItems}
              personnummer={personnummer}
              setPersonnummer={setPersonnummer}
              fastighetsbeteckning={fastighetsbeteckning}
              setFastighetsbeteckning={setFastighetsbeteckning}
            />

            <QuoteStandardTextsSection
              open={showStandardTexts}
              setOpen={setShowStandardTexts}
              textsByType={textsByType}
              referencePerson={referencePerson}
              setReferencePerson={setReferencePerson}
              customerReference={customerReference}
              setCustomerReference={setCustomerReference}
              projectAddress={projectAddress}
              setProjectAddress={setProjectAddress}
              notIncluded={notIncluded}
              setNotIncluded={setNotIncluded}
              ataTerms={ataTerms}
              setAtaTerms={setAtaTerms}
              paymentTermsText={paymentTermsText}
              setPaymentTermsText={setPaymentTermsText}
              termsText={termsText}
              setTermsText={setTermsText}
            />

            <QuotePaymentPlanSection
              open={showPaymentPlan}
              setOpen={setShowPaymentPlan}
              paymentPlan={paymentPlan}
              calculatedPaymentPlan={calculatedPaymentPlan}
              paymentPlanValid={paymentPlanValid}
              onAddEntry={addPaymentPlanEntry}
              onUpdateEntry={updatePaymentPlanEntry}
              onRemoveEntry={removePaymentPlanEntry}
              formatCurrency={formatCurrency}
            />

            {/* Bilagor — samma kort som new-sidan. */}
            <QuoteNewAttachmentsCard
              attachments={attachments}
              setAttachments={setAttachments}
              uploadingFile={uploadingFile}
              onFileUpload={onFileUpload}
            />

            <QuoteDisplaySettingsSection
              open={showDisplaySettings}
              setOpen={setShowDisplaySettings}
              detailLevel={detailLevel}
              setDetailLevel={setDetailLevel}
              showUnitPrices={showUnitPrices}
              setShowUnitPrices={setShowUnitPrices}
              showQuantities={showQuantities}
              setShowQuantities={setShowQuantities}
            />

            <QuoteTotalsSection
              totals={totals}
              vatRate={vatRate}
              discountPercent={discountPercent}
              setDiscountPercent={setDiscountPercent}
              hasRotItems={hasRotItems}
              hasRutItems={hasRutItems}
              formatCurrency={formatCurrency}
              items={items}
              setItems={setItems}
            />
          </div>

          {/* ── Right Column — Preview-only, fyller viewport ─────── */}
          <div className="lg:sticky lg:top-[5.5rem] lg:h-[calc(100vh-7rem)]">
            <QuotePreviewPanel
              open={showPreviewPanel}
              setOpen={setShowPreviewPanel}
              previewMode={previewMode}
              setPreviewMode={setPreviewMode}
              liveEnabled={liveAvailable}
              liveTemplateData={quoteTemplateData}
              liveHandlers={liveHandlers}
              onRowTap={setSheetItemId}
              onAddRowTap={() => setAddRowSheetOpen(true)}
              templatePreviewPayload={templatePreviewPayload}
            />
          </div>
        </div>
      </div>

      <RowEditSheet
        item={sheetItem}
        allCategories={allCategories}
        onUpdate={updateItem}
        onRemove={removeItem}
        onMove={moveItemById}
        onClose={() => setSheetItemId(null)}
        linkedProductPrice={
          sheetItem?.linked_product_id
            ? products.find(p => p.id === sheetItem.linked_product_id)?.sales_price ?? null
            : null
        }
        onSaveAsStandard={(productId, price) => { void onSaveAsStandard(productId, price) }}
        onSaveToBank={row => setProductModalRow(row)}
      />

      <AddRowSheet
        open={addRowSheetOpen}
        reservationCount={product => reservations.countForProduct(product)}
        onSelectProduct={(product, quantity) => { void addFromProduct(product, quantity) }}
        onAddBlankRow={addBlankRowWithDescription}
        onAddHeading={() => addItem('heading')}
        onClose={() => setAddRowSheetOpen(false)}
      />

      <ReservationReviewSheet
        open={reservations.reviewOpen}
        suggestions={reservations.suggestions}
        onAccept={reservations.acceptSuggestions}
        onSkipAll={reservations.dismissAll}
        onClose={() => reservations.setReviewOpen(false)}
      />

      <ProductSearchModal
        isOpen={showGrossistSearch}
        onClose={() => setShowGrossistSearch(false)}
        onSelect={p => {
          addFromGrossist(p)
          setShowGrossistSearch(false)
        }}
        businessId={businessId}
      />

      {productModalRow && (
        <ProductModal
          product={null}
          initialValues={buildProductInitialValues(productModalRow)}
          title="Spara i prislistan"
          saving={savingProduct}
          onSave={saveItemToProducts}
          onClose={() => setProductModalRow(null)}
        />
      )}

      <QuoteSaveTemplateModal
        show={showSaveTemplateModal}
        onClose={() => setShowSaveTemplateModal(false)}
        templateName={templateName}
        setTemplateName={setTemplateName}
        saving={savingTemplate}
        onSave={saveAsTemplate}
      />
    </div>
  )
}
