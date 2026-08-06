/**
 * Facit för ägarkontrollen på personliga poster (2026-08-06).
 *
 * Regeln ser trivial ut och är det inte: två av kantfallen avgör om den
 * skyddar något alls. Det som testas hårdast är därför inte att en ägare når
 * sin egen post, utan att `null === null` ALDRIG läses som ägarskap — varken
 * när posten saknar ägare eller när användaren inte kunde härledas.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/record-ownership.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { canTouchRecord, canCreateForOwner } from '../lib/auth/record-ownership'

const ANNA = 'bu_anna'
const BENGT = 'bu_bengt'

test.describe('egen post', () => {
  test('ägaren får röra sin egen post utan behörighet', () => {
    expect(canTouchRecord({
      recordOwnerId: ANNA, currentUserId: ANNA, hasFallbackPermission: false,
    })).toBe(true)
  })

  test('en kollega får INTE röra någon annans post', () => {
    // Det här var hålet: skrivvägarna filtrerade bara på business_id, så vem
    // som helst kunde ändra eller radera en kollegas körjournal.
    expect(canTouchRecord({
      recordOwnerId: ANNA, currentUserId: BENGT, hasFallbackPermission: false,
    })).toBe(false)
  })

  test('behörighet räcker även för någon annans post', () => {
    expect(canTouchRecord({
      recordOwnerId: ANNA, currentUserId: BENGT, hasFallbackPermission: true,
    })).toBe(true)
  })
})

test.describe('KANTFALLEN — här avgörs om regeln skyddar något', () => {
  test('post UTAN ägare tillhör inte den som råkar titta', () => {
    // Äldre data och poster där POST aldrig satte business_user_id. Motsatt
    // tolkning hade gjort varje herrelös post till fritt vilt.
    expect(canTouchRecord({
      recordOwnerId: null, currentUserId: ANNA, hasFallbackPermission: false,
    })).toBe(false)
  })

  test('men behörighet når den ägarlösa posten', () => {
    expect(canTouchRecord({
      recordOwnerId: null, currentUserId: ANNA, hasFallbackPermission: true,
    })).toBe(true)
  })

  test('okänd användare äger ingenting', () => {
    // Om getCurrentUser inte kunde härleda rollen får en trasig session inte
    // bli en nyckel till alla ägarlösa poster.
    expect(canTouchRecord({
      recordOwnerId: null, currentUserId: null, hasFallbackPermission: false,
    })).toBe(false)
  })

  test('okänd användare når inte heller en namngiven post', () => {
    expect(canTouchRecord({
      recordOwnerId: ANNA, currentUserId: null, hasFallbackPermission: false,
    })).toBe(false)
  })

  test('tom sträng räknas inte som ett id', () => {
    expect(canTouchRecord({
      recordOwnerId: '', currentUserId: '', hasFallbackPermission: false,
    })).toBe(false)
  })

  test('undefined beter sig som null', () => {
    expect(canTouchRecord({
      recordOwnerId: undefined, currentUserId: undefined, hasFallbackPermission: false,
    })).toBe(false)
  })
})

test.describe('skapa i någon annans namn', () => {
  test('utan angiven ägare är det alltid tillåtet', () => {
    // Posten blir anroparens egen — det normala fallet.
    expect(canCreateForOwner({
      recordOwnerId: null, currentUserId: ANNA, hasFallbackPermission: false,
    })).toBe(true)
  })

  test('sig själv är alltid tillåtet', () => {
    expect(canCreateForOwner({
      recordOwnerId: ANNA, currentUserId: ANNA, hasFallbackPermission: false,
    })).toBe(true)
  })

  test('en kollega kräver behörighet', () => {
    // POST tog business_user_id ur bodyn — vem som helst kunde registrera
    // utlägg på en kollega.
    expect(canCreateForOwner({
      recordOwnerId: BENGT, currentUserId: ANNA, hasFallbackPermission: false,
    })).toBe(false)
    expect(canCreateForOwner({
      recordOwnerId: BENGT, currentUserId: ANNA, hasFallbackPermission: true,
    })).toBe(true)
  })
})
