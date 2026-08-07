/**
 * Organisationsnummer — validering och tolkning (2026-08-07).
 *
 * ═══ VARFÖR DEN BEHÖVS ═══
 *
 * Onboardingen har hittills bara kontrollerat att fältet är elva tecken långt
 * (`Step2Business.tsx`, `data.orgNumber?.length === 11`). Ett feltryck i en
 * siffra passerar alltså rakt igenom — och organisationsnumret är det som ska
 * slå upp företaget hos Bolagsverket och som står på varje faktura.
 *
 * Kodbasen har redan Luhn (`lib/rot-rut.ts:101`, `lib/ocr.ts:8`), men den har
 * aldrig använts på org.nr.
 *
 * ═══ BOLAGSFORMEN LIGGER I NUMRET ═══
 *
 * Den tredje siffran anger juridisk form. Det betyder att onboardingen inte
 * behöver fråga om bolagsform — den kan läsas ur numret som redan är ifyllt,
 * vilket är en fråga mindre i det steg som redan har elva obligatoriska fält.
 *
 * Rena funktioner — tests/karin-org-number.spec.ts.
 */

/** Bara siffror, oavsett hur användaren skrivit numret. */
export function normalizeOrgNumber(input: string | null | undefined): string {
  return (input || '').replace(/\D/g, '')
}

/** `556677-8899` — formen som står på fakturor. */
export function formatOrgNumber(input: string | null | undefined): string {
  const d = normalizeOrgNumber(input)
  // Tolv siffror = med sekelprefix (16…). Prefixet visas aldrig.
  const tio = d.length === 12 ? d.slice(2) : d
  if (tio.length !== 10) return input || ''
  return `${tio.slice(0, 6)}-${tio.slice(6)}`
}

/**
 * Luhn/mod-10 över de tio siffrorna.
 *
 * Samma algoritm som `validatePersonnummer`, men medvetet en egen funktion:
 * ett organisationsnummer har andra giltighetsregler för själva siffrorna
 * (månadsdelen är +20, se `orgNumberCompanyForm`), och att låna
 * personnummervalideringen hade dolt det.
 */
export function isValidOrgNumber(input: string | null | undefined): boolean {
  const d = normalizeOrgNumber(input)
  const tio = d.length === 12 ? d.slice(2) : d
  if (!/^\d{10}$/.test(tio)) return false

  let summa = 0
  for (let i = 0; i < 10; i++) {
    let n = Number(tio[i])
    if (i % 2 === 0) {
      n *= 2
      if (n > 9) n -= 9
    }
    summa += n
  }
  return summa % 10 === 0
}

/**
 * Juridisk form ur FÖRSTA siffran (SCB:s gruppindelning).
 *
 * Ett klassiskt aktiebolagsnummer börjar på 55 — det är förstasiffran som
 * bär formen, inte den tredje.
 *
 * Den TREDJE siffran har en annan roll: i ett riktigt organisationsnummer är
 * den alltid minst 2, just för att numret inte ska kunna förväxlas med ett
 * personnummer (där siffra 3–4 är en månad, alltså högst 12). En enskild
 * firma har inget eget organisationsnummer utan använder innehavarens
 * personnummer, och känns igen på precis det.
 *
 * Returnerar `null` när siffran inte motsvarar en känd form — då frågar vi
 * hellre än gissar.
 */
export function orgNumberCompanyForm(input: string | null | undefined): string | null {
  const d = normalizeOrgNumber(input)
  const tio = d.length === 12 ? d.slice(2) : d
  if (!/^\d{10}$/.test(tio)) return null

  // Tredje siffran under 2 → personnummer, alltså enskild firma.
  if (Number(tio[2]) < 2) return 'ef'

  switch (Number(tio[0])) {
    case 2: return 'annat'                 // Stat, landsting, kommun, församling
    case 5: return 'ab'                    // Aktiebolag
    case 6: return 'annat'                 // Enkelt bolag
    case 7: return 'ekonomisk_forening'    // Ekonomiska föreningar, bostadsrättsföreningar
    case 8: return 'annat'                 // Ideella föreningar och stiftelser
    case 9: return 'hb'                    // Handelsbolag och kommanditbolag
    default: return null
  }
}

export interface OrgNumberCheck {
  valid: boolean
  formatted: string
  /** Härledd bolagsform, eller null när siffran inte säger något säkert. */
  companyForm: string | null
  /** Svensk förklaring när numret inte duger. Tom sträng när det gör det. */
  error: string
}

/** Allt på en gång — det gränssnittet behöver för att svara användaren. */
export function checkOrgNumber(input: string | null | undefined): OrgNumberCheck {
  const d = normalizeOrgNumber(input)
  const tio = d.length === 12 ? d.slice(2) : d

  if (!d) {
    return { valid: false, formatted: '', companyForm: null, error: 'Fyll i organisationsnummer.' }
  }
  if (tio.length !== 10) {
    return {
      valid: false,
      formatted: input || '',
      companyForm: null,
      error: 'Ett organisationsnummer har tio siffror, till exempel 556677-8899.',
    }
  }
  if (!isValidOrgNumber(d)) {
    return {
      valid: false,
      formatted: formatOrgNumber(d),
      companyForm: null,
      // Säg VAD som är fel, inte bara att något är det — kontrollsiffran gör
      // att ett feltryck går att upptäcka, och det är värt att berätta.
      error: 'Kontrollsiffran stämmer inte. Kolla att alla siffror blev rätt.',
    }
  }
  return {
    valid: true,
    formatted: formatOrgNumber(d),
    companyForm: orgNumberCompanyForm(d),
    error: '',
  }
}
