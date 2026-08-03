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
