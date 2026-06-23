/**
 * Skatteverket ROT/RUT — beslutsfil (JSON, UTF-8).
 *
 * Byggd mot Skatteverkets riktiga exempel-beslutsfil:
 *   { version, utforare, beslut: [ { namn, referensnummer,
 *       arenden: [ { personnummer, fakturanummer?, godkantBelopp } ] } ] }
 * godkantBelopp = beviljat belopp i HELA KRONOR. 0 = avslaget.
 * Matchning mot vår faktura sker primärt på fakturanummer, annars personnummer.
 */

export interface DecisionArende {
  personnummer: string
  fakturanummer?: string
  /** Beviljat belopp i kronor. 0 = avslaget. */
  godkantBelopp: number
}

export interface DecisionBeslut {
  namn?: string
  referensnummer?: string
  arenden: DecisionArende[]
}

export interface ParsedDecisionFile {
  version?: string
  utforare?: string
  beslut: DecisionBeslut[]
}

export function parseDecisionFile(jsonText: string): ParsedDecisionFile {
  let raw: any
  try {
    // Strippa ev. UTF-8 BOM.
    raw = JSON.parse(jsonText.replace(/^﻿/, ''))
  } catch {
    throw new Error('Filen är inte giltig JSON (förväntar Skatteverkets beslutsfil).')
  }
  if (!raw || !Array.isArray(raw.beslut)) {
    throw new Error('Okänt filformat — saknar "beslut"-listan. Är det rätt beslutsfil från Skatteverket?')
  }

  const beslut: DecisionBeslut[] = raw.beslut.map((b: any) => ({
    namn: typeof b?.namn === 'string' ? b.namn : undefined,
    referensnummer: typeof b?.referensnummer === 'string' ? b.referensnummer : undefined,
    arenden: Array.isArray(b?.arenden)
      ? b.arenden
          .filter((a: any) => a && (a.personnummer || a.fakturanummer))
          .map((a: any) => ({
            personnummer: String(a.personnummer || '').replace(/\D/g, ''),
            fakturanummer: a.fakturanummer != null ? String(a.fakturanummer) : undefined,
            godkantBelopp: Math.round(Number(a.godkantBelopp) || 0),
          }))
      : [],
  }))

  return {
    version: raw.version != null ? String(raw.version) : undefined,
    utforare: raw.utforare != null ? String(raw.utforare) : undefined,
    beslut,
  }
}

/** Alla ärenden plattade från alla beslut i filen. */
export function flattenDecisionArenden(parsed: ParsedDecisionFile): DecisionArende[] {
  return parsed.beslut.flatMap(b => b.arenden)
}
