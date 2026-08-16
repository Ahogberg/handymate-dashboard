import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
function source(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

// Egenkostnad (purchase_price) fanns redan fullt stödd i API:t (POST/PUT
// /api/products läser den och räknar automatiskt ut markup_percent) men
// hade INGEN väg in via redigeraren — hantverkaren kunde aldrig faktiskt
// sätta den. Det här facitet låser att fältet finns, följer samma
// "tomt = okänt, aldrig 0"-disciplin som säljpriset, och räknar en
// levande marginal utan att gissa vid ofullständig data.

test.describe('ProductEditorModal — egenkostnad (purchase_price)', () => {
  const src = () => source('app/dashboard/settings/products/components/ProductEditorModal.tsx')

  test('fältet finns, initieras från produktens purchase_price', () => {
    const s = src()
    expect(s).toContain('purchasePrice')
    expect(s).toMatch(/product\?\.purchase_price \? product\.purchase_price\.toString\(\) : ''/)
    expect(s).toContain('Egenkostnad')
  })

  test('tomt fält skickas som null, inte 0 — samma disciplin som säljpriset', () => {
    const s = src()
    const purchaseLine = s.match(/const purchase = purchasePrice\.trim\(\)[^\n]*/)
    expect(purchaseLine, 'saknar tomt-är-null-hanteringen').toBeTruthy()
    expect(purchaseLine![0]).toContain('null')
    expect(s).toContain('purchase_price: purchase')
  })

  test('ogiltig eller negativ egenkostnad stoppas innan sparning', () => {
    const s = src()
    expect(s).toMatch(/purchase !== null && \(Number\.isNaN\(purchase\) \|\| purchase < 0\)/)
  })

  test('en levande marginal räknas, men bara när båda priserna är kända — aldrig en gissning', () => {
    const s = src()
    const marginIndex = s.indexOf('const marginPct')
    expect(marginIndex).toBeGreaterThan(-1)
    const marginBlock = s.slice(marginIndex, marginIndex + 300)
    expect(marginBlock).toContain("if (!(purchase > 0) || !(sale > 0)) return null")
    expect(marginBlock).toMatch(/Math\.round\(\(\(sale - purchase\) \/ purchase\) \* 100\)/)
  })

  test('marginal-formeln matchar exakt den servern redan använder (POST /api/products)', () => {
    const modal = src()
    const route = source('app/api/products/route.ts')
    expect(modal).toContain('(sale - purchase) / purchase) * 100')
    expect(route).toContain('(body.sales_price - body.purchase_price) / body.purchase_price) * 100')
  })
})
