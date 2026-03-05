export interface ColumnMapping {
  name: number | null
  phone_number: number | null
  email: number | null
  address: number | null
}

export interface ParsedCustomerRow {
  name: string
  phone_number: string
  email: string
  address: string
  raw: string[]
}

/**
 * Parse CSV text into headers and rows.
 * Handles comma, semicolon, and tab delimiters + quoted fields.
 */
export function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter(line => line.trim())
  if (lines.length === 0) return { headers: [], rows: [] }

  // Detect delimiter
  const firstLine = lines[0]
  let delimiter = ','
  if (firstLine.includes(';') && !firstLine.includes(',')) delimiter = ';'
  if (firstLine.includes('\t') && !firstLine.includes(',') && !firstLine.includes(';')) delimiter = '\t'

  const parseRow = (line: string): string[] => {
    const result: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = parseRow(lines[0])
  const rows = lines.slice(1).map(parseRow).filter(row => row.some(cell => cell))

  return { headers, rows }
}

/**
 * Auto-detect column mapping from headers (Swedish & English)
 */
export function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = { name: null, phone_number: null, email: null, address: null }

  headers.forEach((header, index) => {
    const h = header.toLowerCase()
    if (h.includes('namn') || h.includes('name') || h.includes('kund')) {
      if (mapping.name === null) mapping.name = index
    }
    if (h.includes('telefon') || h.includes('phone') || h.includes('mobil') || h.includes('tel')) {
      if (mapping.phone_number === null) mapping.phone_number = index
    }
    if (h.includes('mail') || h.includes('e-post') || h.includes('epost')) {
      if (mapping.email === null) mapping.email = index
    }
    if (h.includes('adress') || h.includes('address') || h.includes('gata') || h.includes('street')) {
      if (mapping.address === null) mapping.address = index
    }
  })

  return mapping
}

/**
 * Format Swedish phone number to +46 format
 */
export function formatSwedishPhone(phone: string): string {
  let cleaned = phone.replace(/[^\d+]/g, '')
  if (cleaned.startsWith('0')) cleaned = '+46' + cleaned.slice(1)
  if (!cleaned.startsWith('+')) cleaned = '+46' + cleaned
  return cleaned
}

/**
 * Validate Swedish phone number
 */
export function validateSwedishPhone(phone: string): boolean {
  const formatted = formatSwedishPhone(phone)
  return /^\+46\d{7,10}$/.test(formatted)
}

/**
 * Prepare parsed rows from CSV data using a column mapping
 */
export function prepareCustomerRows(
  rows: string[][],
  mapping: ColumnMapping
): ParsedCustomerRow[] {
  if (mapping.phone_number === null && mapping.name === null) return []

  return rows
    .map(row => ({
      name: mapping.name !== null ? row[mapping.name] || '' : '',
      phone_number: mapping.phone_number !== null ? formatSwedishPhone(row[mapping.phone_number] || '') : '',
      email: mapping.email !== null ? row[mapping.email] || '' : '',
      address: mapping.address !== null ? row[mapping.address] || '' : '',
      raw: row,
    }))
    .filter(row => row.name || (row.phone_number && validateSwedishPhone(row.phone_number)))
}
