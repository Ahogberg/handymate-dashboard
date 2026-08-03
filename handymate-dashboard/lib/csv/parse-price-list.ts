/**
 * Ren CSV-parsning för prislist-import (P2, UX-revision 2026-08-03).
 *
 * Samma grundlogik (delimiter-detektion, header/rad-split, citattecken-
 * strippning, kolumn-auto-detektion) som den befintliga, fungerande
 * importflödet i app/dashboard/settings/pricelist/page.tsx (parseCSV,
 * rad ~304-346) — men extraherad hit som ren, testbar logik och generaliserad
 * för produktbankens fyra kolumner (namn/enhet/pris/kategori) istället för
 * grossist-prislistans (namn/sku/kategori/inköpspris).
 *
 * Används av app/dashboard/settings/products/page.tsx (CSV-import-knappen i
 * tomt-läget). pricelist/page.tsx rörs INTE — dess importflöde (leverantörer,
 * suppliers/products) är en separat, redan fungerande feature och byts inte
 * ut här för att undvika regression på en oberoende yta.
 */

export interface ParsedCsv {
  headers: string[]
  rows: Record<string, string>[]
}

/** ';' om filen innehåller det (vanligt i svenska Excel-exporter), annars ','. */
export function detectDelimiter(text: string): string {
  return text.includes(';') ? ';' : ','
}

/**
 * Delar upp rå CSV-text i headers + rader. Tomma rader hoppas över.
 * Citattecken runt fält strippas (naivt — klarar inte kommatecken/semikolon
 * INUTI citerade fält, samma begränsning som förlagan i pricelist/page.tsx).
 */
export function parseCsvText(text: string): ParsedCsv {
  const lines = text.split('\n').filter(line => line.trim())
  if (lines.length < 2) {
    return { headers: [], rows: [] }
  }

  const delimiter = detectDelimiter(text)
  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/"/g, ''))

  const rows = lines.slice(1).map(line => {
    const values = line.split(delimiter).map(v => v.trim().replace(/"/g, ''))
    const row: Record<string, string> = {}
    headers.forEach((h, i) => {
      row[h] = values[i] || ''
    })
    return row
  })

  return { headers, rows }
}

export interface PriceListColumnMapping {
  name?: string
  unit?: string
  price?: string
  category?: string
}

/**
 * Auto-gissar vilken CSV-kolumn som motsvarar namn/enhet/pris/kategori,
 * baserat på vanliga svenska/engelska rubriker. Första träffen vinner —
 * samma "först hittad kolumn"-princip som förlagan.
 */
export function autoDetectPriceListColumns(headers: string[]): PriceListColumnMapping {
  const lower = headers.map(h => h.toLowerCase())
  const find = (predicate: (h: string) => boolean) => {
    const idx = lower.findIndex(predicate)
    return idx === -1 ? undefined : headers[idx]
  }

  return {
    name: find(h => h.includes('namn') || h.includes('name') || h.includes('produkt') || h.includes('artikel')),
    unit: find(h => h.includes('enhet') || h.includes('unit') || h === 'e'),
    price: find(h => h.includes('pris') || h.includes('price') || h.includes('sälj') || h.includes('salj')),
    category: find(h => h.includes('kategori') || h.includes('category')),
  }
}

export interface PriceListRow {
  name: string
  unit: string
  sales_price: number
  category?: string
}

export interface PriceListRowError {
  rowIndex: number
  message: string
}

/**
 * Mappar råa CSV-rader (Record<kolumn, värde>) till produktbanks-rader enligt
 * kolumn-mappningen. `unit` default 'st' om ej mappad/tom. Rader utan namn
 * eller med ett icke-tolkningsbart pris räknas som fel (rapporteras, hoppas
 * över) — hellre en tydlig felrad än en tyst 0-krad produkt.
 */
export function mapCsvRowsToPriceList(
  rows: Record<string, string>[],
  mapping: PriceListColumnMapping,
): { valid: PriceListRow[]; errors: PriceListRowError[] } {
  const valid: PriceListRow[] = []
  const errors: PriceListRowError[] = []

  rows.forEach((row, idx) => {
    const name = (mapping.name ? row[mapping.name] : '').trim()
    if (!name) {
      errors.push({ rowIndex: idx, message: `Rad ${idx + 2}: namn saknas` })
      return
    }

    const rawPrice = (mapping.price ? row[mapping.price] : '').trim()
    // Svenska tal-format ("1 234,50") — mellanslag bort, komma → punkt.
    const normalizedPrice = rawPrice.replace(/\s/g, '').replace(',', '.')
    const price = normalizedPrice === '' ? 0 : Number(normalizedPrice)
    if (rawPrice !== '' && !Number.isFinite(price)) {
      errors.push({ rowIndex: idx, message: `Rad ${idx + 2}: ogiltigt pris "${rawPrice}"` })
      return
    }

    const unit = (mapping.unit ? row[mapping.unit] : '').trim() || 'st'
    const category = mapping.category ? row[mapping.category]?.trim() || undefined : undefined

    valid.push({ name, unit, sales_price: price, category })
  })

  return { valid, errors }
}
