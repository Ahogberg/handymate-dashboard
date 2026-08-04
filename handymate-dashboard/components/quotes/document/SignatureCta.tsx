/** @jsxImportSource react */
import type { QuoteDocumentMode } from './types'

/**
 * Signatur-CTA-sektionen (ETAPP 2a, offert-masterplan.md, punkt 5) — struktur
 * på plats för E4/E5, men PDF/kundvyn förblir OFÖRÄNDRAD idag eftersom
 * buildQuoteTemplateData explicit sätter signatureCta: 'hidden' tills E5
 * kopplar på kundvyn. Designen är medvetet enkel ("en rundad ruta räcker") —
 * Claude Design polerar per handoff-planen.
 */
interface SignatureCtaProps {
  mode: QuoteDocumentMode
  /** Redan resolvad (data.signatureCta ?? isSigned-baserad default) — se
      QuoteDocument.tsx. 'hidden' renderar ingenting i static-läge. */
  cta: 'active' | 'signed' | 'hidden'
  isSigned: boolean
  signedDate?: string | null
}

export function SignatureCta({ mode, cta, isSigned, signedDate }: SignatureCtaProps) {
  if (mode === 'static') {
    if (cta === 'hidden') return null
    if (cta === 'signed') {
      return (
        <div className="signature-cta signed">
          <div className="sig-title">Signerad{signedDate ? ` ${signedDate}` : ''}</div>
          <div className="sig-sub">Offerten är godkänd och signerad.</div>
        </div>
      )
    }
    // ETAPP 5 (offert-masterplan.md), punkt 2: i kundläget är denna yta en
    // ankarpunkt — ett klick scrollar ner till det RIKTIGA signaturkortet
    // (canvas + namn + villkor) längre ner på sidan (id="signature-card",
    // se app/quote/[token]/page.tsx). Vanlig <a href="#…">-navigering är
    // medvetet valt framför en onClick-handler: fungerar identiskt oavsett
    // om komponenten körs client-side (interaktiv) eller genom
    // renderToStaticMarkup (PDF/mall-HTML, där cta ändå alltid är 'hidden'
    // — se buildQuoteTemplateData — så länken där aldrig renderas i praktiken).
    return (
      <a href="#signature-card" className="signature-cta signature-cta--link">
        <div className="sig-title">Godkänn offerten digitalt</div>
        <div className="sig-sub">Signera direkt i webbläsaren — inga utskrifter behövs.</div>
      </a>
    )
  }

  // Edit-läge: ALLTID synlig (oavsett cta-värdet) men dämpad — hantverkaren
  // ska se att sektionen finns och veta att den syns för kunden. Variant
  // speglar dokumentets faktiska isSigned-status.
  const editVariant: 'active' | 'signed' = isSigned ? 'signed' : 'active'
  return (
    <div className={`signature-cta edit-dimmed${editVariant === 'signed' ? ' signed' : ''}`}>
      <div className="sig-title">
        {editVariant === 'signed' ? `Signerad${signedDate ? ` ${signedDate}` : ''}` : 'Godkänn offerten digitalt'}
      </div>
      <div className="sig-sub">
        {editVariant === 'signed'
          ? 'Offerten är godkänd och signerad.'
          : 'Signera direkt i webbläsaren — inga utskrifter behövs.'}
      </div>
      <div className="sig-edit-note">Syns för kunden</div>
    </div>
  )
}
