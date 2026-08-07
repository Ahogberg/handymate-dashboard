import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const route = fs.readFileSync(path.resolve(__dirname, '../app/api/quotes/public/[token]/route.ts'), 'utf8')
const migration = fs.readFileSync(path.resolve(__dirname, '../sql/v97_atomic_quote_signing.sql'), 'utf8')

test('publik signering gör en enda atomisk RPC-mutation', () => {
  const signSection = route.slice(route.indexOf('// ── Sign'))
  expect(signSection).toContain(".rpc('sign_quote_with_options'")
  expect(signSection).not.toMatch(/for \(const r of optionRows\)[\s\S]*\.update\(\{ option_selected:/)
  expect(signSection).not.toMatch(/\.from\('quotes'\)[\s\S]*\.update\(updateFields\)/)
})

test('RPC låser offerten och rullar tillbaka options- och offertskrivningen tillsammans', () => {
  expect(migration).toContain('BEGIN;')
  expect(migration).toContain('FOR UPDATE;')
  expect(migration).toMatch(/UPDATE public\.quote_items[\s\S]*UPDATE public\.quotes/)
  expect(migration).toContain('SECURITY DEFINER')
  expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.sign_quote_with_options[\s\S]*FROM PUBLIC, anon, authenticated/)
  expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.sign_quote_with_options[\s\S]*TO service_role/)
})
