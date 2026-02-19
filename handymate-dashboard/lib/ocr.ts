/**
 * OCR-nummer med Luhn mod 10 checksumma (svensk bankstandard)
 */
export function generateOCR(invoiceNumber: string): string {
  const digits = invoiceNumber.replace(/\D/g, '')
  if (!digits) return '0'

  // Luhn mod 10 checksumma
  let sum = 0
  let alternate = true // Börja med faktor 2 från höger
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i])
    if (alternate) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alternate = !alternate
  }
  const checkDigit = (10 - (sum % 10)) % 10
  return digits + checkDigit.toString()
}

export function validateOCR(ocr: string): boolean {
  const digits = ocr.replace(/\D/g, '')
  if (digits.length < 2) return false

  let sum = 0
  let alternate = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i])
    if (alternate) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alternate = !alternate
  }
  return sum % 10 === 0
}
