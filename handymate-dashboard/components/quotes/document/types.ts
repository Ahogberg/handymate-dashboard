/**
 * Delade typer för dokumentmotorn (ETAPP 2a, offert-masterplan.md).
 * Egen fil (inte QuoteDocument.tsx) så QuoteDocument.tsx och
 * QuoteDocumentRow.tsx/SignatureCta.tsx kan importera varandras typer utan
 * en cirkulär modulgraf.
 */
import type { QuoteTemplateData } from '@/lib/quote-templates/types'
import type { InvoiceTemplateData } from '@/lib/invoice-templates/types'

/**
 * ETAPP 6a (offert-masterplan.md, faktura-sprinten): docType-diskriminerad
 * union — dokumentmotorn (QuoteDocument.tsx) generaliseras till att rendera
 * BÅDE offerter och fakturor. QuoteTemplateData/InvoiceTemplateData
 * (lib/quote-templates, lib/invoice-templates) förblir OFÖRÄNDRADE som
 * fristående typer (minsta churn — 25+ befintliga call sites importerar
 * dem redan) — unionen lägger bara till diskriminanten `docType` ovanpå.
 * buildQuoteTemplateData sätter `docType: 'quote'`, buildInvoiceTemplateData
 * sätter `docType: 'invoice'` (se respektive data-builder.ts).
 *
 * Filnamnet/komponentnamnen (QuoteDocument.tsx, QuoteDocumentRow.tsx)
 * BEHÅLLS medvetet trots generaliseringen — en mappflytt/omdöpning till
 * "MoneyDocument" hade krävt att ändra importvägen på 19+ ställen för noll
 * funktionell vinst. Se rapporten för det beslutet.
 */
export type MoneyDocumentData =
  | (QuoteTemplateData & { docType: 'quote' })
  | (InvoiceTemplateData & { docType: 'invoice' })

/** Fält som canvasen kan patcha på en rad — id-baserat, INTE index-baserat
    (ETAPP 2a ersätter new/page.tsx:s tidigare index-mutation). Sparse-patch:
    endast de fält som faktiskt ändrades skickas med i varje anrop. */
export interface QuoteItemPatch {
  name?: string
  quantity?: number
  unit?: string
  unitPrice?: number
}

export type QuoteDocumentMode = 'static' | 'edit'

/**
 * ETAPP C3 (Snabbofferten, 2026-08-06): SAMTLIGA handlers är optionella.
 *
 * Dokumentmotorn gatar redan varje redigerbart fält på att motsvarande handler
 * finns — saknas den renderas fältet som ren text i stället. Det betyder att
 * ett PARTIELLT handlers-objekt ger "bara den här sektionen är redigerbar,
 * resten är läsbar" utan en enda ändring i renderingslogiken.
 *
 * Tidigare var sex av fälten obligatoriska (titel, beskrivning, radändring,
 * radtillägg, radborttagning, ROT-cykel, tillvalsförval), vilket tvingade
 * varje anropare att skicka allt. Sektionsfokus hade då krävt att skicka in
 * no-op-funktioner — och en no-op ser ut som en fungerande handler för
 * dokumentmotorn, så fältet hade renderats redigerbart men inte gjort något.
 * Att göra fälten optionella är alltså inte bara bekvämare, det är det enda
 * sättet att uttrycka "det här fältet ska INTE gå att redigera nu".
 *
 * Befintliga anropare (new/edit-sidornas liveHandlers) skickar fortfarande
 * allt och påverkas inte. Se lib/quotes/section-handlers.ts för hur
 * delmängderna byggs.
 */
export interface QuoteDocumentHandlers {
  onTitleChange?: (v: string) => void
  onDescriptionChange?: (v: string) => void
  /** Endast satt på ytor där kundnamnet får redigeras inline (idag ingen —
      kunden väljs via en separat selector). undefined → namnet är text. */
  onCustomerNameChange?: (v: string) => void
  onPaymentTermsChange?: (v: string) => void
  onTermsChange?: (v: string) => void
  /** Giltig till-datum — ISO-sträng (yyyy-mm-dd) från EditableDate-fältets
      native <input type="date">. Anroparen räknar om till sitt eget
      "giltig i N dagar"-state (se new/edit-sidornas onValidUntilChange). */
  onValidUntilChange?: (v: string) => void
  /** Global procentrabatt i summeringen — se QuoteTemplateQuote.discountPercent.
      Utelämnad → raden renderas inte alls (varken text eller redigerbar). */
  onDiscountChange?: (v: number) => void
  /** "Ej inkluderat"-texten i villkorsstycket — multiline, samma mönster som
      onTermsChange. */
  onNotIncludedChange?: (v: string) => void
  onItemChange?: (id: string, patch: QuoteItemPatch) => void
  /** Lägger till en ny tom 'item'-rad sist — samma beteende som dagens
      "+ Lägg till rad". Radtypsväljare (rubrik/text/etc) ägs av "Mer"-
      verktygsraden (E2b), inte av canvasen. */
  onItemAdd?: () => void
  onItemRemove?: (id: string) => void
  /** Flyttar raden ett steg upp eller ned. Canvasen kunde tidigare inte
      ändra radordning alls — på mobilen, där canvasen är huvudytan, gick
      det inte att flytta en rad utan att lämna vyn. dnd-kit används
      MEDVETET inte här: DocumentScaler CSS-transformerar hela A4:an, vilket
      gör pointer-koordinater opålitliga, och ett draghandtag i ~47 % skala
      är precis det träffyteproblem sheetMode finns för att lösa. */
  onItemMove?: (id: string, direction: 'up' | 'down') => void
  /** Tar bort en reservation ur offertens snapshot (×-knappen i
      villkorssektionen). Utelämnad → reservationerna renderas som ren text. */
  onReservationRemove?: (index: number) => void
  /** Cyklar radens ROT/RUT-badge: null → rot → rut → null. Grön teknik
      lämnas till radeditorn (listvyn) — badgen kan inte välja KATEGORI,
      men ett klick på en grön-taggad rad flyttar den medvetet ut ur grön
      teknik och in i cykeln (aldrig tyst). */
  onItemRotRutCycle?: (id: string) => void
  /** Endast 'option'-rader: hantverkarens "Förvald"-toggle. Sätter alltid
      BÅDA option_default och option_selected (samma regel som ItemRow). */
  onOptionDefaultToggle?: (id: string, checked: boolean) => void
  /** ETAPP 6c (offert-masterplan.md, faktura-sprinten): faktura-ENDAST
      fält — förfallodatum + referenser. Optional så offertens liveHandlers
      (som aldrig sätter dessa) förblir giltiga utan ändring. ISO-sträng
      (yyyy-mm-dd) från EditableDate, samma mönster som onValidUntilChange
      men UTAN dagar-omräkning (fakturans state äger redan ett absolut
      due_date, till skillnad från offertens "giltig i N dagar"). */
  onDueDateChange?: (v: string) => void
  onOurReferenceChange?: (v: string) => void
  onYourReferenceChange?: (v: string) => void
}

/**
 * ETAPP 3 (offert-masterplan.md): mobilens radredigering. I A4-skala blir
 * EditableText/EditableNumber-fälten för små för touch (dagens 30px-inputs
 * var precis det kartläggningen flaggade) — sheetMode stänger AV inline-
 * redigeringen av radens värdefält (namn/antal/enhet/à-pris/ROT-cykel/
 * Förvald-toggle visas som ren text) och gör HELA raden tappbar istället.
 * `onRowTap` är en separat prop (inte en del av QuoteDocumentHandlers) för
 * att handlers-typen ska förbli en ren datamutations-kontrakt — detta är en
 * UI-navigeringsangelägenhet (öppna bottom-sheet), inte en datamutation.
 * Ta bort-knappen (DeleteButton) fungerar oförändrat i båda lägena.
 */
export interface QuoteDocumentMobileProps {
  sheetMode?: boolean
  onRowTap?: (itemId: string) => void
}
