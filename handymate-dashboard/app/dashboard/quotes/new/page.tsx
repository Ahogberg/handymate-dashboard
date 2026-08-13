'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { useToast } from '@/components/Toast'
import ProductSearchModal from '@/components/ProductSearchModal'
import type { TemplatePreviewPayload } from '@/components/quotes/TemplatePreviewFrame'
import type { QuoteTemplateData, QuoteTemplateItem } from '@/lib/quote-templates/types'
import type { QuoteDocumentHandlers } from '@/components/quotes/document/QuoteDocument'
import { RowEditSheet } from '@/components/quotes/document/RowEditSheet'
import { AddRowSheet } from '@/components/quotes/document/AddRowSheet'
import {
  generateItemId, recalculateItems, setItemRotRut, legacyItemRotRutType, applyOptionRowDefaults,
  getItemRotRutType, resolveLegacyItemFields,
} from '@/lib/quote-calculations'
import { compressImageFile } from '@/lib/images/compress-photo'
import { getAllCategories, type CustomCategory } from '@/lib/constants/categories'
import {
  type DetailLevel,
  type PaymentPlanEntry,
  type QuoteItem,
  type QuoteStandardText,
  type QuoteTemplate,
} from '@/lib/types/quote'

import { useQuoteCalculations } from '../_shared/useQuoteCalculations'
import { useQuoteItems } from '../_shared/useQuoteItems'
import { usePriceListLookup } from '../_shared/usePriceListLookup'
import { ensureProductComponents, applyProductToItem, type ProductWithComponents } from '../_shared/applyProductToItem'
import { QuoteQuickstartCard, type QuickstartRow } from '../_shared/QuoteQuickstartCard'
import { QuoteItemsSection } from '../_shared/QuoteItemsSection'
import { QUOTE_SURFACE_BUSINESS_SELECT, logBusinessConfigError } from '@/lib/business/quote-surface-select'
import { useReservationSuggestions } from '../_shared/useReservationSuggestions'
import { ReservationSuggestionBanner, ReservationMutedNotice } from '../_shared/ReservationSuggestionBanner'
import { ReservationReviewSheet } from '../_shared/ReservationReviewSheet'
import { QuoteMarginCard } from '../_shared/QuoteMarginCard'
import { panelStatus } from '@/lib/quotes/panel-status'
import { QuotePreviewPanel } from '../_shared/QuotePreviewPanel'
import { ProductModal, type ProductInitialValues, type ProductSavePayload } from '@/components/products/ProductModal'

// Återanvända komponenter från edit-sprinten
import { QuoteEditRotSection } from '../[id]/edit/components/QuoteEditRotSection'
import { QuoteEditStandardTextsSection } from '../[id]/edit/components/QuoteEditStandardTextsSection'
import { QuoteEditPaymentPlanSection } from '../[id]/edit/components/QuoteEditPaymentPlanSection'
import { QuoteEditDisplaySettingsSection } from '../[id]/edit/components/QuoteEditDisplaySettingsSection'
import { QuoteEditTotalsSection } from '../[id]/edit/components/QuoteEditTotalsSection'
import { QuoteEditSaveTemplateModal } from '../[id]/edit/components/QuoteEditSaveTemplateModal'

import { QuoteStylePicker } from '@/components/quotes/QuoteStylePicker'

// Nya komponenter unika för new-vyn
import { QuoteNewHeader } from './components/QuoteNewHeader'
import { DanielsBedomning } from './components/DanielsBedomning'
import { QuoteNewAIHelper } from './components/QuoteNewAIHelper'
import { QuoteNewCustomerSection } from './components/QuoteNewCustomerSection'
import { QuoteNewAttachmentsCard } from './components/QuoteNewAttachmentsCard'
import { QuoteNewStartChooser } from './components/QuoteNewStartChooser'
import { QuickIntake } from './components/quick/QuickIntake'
import { QuickBuilding } from './components/quick/QuickBuilding'
import { QuickReviewBar } from './components/quick/QuickReviewBar'
import { QuickReceipt } from './components/quick/QuickReceipt'
import {
  sectionHandlers,
  sectionSummary,
  nextSection,
  SECTION_ORDER,
  type QuoteSection,
} from '@/lib/quotes/section-handlers'
import {
  getCompletedCount,
  recordCompletedQuickQuote,
  shouldSkipSequence,
  shouldAskPreferred,
  getPreferredStart,
  setPreferredStart,
  recordEscape,
  hasBeenAskedPreferred,
  markAskedPreferred,
  type EscapeRoute,
} from '@/lib/quotes/quick-preferences'
import { QuickStartPreferenceBanner } from './components/quick/QuickStartPreferenceBanner'
import { QuoteNewPriceWarningsBanner } from './components/QuoteNewPriceWarningsBanner'
import { QuoteNewEfterkalkylBanner, type EfterkalkylInsight } from './components/QuoteNewEfterkalkylBanner'

// ─── Types ───────────────────────────────────────────────────────────

interface Customer {
  customer_id: string
  name: string
  phone_number: string
  email: string
  address_line: string
  personal_number?: string
  property_designation?: string
  /** Pilot-feedback 2026-05-20: betalningsvillkor ska följa kundens
      default_payment_days istället för hardcoded '30 dagar netto'. */
  default_payment_days?: number | null
}

interface PricingSettings {
  hourly_rate: number
  callout_fee: number
  minimum_hours: number
  vat_rate: number
  rot_enabled: boolean
  rot_percent: number
  rut_enabled: boolean
  rut_percent: number
  payment_terms: number
  warranty_years: number
}

// ─── Helpers ─────────────────────────────────────────────────────────

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(amount)
}

function normalizeUnit(unit: string): string {
  const map: Record<string, string> = {
    hour: 'tim',
    timmar: 'tim',
    h: 'tim',
    piece: 'st',
    styck: 'st',
  }
  return map[unit.toLowerCase()] || unit
}

/**
 * Konverterar legacy AI/mall-rader (type: labor/material/service) till
 * strukturerade QuoteItem-rader. `suggestedDeductionType` styr ROT/RUT via
 * legacyItemRotRutType + setItemRotRut (kodrevision 2026-08-03, Fix 1+2) —
 * default null (ingen avdragstyp antagen) håller befintliga anrop som inte
 * bryr sig om ROT/RUT oförändrade.
 *
 * `itemType` (kodrevision 2026-08-03, B5): AI:ns föreslagna TILLVAL
 * (`quote.options`) mappas genom samma funktion med itemType 'option' —
 * v66-schemat (sql/v66_quote_option_rows.sql) kräver `option_selected` +
 * `option_default` på tillvalsrader. `option_default: false` alltid för
 * AI-föreslagna tillval — kunden ska aktivt välja till, aldrig få dem
 * förikryssade.
 *
 * `sourceIsAi` (P4, UX-revision 2026-08-03): true endast från applyAiResult.
 * Styr `ai_price_missing`-flaggan (unitPrice 0 eller note "PRIS SAKNAS" —
 * lib/ai-quote-generator.ts). Default false så mall-anropen (handleTemplateSelect)
 * är oförändrade — en avsiktligt $0-radad mallrad ("Framkörning ingår") ska
 * INTE amber-markeras som "AI gissade fel pris".
 *
 * Fält-mappningen (namn/pris) görs av resolveLegacyItemFields
 * (lib/quote-calculations.ts) — se den funktionens kommentar för varför:
 * ai-generate skickar description/unitPrice, inte name/unit_price, och utan
 * fallback blev raden NaN för AI-genererade förslag.
 */
function convertLegacyItems(
  legacyItems: Array<{
    id: string
    type: 'labor' | 'material' | 'service'
    name?: string
    description?: string
    quantity?: number
    unit: string
    unit_price?: number
    unitPrice?: number
    total: number
    note?: string | null
    fromPriceList?: boolean
  }>,
  suggestedDeductionType: 'rot' | 'rut' | 'none' | null | undefined = null,
  itemType: 'item' | 'option' = 'item',
  sourceIsAi: boolean = false,
): QuoteItem[] {
  return legacyItems.map((item, idx) => {
    const { description, quantity, unitPrice } = resolveLegacyItemFields(item)
    const priceMissing =
      sourceIsAi && (unitPrice === 0 || !!(item.note && item.note.includes('PRIS SAKNAS')))
    return applyOptionRowDefaults(
      setItemRotRut(
        {
          id: generateItemId(),
          item_type: itemType,
          description,
          quantity,
          unit: normalizeUnit(item.unit),
          unit_price: unitPrice,
          total: quantity * unitPrice,
          is_rot_eligible: false,
          is_rut_eligible: false,
          sort_order: idx,
          ...(priceMissing ? { ai_price_missing: true, save_to_products: true } : {}),
        },
        legacyItemRotRutType(item.type, suggestedDeductionType),
      ),
    )
  })
}

/**
 * ETAPP 2b (offert-masterplan.md): stängningsknapp för "Mer"-radens paneler
 * som saknar egen collapsible-header (Stil/Bilagor/ROT-detaljer — de andra
 * panelerna har redan open/setOpen inbyggt och behöver den inte).
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

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT — orchestrator
// ═══════════════════════════════════════════════════════════════════════════════

export default function NewQuotePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const business = useBusiness()
  const toast = useToast()

  // ─── Loading / global state ─────────────────────────────────────────
  const [customers, setCustomers] = useState<Customer[]>([])
  const [pricingSettings, setPricingSettings] = useState<PricingSettings | null>(null)
  // Live preview behöver fält som inte ligger på useBusiness()-objektet (logo_url m.fl.)
  // Hämtas från business_config i fetchData() och används i liveTemplateData.
  const [businessConfig, setBusinessConfig] = useState<{
    business_name: string | null
    contact_name: string | null
    contact_email: string | null
    phone_number: string | null
    address: string | null
    website: string | null
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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)

  // ─── Standard texts ────────────────────────────────────────────────
  const [allStandardTexts, setAllStandardTexts] = useState<QuoteStandardText[]>([])

  // ─── AI state ──────────────────────────────────────────────────────
  const [sourceImageBase64, setSourceImageBase64] = useState<string | null>(null)
  const [sourceTranscript, setSourceTranscript] = useState<string | null>(null)
  const [aiGenerated, setAiGenerated] = useState(false)
  const [aiTextInput, setAiTextInput] = useState('')
  const [aiConfidence, setAiConfidence] = useState<number | null>(null)
  // Kvittoprincipen Fall 1 (docs/design/SYNLIG-INTELLIGENS.md): motorns
  // eget resonemang + kunskapen som faktiskt påverkade offerten.
  const [aiBedomning, setAiBedomning] = useState<{
    reasoning: string | null
    rules: Array<{ observation: string }>
    lessons: Array<{ lesson_text: string }>
    customerFacts: Array<{ content: string }>
  } | null>(null)
  const [photos, setPhotos] = useState<string[]>([])
  const [photoDescription, setPhotoDescription] = useState('')
  const [showAiHelper, setShowAiHelper] = useState(false)
  const [aiPriceWarning, setAiPriceWarning] = useState<{ message: string; link: string } | null>(null)
  const [aiPhotoCount, setAiPhotoCount] = useState(0)
  const MAX_PHOTOS = 5

  // ─── Form state ────────────────────────────────────────────────────
  const [selectedCustomer, setSelectedCustomer] = useState<string>('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [items, setItems] = useState<QuoteItem[]>([])
  const [discountPercent, setDiscountPercent] = useState(0)
  const [validDays, setValidDays] = useState(30)

  // Customer price list info
  const [customerPriceListInfo, setCustomerPriceListInfo] = useState<{
    name: string
    segment?: string
    contractType?: string
    hourlyRate?: number
    materialMarkup?: number
    calloutFee?: number
    items?: { name: string; unit: string; price: number; category_slug?: string; is_rot_eligible?: boolean; is_rut_eligible?: boolean }[]
  } | null>(null)

  // ROT/RUT
  const [personnummer, setPersonnummer] = useState('')
  const [fastighetsbeteckning, setFastighetsbeteckning] = useState('')

  // Reference fields
  const [referencePerson, setReferencePerson] = useState('')
  const [customerReference, setCustomerReference] = useState('')
  const [projectAddress, setProjectAddress] = useState('')

  // Standard texts (form content) — inlednings-/avslutningstext borttagna
  // ur flödet (redundanta mot description, pilot-beslut 2026-07).
  const [notIncluded, setNotIncluded] = useState('')
  const [ataTerms, setAtaTerms] = useState('')
  const [paymentTermsText, setPaymentTermsText] = useState('')
  // Egen 'Villkor'-text per offert (pilot-feedback 2026-05-20). Default-text
  // 'Offerten gäller till X. Tilläggsarbete debiteras...' är hardcoded i
  // templates — om termsText är fylld ersätts den.
  const [termsText, setTermsText] = useState('')

  // Payment plan
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlanEntry[]>([])

  // Display settings
  const [detailLevel, setDetailLevel] = useState<DetailLevel>('detailed')
  const [showUnitPrices, setShowUnitPrices] = useState(true)
  const [showQuantities, setShowQuantities] = useState(true)

  // Template save modal
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [templateId, setTemplateId] = useState<string | undefined>(undefined)

  // Visuell stil
  const [templateStyle, setTemplateStyle] = useState<'modern' | 'premium' | 'friendly' | null>(null)
  const [businessDefaultStyle, setBusinessDefaultStyle] = useState<'modern' | 'premium' | 'friendly'>('modern')

  // Modals & search
  const [showGrossistSearch, setShowGrossistSearch] = useState(false)
  // Spara-i-prislistan modal — vilken offertrad som ska sparas
  const [productModalRow, setProductModalRow] = useState<QuoteItem | null>(null)
  const [savingProduct, setSavingProduct] = useState(false)
  // Antal sparade produkter — styr om Snabbstart-kortet ska visas
  const [productsCount, setProductsCount] = useState<number | null>(null)

  // Collapsible sections
  // Andreas-beslut 2026-08-03: 'Referenser, villkor & texter' ALLTID stängd
  // by default — tar för mycket plats och ser rörig ut. (Detta REVERSERAR
  // pilot-feedbacken 2026-05-20 då sektionen öppnades för att Christoffer
  // inte hittade fälten — medvetet beslut nu när produkten är mognare;
  // edit-sidan har redan stängd default.)
  const [showStandardTexts, setShowStandardTexts] = useState(false)
  const [showPaymentPlan, setShowPaymentPlan] = useState(false)
  const [showDisplaySettings, setShowDisplaySettings] = useState(false)

  // Custom categories — inline create
  const [showNewCategoryInput, setShowNewCategoryInput] = useState<string | null>(null)
  const [newCategoryLabel, setNewCategoryLabel] = useState('')

  // Attachments
  const [attachments, setAttachments] = useState<{ name: string; url: string; size?: number }[]>([])
  const [priceWarnings, setPriceWarnings] = useState<Array<{ product_name: string; quote_price: number; normal_price: number; supplier_name: string; difference_pct: number }>>([])
  const [priceAlts, setPriceAlts] = useState<Array<{ product_name: string; cheaper_supplier: string; cheaper_price: number; savings_pct: number }>>([])
  // Motor 1 (Lärande prissättning): efterkalkyl-insikt för vald mall/jobbtyp.
  const [efterkalkylInsight, setEfterkalkylInsight] = useState<EfterkalkylInsight | null>(null)
  const [uploadingFile, setUploadingFile] = useState(false)

  // Startsteg (Etapp 3): "Börja tomt / Använd mall / Beskriv med AI" —
  // visas bara när ingen styrsignal pekat ut vad offerten redan ska bli.
  /** Mallväljaren, öppnad från Snabboffertens intag. Ersätter startväljaren
      som helhet — se kommentaren vid showTemplatePicker nedan. */
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)

  // Preview
  const [showPreviewPanel, setShowPreviewPanel] = useState(true)
  const [previewMode, setPreviewMode] = useState<'live' | 'design'>('live')
  // ETAPP 3 (offert-masterplan.md): id på raden vars RowEditSheet (bottom-
  // sheet-radeditorn) är öppen — satt av QuotePreviewPanels onRowTap när
  // hantverkaren trycker på en rad i canvasen under lg. Ersätter
  // QuoteEditMobilePreviewModal/FAB:en (borttagen) — dokumentet syns nu
  // direkt i huvudytan på mobil istället för bakom en separat modal-knapp.
  const [sheetItemId, setSheetItemId] = useState<string | null>(null)
  // Mobilens "lägg till rad"-sheet: sök i artikelbanken i stället för att få
  // en tom rad att fylla i för hand (~9 interaktioner → 2-3).
  const [addRowSheetOpen, setAddRowSheetOpen] = useState(false)

  // ETAPP 2b (offert-masterplan.md): canvas-first-layouten. `activePanel`
  // styr "Mer"-verktygsraden ovanför dokumentet — en sektion synlig i taget,
  // inte modal (hantverkaren ska se dokumentet samtidigt). `mainView` växlar
  // huvudytan mellan dokument-canvasen och radeditorn ("Listvy") — canvas
  // är default när live-läget finns, annars listvy (satt en gång när datan
  // laddat klart, se effekten nedan).
  const [activePanel, setActivePanel] = useState<
    null | 'stil' | 'villkor' | 'betalplan' | 'visning' | 'bilagor' | 'rot'
  >(null)
  const [mainView, setMainView] = useState<'document' | 'list'>('document')
  const mainViewInitialized = useRef(false)
  // ETAPP 1f: inline-bekräftelse för "beskrivning saknas" (ersätter den
  // gamla descriptionWarningShownRef-vägen — se saveQuote/QuoteNewHeader).
  const [sendConfirmPending, setSendConfirmPending] = useState(false)
  const dealLookupDoneRef = useRef(false)

  // ═══ SNABBOFFERTEN (etapp C, 2026-08-06) ═══════════════════════════
  //
  // Ett LÄGE i den här sidan, inte en egen route. Allt Snabbofferten behöver —
  // items-state, saveQuote, reservationshooken, produktlistan — finns redan
  // här. En egen sida hade tvingat fram en andra spar-väg, och två spar-vägar
  // är exakt hur den här kodbasen redan skaffat sig tysta luckor.
  //
  // "Öppna i fullständiga editorn" är därför bokstavligen quickMode = null:
  // samma offert, samma state, andra verktyget. Inget behöver överföras.
  const [quickMode, setQuickMode] = useState<'intake' | 'building' | 'review' | 'overview' | null>(null)
  /** Snabbofferten öppnas automatiskt EN gång vid kallstart. Utan den här
      vakten hade "Öppna fullständiga editorn" (som sätter quickMode = null)
      studsat tillbaka in i intaget direkt. */
  const quickStartDoneRef = useRef(false)
  const [quickSection, setQuickSection] = useState<QuoteSection>('inkluderat')
  const [quickApproved, setQuickApproved] = useState<QuoteSection[]>([])
  const [quickInput, setQuickInput] = useState('')

  // ─── Shared hooks ──────────────────────────────────────────────────
  const {
    products,
    customCategories,
    hydrated: priceListHydrated,
    setLocalPrice,
  } = usePriceListLookup(business.business_id)

  // Custom categories är lokalt state eftersom vi tillåter inline-skapande;
  // initieras från hook-resultatet när det finns
  const [localCustomCategories, setLocalCustomCategories] = useState<CustomCategory[]>([])
  useEffect(() => {
    if (priceListHydrated) setLocalCustomCategories(customCategories)
  }, [priceListHydrated, customCategories])

  const allCategories = useMemo(
    () => getAllCategories(localCustomCategories),
    [localCustomCategories],
  )

  // ETAPP 3: raden RowEditSheet visar — härledd (inte egen kopia) så
  // sheeten alltid speglar senaste values medan hantverkaren redigerar,
  // och stängs automatiskt om raden tas bort (items.find → undefined).
  const sheetItem = useMemo(
    () => items.find(i => i.id === sheetItemId) ?? null,
    [items, sheetItemId],
  )

  const vatRate = pricingSettings?.vat_rate ?? 25
  const { recalculated, totals, calculatedPaymentPlan, paymentPlanValid } = useQuoteCalculations(
    items,
    discountPercent,
    vatRate,
    paymentPlan,
  )

  const {
    addItem,
    updateItem,
    removeItem,
    moveItem,
    moveItemById,
    dndSensors,
    handleDragEnd,
    addFromGrossist,
    applyProductToRow,
    addFromProductBank,
  } = useQuoteItems(items, setItems, localCustomCategories, !!pricingSettings)

  // Reservationsmotorn (v91): matchar raderna mot reservationsbiblioteket och
  // föreslår förbehåll — utan att någonsin avbryta. Delad hook så new och edit
  // beter sig identiskt. Måste ligga före liveHandlers/quoteTemplateData som
  // båda läser snapshoten.
  const reservations = useReservationSuggestions(items)

  // ─── Derived: standard texts grouped by type ──────────────────────
  const textsByType = useMemo(() => {
    const map: Record<string, QuoteStandardText[]> = {
      not_included: [],
      ata_terms: [],
      payment_terms: [],
    }
    for (const t of allStandardTexts) {
      if (map[t.text_type]) map[t.text_type].push(t)
    }
    return map
  }, [allStandardTexts])

  const hasRotItems = items.some(i => i.is_rot_eligible)
  const hasRutItems = items.some(i => i.is_rut_eligible)

  // Statusprickar för Mer-raden — sju offertfält bor bara bakom den, och utan
  // markering måste hantverkaren öppna varje panel för att veta vad som är
  // ifyllt. Det var halva "man får inte med allt".
  const merPanelStatus = useMemo(
    () =>
      panelStatus({
        notIncluded,
        termsText,
        ataTerms,
        paymentTermsText,
        referencePerson,
        customerReference,
        projectAddress,
        paymentPlanCount: paymentPlan.length,
        paymentPlanValid,
        detailLevel,
        showUnitPrices,
        showQuantities,
        attachmentCount: attachments.length,
        templateStyle,
        hasRotItems,
        hasRutItems,
        personnummer,
        fastighetsbeteckning,
      }),
    [
      notIncluded, termsText, ataTerms, paymentTermsText,
      referencePerson, customerReference, projectAddress,
      paymentPlan.length, paymentPlanValid,
      detailLevel, showUnitPrices, showQuantities,
      attachments.length, templateStyle,
      hasRotItems, hasRutItems, personnummer, fastighetsbeteckning,
    ],
  )

  // ═══ SNABBOFFERTEN: sammanfattning per sektion ══════════════════════
  //
  // Räknas för ALLA fyra sektionerna samtidigt eftersom kvittot (C4) visar
  // dem alla på en gång. Att räkna en i taget hade krävt fyra memon som
  // ändå beror på samma state.
  //
  // itemsWithoutPrice räknar bara riktiga 'item'/'option'-rader: en rubrik
  // eller fritextrad har aldrig ett pris, och att flagga dem hade gett en
  // varning på varenda välbyggd offert.
  const quickSummaries = useMemo(() => {
    const priceable = items.filter(i => {
      const t = i.item_type || 'item'
      return t === 'item' || t === 'option'
    })
    const input = {
      itemCount: items.length,
      itemsWithoutPrice: priceable.filter(i => !i.unit_price).length,
      notIncludedFilled: notIncluded.trim().length > 0,
      reservationCount: reservations.snapshot.length,
      reservationSuggestions: reservations.suggestions.length,
      amountToPay:
        totals.gronBase > 0
          ? totals.customerPaysAfterDeductions
          : hasRotItems
            ? totals.rotCustomerPays
            : hasRutItems
              ? totals.rutCustomerPays
              : totals.total,
      deductionMissingPersonnummer: hasRotItems && !personnummer.trim(),
      paymentPlanValid,
      hasPaymentPlan: paymentPlan.length > 0,
    }
    return Object.fromEntries(
      SECTION_ORDER.map(s => [s, sectionSummary(s, input)]),
    ) as Record<QuoteSection, ReturnType<typeof sectionSummary>>
  }, [
    items, notIncluded, reservations.snapshot.length, reservations.suggestions.length,
    totals, hasRotItems, hasRutItems, personnummer, paymentPlanValid, paymentPlan.length,
  ])

  const selectedCustomerObj = useMemo(
    () => customers.find(c => c.customer_id === selectedCustomer) || null,
    [customers, selectedCustomer],
  )

  // ─── Custom category creation (new-vyn unique) ────────────────────
  async function createCustomCategory(label: string, itemId: string) {
    const slug =
      'custom_' + label.toLowerCase().replace(/[^a-zåäö0-9]/g, '_').replace(/_+/g, '_')
    const { data, error } = await supabase
      .from('custom_quote_categories')
      .insert({
        business_id: business.business_id,
        slug,
        label,
        rot_eligible: false,
        rut_eligible: false,
      })
      .select('*')
      .single()
    if (error) {
      toast.error('Kunde inte skapa kategori')
      return
    }
    const newCat = data as CustomCategory
    setLocalCustomCategories(prev => [...prev, newCat])
    updateItem(itemId, 'category_slug', newCat.slug)
    setShowNewCategoryInput(null)
    setNewCategoryLabel('')
  }

  // ─── EN preview-pipeline (ETAPP 1a, offert-masterplan.md) ─────────
  // quoteTemplateData (→ ModernCanvas) och templatePreviewPayload (→
  // TemplatePreviewFrame/iframen) byggdes tidigare i TVÅ separata useMemo
  // med nästan identiska men inte identiska beroendelistor och egna
  // kopior av validUntil/formatDate/amountToPay-logiken — risk att
  // live-canvasen och iframe-previewn tyst visar olika siffror om bara
  // den ena uppdaterades. Nu EN useMemo, EN beroendelista, delad
  // validUntil/amountToPay. quote_items i payloaden är MEDVETET fortsatt
  // rå QuoteItem-form (inte QuoteTemplateItem) — servern (buildQuoteTemplateData)
  // räknar om totalerna själv och behöver de råa fälten (rot_rut_type,
  // option_selected, labor_amount m.fl.) som inte finns kvar i den
  // visningsfärdiga QuoteTemplateData-formen.
  const dealIdFromQuery = searchParams?.get('deal_id') || null
  const leadIdFromQuery = searchParams?.get('lead_id') || null
  const { quoteTemplateData, templatePreviewPayload } = useMemo(() => {
    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + (validDays || 30))
    // En sanning: samma "vad kunden faktiskt betalar"-formel som
    // calculateQuoteTotals/totals redan äger — användes tidigare bara av
    // liveTemplateData; templatePreviewPayload skickade en enklare (och
    // vid grön teknik-avdrag ofullständig) `customer_pays`-variant.
    const amountToPay = totals.totalDeduction > 0
      ? totals.customerPaysAfterDeductions
      : totals.total
    const formatDate = (d: Date) =>
      d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })

    const quoteTemplateData: QuoteTemplateData = {
      business: {
        name: businessConfig?.business_name || business.business_name || 'Företag',
        orgNumber: businessConfig?.org_number || '',
        address: businessConfig?.address || '',
        contactName: businessConfig?.contact_name || business.contact_name || '',
        phone: businessConfig?.phone_number || '',
        email: businessConfig?.contact_email || business.contact_email || '',
        website: businessConfig?.website || null,
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
        personnummer: personnummer || null,
        reference: customerReference || null,
      },
      quote: {
        number: 'Utkast',
        dealNumber: null,
        issuedDate: formatDate(new Date()),
        validUntilDate: formatDate(validUntil),
        validUntilDateISO: validUntil.toISOString().split('T')[0],
        title: title || 'Offert',
        description: description || null,
        items: recalculated.map((i): QuoteTemplateItem => {
          const itemType = ((i.item_type || 'item') as QuoteTemplateItem['itemType'])
          return {
            itemType,
            // ETAPP 2a (offert-masterplan.md): id-baserade liveHandlers kräver
            // radens id i den visningsfärdiga formen — se onItemChange/onItemRemove/
            // onItemRotRutCycle nedan (ersätter tidigare index-mutation).
            id: i.id,
            // ETAPP 2a: tidigare utelämnad här — tillvalsraderna i live-canvasen
            // visade därför ALLTID ☐ oavsett faktiskt val (kunden/hantverkarens
            // Förvald-val speglades aldrig). Fix: samma fält som data-builder.ts.
            optionSelected: itemType === 'option' ? i.option_selected === true : undefined,
            name: i.description || '',
            description: null,
            quantity: Number(i.quantity || 0),
            unit: i.unit || 'st',
            unitPrice: Number(i.unit_price || 0),
            total: itemType === 'discount'
              ? -Math.abs(Number(i.total || 0))
              : Number(i.total || 0),
            isRotEligible: !!i.is_rot_eligible,
            isRutEligible: !!i.is_rut_eligible,
            rotRutType: i.rot_rut_type ?? (i.is_rot_eligible ? 'rot' : i.is_rut_eligible ? 'rut' : null),
          }
        }),
        subtotalExVat: totals.subtotal,
        discountPercent,
        discountAmount: totals.discountAmount,
        vatAmount: totals.vat,
        totalIncVat: totals.total,
        rotDeduction: totals.rotDeduction > 0 ? totals.rotDeduction : undefined,
        rutDeduction: totals.rutDeduction > 0 ? totals.rutDeduction : undefined,
        gronDeduction: totals.gronDeduction > 0 ? totals.gronDeduction : undefined,
        amountToPay,
        paymentTerms: paymentTermsText
          || (selectedCustomerObj?.default_payment_days
            ? `${selectedCustomerObj.default_payment_days} dagar`
            : ''),
        warrantyText: null,
        notIncluded: notIncluded || null,
        // ETAPP 2a: krävs så canvasens redigerbara villkorstext (handlers.
        // onTermsChange) speglar/skriver till samma state som templatePreviewPayload
        // redan skickade (terms_text) — annars visar canvasen alltid tomt.
        termsText: termsText || null,
        // ETAPP A4 (2026-08-06): tre fält som samlades in men aldrig nådde
        // live-dokumentet.
        //
        // reservations var det allvarligaste: handlers.onReservationRemove
        // fanns redan, men eftersom listan aldrig skickades in renderades
        // blocket aldrig och ×-knappen var oåtkomlig. Hantverkaren bockade i
        // förbehåll i granskningsvyn och såg dem sedan inte i offerten förrän
        // efter sparning — precis den sorts tysta lucka som gjorde att
        // Christoffer inte litade på att "man får med allt".
        reservations: reservations.snapshot.length > 0 ? reservations.snapshot : null,
        ataTerms: ataTerms || null,
        paymentPlan: paymentPlan.length > 0
          ? calculatedPaymentPlan.map(p => ({
              label: p.label,
              percent: p.percent,
              amount: p.amount,
              dueDescription: p.due_description || null,
            }))
          : null,
        // Bilagorna syns i förhandsvisningen precis som i kunddokumentet —
        // det man ser är det kunden får (2026-08-10).
        attachments: attachments.length > 0
          ? attachments.map(a => ({ name: a.name, url: a.url }))
          : null,
      },
    }

    const templatePreviewPayload: TemplatePreviewPayload = {
      quote: {
        title: title || 'Offert',
        description: description || null,
        status: 'draft',
        items: [],
        subtotal: totals.subtotal,
        discount_percent: discountPercent,
        discount_amount: totals.discountAmount,
        vat_rate: vatRate,
        vat_amount: totals.vat,
        total: totals.total,
        rot_work_cost: totals.rotWorkCost,
        rot_deduction: totals.rotDeduction,
        rot_customer_pays: totals.rotCustomerPays,
        rut_work_cost: totals.rutWorkCost,
        rut_deduction: totals.rutDeduction,
        rut_customer_pays: totals.rutCustomerPays,
        // Samma amountToPay som quoteTemplateData (var tidigare en egen,
        // ofullständig formel — se kommentar ovan).
        customer_pays: amountToPay,
        valid_until: validUntil.toISOString().split('T')[0],
        not_included: notIncluded || null,
        ata_terms: ataTerms || null,
        payment_terms_text: paymentTermsText || null,
        terms_text: termsText || null,
        reservations_snapshot: reservations.snapshot,
        reference_person: referencePerson || null,
        customer_reference: customerReference || null,
        project_address: projectAddress || null,
        detail_level: detailLevel,
        show_unit_prices: showUnitPrices,
        show_quantities: showQuantities,
        personnummer: personnummer || null,
        fastighetsbeteckning: fastighetsbeteckning || null,
        template_style: templateStyle,
      },
      quote_items: recalculated.map((it, idx) => ({ ...it, sort_order: idx })),
      customer_id: selectedCustomer || null,
      deal_id: dealIdFromQuery,
      template_style: templateStyle,
    }

    return { quoteTemplateData, templatePreviewPayload }
  }, [
    business, businessConfig, selectedCustomerObj, selectedCustomer, title, description,
    recalculated, totals, validDays, discountPercent, vatRate,
    notIncluded, ataTerms, paymentTermsText, termsText, reservations.snapshot,
    referencePerson, customerReference, projectAddress, detailLevel,
    showUnitPrices, showQuantities, personnummer, fastighetsbeteckning,
    templateStyle, dealIdFromQuery,
    // A4: betalplanen renderas nu i dokumentet — utan dessa beror memon inte
    // på den och blocket hade legat kvar med gamla siffror efter en ändring.
    paymentPlan.length, calculatedPaymentPlan,
  ])

  const liveAvailable = (templateStyle || businessDefaultStyle) === 'modern'

  // ETAPP 2b: mainView-defaulten sätts EN gång när data laddat klart —
  // canvas när live-läget finns, annars listvy (se komponentens state ovan).
  useEffect(() => {
    if (!loading && !mainViewInitialized.current) {
      mainViewInitialized.current = true
      setMainView(liveAvailable ? 'document' : 'list')
    }
  }, [loading, liveAvailable])

  // ETAPP 2a (offert-masterplan.md), punkt 6: id-baserade liveHandlers —
  // ersätter tidigare index-mutation. Återanvänder useQuoteItems' egna
  // updateItem/removeItem/addItem (samma enda källa som listvyn/mobilen
  // redan använder) istället för att duplicera setItems-logik här.
  const liveHandlers: QuoteDocumentHandlers = useMemo(
    () => ({
      onTitleChange: setTitle,
      onDescriptionChange: setDescription,
      onCustomerNameChange: undefined,
      onPaymentTermsChange: setPaymentTermsText,
      onTermsChange: setTermsText,
      // Dokumentet visar/redigerar ett ABSOLUT datum (native <input type=date>)
      // men sidans egna state är "giltig i N dagar" (samma fält som
      // QuoteNewCustomerSection redan exponerar) — räknar om till dagar-
      // från-idag så de två fälten aldrig kan divergera (en källa).
      onValidUntilChange: (isoDate: string) => {
        const picked = new Date(isoDate + 'T00:00:00')
        if (Number.isNaN(picked.getTime())) return
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const diffDays = Math.round((picked.getTime() - today.getTime()) / 86400000)
        setValidDays(Math.max(0, diffDays))
      },
      onDiscountChange: setDiscountPercent,
      onNotIncludedChange: setNotIncluded,
      onItemChange: (id, patch) => {
        if (patch.name !== undefined) updateItem(id, 'description', patch.name)
        if (patch.quantity !== undefined) updateItem(id, 'quantity', patch.quantity)
        if (patch.unit !== undefined) updateItem(id, 'unit', patch.unit)
        if (patch.unitPrice !== undefined) updateItem(id, 'unit_price', patch.unitPrice)
      },
      onItemAdd: () => addItem('item'),
      // Dokumentmotorn visar ta-bort-knappen på ALLA radtyper med id
      // (rubrik/text/delsumma/rabatt/tillval/item) — till skillnad från
      // gamla ModernCanvas som bara kunde ta bort 'item'-rader.
      onItemRemove: id => removeItem(id),
      // Cyklar ROT/RUT: null → rot → rut → null. En grön teknik-taggad rad
      // flyttas medvetet in i cykeln (till 'rot') vid första klicket istället
      // för att tyst nollställas — se RotBadge-kommentaren i QuoteDocumentRow.
      onItemRotRutCycle: id => {
        const item = items.find(i => i.id === id)
        if (!item) return
        const current = getItemRotRutType(item)
        const isGron = current === 'gron_solceller' || current === 'gron_lagring' || current === 'gron_laddpunkt'
        const next = isGron || current === null ? 'rot' : current === 'rot' ? 'rut' : null
        updateItem(id, 'rot_rut_type', next)
      },
      // Samma regel som ItemRow.tsx: option_default OCH option_selected
      // sätts alltid ihop (kunden kan sedan ändra option_selected i portalen).
      onOptionDefaultToggle: (id, checked) => {
        updateItem(id, 'option_default', checked)
        updateItem(id, 'option_selected', checked)
      },
      onItemMove: moveItemById,
      onReservationRemove: reservations.removeReservation,
    }),
    [
      setTitle, setDescription, setPaymentTermsText, setTermsText, setValidDays, setDiscountPercent,
      setNotIncluded, updateItem, addItem, removeItem, items, moveItemById,
      reservations.removeReservation,
    ],
  )

  // ═══════════════════════════════════════════════════════════════════
  // Data fetching
  // ═══════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!business.business_id) return
    fetchData()
    fetchStandardTexts()
    fetchProductsCount()

    const transcript = searchParams?.get('transcript')
    const customerId = searchParams?.get('customerId') || searchParams?.get('customer_id')
    const prefillTitle = searchParams?.get('title')
    const prefillDescription = searchParams?.get('description')
    const dealId = searchParams?.get('deal_id')
    if (transcript) {
      setSourceTranscript(transcript)
      setAiTextInput(transcript)
      setShowAiHelper(true)
    }
    if (customerId) setSelectedCustomer(customerId)
    if (prefillTitle) setTitle(prefillTitle)
    if (prefillDescription) setDescription(prefillDescription)
    if (!referencePerson && business.contact_name) setReferencePerson(business.contact_name)
    if (dealId && customerId) fetchDealDocuments(customerId)
    // Deal-lookup (Etapp 2): körs bara en gång per mount (ref-flagga skyddar
    // mot dubbelkörning t.ex. i React strict mode). Query-param-title/
    // description har redan satts (rader ovan) och VINNER alltid över
    // dealens fält — deal-lookupen fyller endast i det som fortfarande är
    // tomt när svaret kommer tillbaka.
    if (dealId && !dealLookupDoneRef.current) {
      dealLookupDoneRef.current = true
      fetchDealAndPrefill(dealId, !!customerId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.business_id])

  async function fetchDealAndPrefill(dealId: string, hasCustomerIdParam: boolean) {
    try {
      const res = await fetch(`/api/pipeline/deals/${dealId}`)
      if (!res.ok) return
      const data = await res.json()
      const deal = data.deal
      if (!deal) return

      // Query-param vinner alltid — fyll bara i om fältet fortfarande är
      // tomt när svaret kommer (funktionell uppdatering pga stale closure).
      if (deal.title) setTitle(prev => prev || deal.title)
      if (deal.description) setDescription(prev => prev || deal.description)

      // Kund saknas bara om ingen customerId-param fanns (DealModal-grenen) —
      // sätts befintlig kund-prefill (personnummer, fastighetsbeteckning m.m.)
      // igång automatiskt via effekten på selectedCustomer.
      if (!hasCustomerIdParam && deal.customer_id) {
        setSelectedCustomer(deal.customer_id)
      }
      // deal.value förifylls INTE — offertens summa byggs av raderna.

      // Motor 1: deal-prefill gav ev. en jobbtyp — hämta efterkalkyl-insikt
      // som sekundär nyckel (mall vinner om användaren sen väljer en).
      if (deal.job_type) {
        fetchEfterkalkylInsight({ jobType: deal.job_type })
      }
    } catch (err) {
      console.error('[NewQuote] Kunde inte hämta deal:', err)
      // Tyst degradering — formuläret fungerar precis som utan deal-lookup.
    }
  }

  /**
   * Motor 1 (Lärande prissättning): hämtar efterkalkyl-insikt för vald
   * mall (primär nyckel) eller jobbtyp (sekundär). Tyst degradering vid
   * fel — bannern visas bara inte.
   */
  async function fetchEfterkalkylInsight(params: { templateId?: string; jobType?: string }) {
    try {
      const qs = new URLSearchParams()
      if (params.templateId) qs.set('template_id', params.templateId)
      else if (params.jobType) qs.set('job_type', params.jobType)
      else return

      const res = await fetch(`/api/quotes/efterkalkyl-insikt?${qs.toString()}`)
      if (!res.ok) return
      const data = await res.json()
      setEfterkalkylInsight(data)
    } catch (err) {
      console.error('[NewQuote] Kunde inte hämta efterkalkyl-insikt:', err)
      // Tyst degradering — bannern visas bara inte.
    }
  }

  async function fetchData() {
    const [customersApiRes, settingsRes] = await Promise.all([
      fetch('/api/customers').then(r => r.json()),
      supabase
        .from('business_config')
        // '*' är MEDVETET — se lib/business/quote-surface-select.ts. En
        // kolumnlista här 400:ade hela frågan och tystade logotypen.
        .select(QUOTE_SURFACE_BUSINESS_SELECT)
        .eq('business_id', business.business_id)
        .single(),
    ])

    if (!customersApiRes || customersApiRes.error) {
      console.error('[NewQuote] Kunde inte hämta kunder:', customersApiRes?.error)
    }
    logBusinessConfigError('NewQuote', settingsRes.error)
    setCustomers(customersApiRes?.customers || [])
    const defaultStyle = settingsRes.data?.quote_template_style as 'modern' | 'premium' | 'friendly' | undefined
    if (defaultStyle && ['modern', 'premium', 'friendly'].includes(defaultStyle)) {
      setBusinessDefaultStyle(defaultStyle)
    }
    if (settingsRes.data) {
      const cfg = settingsRes.data as Record<string, unknown>
      setBusinessConfig({
        business_name: (cfg.business_name as string | null) ?? null,
        contact_name: (cfg.contact_name as string | null) ?? null,
        contact_email: (cfg.contact_email as string | null) ?? null,
        phone_number: (cfg.phone_number as string | null) ?? null,
        address: (cfg.address as string | null) ?? null,
        website: (cfg.website as string | null) ?? null,
        org_number: (cfg.org_number as string | null) ?? null,
        f_skatt_registered: (cfg.f_skatt_registered as boolean | null) ?? null,
        bankgiro: (cfg.bankgiro as string | null) ?? null,
        plusgiro: (cfg.plusgiro as string | null) ?? null,
        swish_number: (cfg.swish_number as string | null) ?? null,
        vat_number: (cfg.vat_number as string | null) ?? null,
        accent_color: (cfg.accent_color as string | null) ?? null,
        logo_url: (cfg.logo_url as string | null) ?? null,
        tagline: (cfg.tagline as string | null) ?? null,
        service_area: (cfg.service_area as string | null) ?? null,
      })
    }
    setPricingSettings(
      settingsRes.data?.pricing_settings || {
        hourly_rate: 650,
        callout_fee: 495,
        minimum_hours: 1,
        vat_rate: 25,
        rot_enabled: true,
        rot_percent: 30,
        rut_enabled: false,
        rut_percent: 50,
        payment_terms: 30,
        warranty_years: 2,
      },
    )
    setLoading(false)
  }

  async function fetchStandardTexts() {
    try {
      const res = await fetch('/api/quote-standard-texts')
      if (!res.ok) return
      const data = await res.json()
      const texts: QuoteStandardText[] = data.texts || []
      setAllStandardTexts(texts)

      const defaultNotIncluded = texts.find(t => t.text_type === 'not_included' && t.is_default)
      const defaultAta = texts.find(t => t.text_type === 'ata_terms' && t.is_default)
      const defaultPayment = texts.find(t => t.text_type === 'payment_terms' && t.is_default)

      if (defaultNotIncluded) setNotIncluded(defaultNotIncluded.content)
      if (defaultAta) setAtaTerms(defaultAta.content)
      if (defaultPayment) setPaymentTermsText(defaultPayment.content)
    } catch {
      // silent
    }
  }

  async function fetchProductsCount() {
    try {
      const res = await fetch('/api/products')
      if (!res.ok) {
        setProductsCount(0)
        return
      }
      const data = await res.json()
      setProductsCount((data.products || []).length)
    } catch {
      setProductsCount(0)
    }
  }

  async function fetchDealDocuments(customerId: string) {
    try {
      const res = await fetch(`/api/customers/${customerId}/documents`)
      if (!res.ok) return
      const data = await res.json()
      const docs = (data.documents || []).map((d: any) => ({
        name: d.file_name,
        url: d.file_url,
        size: d.file_size || 0,
      }))
      if (docs.length > 0) setAttachments(docs)
    } catch {
      // silent
    }
  }

  // ─── Attachment upload ───────────────────────────────────────────
  async function handleFileUpload(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Filen är för stor (max 10 MB)')
      return
    }
    setUploadingFile(true)
    try {
      const timestamp = Date.now()
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath = `${business.business_id}/quotes/drafts/${timestamp}_${safeName}`
      const arrayBuffer = await file.arrayBuffer()
      const { error: uploadError } = await supabase.storage
        .from('customer-documents')
        .upload(filePath, arrayBuffer, { contentType: file.type, upsert: false })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('customer-documents').getPublicUrl(filePath)
      setAttachments(prev => [
        ...prev,
        { name: file.name, url: urlData.publicUrl, size: file.size },
      ])
    } catch (err) {
      console.error('Upload failed:', err)
      toast.error('Kunde inte ladda upp filen')
    }
    setUploadingFile(false)
  }

  // ─── Supplier price comparison (debounced) ───────────────────────
  useEffect(() => {
    const materialItems = items.filter(i => i.item_type === 'item' && i.unit_price > 0)
    if (materialItems.length === 0) {
      setPriceWarnings([])
      setPriceAlts([])
      return
    }
    const timer = setTimeout(() => {
      fetch('/api/suppliers/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: materialItems.map(i => ({ description: i.description, unit_price: i.unit_price, unit: i.unit })),
        }),
      })
        .then(r => r.json())
        .then(data => {
          setPriceWarnings(data.warnings || [])
          setPriceAlts(data.alternatives || [])
        })
        .catch(() => {})
    }, 2000)
    return () => clearTimeout(timer)
  }, [items])

  // ─── Auto-fill personal data + price list on customer change ─────
  useEffect(() => {
    if (!selectedCustomer) {
      setCustomerPriceListInfo(null)
      return
    }
    const customer = customers.find(c => c.customer_id === selectedCustomer)
    if (!customer) return

    if (customer.personal_number && !personnummer) setPersonnummer(customer.personal_number)
    if (customer.property_designation && !fastighetsbeteckning)
      setFastighetsbeteckning(customer.property_designation)
    if (customer.address_line && !projectAddress) setProjectAddress(customer.address_line)
    if (customer.name && !customerReference) setCustomerReference(customer.name)

    ;(async () => {
      const cust = customer as any
      let priceListId = cust.price_list_id

      if (!priceListId && cust.segment_id) {
        try {
          const segRes = await supabase
            .from('price_lists_v2')
            .select('id')
            .eq('business_id', business.business_id)
            .eq('segment_id', cust.segment_id)
            .limit(1)
            .maybeSingle()
          if (segRes.data?.id) priceListId = segRes.data.id
        } catch {}
      }

      if (!priceListId) {
        try {
          const defRes = await supabase
            .from('price_lists_v2')
            .select('id')
            .eq('business_id', business.business_id)
            .eq('is_default', true)
            .limit(1)
            .maybeSingle()
          if (defRes.data?.id) priceListId = defRes.data.id
        } catch {}
      }

      if (priceListId) {
        fetch(`/api/pricing/price-lists/${priceListId}`)
          .then(r => r.json())
          .then(data => {
            if (data.priceList) {
              const pl = data.priceList
              setCustomerPriceListInfo({
                name: pl.name,
                segment: pl.segment?.name,
                contractType: pl.contract_type?.name,
                hourlyRate: pl.hourly_rate_normal,
                materialMarkup: pl.material_markup_pct,
                calloutFee: pl.callout_fee,
                items: (pl.items || []).map((it: any) => ({
                  name: it.name,
                  unit: it.unit,
                  price: it.price,
                  category_slug: it.category_slug,
                  is_rot_eligible: it.is_rot_eligible,
                  is_rut_eligible: it.is_rut_eligible,
                })),
              })
              if (pl.hourly_rate_normal || pl.callout_fee) {
                setPricingSettings(prev => ({
                  ...(prev || {
                    hourly_rate: 650,
                    callout_fee: 495,
                    minimum_hours: 1,
                    vat_rate: 25,
                    rot_enabled: true,
                    rot_percent: 30,
                    rut_enabled: false,
                    rut_percent: 50,
                    payment_terms: 30,
                    warranty_years: 2,
                  }),
                  hourly_rate: pl.hourly_rate_normal || prev?.hourly_rate || 650,
                  callout_fee: pl.callout_fee ?? prev?.callout_fee ?? 495,
                }))
              }
            }
          })
          .catch(() => {})
      } else {
        setCustomerPriceListInfo(null)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer])

  // ═══════════════════════════════════════════════════════════════════
  // AI helpers
  // ═══════════════════════════════════════════════════════════════════

  /**
   * ETAPP B1 (2026-08-06): låter en AI-rad ärva allt en produktkopplad rad har.
   *
   * Serversidan har redan avgjort VILKEN artikel raden hör till (och avvisat
   * osäkra träffar — se lib/products/match-generated-items.ts). Här görs
   * kopplingen verklig genom exakt samma applyProductToItem som snabbvalen och
   * artikelsöket använder, så en AI-byggd rad blir identisk med en handplockad:
   * fryst komponent-snapshot, arbetsandel, ROT/RUT-flagga, artikelnummer och
   * inköpspris. Det är kopplingen som väcker marginalkortet och gör att
   * reservationsmotorns produkttriggers börjar träffa.
   *
   * TVÅ FÄLT BEHÅLLS FRÅN AI:N MEDVETET:
   * - beskrivningen, eftersom den är jobbspecifik ("Rivning badrum, plan 2")
   *   medan artikelnamnet är generiskt ("Rivning badrum"). Att skriva över den
   *   hade gjort offerten fattigare, inte rikare.
   * - kvantiteten, eftersom AI:n läst den ur beskrivningen (12 fönster).
   * Priset tas däremot ALLTID från artikeln — det är hela poängen med att ha
   * en produktbank.
   */
  function linkAiItemsToProducts(rows: QuoteItem[], rawRows: any[]): QuoteItem[] {
    if (products.length === 0) return rows
    const byId = new Map(products.map(p => [p.id, p]))
    let linked = 0
    const result = rows.map((row, i) => {
      const productId = rawRows[i]?.linkedProductId
      if (!productId) return row
      const product = byId.get(productId)
      if (!product) return row
      linked++
      const applied = applyProductToItem(row, product, row.quantity)
      return { ...applied, description: row.description || applied.description }
    })
    if (linked > 0) {
      console.log(`[quotes/new] ${linked} AI-rader kopplade till produktbanken`)
    }
    return result
  }

  function applyAiResult(quote: any) {
    setTitle(quote.jobTitle || '')
    setDescription(quote.jobDescription || '')
    // Kodrevision 2026-08-03 (Fix 1+2): ROT/RUT sätts nu ENDAST via
    // convertLegacyItems' egen setItemRotRut-mappning, styrd av AI:ns
    // suggestedDeductionType. Tidigare additiva forEach-block här kunde
    // lämna is_rot_eligible kvar TRUE samtidigt som is_rut_eligible sattes
    // TRUE (RUT-jobb fick ROT eftersom getItemRotRutType kollar ROT först),
    // och 'none' ROT-flaggade ändå allt arbete via convertLegacyItems.
    const converted = linkAiItemsToProducts(
      convertLegacyItems(quote.items || [], quote.suggestedDeductionType, 'item', true),
      quote.items || [],
    )
    // B5: AI:ns föreslagna tillval (0-3 st, tomt om inget genuint relevant)
    // läggs efter grundraderna som avbockade item_type 'option'-rader.
    const options = linkAiItemsToProducts(
      convertLegacyItems(quote.options || [], quote.suggestedDeductionType, 'option', true),
      quote.options || [],
    )
    const combined = [
      ...converted,
      ...options.map((o, idx) => ({ ...o, sort_order: converted.length + idx })),
    ]
    setItems(combined)

    // B3: AI:ns förslag på vad som INTE ingår. Fylls bara i när fältet är tomt
    // — hantverkarens egen text får aldrig skrivas över av ett förslag.
    if (Array.isArray(quote.notIncludedSuggestions) && quote.notIncludedSuggestions.length > 0) {
      setNotIncluded(prev => (prev.trim() ? prev : quote.notIncludedSuggestions.join('\n')))
    }
    setAiGenerated(true)
    setAiConfidence(quote.confidence || null)
    setAiBedomning({
      reasoning: typeof quote.reasoning === 'string' ? quote.reasoning : null,
      rules: Array.isArray(quote.rules) ? quote.rules : [],
      lessons: Array.isArray(quote.lessons) ? quote.lessons : [],
      customerFacts: Array.isArray(quote.customerFacts) ? quote.customerFacts : [],
    })

    // P4 (UX-revision 2026-08-03): positiv signal när produktbanken faktiskt
    // gjorde jobbet — räknas på de RÅA AI-raderna (fromPriceList finns bara
    // där, convertLegacyItems bär inte med sig det). Visas bara när det finns
    // något att vara nöjd över — annars ingen extra brus utöver standardtoasten.
    const rawItems = [...(quote.items || []), ...(quote.options || [])] as Array<{ fromPriceList?: boolean }>
    const fromBankCount = rawItems.filter(i => i.fromPriceList === true).length
    toast.success(
      fromBankCount > 0
        ? `AI genererade offertförslag! ${fromBankCount} av ${rawItems.length} rader prissatta från din produktbank.`
        : 'AI genererade offertförslag!',
    )
  }

  // B1 (kodrevision 2026-08-03): komprimera INNAN base64 — en okomprimerad
  // mobilkamerabild (3-8 MB) blir 4-11 MB som base64 och spränger både
  // Vercels ~4,5 MB request-gräns och Anthropics 5 MB/bild-gräns. Gäller
  // ALLA foto-inläsningsvägar (kamera, galleri, "+"-rutan) — de går alla
  // genom denna enda funktion (QuoteNewAIHelper → onPhotoFile).
  async function handlePhotoFile(file: File) {
    if (!file.type.startsWith('image/')) return
    if (photos.length >= MAX_PHOTOS) {
      toast.error(`Max ${MAX_PHOTOS} foton`)
      return
    }
    try {
      const dataUrl = await compressImageFile(file)
      setPhotos(prev => [...prev, dataUrl])
    } catch (err) {
      console.error('Kunde inte komprimera foto:', err)
      toast.error('Kunde inte läsa in fotot')
    }
  }

  function removePhoto(index: number) {
    setPhotos(prev => prev.filter((_, i) => i !== index))
  }

  // B6: laddar upp ett (redan komprimerat, B1) foto till samma lagringsväg
  // som QuoteNewAttachmentsCard/handleFileUpload använder för manuella
  // bilagor — bara källan skiljer sig (dataURL i state i stället för en
  // File från en <input>). Attachments kräver ingen quote_id (skickas med
  // i POST-bodyn vid spar, se saveQuote) så uppladdningen kan ske direkt
  // efter analys, innan `photos` rensas. Sväljer fel — en misslyckad
  // bilage-uppladdning ska aldrig stoppa det redan lyckade AI-förslaget.
  async function uploadPhotoAsAttachment(
    dataUrl: string,
    index: number,
  ): Promise<{ name: string; url: string; size: number } | null> {
    try {
      const arrayBuffer = await (await fetch(dataUrl)).arrayBuffer()
      const timestamp = Date.now()
      const filePath = `${business.business_id}/quotes/drafts/${timestamp}_foto_${index + 1}.jpg`
      const { error: uploadError } = await supabase.storage
        .from('customer-documents')
        .upload(filePath, arrayBuffer, { contentType: 'image/jpeg', upsert: false })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('customer-documents').getPublicUrl(filePath)
      return { name: `Foto ${index + 1}.jpg`, url: urlData.publicUrl, size: arrayBuffer.byteLength }
    } catch (err) {
      console.error('Kunde inte spara foto som bilaga:', err)
      return null
    }
  }

  async function analyzePhoto() {
    if (photos.length === 0) return
    const images = photos.map(p => p.split(',')[1])
    setSourceImageBase64(images[0])
    setGenerating(true)
    try {
      const response = await fetch('/api/quotes/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images,
          textDescription: photoDescription || undefined,
          customerId: selectedCustomer || undefined,
        }),
      })
      const data = await response.json()
      if (data.success) {
        applyAiResult(data.quote)
        setAiPriceWarning(data.priceWarning || null)
        setAiPhotoCount(data.photoCount || photos.length)
        // B6: spara de analyserade fotona som bilagor på offerten i stället
        // för att bara slänga dem — hantverkarens dokumentation ska finnas
        // kvar. Görs innan `setPhotos([])` nedan.
        const uploaded = await Promise.all(photos.map((p, i) => uploadPhotoAsAttachment(p, i)))
        const newAttachments = uploaded.filter((a): a is { name: string; url: string; size: number } => !!a)
        if (newAttachments.length > 0) {
          setAttachments(prev => [...prev, ...newAttachments])
        }
        setPhotos([])
        setPhotoDescription('')
      } else {
        toast.error(data.error || 'AI-generering misslyckades')
      }
    } catch (err) {
      console.error('AI generation failed:', err)
      toast.error('Nätverksfel vid AI-generering')
    }
    setGenerating(false)
  }

  async function generateFromText(text?: string) {
    const inputText = text || aiTextInput
    if (!inputText.trim()) return
    setGenerating(true)
    try {
      const body: Record<string, string> = { textDescription: inputText }
      if (sourceImageBase64) body.imageBase64 = sourceImageBase64
      const response = await fetch('/api/quotes/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (data.success) {
        setSourceTranscript(inputText)
        applyAiResult(data.quote)
      } else {
        toast.error(data.error || 'AI-generering misslyckades')
      }
    } catch (err) {
      console.error('AI generation failed:', err)
      toast.error('Nätverksfel vid AI-generering')
    }
    setGenerating(false)
  }

  // ═══ SNABBOFFERTEN: bygg utkastet ═══════════════════════════════════
  //
  // Samma generator som AI-hjälpen — skillnaden är vad som händer EFTERÅT:
  // här landar man i sektionsgranskningen i stället för i den fulla editorn.
  //
  // Vid fel går vi tillbaka till intaget med texten kvar. Att slänga
  // hantverkaren in i en tom editor efter ett misslyckat AI-anrop hade
  // betytt att han fick skriva om hela beskrivningen.
  async function buildQuickDraft() {
    const inputText = quickInput.trim()
    if (!inputText) return
    setQuickMode('building')
    try {
      const body: Record<string, unknown> = { textDescription: inputText }
      if (photos.length > 0) body.images = photos.map(p => p.split(',')[1])
      if (selectedCustomer) body.customerId = selectedCustomer

      const response = await fetch('/api/quotes/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (!data.success) {
        toast.error(data.error || 'Kunde inte bygga utkastet')
        setQuickMode('intake')
        return
      }

      setSourceTranscript(inputText)
      applyAiResult(data.quote)
      setAiPriceWarning(data.priceWarning || null)

      // Fotona sparas som bilagor i stället för att slängas — samma väg som
      // AI-hjälpen (B6). Fail-soft: en misslyckad uppladdning får aldrig
      // fälla ett utkast som redan lyckats.
      if (photos.length > 0) {
        const uploaded = await Promise.all(photos.map((p, i) => uploadPhotoAsAttachment(p, i)))
        const ok = uploaded.filter((a): a is { name: string; url: string; size: number } => !!a)
        if (ok.length > 0) setAttachments(prev => [...prev, ...ok])
        setPhotos([])
      }

      // ETAPP D: efter fem genomförda snabbofferter landar utkastet direkt i
      // översikten. Granskningen finns kvar — den slutar bara vara startläget,
      // och kvittots amber-chips leder tillbaka in i den vid behov.
      setQuickSection('inkluderat')
      setQuickApproved([])
      setQuickMode(shouldSkipSequence(getCompletedCount()) ? 'overview' : 'review')
    } catch (err) {
      console.error('[Snabboffert] Kunde inte bygga utkastet:', err)
      toast.error('Nätverksfel — försök igen')
      setQuickMode('intake')
    }
  }

  // ETAPP C3: scrolla fram sektionen som granskas. scroll-margin-top i
  // modern-css.ts ger plats åt den sticky baren, annars hamnar sektionens
  // överkant under den. Körs efter render (requestAnimationFrame) eftersom
  // data-section-attributet sätts i samma renderpass som byter fokus.
  //
  // Misslyckas uppslaget händer ingenting alls — en sektion kan sakna
  // element (inga reservationer → inget reservationsblock), och det är ett
  // helt normalt tillstånd, inte ett fel att larma om.
  useEffect(() => {
    if (quickMode !== 'review') return
    const frame = requestAnimationFrame(() => {
      const target = document.querySelector(`[data-section="${quickSection}"]`)
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => cancelAnimationFrame(frame)
  }, [quickMode, quickSection])

  /** Godkänner sektionen och glider vidare; sista sektionen leder till helheten. */
  function approveQuickSection() {
    setQuickApproved(prev => (prev.includes(quickSection) ? prev : [...prev, quickSection]))
    const next = nextSection(quickSection)
    if (next) {
      setQuickSection(next)
    } else {
      setQuickMode('overview')
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Template handlers
  // ═══════════════════════════════════════════════════════════════════

  function handleNewTemplateSelect(template: QuoteTemplate) {
    // Sätts ENDAST om fälten fortfarande är tomma — en deal-prefill (Etapp 2)
    // äger jobbets identitet och ska aldrig skrivas över av mallvalet.
    setTitle(prev => prev || template.name)
    setDescription(prev => prev || template.description || '')
    setTemplateId(template.id)
    // Motor 1: template_id är primär grupperingsnyckel för efterkalkyl-insikt.
    fetchEfterkalkylInsight({ templateId: template.id })

    if (template.default_items && template.default_items.length > 0) {
      const cloned: QuoteItem[] = template.default_items.map((item, idx) => ({
        ...item,
        id: generateItemId(),
        sort_order: idx,
        total: item.item_type === 'item' ? item.quantity * item.unit_price : item.total,
      }))
      setItems(cloned)
    }

    if (template.default_payment_plan && template.default_payment_plan.length > 0) {
      setPaymentPlan(template.default_payment_plan)
      setShowPaymentPlan(true)
    }

    // Inlednings-/avslutningstext appliceras INTE längre från mallen
    // (redundanta mot description, pilot-beslut 2026-07).
    if (template.not_included) setNotIncluded(template.not_included)
    if (template.ata_terms) setAtaTerms(template.ata_terms)
    if (template.payment_terms_text) setPaymentTermsText(template.payment_terms_text)
    if (template.terms_text) setTermsText(template.terms_text)

    setDetailLevel(template.detail_level || 'detailed')
    setShowUnitPrices(template.show_unit_prices ?? true)
    setShowQuantities(template.show_quantities ?? true)

    // usage_count-räknare — PATCH istället för den gamla dubblett-POST:en som
    // (buggigt) skapade en NY mallrad i job_template vid varje mallval.
    fetch('/api/quote-templates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: template.id, increment_usage: true }),
    }).catch(() => {})

    toast.success(`Mall "${template.name}" tillämpad`)
  }

  function handleTemplateSelect(template: any) {
    if (template.default_items && Array.isArray(template.default_items) && template.default_items.length > 0) {
      handleNewTemplateSelect(template as QuoteTemplate)
      return
    }

    setTitle(template.name)
    setDescription(template.description || '')

    if (template.items && Array.isArray(template.items) && template.items.length > 0) {
      setItems(convertLegacyItems(template.items))
    } else {
      const newItems: QuoteItem[] = []
      const hourlyRate = pricingSettings?.hourly_rate || 650

      if (template.estimated_hours && template.labor_cost) {
        newItems.push({
          id: generateItemId(),
          item_type: 'item',
          description: template.name,
          quantity: template.estimated_hours,
          unit: 'tim',
          unit_price: hourlyRate,
          total: template.estimated_hours * hourlyRate,
          is_rot_eligible: true,
          is_rut_eligible: false,
          sort_order: 0,
        })
      }

      if (template.materials && Array.isArray(template.materials)) {
        template.materials.forEach((mat: any, idx: number) => {
          newItems.push({
            id: generateItemId(),
            item_type: 'item',
            description: mat.name || mat.description || 'Material',
            quantity: mat.quantity || 1,
            unit: normalizeUnit(mat.unit || 'st'),
            unit_price: mat.unitPrice || mat.unit_price || 0,
            total: (mat.quantity || 1) * (mat.unitPrice || mat.unit_price || 0),
            is_rot_eligible: false,
            is_rut_eligible: false,
            sort_order: idx + 1,
          })
        })
      }

      setItems(newItems)
    }

    if (template.rot_rut_type === 'rot' || template.rot_rut_type === 'rut') {
      setItems(prev =>
        prev.map(item => ({
          ...item,
          is_rot_eligible: template.rot_rut_type === 'rot' && item.unit === 'tim',
          is_rut_eligible: template.rot_rut_type === 'rut' && item.unit === 'tim',
        })),
      )
    }

    toast.success(`Mall "${template.name}" tillämpad`)
  }

  // ═══════════════════════════════════════════════════════════════════
  // Product search — sparade produkter från api/products
  // ═══════════════════════════════════════════════════════════════════

  // NY rad från produktbanken (add-row-combon + snabbval + modal): komponenterna
  // hämtas lazily om de saknas (snabbvalens produkter laddas utan) och raden
  // förfylls via applyProductToItem — snapshot/split/timmar fryses in.
  const addFromProduct = useCallback(
    async (product: ProductWithComponents, quantity = 1) => {
      addFromProductBank(await ensureProductComponents(product), quantity)
    },
    [addFromProductBank],
  )

  // Tom rad med beskrivningen redan ifylld — delas av listvyns combobox och
  // mobilens AddRowSheet, så "hittade ingen artikel" beter sig likadant på
  // båda ytorna.
  const addBlankRowWithDescription = useCallback((description: string) => {
    setItems(prev => [
      ...prev,
      {
        id: generateItemId(),
        item_type: 'item',
        description,
        quantity: 1,
        unit: 'st',
        unit_price: 0,
        total: 0,
        is_rot_eligible: false,
        is_rut_eligible: false,
        sort_order: prev.length,
      },
    ])
  }, [])

  // Förfyll BEFINTLIG rad (inline-combon i beskrivningsfältet) — combon
  // söker med include=components så inget extra API-anrop behövs, men
  // ensureProductComponents är en billig no-op-vakt om komponenter saknas.
  const applyProductToExistingRow = useCallback(
    async (itemId: string, product: ProductWithComponents) => {
      applyProductToRow(itemId, await ensureProductComponents(product))
    },
    [applyProductToRow],
  )

  // ═══════════════════════════════════════════════════════════════════
  // Payment plan handlers
  // ═══════════════════════════════════════════════════════════════════

  function addPaymentPlanEntry() {
    setPaymentPlan(prev => [...prev, { label: '', percent: 0, amount: 0, due_description: '' }])
  }

  function updatePaymentPlanEntry(index: number, field: keyof PaymentPlanEntry, value: any) {
    setPaymentPlan(prev => prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry)))
  }

  function removePaymentPlanEntry(index: number) {
    setPaymentPlan(prev => prev.filter((_, i) => i !== index))
  }

  // ═══════════════════════════════════════════════════════════════════
  // Spara i prislistan — POST /api/products + uppdatera linked_product_id
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Sparar radens pris som artikelns standardpris (2026-08-06).
   *
   * Registret seedas PRISLÖST — ett gissat pris är sämre än inget, eftersom
   * systemet quotar det med full självsäkerhet i offerten, telefonagenten och
   * storefronten. Priset förtjänas i stället av användning: hantverkaren
   * skriver in det första gången han använder artikeln och får då frågan här.
   *
   * Använder befintliga PUT /api/products, som redan tar sales_price. Ingen
   * ny rutt, ingen migration.
   *
   * Fail-soft: misslyckas skrivningen står priset kvar på raden och offerten
   * är oförändrad — bara standarden uteblir. Men det SÄGS, annars tror
   * hantverkaren att han sparat något han inte sparat.
   */
  async function saveStandardPrice(productId: string, price: number) {
    try {
      const res = await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: productId, sales_price: price }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      toast.success('Sparat som standardpris')
      setLocalPrice(productId, price)
    } catch (err) {
      console.error('[quotes/new] kunde inte spara standardpris:', err)
      toast.error('Kunde inte spara standardpriset — priset står kvar på raden')
    }
  }

  async function saveItemToProducts(payload: ProductSavePayload) {
    if (!productModalRow) return
    setSavingProduct(true)
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Kunde inte spara i prislistan')
      } else {
        const newId = data.product?.id
        if (newId) {
          updateItem(productModalRow.id, 'linked_product_id', newId)
        }
        toast.success('Sparad i prislistan')
        setProductModalRow(null)
      }
    } catch (err) {
      console.error('Save to products failed:', err)
      toast.error('Kunde inte spara i prislistan')
    }
    setSavingProduct(false)
  }

  function addQuickstartRow(row: QuickstartRow) {
    setItems(prev => [
      ...prev,
      {
        id: generateItemId(),
        item_type: 'item',
        description: row.name,
        quantity: 1,
        unit: row.unit,
        unit_price: row.sales_price,
        total: row.sales_price,
        category_slug: row.category_slug,
        is_rot_eligible: row.is_rot_eligible,
        is_rut_eligible: row.is_rut_eligible,
        rot_rut_type: row.is_rot_eligible ? 'rot' : row.is_rut_eligible ? 'rut' : null,
        sort_order: prev.length,
      },
    ])
  }

  function buildProductInitialValues(row: QuoteItem): ProductInitialValues {
    return {
      name: row.description,
      unit: row.unit,
      sales_price: row.unit_price,
      purchase_price: row.cost_price ?? null,
      sku: row.article_number ?? null,
      category: row.category_slug || 'material_bygg',
      rot_eligible: row.is_rot_eligible,
      rut_eligible: row.is_rut_eligible,
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Save
  // ═══════════════════════════════════════════════════════════════════

  // ETAPP 1f (offert-masterplan.md): `skipDescriptionConfirm` ersätter den
  // gamla descriptionWarningShownRef-dubbelklicksväggen (osynlig — kräver
  // att man vet att man ska klicka Skicka igen). Nu visar QuoteNewHeader
  // en inline-bekräftelse ("Skicka ändå?") och skickar true hit när
  // hantverkaren aktivt bekräftar.
  const saveQuote = async (send: boolean = false, skipDescriptionConfirm: boolean = false) => {
    if (send && !selectedCustomer) {
      toast.warning('Välj en kund först för att skicka offerten')
      return
    }
    if (send && !description.trim() && !skipDescriptionConfirm) {
      setSendConfirmPending(true)
      return
    }
    setSendConfirmPending(false)
    if (paymentPlan.length > 0 && !paymentPlanValid) {
      toast.warning('Betalningsplanens procentsatser måste summera till 100%')
      return
    }

    setSaving(true)
    try {
      // P4 (UX-revision 2026-08-03): AI-rader som saknade pris, som
      // användaren fyllt i och lämnat ikryssade ("Spara i produktbanken",
      // default PÅ — se ItemRow) — auto-POSTas till /api/products HÄR, före
      // offerten sparas, så nästa AI-offert hittar priset. `workingItems` är
      // en lokal kopia (inte `items`-state) eftersom setState inte
      // reflekteras synkront — linked_product_id måste hinna sättas innan
      // finalItems byggs nedan.
      let workingItems = items
      const autoSaveCandidates = workingItems.filter(
        i =>
          i.item_type === 'item' &&
          i.ai_price_missing &&
          i.save_to_products !== false &&
          i.unit_price > 0 &&
          !i.linked_product_id &&
          i.description.trim() !== '',
      )
      if (autoSaveCandidates.length > 0) {
        for (const row of autoSaveCandidates) {
          try {
            const res = await fetch('/api/products', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: row.description,
                description: null,
                category: row.category_slug || 'material_bygg',
                sku: null,
                unit: row.unit,
                purchase_price: row.cost_price ?? null,
                sales_price: row.unit_price,
                rot_eligible: row.is_rot_eligible,
                rut_eligible: row.is_rut_eligible,
                is_favorite: false,
              }),
            })
            if (res.ok) {
              const data = await res.json()
              const newId = data.product?.id
              if (newId) {
                workingItems = workingItems.map(i => (i.id === row.id ? { ...i, linked_product_id: newId } : i))
              }
            }
          } catch (err) {
            // Sväljs medvetet — en misslyckad produktbanks-auto-save får
            // aldrig blockera offert-sparandet.
            console.error('[saveQuote] auto-save till produktbanken misslyckades:', err)
          }
        }
        setItems(workingItems)
      }

      const finalItems = recalculateItems(workingItems)
        .map((item, idx) => ({ ...item, sort_order: idx }))
        // Editor-interna flaggor (P4) ska inte fastna i den sparade offerten.
        .map(({ ai_price_missing, save_to_products, ...rest }) => rest)

      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: selectedCustomer || null,
          status: 'draft',
          title,
          description,
          quote_items: finalItems,
          vat_rate: vatRate,
          discount_percent: discountPercent,
          not_included: notIncluded || null,
          ata_terms: ataTerms || null,
          payment_terms_text: paymentTermsText || null,
          terms_text: termsText || null,
          reservations_snapshot: reservations.snapshot.length > 0 ? reservations.snapshot : null,
          payment_plan: paymentPlan.length > 0 ? calculatedPaymentPlan : null,
          reference_person: referencePerson || null,
          customer_reference: customerReference || null,
          project_address: projectAddress || null,
          detail_level: detailLevel,
          show_unit_prices: showUnitPrices,
          show_quantities: showQuantities,
          personnummer: hasRotItems || hasRutItems ? personnummer || null : null,
          fastighetsbeteckning: hasRotItems ? fastighetsbeteckning || null : null,
          valid_days: validDays,
          ai_generated: aiGenerated || false,
          ai_confidence: aiConfidence || null,
          source_transcript: sourceTranscript || null,
          template_id: templateId || null,
          template_style: templateStyle,
          attachments: attachments.length > 0 ? attachments : [],
          deal_id: dealIdFromQuery,
          lead_id: leadIdFromQuery,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Kunde inte spara offerten')
      } else {
        toast.success(send ? 'Offert sparad — öppnar skicka-vy' : 'Offert sparad som utkast')
        router.push(
          send
            ? `/dashboard/quotes/${data.quote.quote_id}?send=true`
            : `/dashboard/quotes/${data.quote.quote_id}`,
        )
      }
    } catch (err) {
      console.error('Save failed:', err)
      toast.error('Kunde inte spara offerten')
    }
    setSaving(false)
  }

  async function saveAsTemplate() {
    if (!templateName.trim()) return
    setSavingTemplate(true)
    try {
      await fetch('/api/quote-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateName,
          description,
          default_items: recalculateItems(items),
          default_payment_plan: paymentPlan,
          not_included: notIncluded || null,
          ata_terms: ataTerms || null,
          payment_terms_text: paymentTermsText || null,
          terms_text: termsText || null,
          detail_level: detailLevel,
          show_unit_prices: showUnitPrices,
          show_quantities: showQuantities,
          rot_enabled: hasRotItems,
          rut_enabled: hasRutItems,
        }),
      })
      toast.success('Mall sparad!')
      setShowSaveTemplateModal(false)
      setTemplateName('')
    } catch (err) {
      console.error('Failed to save template:', err)
      toast.error('Kunde inte spara mallen')
    }
    setSavingTemplate(false)
  }

  // ═══════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════

  // Startsteget döljs så fort NÅGON styrsignal redan pekat ut vad offerten
  // ska bli — transcript (AI-flödet öppnas redan automatiskt ovan),
  // deal/lead-koppling, vald kund, eller en förifylld titel.
  const hasQuoteStartSignal = !!(
    searchParams?.get('transcript') ||
    searchParams?.get('deal_id') || searchParams?.get('lead_id') ||
    searchParams?.get('customerId') || searchParams?.get('customer_id') ||
    searchParams?.get('title')
  )
  /**
   * KALLSTART GÅR DIREKT TILL SNABBOFFERTEN (2026-08-06).
   *
   * Tidigare låg en fullskärmsväljare med fyra alternativ först. Två av dem
   * var samma sak: "Beskriv jobbet med AI" och "Snabboffert" postade båda till
   * /api/quotes/ai-generate och körde applyAiResult — Snabbofferten är en
   * strikt förbättring med röst, kundval och sektionsgranskning. Ett tredje,
   * "Börja från tom offert", erbjöd piloten exakt den yta han beskrev som "för
   * mycket, rörigt".
   *
   * Kvar blir ETT beslut — beskriva eller återanvända — och det behöver ingen
   * egen skärm. Mallvalet och den fullständiga editorn ligger som länkar i
   * intaget, där de kostar noll tills de behövs.
   *
   * Villkoret är detsamma som styrde väljaren: kommer man från en affär, lead,
   * kund eller ett transkript vet vi redan vad offerten gäller och ska inte
   * fråga om något.
   */
  const coldStart = !hasQuoteStartSignal
  useEffect(() => {
    if (loading || !coldStart || quickMode !== null || quickStartDoneRef.current) return
    quickStartDoneRef.current = true

    // Etapp D2: hantverkarens egen vana väger tyngre än vårt default. Den som
    // svarat ja på "vill du alltid börja så här?" slipper mellansteget.
    const preferred = getPreferredStart()
    if (preferred === 'editor') return          // stanna i offertskaparen
    if (preferred === 'template') { setTemplatePickerOpen(true); return }
    setQuickMode('intake')
  }, [loading, coldStart, quickMode])

  /**
   * Etapp D2: den väg ut ur Snabbofferten som hantverkaren just tagit för
   * tredje gången. Sätts av utgångarna nedan och visar frågan EN gång.
   */
  const [askPreferredFor, setAskPreferredFor] = useState<EscapeRoute | null>(null)

  /**
   * Hantverkarens sparade startläge. Läses en gång efter montering — inte i
   * en useState-initierare, eftersom localStorage inte finns under
   * serverrenderingen och värdena då skulle skilja sig mellan server och
   * klient.
   *
   * Används bara för att kunna ta sig TILLBAKA till Snabbofferten. Den som
   * svarat "börja alltid i offertskaparen" hade annars ingen väg dit igen —
   * och banderollen lovar uttryckligen att man kan ändra sig.
   */
  const [preferredStart, setPreferredStartState] = useState<'quick' | 'editor' | 'template'>('quick')
  useEffect(() => { setPreferredStartState(getPreferredStart()) }, [])

  /**
   * Tar hand om en väg ut ur Snabbofferten: räknar, och frågar vid tredje.
   *
   * `carryText` finns för att inget skrivet ska gå förlorat. Skriver man halva
   * beskrivningen i intaget och sedan byter till offertskaparen låg texten
   * tidigare kvar i quickInput utan att någonsin tillämpas — och eftersom det
   * inte finns någon väg tillbaka till intaget var den i praktiken tappad.
   */
  function leaveQuickMode(route: EscapeRoute, carryText: boolean) {
    if (carryText) {
      const typed = quickInput.trim()
      // Skriver aldrig över något som redan står där.
      if (typed && !description.trim()) setDescription(typed)
      if (typed && !sourceTranscript) setSourceTranscript(typed)
    }
    const count = recordEscape(route)
    if (shouldAskPreferred(count, hasBeenAskedPreferred(route))) {
      setAskPreferredFor(route)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
      </div>
    )
  }

  // ═══ SNABBOFFERTEN: intag och byggkänsla är fullskärmslägen ══════════
  if (quickMode === 'intake') {
    return (
      <>
      {/* Mallistan ligger ÖVER intaget, som blir kvar monterat under. Stänger
          man den utan att välja något är man tillbaka där man var — annars
          hade ett ångrat mallval landat i den fullständiga editorn, alltså
          precis den yta man försökte undvika. */}
      <QuoteNewStartChooser
        show={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
        onSelectTemplate={t => { handleTemplateSelect(t); setQuickMode(null) }}
      />
      <QuickIntake
        customers={customers}
        selectedCustomer={selectedCustomer}
        onSelectCustomer={setSelectedCustomer}
        value={quickInput}
        onChange={setQuickInput}
        photos={photos}
        onPhotoFile={file => { void handlePhotoFile(file) }}
        onRemovePhoto={removePhoto}
        maxPhotos={MAX_PHOTOS}
        onBuild={() => { void buildQuickDraft() }}
        // "Tillbaka" lämnar offerten. Intaget är sedan startväljaren togs bort
        // det FÖRSTA man ser vid kallstart, så det finns ingenting bakom det i
        // sidan — hade den bara satt quickMode = null vore den identisk med
        // "Öppna fullständiga editorn" strax intill, alltså samma sorts
        // dubblett vi nyss städade bort.
        onClose={() => router.push('/dashboard/quotes')}
        onOpenFullEditor={() => { leaveQuickMode('editor', true); setQuickMode(null) }}
        building={false}
        // Ingen carryText här: mallen sätter sin egen titel och beskrivning,
        // så texten hade skrivits över i nästa andetag ändå.
        onUseTemplate={() => { leaveQuickMode('template', false); setTemplatePickerOpen(true) }}
        hasContent={items.length > 0}
      />
      </>
    )
  }

  if (quickMode === 'building') {
    return (
      <QuickBuilding
        businessName={businessConfig?.business_name || business.business_name || 'Ditt företag'}
        customerName={selectedCustomerObj?.name || null}
        issuedDate={new Date().toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })}
      />
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mallväljaren. Öppnas bara från Snabboffertens intag — den är inte
          längre ett startval utan en av två utgångar därifrån. */}
      <QuoteNewStartChooser
        show={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
        onSelectTemplate={handleTemplateSelect}
      />

      {/* Granskningsbaren är fäst i nederkanten och täcker sidans slut — utan
          utrymme nedtill hamnar summeringen under den och går inte att nå.
          Höjden var tidigare en hårdkodad gissning (260px); baren mäter och
          publicerar nu sin faktiska höjd som --qk-review-bar-h. */}
      <div
        className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4 sm:py-6"
        style={quickMode === 'review' ? { paddingBottom: 'calc(var(--qk-review-bar-h, 220px) + 1.5rem)' } : undefined}
      >
        <QuoteNewHeader
          aiGenerated={aiGenerated}
          aiConfidence={aiConfidence}
          aiPriceWarning={aiPriceWarning}
          aiPhotoCount={aiPhotoCount}
          saving={saving}
          canSend={!!selectedCustomer}
          sendDisabledReason={!selectedCustomer ? 'Välj kund först' : undefined}
          sendConfirmPending={sendConfirmPending}
          onConfirmSend={() => saveQuote(true, true)}
          onCancelSend={() => setSendConfirmPending(false)}
          hasItems={items.length > 0}
          onSendQuote={() => saveQuote(true)}
          onSaveDraft={() => saveQuote(false)}
          onSaveTemplate={() => {
            setTemplateName(title)
            setShowSaveTemplateModal(true)
          }}
        />

        {/* Kvittoprincipen Fall 1: motorns eget resonemang, direkt under
            headern före radlistan. Renderar ingenting utan reasoning;
            expanderat från start när en affärsregel aktiverats. */}
        {aiGenerated && aiBedomning && (
          <DanielsBedomning
            reasoning={aiBedomning.reasoning}
            rules={aiBedomning.rules}
            lessons={aiBedomning.lessons}
            customerFacts={aiBedomning.customerFacts}
            confidence={aiConfidence}
          />
        )}

        {/* ETAPP 2b (offert-masterplan.md): canvas-first-layouten. Dokumentet
            är huvudytan (majoritetsbredd) — assistentkolumnen innehåller bara
            det som inte syns i dokumentet: kund & giltighet, AI-hjälpen,
            summering + skicka. Allt annat nås via "Mer"-raden ovanför
            dokumentet. */}
        {/* MOBILORDNING (pilotfeedback 2026-08-06): assistentkolumnen låg
            först i DOM:en, så dokumentet hamnade efter ~25 kontroller — man
            fick scrolla förbi allt för att se offerten. Nu är kolumnen delad:
            kund och varningar ligger kvar överst (kundvalet är enda hårda
            valideringen och får inte hamna under dokumentet), medan
            AI-hjälpen, summeringen och Skicka flyttas NEDANFÖR dokumentet på
            mobil. Desktop är oförändrad — grid-placeringen sätts explicit. */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,380px)_1fr] lg:grid-rows-[auto_1fr] gap-5 items-start">
          {/* ── Assistentkolumnen, del 1: varningar + kund ────────── */}
          <div className="order-1 lg:order-none lg:col-start-1 lg:row-start-1 flex flex-col gap-4">
            {/* ETAPP C4: kvittot när alla sektioner är genomgångna. Ligger
                överst i kolumnen så det är det första man ser när
                granskningen är klar — svaret på "har jag fått med allt?". */}
            {quickMode === 'overview' && (
              <QuickReceipt
                summaries={quickSummaries}
                approved={quickApproved}
                amountToPay={formatCurrency(
                  totals.gronBase > 0
                    ? totals.customerPaysAfterDeductions
                    : hasRotItems
                      ? totals.rotCustomerPays
                      : hasRutItems
                        ? totals.rutCustomerPays
                        : totals.total,
                )}
                customerName={selectedCustomerObj?.name || null}
                onGoToSection={section => { setQuickSection(section); setQuickMode('review') }}
                onSend={() => {
                  // Räknas när offerten FAKTISKT skickas, aldrig när utkastet
                  // byggdes. En påbörjad och övergiven snabboffert är inte
                  // erfarenhet — den ska inte snabba på flödet nästa gång.
                  recordCompletedQuickQuote()
                  void saveQuote(true)
                }}
                onOpenFullEditor={() => setQuickMode(null)}
                sending={saving}
              />
            )}

            {/* Etapp D2: "vill du alltid börja så här?" — ställs en gång, när
                hantverkaren tagit samma väg ut för tredje gången. Banderoll
                och inte dialog: frågan dyker upp precis när han är på väg att
                börja jobba, och ska gå att ignorera helt. */}
            {askPreferredFor && (
              <QuickStartPreferenceBanner
                route={askPreferredFor}
                onAccept={() => {
                  setPreferredStart(askPreferredFor)
                  markAskedPreferred(askPreferredFor)
                  setAskPreferredFor(null)
                  toast.success('Sparat — vi börjar här nästa gång.')
                }}
                onDecline={() => {
                  // Ett nej är också ett svar. Markeras som ställd så frågan
                  // aldrig kommer tillbaka.
                  markAskedPreferred(askPreferredFor)
                  setAskPreferredFor(null)
                }}
              />
            )}

            {/* Vägen TILLBAKA till Snabbofferten. Syns bara för den som valt
                bort den, och bara innan offerten fått innehåll — annars vore
                det en knapp som slänger arbete. Utan den här raden vore
                banderollens "du kan alltid ändra dig" ett tomt löfte. */}
            {preferredStart !== 'quick' && quickMode === null && items.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  setPreferredStart('quick')
                  setPreferredStartState('quick')
                  setQuickMode('intake')
                }}
                className="w-full px-4 py-3 bg-white border border-slate-200 hover:border-primary-700 rounded-2xl text-sm font-medium text-primary-700 transition-colors text-left"
              >
                Beskriv jobbet i stället — vi bygger utkastet
              </button>
            )}

            {/* Prisvarningar/efterkalkyl — viktig info, inte begravd */}
            <QuoteNewPriceWarningsBanner warnings={priceWarnings} alternatives={priceAlts} />
            <QuoteNewEfterkalkylBanner insight={efterkalkylInsight} />

            {/* Reservationsmotorn: tyst räknare, aldrig en avbrytande dialog.
                15 matchande artiklar ger fortfarande EN banner med en siffra. */}
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

            {/* Marginalen medan priset sätts — självgardande, syns bara när
                minst en rad har ett känt inköpspris. */}
            <QuoteMarginCard items={recalculated} />

            <QuoteNewCustomerSection
              customers={customers}
              selectedCustomer={selectedCustomer}
              setSelectedCustomer={setSelectedCustomer}
              validDays={validDays}
              setValidDays={setValidDays}
              title={title}
              setTitle={setTitle}
              description={description}
              setDescription={setDescription}
              customerPriceListInfo={customerPriceListInfo}
              items={items}
              setItems={setItems}
              hasItems={items.length > 0}
            />
          </div>

          {/* ── Assistentkolumnen, del 2: verktyg och avslut ───────
              Ligger EFTER dokumentet på mobil (order-3) men i samma
              vänsterkolumn på desktop. */}
          <div className="order-3 lg:order-none lg:col-start-1 lg:row-start-2 flex flex-col gap-4">
            <QuoteNewAIHelper
              open={showAiHelper}
              setOpen={setShowAiHelper}
              generating={generating}
              photos={photos}
              maxPhotos={MAX_PHOTOS}
              onPhotoFile={handlePhotoFile}
              onRemovePhoto={removePhoto}
              photoDescription={photoDescription}
              setPhotoDescription={setPhotoDescription}
              onAnalyzePhoto={analyzePhoto}
              aiTextInput={aiTextInput}
              setAiTextInput={setAiTextInput}
              onGenerateFromText={() => generateFromText()}
            />

            <QuoteEditTotalsSection
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

            {/* DUBBLETT BORTTAGEN (2026-08-06): Skicka fanns både här och i
                den sticky headern. Headern vinner — den är alltid synlig,
                vilket blev avgörande när summeringen flyttade under
                dokumentet på mobil. En sanning per kontroll. */}
          </div>

          {/* ── Dokumentpanelen — huvudytan, näst överst på mobil ── */}
          <div className="order-2 lg:order-none lg:col-start-2 lg:row-start-1 lg:row-span-2 flex flex-col gap-3">
            {/* "Mer"-verktygsrad — Stil/Villkor/Betalplan/Visning/Bilagor/
                ROT nås härifrån, en panel synlig i taget (inte modal —
                dokumentet syns hela tiden nedanför). Listvy/Dokument växlar
                huvudytans innehåll. */}
            <div className="bg-white border border-slate-200 rounded-2xl p-2 flex flex-wrap items-center gap-1.5">
              <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Mer</span>
              {(
                [
                  { key: 'stil', label: 'Stil' },
                  { key: 'villkor', label: 'Villkor & texter' },
                  { key: 'betalplan', label: 'Betalplan' },
                  { key: 'visning', label: 'Visning' },
                  { key: 'bilagor', label: 'Bilagor' },
                  { key: 'rot', label: 'ROT-detaljer' },
                ] as const
              ).map(p => {
                // Statusprick: sju av offertens fält bor bara här, och utan
                // markering måste man öppna varje panel för att veta vad som
                // är ifyllt. Amber används sparsamt — bara vid verkliga fel.
                const status = merPanelStatus[p.key]
                const isActive = activePanel === p.key
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setActivePanel(isActive ? null : p.key)}
                    title={status.state === 'attention' ? `${p.label} — ${status.hint}` : undefined}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-primary-700 text-white'
                        : status.state === 'attention'
                          ? 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                          : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {status.state !== 'empty' && (
                      <span
                        aria-hidden
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isActive
                            ? 'bg-white/80'
                            : status.state === 'attention'
                              ? 'bg-amber-500'
                              : 'bg-primary-600'
                        }`}
                      />
                    )}
                    {p.label}
                    {status.hint && status.state !== 'attention' && (
                      <span className={isActive ? 'text-white/70' : 'text-slate-400'}>{status.hint}</span>
                    )}
                  </button>
                )
              })}
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
                  value={templateStyle}
                  onChange={setTemplateStyle}
                  businessDefaultStyle={businessDefaultStyle}
                  accentColor={businessConfig?.accent_color}
                />
              </div>
            )}

            {activePanel === 'villkor' && (
              <QuoteEditStandardTextsSection
                open={true}
                setOpen={b => setActivePanel(b ? 'villkor' : null)}
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
            )}

            {activePanel === 'betalplan' && (
              <QuoteEditPaymentPlanSection
                open={true}
                setOpen={b => setActivePanel(b ? 'betalplan' : null)}
                paymentPlan={paymentPlan}
                calculatedPaymentPlan={calculatedPaymentPlan}
                paymentPlanValid={paymentPlanValid}
                onAddEntry={addPaymentPlanEntry}
                onUpdateEntry={updatePaymentPlanEntry}
                onRemoveEntry={removePaymentPlanEntry}
                formatCurrency={formatCurrency}
              />
            )}

            {activePanel === 'visning' && (
              <QuoteEditDisplaySettingsSection
                open={true}
                setOpen={b => setActivePanel(b ? 'visning' : null)}
                detailLevel={detailLevel}
                setDetailLevel={setDetailLevel}
                showUnitPrices={showUnitPrices}
                setShowUnitPrices={setShowUnitPrices}
                showQuantities={showQuantities}
                setShowQuantities={setShowQuantities}
              />
            )}

            {activePanel === 'bilagor' && (
              <div className="relative">
                <MerPanelClose onClose={() => setActivePanel(null)} />
                <QuoteNewAttachmentsCard
                  attachments={attachments}
                  setAttachments={setAttachments}
                  uploadingFile={uploadingFile}
                  onFileUpload={handleFileUpload}
                />
              </div>
            )}

            {activePanel === 'rot' && (
              <div className="relative">
                <MerPanelClose onClose={() => setActivePanel(null)} />
                <QuoteEditRotSection
                  items={items}
                  setItems={setItems}
                  hasRotItems={hasRotItems}
                  personnummer={personnummer}
                  setPersonnummer={setPersonnummer}
                  fastighetsbeteckning={fastighetsbeteckning}
                  setFastighetsbeteckning={setFastighetsbeteckning}
                />
              </div>
            )}

            {/* Huvudyta: dokument-canvas (default) eller listvy (radeditor) */}
            {mainView === 'list' ? (
              <QuoteItemsSection
                items={items}
                recalculated={recalculated}
                allCategories={allCategories}
                customCategories={localCustomCategories}
                products={products}
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
            ) : (
              <div className="lg:sticky lg:top-[5.5rem] lg:h-[calc(100vh-7rem)]">
                <QuotePreviewPanel
                  open={showPreviewPanel}
                  setOpen={setShowPreviewPanel}
                  previewMode={previewMode}
                  setPreviewMode={setPreviewMode}
                  liveEnabled={liveAvailable}
                  liveTemplateData={quoteTemplateData}
                  // ETAPP C3: i granskningsläget skickas bara den fokuserade
                  // sektionens handlers in — dokumentmotorn renderar då resten
                  // som ren text. focusSection sköter dimningen. Två oberoende
                  // spakar: dimning utan handler-gating hade sett låst ut men
                  // fortfarande varit redigerbart.
                  liveHandlers={
                    quickMode === 'review' ? sectionHandlers(quickSection, liveHandlers) : liveHandlers
                  }
                  focusSection={quickMode === 'review' ? quickSection : null}
                  // Gaten är "är vi i snabbofferten alls", inte "är vi i
                  // granskningssteget". Med det senare hade klassen lagts till
                  // på nytt vid översikt → sektion och revealen spelats om.
                  quickReveal={quickMode !== null}
                  onRowTap={quickMode === 'review' && quickSection !== 'inkluderat' ? undefined : setSheetItemId}
                  onAddRowTap={() => setAddRowSheetOpen(true)}
                  templatePreviewPayload={templatePreviewPayload}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ETAPP 3: bottom-sheet-radeditorn (mobil) — se sheetItem/sheetItemId
          ovan. Ersätter QuoteEditMobilePreviewModal/FAB:en (borttagen):
          dokumentet syns nu direkt i huvudytan på mobil (QuotePreviewPanel
          är inte längre `hidden lg:flex`) istället för bakom en separat
          modal-knapp. */}
      <RowEditSheet
        item={sheetItem}
        allCategories={allCategories}
        onUpdate={updateItem}
        onRemove={removeItem}
        onMove={moveItemById}
        onClose={() => setSheetItemId(null)}
        // Priset förtjänas av användning: registret seedas prislöst och
        // hantverkaren sätter standarden första gången han använder artikeln.
        // Uppslaget görs mot listan sidan redan har — sheeten hämtar inget.
        linkedProductPrice={
          sheetItem?.linked_product_id
            ? products.find(p => p.id === sheetItem.linked_product_id)?.sales_price ?? null
            : null
        }
        onSaveAsStandard={(productId, price) => { void saveStandardPrice(productId, price) }}
        onSaveToBank={row => setProductModalRow(row)}
      />

      {/* Mobilens "lägg till rad" — söker i artikelbanken i stället för att
          ge en tom rad. Öppnas av den oskalade knappen under dokumentet. */}
      <AddRowSheet
        open={addRowSheetOpen}
        // SPÅR C2: förbehållen syns i väljaren, innan raden läggs till.
        reservationCount={product => reservations.countForProduct(product)}
        onSelectProduct={(product, quantity) => { void addFromProduct(product, quantity) }}
        onAddBlankRow={addBlankRowWithDescription}
        onAddHeading={() => addItem('heading')}
        onClose={() => setAddRowSheetOpen(false)}
      />

      {/* ETAPP C3: Snabboffertens granskningsbar. Sticky nederst, med
          tappbara progressprickar och "Hoppa till översikt" — granskningen är
          navigering, inte grindar. Varje sektion får sitt eget verktyg som
          barn: det som sektionen faktiskt behöver, inte en generisk meny. */}
      {quickMode === 'review' && (
        <QuickReviewBar
          section={quickSection}
          summary={quickSummaries[quickSection]}
          approved={quickApproved}
          onSelectSection={setQuickSection}
          onApprove={approveQuickSection}
          onSkipToOverview={() => setQuickMode('overview')}
        >
          {quickSection === 'inkluderat' && (
            <button
              type="button"
              onClick={() => setAddRowSheetOpen(true)}
              className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-dashed border-slate-300 text-primary-700 text-sm font-semibold rounded-xl hover:bg-primary-50/50 transition-colors"
            >
              + Lägg till rad
            </button>
          )}
          {quickSection === 'reservationer' && reservations.suggestions.length > 0 && (
            <button
              type="button"
              onClick={() => reservations.setReviewOpen(true)}
              className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-amber-300 text-amber-800 text-sm font-semibold rounded-xl hover:bg-amber-50 transition-colors"
            >
              Se {reservations.suggestions.length} förslag
            </button>
          )}
          {quickSection === 'exkluderat' && (
            <textarea
              value={notIncluded}
              onChange={e => setNotIncluded(e.target.value)}
              rows={2}
              placeholder="Vad ingår INTE? T.ex. målning, bygglov, bortforsling…"
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 bg-white focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors resize-none"
            />
          )}
          {quickSection === 'prisbild' && hasRotItems && !personnummer.trim() && (
            <input
              type="text"
              value={personnummer}
              onChange={e => setPersonnummer(e.target.value)}
              placeholder="Kundens personnummer — krävs för ROT-avdraget"
              className="w-full px-3 py-2.5 border border-amber-300 rounded-xl text-sm text-slate-900 placeholder:text-amber-700/60 bg-white focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors"
            />
          )}
        </QuickReviewBar>
      )}

      {/* Granskningsvyn för reservationsförslag — förbockade, redigerbara,
          med raderna som utlöste dem som motivering. */}
      <ReservationReviewSheet
        open={reservations.reviewOpen}
        suggestions={reservations.suggestions}
        onAccept={reservations.acceptSuggestions}
        onSkipAll={reservations.dismissAll}
        onClose={() => reservations.setReviewOpen(false)}
      />

      {/* Grossist search modal */}
      <ProductSearchModal
        isOpen={showGrossistSearch}
        onClose={() => setShowGrossistSearch(false)}
        onSelect={p => {
          addFromGrossist(p)
          setShowGrossistSearch(false)
        }}
        businessId={business.business_id}
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

      <QuoteEditSaveTemplateModal
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
