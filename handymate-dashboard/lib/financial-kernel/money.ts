/** C1: exact money mechanisms. No accounting policy or production callers. */
const MINOR_DIGITS = { SEK: 2, EUR: 2, NOK: 2, DKK: 2 } as const
export type CurrencyCode = keyof typeof MINOR_DIGITS
export interface Money { readonly amountMinor: bigint; readonly currency: CurrencyCode }
/** DOWN = toward zero; UP = away from zero. HALF_UP ties go away from zero. */
export type RoundingMode = 'HALF_UP' | 'HALF_EVEN' | 'DOWN' | 'UP'

const ZERO = BigInt(0), ONE = BigInt(1), TWO = BigInt(2), TEN = BigInt(10)

function digits(currency: CurrencyCode): number {
  if (typeof currency !== 'string' || !Object.prototype.hasOwnProperty.call(MINOR_DIGITS, currency)) {
    throw new TypeError('Unsupported currency')
  }
  return MINOR_DIGITS[currency]
}
// Avoid bigint exponent syntax: the existing app tsconfig has no modern target.
function powerOfTen(exponent: bigint): bigint {
  let value = ONE
  for (let remaining = exponent; remaining > ZERO; remaining -= ONE) value *= TEN
  return value
}
function scale(currency: CurrencyCode): bigint { return powerOfTen(BigInt(digits(currency))) }
function validate(m: Money): void {
  if (!m || typeof m.amountMinor !== 'bigint') throw new TypeError('Expected Money with bigint minor units')
  digits(m.currency)
}
function sameCurrency(a: Money, b: Money): void {
  validate(a); validate(b)
  if (a.currency !== b.currency) throw new TypeError('Currency mismatch')
}
function roundingMode(mode: RoundingMode): void {
  if (!['HALF_UP', 'HALF_EVEN', 'DOWN', 'UP'].includes(mode)) throw new TypeError('Explicit rounding mode required')
}

/** Exact minor-unit construction; a number must already be a safe integer. */
export function money(amountMinor: bigint | number, currency: CurrencyCode): Money {
  digits(currency)
  if (typeof amountMinor !== 'bigint' && (typeof amountMinor !== 'number' || !Number.isSafeInteger(amountMinor))) {
    throw new TypeError('Minor units must be bigint or a safe integer')
  }
  const value: Money = { amountMinor: BigInt(amountMinor), currency }
  // Local, non-enumerable serialization hook: no global BigInt mutation.
  Object.defineProperty(value, 'toJSON', { value: () => toJSON(value) })
  return Object.freeze(value)
}

/** Plain signed decimal only; redundant fractional zeroes are exact, not rounding. */
export function fromDecimalString(s: string, currency: CurrencyCode): Money {
  const precision = digits(currency)
  if (typeof s !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(s)) throw new TypeError('Expected a plain decimal string')
  const negative = s.startsWith('-')
  const [whole, fraction = ''] = (negative ? s.slice(1) : s).split('.')
  if (/[1-9]/.test(fraction.slice(precision))) throw new RangeError('Too many currency decimals')
  const amount = BigInt(whole) * scale(currency) + BigInt(fraction.slice(0, precision).padEnd(precision, '0') || '0')
  return money(negative ? -amount : amount, currency)
}

export function toDecimalString(m: Money): string {
  validate(m)
  const precision = digits(m.currency), unit = scale(m.currency)
  const magnitude = m.amountMinor < ZERO ? -m.amountMinor : m.amountMinor
  const fraction = precision === 0 ? '' : '.' + (magnitude % unit).toString().padStart(precision, '0')
  return (m.amountMinor < ZERO ? '-' : '') + (magnitude / unit).toString() + fraction
}

function roundedQuotient(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  roundingMode(mode)
  if (typeof numerator !== 'bigint' || typeof denominator !== 'bigint') throw new TypeError('Ratio must use bigint')
  if (denominator === ZERO) throw new RangeError('Zero denominator')
  const negative = (numerator < ZERO) !== (denominator < ZERO)
  const n = numerator < ZERO ? -numerator : numerator
  const d = denominator < ZERO ? -denominator : denominator
  let quotient = n / d
  const remainder = n % d
  const increment = remainder !== ZERO && (
    mode === 'UP' ||
    (mode === 'HALF_UP' && remainder * TWO >= d) ||
    (mode === 'HALF_EVEN' && (remainder * TWO > d || (remainder * TWO === d && quotient % TWO !== ZERO)))
  )
  if (increment) quotient += ONE
  return negative ? -quotient : quotient
}

/**
 * The only float input boundary, for legacy number kr columns. Interpret the
 * finite number's shortest decimal string (including exponent notation), then
 * round an exact integer ratio. Precision lost before this call is unrecoverable.
 */
export function fromLegacyNumber(n: number, currency: CurrencyCode, rounding: RoundingMode): Money {
  digits(currency); roundingMode(rounding)
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new TypeError('Expected finite legacy amount')
  const [mantissa, exponent = '0'] = n.toString().split('e')
  const [whole, fraction = ''] = mantissa.split('.')
  const coefficient = BigInt(whole + fraction)
  const power = BigInt(exponent) - BigInt(fraction.length) + BigInt(digits(currency))
  const numerator = power >= ZERO ? coefficient * powerOfTen(power) : coefficient
  const denominator = power >= ZERO ? ONE : powerOfTen(-power)
  return money(roundedQuotient(numerator, denominator, rounding), currency)
}

/** Lossy-by-design legacy projection boundary; never feed back into canonical math. */
export function toLegacyNumber(m: Money): number {
  const result = Number(toDecimalString(m))
  if (!Number.isFinite(result)) throw new RangeError('Amount exceeds finite legacy number range')
  return result
}

export function add(a: Money, b: Money): Money {
  sameCurrency(a, b); return money(a.amountMinor + b.amountMinor, a.currency)
}
export function subtract(a: Money, b: Money): Money {
  sameCurrency(a, b); return money(a.amountMinor - b.amountMinor, a.currency)
}
export function negate(m: Money): Money { validate(m); return money(-m.amountMinor, m.currency) }
export function sum(ms: Money[], currency: CurrencyCode): Money {
  return ms.reduce((total, m) => add(total, m), money(ZERO, currency))
}
export function multiply(m: Money, ratio: { numerator: bigint; denominator: bigint }, rounding: RoundingMode): Money {
  validate(m)
  if (!ratio || typeof ratio.numerator !== 'bigint' || typeof ratio.denominator !== 'bigint') throw new TypeError('Ratio must use bigint')
  return money(roundedQuotient(m.amountMinor * ratio.numerator, ratio.denominator, rounding), m.currency)
}

/**
 * Largest remainder on the magnitude, restoring the sign for credit notes.
 * Equal remainders favour earlier indices; zero weights never receive a unit.
 * Empty, all-zero or negative weights are invalid, even for a zero amount.
 */
export function allocate(m: Money, weights: bigint[]): Money[] {
  validate(m)
  if (!Array.isArray(weights) || weights.length === 0) throw new RangeError('Allocation needs weights')
  let total = ZERO
  for (const weight of weights) {
    if (typeof weight !== 'bigint' || weight < ZERO) throw new RangeError('Weights must be nonnegative bigint')
    total += weight
  }
  if (total === ZERO) throw new RangeError('Allocation needs a positive weight')
  const magnitude = m.amountMinor < ZERO ? -m.amountMinor : m.amountMinor
  const shares = weights.map((weight, index) => ({ index, amount: magnitude * weight / total, remainder: magnitude * weight % total }))
  let leftover = magnitude - shares.reduce((acc, share) => acc + share.amount, ZERO)
  const ranked = [...shares].sort((a, b) => a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1)
  for (const share of ranked) {
    if (leftover === ZERO) break
    share.amount += ONE
    leftover -= ONE
  }
  return shares.map(share => money(m.amountMinor < ZERO ? -share.amount : share.amount, m.currency))
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  sameCurrency(a, b)
  return a.amountMinor === b.amountMinor ? 0 : a.amountMinor < b.amountMinor ? -1 : 1
}
export function equals(a: Money, b: Money): boolean { return compare(a, b) === 0 }
export function isZero(m: Money): boolean { validate(m); return m.amountMinor === ZERO }
export function isNegative(m: Money): boolean { validate(m); return m.amountMinor < ZERO }
export function toJSON(m: Money): { amount: string; currency: CurrencyCode } {
  return { amount: toDecimalString(m), currency: m.currency }
}
export function fromJSON(v: unknown): Money {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new TypeError('Expected Money JSON object')
  const keys = Reflect.ownKeys(v)
  if (keys.length !== 2 || !keys.includes('amount') || !keys.includes('currency')) throw new TypeError('Expected amount and currency only')
  const value = v as { amount: unknown; currency: unknown }
  if (typeof value.amount !== 'string' || typeof value.currency !== 'string') throw new TypeError('Expected string amount and currency')
  return fromDecimalString(value.amount, value.currency as CurrencyCode)
}
