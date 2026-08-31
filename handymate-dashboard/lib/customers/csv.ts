/** CSV only: preserve quoted separators/newlines and escaped quotes. No guessing of customer fields. */
export function parseCustomerCsv(input: string): { headers: string[]; rows: string[][] } {
  const text = input.replace(/^\uFEFF/, '').replace(/^(?:[ \t]*(?:\r\n|\n|\r))+/, '')
  // Count separators outside quotes in the first record, not in a quoted name/address.
  const separators: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      if (quoted && text[i + 1] === '"') i++
      else quoted = !quoted
    } else if (!quoted) {
      if (c === '\n' || c === '\r') break
      if (c in separators) separators[c]++
    }
  }
  const delimiter = Object.keys(separators).sort((a, b) => separators[b] - separators[a])[0]
  const records: string[][] = []
  let row: string[] = []
  let cell = ''
  let closedQuote = false
  quoted = false
  const finishCell = () => { row.push(cell.trim()); cell = ''; closedQuote = false }
  const finishRow = () => {
    finishCell()
    if (row.some(value => value !== '')) records.push(row)
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ }
        else { quoted = false; closedQuote = true }
      } else cell += c
    } else if (c === delimiter) finishCell()
    else if (c === '\n' || c === '\r') {
      finishRow()
      if (c === '\r' && text[i + 1] === '\n') i++
    } else if (c === '"') {
      if (cell.trim() !== '' || closedQuote) throw new Error('CSV-filen har felplacerade citattecken. Kontrollera exporten.')
      cell = ''
      quoted = true
    } else {
      if (closedQuote && c.trim() !== '') throw new Error('CSV-filen har text efter ett avslutande citattecken. Kontrollera exporten.')
      cell += c
    }
  }
  if (quoted) throw new Error('CSV-filen har ett oavslutat citattecken. Ingen import har startats.')
  finishRow()
  if (!records.length) return { headers: [], rows: [] }
  const [headers, ...rows] = records
  const mismatch = rows.findIndex(record => record.length !== headers.length)
  if (mismatch >= 0) throw new Error(`CSV-post ${mismatch + 2} har fel antal kolumner. Kontrollera exporten innan import.`)
  return { headers, rows }
}

/** Onboarding auto-mapping. With headers, an absent field stays absent. */
export function parseCsvCustomers(text: string): Array<{ name: string; phone_number: string; email: string; address: string }> {
  const { headers, rows } = parseCustomerCsv(text)
  if (headers.length === 0) return []
  const header = headers.map(h => h.toLowerCase())
  const findCol = (keys: string[]) => header.findIndex(h => keys.some(k => h.includes(k)))
  const nameIdx = findCol(['namn', 'name', 'kund', 'företag', 'foretag'])
  const phoneIdx = findCol(['telefon', 'phone', 'mobil', 'tel'])
  const emailIdx = findCol(['e-post', 'epost', 'email', 'mail', 'e-mail'])
  const addrIdx = findCol(['adress', 'address', 'gata'])
  const hasHeader = nameIdx >= 0 || phoneIdx >= 0 || emailIdx >= 0 || addrIdx >= 0
  return (hasHeader ? rows : [headers, ...rows]).map(cols => ({
    name: nameIdx >= 0 ? cols[nameIdx] : hasHeader ? '' : cols[0] ?? '',
    phone_number: phoneIdx >= 0 ? cols[phoneIdx] : hasHeader ? '' : cols[1] ?? '',
    email: emailIdx >= 0 ? cols[emailIdx] : '',
    address: addrIdx >= 0 ? cols[addrIdx] : '',
  }))
}
