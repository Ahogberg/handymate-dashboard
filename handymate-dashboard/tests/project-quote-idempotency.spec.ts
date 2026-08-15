import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')

function source(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8')
}

// TD-57 (tasks/tech-debt.md): dubbel-klick eller nätverks-retransmission på
// POST /api/projects med from_quote_id skapade två projekt av samma offert
// (bevisat i Bee Service-piloten, 2026-05-20). Facit för de två lagren av
// skydd: en tidig applikationsnivå-koll + ett DB-nivå unikt index som
// backstopp för äkta samtidighet.

test.describe('projekt-skapande från offert är idempotent (TD-57)', () => {
  test('en befintlig lookup på business_id+quote_id sker innan offerten hämtas', () => {
    const routeSource = source('app/api/projects/route.ts')
    const fromQuoteBlock = routeSource.indexOf('if (body.from_quote_id) {')
    const dedupLookup = routeSource.indexOf(".from('project')", fromQuoteBlock)
    const quoteFetch = routeSource.indexOf(".from('quotes')", fromQuoteBlock)

    expect(fromQuoteBlock).toBeGreaterThan(-1)
    expect(dedupLookup).toBeGreaterThan(fromQuoteBlock)
    expect(quoteFetch).toBeGreaterThan(dedupLookup)

    const dedupSlice = routeSource.slice(dedupLookup, quoteFetch)
    expect(dedupSlice).toContain("eq('business_id', businessId)")
    expect(dedupSlice).toContain("eq('quote_id', body.from_quote_id)")
    expect(dedupSlice).toContain('maybeSingle()')
  })

  test('ett hittat befintligt projekt returneras direkt utan att skapa ett nytt', () => {
    const routeSource = source('app/api/projects/route.ts')
    const fromQuoteBlock = routeSource.indexOf('if (body.from_quote_id) {')
    const dedupLookup = routeSource.indexOf(".from('project')", fromQuoteBlock)
    const quoteFetch = routeSource.indexOf(".from('quotes')", fromQuoteBlock)
    const dedupSlice = routeSource.slice(dedupLookup, quoteFetch)

    expect(dedupSlice).toMatch(/if \(existingProject\)/)
    expect(dedupSlice).toContain('deduplicated: true')
  })

  test('en 23505-krock på insert (äkta samtidighet) returnerar vinnaren i stället för 500', () => {
    const routeSource = source('app/api/projects/route.ts')
    const insertErrorCheck = routeSource.indexOf('if (insertError) {')
    expect(insertErrorCheck).toBeGreaterThan(-1)

    const insertErrorBlockEnd = routeSource.indexOf(
      "status: 500 })",
      insertErrorCheck,
    )
    const insertErrorBlock = routeSource.slice(insertErrorCheck, insertErrorBlockEnd)

    expect(insertErrorBlock).toContain("insertError.code === '23505'")
    expect(insertErrorBlock).toContain('deduplicated: true')
  })

  test('migrationen lägger ett partiellt unikt index på project.quote_id', () => {
    const migration = source('sql/v136_unique_quote_project.sql')
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS project_quote_id_unique/)
    expect(migration).toMatch(/ON project \(quote_id\)/)
    expect(migration).toContain('WHERE quote_id IS NOT NULL')
    expect(migration).not.toMatch(/DROP |DELETE |TRUNCATE /i)
  })
})
