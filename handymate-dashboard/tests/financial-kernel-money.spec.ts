import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  money, fromDecimalString, toDecimalString, fromLegacyNumber, toLegacyNumber,
  add, subtract, negate, sum, multiply, allocate, compare, equals, isZero, isNegative,
  toJSON, fromJSON, type Money, type CurrencyCode, type RoundingMode,
} from '../lib/financial-kernel/money'

const b = BigInt
const sek = (s: string) => fromDecimalString(s, 'SEK')

// Compiled by tsc, never executed. Rounding and currency cannot be omitted.
function typeContract(m: Money) {
  // @ts-expect-error explicit rounding required
  multiply(m, { numerator: b(1), denominator: b(2) })
  // @ts-expect-error explicit legacy rounding required
  fromLegacyNumber(1.5, 'SEK')
  // @ts-expect-error currency required
  money(b(1))
  // @ts-expect-error unsupported currency
  money(b(1), 'USD')
  // @ts-expect-error immutable amount
  m.amountMinor = b(2)
}
void typeContract

test('1: decimal addition is exact', () => {
  expect(equals(add(sek('0.10'), sek('0.20')), sek('0.30'))).toBe(true)
  expect(toDecimalString(subtract(sek('0.30'), sek('0.10')))).toBe('0.20')
})

test('2: seeded allocations conserve every minor unit and bound each share exactly', () => {
  let seed = b(81723)
  const next = () => { seed = (seed * b(48271)) % b(2147483647); return seed }
  for (let i = 0; i < 600; i++) {
    const amount = (next() - b(1073741824)) * b('999999999999999')
    const weights = [next() % b(17), b(0), next() % b(113), next() + b(1)]
    const total = weights.reduce((a, w) => a + w, b(0))
    const parts = allocate(money(amount, 'SEK'), weights)
    expect(sum(parts, 'SEK').amountMinor).toBe(amount)
    parts.forEach((part, j) => {
      const delta = part.amountMinor * total - amount * weights[j]
      expect(delta < total && delta > -total).toBe(true)
    })
    expect(parts[1].amountMinor).toBe(b(0))
  }
  expect(allocate(money(2, 'SEK'), [b(1), b(1), b(1)]).map(m => m.amountMinor)).toEqual([b(1), b(1), b(0)])
  expect(allocate(money(-2, 'SEK'), [b(1), b(1), b(1)]).map(m => m.amountMinor)).toEqual([b(-1), b(-1), b(0)])
})

test('3: all rounding modes handle positive and negative ties and non-ties', () => {
  const cases: [number, number, number, number, number][] = [
    [25, 3, 2, 2, 3], [-25, -3, -2, -2, -3],
    [35, 4, 4, 3, 4], [-35, -4, -4, -3, -4],
    [21, 2, 2, 2, 3], [-21, -2, -2, -2, -3],
    [29, 3, 3, 2, 3], [-29, -3, -3, -2, -3],
    [20, 2, 2, 2, 2], [0, 0, 0, 0, 0],
  ]
  const modes: RoundingMode[] = ['HALF_UP', 'HALF_EVEN', 'DOWN', 'UP']
  for (const [input, ...expected] of cases) {
    modes.forEach((mode, i) => expect(multiply(money(input, 'SEK'), {
      numerator: b(1), denominator: b(10),
    }, mode).amountMinor).toBe(b(expected[i])))
  }
  expect(multiply(sek('1.00'), { numerator: b(-1), denominator: b(-2) }, 'UP')).toEqual(sek('0.50'))
  expect(multiply(sek('1.00'), { numerator: b(1), denominator: b(-2) }, 'UP')).toEqual(sek('-0.50'))
})

test('4: every binary operation rejects currency mismatch, including equals and sum', () => {
  const a = sek('1'), foreign = fromDecimalString('1', 'EUR')
  for (const op of [add, subtract, compare, equals]) expect(() => op(a, foreign)).toThrow()
  expect(() => sum([a, foreign], 'SEK')).toThrow()
  expect(() => sum([foreign], 'SEK')).toThrow()
  expect(sum([], 'DKK')).toEqual(money(0, 'DKK'))
})

test('5: exact parsing permits redundant zeros but never rounds excess precision', () => {
  for (const [input, output] of [['125', '125.00'], ['-0.5', '-0.50'], ['1234.5600', '1234.56'], ['-0.000', '0.00']]) {
    expect(toDecimalString(sek(input))).toBe(output)
  }
  for (const input of ['1.005', '-1.001', '1.0001', '', ' 1', '1 ', '+1', '.5', '1.', '1e2', 'NaN', '1,00']) {
    expect(() => sek(input)).toThrow()
  }
})

test('6: JSON serialization round-trips signed arbitrary precision and nested values', () => {
  for (const currency of ['SEK', 'EUR', 'NOK', 'DKK'] as const) {
    for (const amount of [b(0), b(-1), b(1), b('999999999999999999999999999999999999'), b('-999999999999999999999999999999999999')]) {
      const m = money(amount, currency)
      expect(equals(fromJSON(toJSON(m)), m)).toBe(true)
      expect(equals(fromJSON(JSON.parse(JSON.stringify(m))), m)).toBe(true)
      expect(JSON.parse(JSON.stringify({ items: [m] })).items[0]).toEqual(toJSON(m))
    }
  }
  expect(toJSON(sek('-12.3'))).toEqual({ amount: '-12.30', currency: 'SEK' })
  expect(() => JSON.stringify(b(1))).toThrow() // no global BigInt prototype patch
})

test('7: legacy conversion rounds the shortest decimal representation, including exponents', () => {
  expect(fromLegacyNumber(1234.5600000001, 'SEK', 'HALF_UP')).toEqual(sek('1234.56'))
  expect(fromLegacyNumber(1.005, 'SEK', 'HALF_UP')).toEqual(sek('1.01'))
  expect(fromLegacyNumber(-1.005, 'SEK', 'HALF_UP')).toEqual(sek('-1.01'))
  expect(fromLegacyNumber(1.005, 'SEK', 'HALF_EVEN')).toEqual(sek('1.00'))
  expect(fromLegacyNumber(1e-7, 'SEK', 'UP')).toEqual(sek('0.01'))
  expect(fromLegacyNumber(-5e-324, 'SEK', 'DOWN')).toEqual(sek('0.00'))
  expect(fromLegacyNumber(1e21, 'SEK', 'HALF_UP')).toEqual(sek('1000000000000000000000'))
  expect(toLegacyNumber(sek('1234.56'))).toBe(1234.56)
  expect(() => toLegacyNumber(money(b('1' + '0'.repeat(400)), 'SEK'))).toThrow()
})

test('8: VAT ratios are exact mechanisms, including zero VAT and midpoint differences', () => {
  for (const mode of ['HALF_UP', 'HALF_EVEN'] as const) {
    expect(multiply(sek('99.99'), { numerator: b(25), denominator: b(100) }, mode)).toEqual(sek('25.00'))
    expect(multiply(sek('99.99'), { numerator: b(0), denominator: b(100) }, mode)).toEqual(sek('0'))
  }
  expect(multiply(sek('0.10'), { numerator: b(25), denominator: b(100) }, 'HALF_UP')).toEqual(sek('0.03'))
  expect(multiply(sek('0.10'), { numerator: b(25), denominator: b(100) }, 'HALF_EVEN')).toEqual(sek('0.02'))
})

test('9: ROT example conserves customer and tax-authority shares', () => {
  const total = sek('10000')
  const tax = multiply(total, { numerator: b(30), denominator: b(100) }, 'HALF_UP')
  const customer = subtract(total, tax)
  expect(tax).toEqual(sek('3000'))
  expect(customer).toEqual(sek('7000'))
  expect(allocate(total, [b(70), b(30)])).toEqual([customer, tax])
})

test('10: credit notes, ordering, sign and immutability', () => {
  const m = sek('-99999999999999999999.99')
  expect(equals(negate(negate(m)), m)).toBe(true)
  expect(isNegative(m)).toBe(true)
  expect(isZero(subtract(m, m))).toBe(true)
  expect(compare(m, sek('0'))).toBe(-1)
  expect(compare(negate(m), m)).toBe(1)
  expect(compare(m, m)).toBe(0)
  expect(Object.isFrozen(m)).toBe(true)
  expect(Object.keys(m)).toEqual(['amountMinor', 'currency'])
})

test('11: source has no tolerance or external dependency', () => {
  const source = readFileSync(join(__dirname, '../lib/financial-kernel/money.ts'), 'utf8')
  for (const forbidden of ['TOLERANCE', 'EPSILON', 'Math.abs(']) expect(source).not.toContain(forbidden)
  expect(source).not.toMatch(/\b(?:import|require)\s*[({]/)
})

test('runtime boundaries reject unsafe amounts, unsupported currencies and invalid JSON', () => {
  for (const n of [NaN, Infinity, -Infinity, 1.2, Number.MAX_SAFE_INTEGER + 1]) expect(() => money(n, 'SEK')).toThrow()
  for (const currency of ['USD', 'sek', '__proto__', 'toString', '', null, undefined]) {
    expect(() => money(1, currency as CurrencyCode)).toThrow()
  }
  for (const input of [null, [], '1', 1, {}, { amount: 1, currency: 'SEK' }, { amount: '1' },
    { amount: '1', currency: 'USD' }, { amount: '1.005', currency: 'SEK' },
    { amount: '1', currency: 'SEK', extra: true }, Object.create({ amount: '1', currency: 'SEK' })]) {
    expect(() => fromJSON(input)).toThrow()
  }
  for (const n of [NaN, Infinity, -Infinity]) expect(() => fromLegacyNumber(n, 'SEK', 'DOWN')).toThrow()
})

test('runtime ratio, rounding and allocation boundaries fail explicitly', () => {
  const m = sek('1')
  expect(() => multiply(m, { numerator: b(1), denominator: b(0) }, 'DOWN')).toThrow()
  for (const mode of [undefined, null, 'FLOOR']) {
    expect(() => multiply(m, { numerator: b(1), denominator: b(1) }, mode as RoundingMode)).toThrow()
    expect(() => fromLegacyNumber(1, 'SEK', mode as RoundingMode)).toThrow()
  }
  for (const weights of [[], [b(0)], [b(0), b(0)], [b(-1), b(2)]]) expect(() => allocate(m, weights)).toThrow()
  expect(allocate(sek('0'), [b(1), b(0)])).toEqual([sek('0'), sek('0')])
})
