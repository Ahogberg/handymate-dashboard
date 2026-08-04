/**
 * Delade typer för dokumentmotorn (ETAPP 2a, offert-masterplan.md).
 * Egen fil (inte QuoteDocument.tsx) så QuoteDocument.tsx och
 * QuoteDocumentRow.tsx/SignatureCta.tsx kan importera varandras typer utan
 * en cirkulär modulgraf.
 */

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

export interface QuoteDocumentHandlers {
  onTitleChange: (v: string) => void
  onDescriptionChange: (v: string) => void
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
  onItemChange: (id: string, patch: QuoteItemPatch) => void
  /** Lägger till en ny tom 'item'-rad sist — samma beteende som dagens
      "+ Lägg till rad". Radtypsväljare (rubrik/text/etc) ägs av "Mer"-
      verktygsraden (E2b), inte av canvasen. */
  onItemAdd: () => void
  onItemRemove: (id: string) => void
  /** Cyklar radens ROT/RUT-badge: null → rot → rut → null. Grön teknik
      lämnas till radeditorn (listvyn) — badgen kan inte välja KATEGORI,
      men ett klick på en grön-taggad rad flyttar den medvetet ut ur grön
      teknik och in i cykeln (aldrig tyst). */
  onItemRotRutCycle: (id: string) => void
  /** Endast 'option'-rader: hantverkarens "Förvald"-toggle. Sätter alltid
      BÅDA option_default och option_selected (samma regel som ItemRow). */
  onOptionDefaultToggle: (id: string, checked: boolean) => void
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
