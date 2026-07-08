/**
 * Offert-identitet — "Vår referens" auto-ifyllnad (Commit 2, CAPTURE).
 * Ren funktion resolveReferencePerson: tom/whitespace payload → skaparen,
 * ifylld payload → behålls (trimmad), båda tomma → null.
 * Körs: npx playwright test tests/quote-created-by.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { resolveReferencePerson } from '../lib/quotes/resolve-reference-person'

test.describe('resolveReferencePerson', () => {
  test('tom sträng i payload → skaparens namn', () => {
    expect(resolveReferencePerson('', 'Anna Andersson')).toBe('Anna Andersson')
  })
  test('null payload → skaparens namn', () => {
    expect(resolveReferencePerson(null, 'Anna Andersson')).toBe('Anna Andersson')
  })
  test('undefined payload → skaparens namn', () => {
    expect(resolveReferencePerson(undefined, 'Anna Andersson')).toBe('Anna Andersson')
  })
  test('enbart whitespace i payload → skaparens namn', () => {
    expect(resolveReferencePerson('   ', 'Anna Andersson')).toBe('Anna Andersson')
  })
  test('ifylld payload → behålls (skaparen ignoreras)', () => {
    expect(resolveReferencePerson('Bengt B', 'Anna Andersson')).toBe('Bengt B')
  })
  test('ifylld payload trimmas', () => {
    expect(resolveReferencePerson('  Bengt B  ', 'Anna Andersson')).toBe('Bengt B')
  })
  test('tom payload + null/undefined skapare → null', () => {
    expect(resolveReferencePerson('', null)).toBeNull()
    expect(resolveReferencePerson(undefined, undefined)).toBeNull()
    expect(resolveReferencePerson('   ', null)).toBeNull()
  })
})
