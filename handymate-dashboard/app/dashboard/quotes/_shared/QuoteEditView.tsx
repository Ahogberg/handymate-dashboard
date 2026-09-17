'use client'

import type { Dispatch, SetStateAction, ReactNode } from 'react'
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
import { ProductModal, type ProductInitialValues, type ProductSavePayload } from '@/components/products/ProductModal'
import type { CustomCategory } from '@/lib/constants/categories'

import { useReservationSuggestions } from './useReservationSuggestions'
import { ReservationMutedNotice } from './ReservationSuggestionBanner'
import { ReservationReviewSheet } from './ReservationReviewSheet'
import { QuoteMarginCard } from './QuoteMarginCard'
import { QuoteDocumentSurface } from './QuoteDocumentSurface'
import QuotePackageComparison from '@/components/quotes/QuotePackageComparison'
// RIVNING PAKET B (2026-09-17): QuoteStylePicker monteras inte längre här
// (komponenten lever kvar, InvoiceEditor.tsx använder den fortfarande för
// fakturans egen stil). QuoteRotSection och QuoteStandardTextsSection är
// raderade filer — se lib/quotes/panel-status.ts:s docblock för var de tre
// ytorna flyttade. QuoteTotalsSection är också raderad.
import { QuotePaymentPlanSection } from './QuotePaymentPlanSection'
import { QuoteDisplaySettingsSection } from './QuoteDisplaySettingsSection'
import { QuoteSaveTemplateModal } from './QuoteSaveTemplateModal'
import { QuoteBuilderHeader } from './QuoteBuilderHeader'
import { QuoteBuilderBottomBar } from './QuoteBuilderBottomBar'
import { QuoteEditCustomerSection } from './QuoteEditCustomerSection'
import type { ProductWithComponents } from './applyProductToItem'
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
 * `tests/quotes-mer-i-flodet.spec.ts` låser att de delade Mer-panelerna
 * (efter rivning paket B, 2026-09-17: QuotePaymentPlanSection/
 * QuoteDisplaySettingsSection/QuoteNewAttachmentsCard — Stil/Villkor &
 * texter/ROT-detaljer är borta, se panel-status.ts) monteras EXAKT EN GÅNG
 * i `QuoteBuilder.tsx` — de monteras redan där för create-lägets "Mer"-rad.
 * Om edit-lägets JSX (som VISAR dem permanent, ingen "Mer"-rad) låg
 * inline i samma fil hade mount-räkningen blivit två för varje panel.
 * Edit-läget har dessutom en helt annan layout (klassisk tvåkolumn, ingen
 * Snabboffert/canvas-first "Mer"-rad) — att tvinga in det i samma
 * returstatement som create-lägets ~250 rader kanvas-JSX hade gjort
 * QuoteBuilder.tsx svårläst utan att vinna något.
 */
export interface QuoteEditViewProps {
  visitRuleEditor?: ReactNode
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
  products: ProductWithComponents[]
  onSaveAsStandard: (productId: string, price: number) => void
  addItem: (type: QuoteItem['item_type']) => void
  updateItem: (id: string, field: keyof QuoteItem, value: any) => void
  removeItem: (id: string) => void
  moveItemById: (id: string, direction: 'up' | 'down') => void
  addFromProduct: (product: ProductWithComponents, quantity?: number) => void
  applyProductToExistingRow: (itemId: string, product: ProductWithComponents) => void
  addBlankRowWithDescription: (description: string) => void
  setProductModalRow: (row: QuoteItem | null) => void

  /** Rivning paket B (2026-09-17, rad 2.5/2.6): vilket avdrag som är valt —
      ersätter hasRotItems/hasRutItems, som bara behövdes av den borttagna
      QuoteRotSection/QuoteTotalsSection. Vidarebefordras rakt till
      QuoteDocumentSurface. */
  activeDeductionType: 'rot' | 'rut' | null

  /** Rivning paket B (2026-09-17, rad 2.3): standardtexterna, vidare-
      befordrade till dokumentets egna textfält i stället för den
      borttagna QuoteStandardTextsSection. */
  textsByType: Record<string, QuoteStandardText[]>
  referencePerson: string
  setReferencePerson: (v: string) => void
  customerReference: string
  setCustomerReference: (v: string) => void
  projectAddress: string
  setProjectAddress: (v: string) => void

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

  vatRate: number
  discountPercent: number

  liveAvailable: boolean
  quoteTemplateData: QuoteTemplateData
  liveHandlers: QuoteDocumentHandlers
  setSheetItemId: (id: string | null) => void
  addRowSheetOpen: boolean
  setAddRowSheetOpen: (b: boolean) => void
  templatePreviewPayload: TemplatePreviewPayload

  sheetItem: QuoteItem | null

  businessId: string

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
    reservations, recalculated,
    customers, selectedCustomer, setSelectedCustomer, validDays, setValidDays, title, setTitle, description, setDescription,
    items, setItems, allCategories, products, onSaveAsStandard, addItem, updateItem, removeItem, moveItemById, addFromProduct, applyProductToExistingRow,
    addBlankRowWithDescription, setProductModalRow,
    activeDeductionType, textsByType, referencePerson, setReferencePerson,
    customerReference, setCustomerReference, projectAddress, setProjectAddress,
    showPaymentPlan, setShowPaymentPlan, paymentPlan, calculatedPaymentPlan, paymentPlanValid,
    addPaymentPlanEntry, updatePaymentPlanEntry, removePaymentPlanEntry, formatCurrency,
    attachments, setAttachments, uploadingFile, onFileUpload,
    showDisplaySettings, setShowDisplaySettings, detailLevel, setDetailLevel, showUnitPrices, setShowUnitPrices,
    showQuantities, setShowQuantities,
    vatRate, discountPercent,
    liveAvailable, quoteTemplateData,
    liveHandlers, setSheetItemId, addRowSheetOpen, setAddRowSheetOpen, templatePreviewPayload, sheetItem,
    businessId, productModalRow, savingProduct, saveItemToProducts, buildProductInitialValues,
    showSaveTemplateModal, setShowSaveTemplateModal, templateName, setTemplateName, savingTemplate, saveAsTemplate,
  } = props

  // Fas B-granskningsfix (offertskaparen-design-polish, 2026-08-31): lyft ur
  // en gång i stället för att copy-pasta samma uttryck till både
  // QuoteBuilderHeader (desktop) och QuoteBuilderBottomBar (mobil) nedan.
  const canSend = !!selectedCustomer

  // DESIGN-SPEC.md ("Helt tomt läge", offertskaparen-polish): samma villkor
  // som QuoteBuilder.tsx (create-läget) — döljer completeness-remsan (både
  // header-rad 2 och bottenfältets chip-rad) helt tills offerten har
  // meningsfullt innehåll. Beräknas lokalt av samma skäl som `canSend` ovan:
  // den här komponenten är ren presentation men äger sitt eget JSX-träd.
  const hasQuoteContent = items.length > 0 || !!selectedCustomer

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Fas B (offertskaparen-design-polish, 2026-08-31): pb-40/lg:pb-6
          ersätter det gamla py-4/sm:py-6-bottenvärdet EXPLICIT (pt-* hanterar
          toppen oförändrat) så det fasta bottenfältet (QuoteBuilderBottomBar,
          lg:hidden, monterad nedan) aldrig täcker dokumentets sista rad
          under `lg`. Se samma (granskade) matteräkning i QuoteBuilder.tsx
          (create-läget) — safe-area-inset-bottom på riktiga iPhones (~34px)
          gör baren högre än pb-32 räckte till. */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-40 lg:pb-6">
        <QuoteBuilderHeader
          mode="edit"
          quoteNumber={quoteNumber}
          title={title}
          completenessSummaries={hasQuoteContent ? completenessSummaries : undefined}
          onSelectSection={onSelectSection}
          autoSaveStatus={autoSaveStatus}
          saving={saving}
          canSend={canSend}
          hasItems={hasItems}
          onSendQuote={onSendQuote}
          onSaveDraft={onSaveDraft}
          onSaveTemplate={onSaveTemplate}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(620px,46%)] gap-5 items-start">
          {/* ── Left Column — Form ─────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            {/* RIVNING PAKET B (2026-09-17, rad 2.4/3.12): QuoteStylePicker
                monteras inte längre här — firmadefaulten i inställningar
                räcker, ingen per-offert-stilväljare kvar. */}

            {/* FAS D (offertskaparen-design-polish, 2026-09-01): den
                fristående "N reservationer matchar"-bannern som satt här
                (ReservationSuggestionBanner) är borttagen — förslagen
                renderas nu i dokumentets egen Reservationer-sektion
                (QuoteDocument.tsx, se `reservationSuggestions`-proppen på
                QuoteDocumentSurface nedan). ReservationMutedNotice är en
                ANNAN, orelaterad affordans och stannar kvar precis här. */}
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
              referencePerson={referencePerson}
              setReferencePerson={setReferencePerson}
              customerReference={customerReference}
              setCustomerReference={setCustomerReference}
              projectAddress={projectAddress}
              setProjectAddress={setProjectAddress}
            />

            {props.visitRuleEditor}
            <QuotePackageComparison items={items} discountPercent={discountPercent} vatRate={vatRate} onApply={setItems} />

            {/* RIVNING PAKET B (2026-09-17, rad 2.3/2.5/2.6): QuoteRotSection,
                QuoteStandardTextsSection och QuoteTotalsSection borttagna —
                avdragsväxeln och texterna sitter nu i dokumentets egen
                summering/villkorsstycke (se activeDeductionType/textsByType
                på QuoteDocumentSurface nedan). */}

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
          </div>

          {/* ── Höger kolumn — dokumentytan, fyller viewport ─────── */}
          <div className="lg:sticky lg:top-[5.5rem] lg:h-[calc(100vh-7rem)]">
            <QuoteDocumentSurface
              liveEnabled={liveAvailable}
              liveTemplateData={quoteTemplateData}
              liveHandlers={liveHandlers}
              onRowTap={setSheetItemId}
              onAddRowTap={() => setAddRowSheetOpen(true)}
              templatePreviewPayload={templatePreviewPayload}
              reservationSuggestions={reservations.suggestions}
              onReviewReservationSuggestions={() => reservations.setReviewOpen(true)}
              activeDeductionType={activeDeductionType}
              standardTexts={textsByType}
              // onOpenAiHelp intentionally omitted: edit-läget har ingen
              // AI-utkasts-flöde (showAiHelper/QuoteNewAIHelper finns bara i
              // create-läget i QuoteBuilder.tsx) — utan proppen visar
              // dokumentets tomma-läge bara "Lägg till rad", ingen "eller
              // beskriv jobbet"-länk. Se QuoteDocument.tsx:s onOpenAiHelp-docblock.
            />
          </div>
        </div>
      </div>

      {/* Fas B (offertskaparen-design-polish, 2026-08-31): mobilens fasta
          bottenfält — samma completeness-data och Spara/Skicka-handlers som
          headern ovan (nu desktop-only, se dess `hidden lg:flex`-gate).
          Edit-läget har aldrig haft sendDisabledReason/sendConfirmPending/
          onConfirmSend/onCancelSend (se QuoteBuilderHeader.tsx:s docblock —
          den "extra bekräftelsen" hörde bara till create-flödet), så de
          utelämnas här precis som i mountningen av headern ovan. */}
      <QuoteBuilderBottomBar
        summaries={completenessSummaries}
        hasQuoteContent={hasQuoteContent}
        onSelect={onSelectSection}
        saving={saving}
        canSend={canSend}
        onSendQuote={onSendQuote}
        onSaveDraft={onSaveDraft}
      />

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
        onSelectProductForRow={(itemId, product) => { void applyProductToExistingRow(itemId, product) }}
      />

      <AddRowSheet
        open={addRowSheetOpen}
        reservationCount={product => reservations.countForProduct(product)}
        onSelectProduct={(product, quantity) => { void addFromProduct(product, quantity) }}
        onAddBlankRow={addBlankRowWithDescription}
        onAddRowType={addItem}
        onClose={() => setAddRowSheetOpen(false)}
      />

      <ReservationReviewSheet
        open={reservations.reviewOpen}
        suggestions={reservations.suggestions}
        onAccept={reservations.acceptSuggestions}
        onSkipAll={reservations.dismissAll}
        onClose={() => reservations.setReviewOpen(false)}
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
