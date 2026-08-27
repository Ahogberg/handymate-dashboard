import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')

function source(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

const MUTABLE_PUBLIC_GET_ROUTES = [
  'app/api/quotes/public/[token]/route.ts',
  'app/api/ata/sign/[token]/route.ts',
  'app/api/portal/[token]/route.ts',
  'app/api/portal/[token]/activity/route.ts',
  'app/api/portal/[token]/invoices/route.ts',
  'app/api/portal/[token]/messages/route.ts',
  'app/api/portal/[token]/quotes/route.ts',
  'app/api/portal/[token]/reports/route.ts',
  'app/api/portal/[token]/jobbpass/route.ts',
  'app/api/portal/[token]/documents/route.ts',
  'app/api/portal/[token]/invoices/[id]/route.ts',
  'app/api/portal/route.ts',
] as const

test.describe('Launchfacit — föränderliga publika kundrutter', () => {
  for (const routePath of MUTABLE_PUBLIC_GET_ROUTES) {
    test(`${routePath} är explicit dynamisk`, () => {
      expect(source(routePath)).toMatch(/export const dynamic\s*=\s*['"]force-dynamic['"]/)
    })
  }

  test('offertsvaret byggs via publik DTO och signeringstoken loggas aldrig', () => {
    const route = source('app/api/quotes/public/[token]/route.ts')
    expect(route).toContain('buildPublicQuoteDto({')
    expect(route).not.toMatch(/console\.(?:log|error|warn)\([^\n]*['"]token:['"][^\n]*token/)
  })

  test('publik ÄTA returnerar explicit DTO utan interna anteckningar eller råa fel', () => {
    const route = source('app/api/ata/sign/[token]/route.ts')
    const responseStart = route.indexOf('return NextResponse.json({\n      ata: {')
    expect(responseStart).toBeGreaterThan(-1)
    const dto = route.slice(responseStart, responseStart + 800)
    expect(dto).not.toMatch(/notes:\s*ata\.notes/)
    expect(route).not.toMatch(/NextResponse\.json\(\{\s*error:\s*error\.message/)
  })

  test('portalfakturan binds till både portalens kund och företag', () => {
    const route = source('app/api/portal/[token]/invoices/[id]/route.ts')
    expect(route).toMatch(/\.eq\('portal_token',\s*token\)/)
    expect(route).toMatch(/\.eq\('customer_id',\s*customer\.customer_id\)/)
    expect(route).toMatch(/\.eq\('business_id',\s*customer\.business_id\)/)
  })

  test('betalningspåståendet binds till kund och företag, dedupliceras och läcker inga råa fel', () => {
    const route = source('app/api/portal/[token]/invoices/[id]/claim-paid/route.ts')
    expect(route).toMatch(/\.eq\('portal_token',\s*token\)/)
    expect(route).toMatch(/\.eq\('business_id',\s*customer\.business_id\)/)
    expect(route).toContain('invoice.customer_id !== customer.customer_id')
    expect(route).toMatch(/\.contains\('payload',\s*\{\s*invoice_id:\s*invoiceId\s*\}\)/)
    expect(route).not.toMatch(/NextResponse\.json\(\{\s*error:\s*err\??\.message/)
  })

  test('jobbpass kräver publicerad rad och passerar genom kundvyns allowlist', () => {
    const route = source('app/api/jobbpass/public/[token]/route.ts')
    expect(route).toContain('getPublishedJobbpassByToken')
    // Derivationen (allowlisten) bor sedan Fastighetspasset steg 1 (2026-08-27) i den
    // delade assembleJobbpassView — samma väg för publika sidan och kundportalen.
    expect(route).toContain('assembleJobbpassView(supabase, jobbpass)')
    const lib = source('lib/jobbpass/jobbpass.ts')
    const assembleStart = lib.indexOf('export async function assembleJobbpassView(')
    expect(assembleStart).toBeGreaterThan(-1)
    expect(lib.indexOf('deriveJobbpassView({', assembleStart)).toBeGreaterThan(assembleStart)
    expect(route).toMatch(/return NextResponse\.json\(\{\s*jobbpass:\s*view\s*\}\)/)
  })
})
