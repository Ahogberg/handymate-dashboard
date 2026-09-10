/**
 * Facit: status + "nästa att göra" i projektlistan (projektöversikten Del C, 2026-08-26).
 *
 * Bakgrund: "nästa steg"-härledningen (todoMode) låg inline i detaljsidan och
 * kunde inte återanvändas; godkännandekort kopplas till projekt bara via
 * payload.project_id; listan visade varken steg eller nästa åtgärd.
 *
 *   npx playwright test tests/facit-project-list-next-todo.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

test('fakturakällan visas som två val utan att renderingen skapar eller väljer något', () => {
  const choices: string[] = []
  // Playwrights komponenttransform ger __pw_type-objekt, inte React-noder.
  // Kompilera den riktiga komponenten med vanlig React-JSX för SSR-provet.
  const code = ts.transpileModule(read('components/projects/InvoiceSourceChoice.tsx'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText
  const module = { exports: {} as any }
  new Function('require', 'module', 'exports', code)((name: string) => {
    if (name !== 'react') throw new Error(`Unexpected dependency: ${name}`)
    return React
  }, module, module.exports)
  const html = renderToStaticMarkup(React.createElement(module.exports.InvoiceSourceChoice, {
    onChoose: (source: string) => choices.push(source), onClose: () => {},
  }))
  expect(html).toContain('Offert och godkända ÄTA')
  expect(html).toContain('Registrerad tid och material')
  expect(html).toContain('Inget skapas eller skickas')
  expect(html).toContain('Avbryt')
  expect(choices).toEqual([])
})

test('alla generiska fakturastarter använder valgrinden, inte project_type', () => {
  const page = read('app/dashboard/projects/[id]/page.tsx')
  expect(page).toContain("invoiceReviewEntry(project.quote_id) === 'choose'")
  expect(page).toContain('onAction: openInvoiceReview')
  expect(page).toContain('onInvoiceProject={openInvoiceReview}')
  expect(page).toContain('onClick={openInvoiceReview}')
  expect(page).toContain('? openInvoiceReview')
  expect(page).toContain('<InvoiceSourceChoice')
  expect(page).not.toContain("? invoicePath === 'contract'")
})

test.describe('en beräkning, två ytor', () => {
  test('TODO_PRIMARY_LABEL + getStageBucket bor i lib/projects/derive-todo.ts; komponenterna re-exporterar', () => {
    const lib = read('lib/projects/derive-todo.ts')
    expect(lib).toContain('export const TODO_PRIMARY_LABEL')
    expect(lib).toContain('export function getStageBucket(')
    expect(lib).toContain('export function deriveTodoMode(')
    expect(lib).toContain('export function deriveProjectTodo(')
    const todoBlock = read('components/projects/ProjectTodoBlock.tsx')
    expect(todoBlock).toContain("from '@/lib/projects/derive-todo'")
    expect(todoBlock, 'ingen egen kopia av etiketterna kvar').not.toMatch(/nystartat: 'Boka första besök'/)
    const card = read('components/projects/ProjectStatusCard.tsx')
    expect(card).toContain("from '@/lib/projects/derive-todo'")
    expect(card, 'ingen egen kopia av bucket-logiken kvar').not.toContain('if (pos <= 2) return')
  })

  test('detaljsidan använder deriveTodoMode — ingen inline-kopia', () => {
    const page = read('app/dashboard/projects/[id]/page.tsx')
    expect(page).toContain('const todoMode: TodoMode = deriveTodoMode({')
    expect(page).not.toMatch(/let todoMode: TodoMode = 'pagaende'/)
  })
})

test.describe('GET /api/projects — steg + nästa att göra per rad', () => {
  const s = read('app/api/projects/route.ts')

  test('EN query mot pending_approvals, filtrerad på payload.project_id, läser error', () => {
    expect(s).toContain(".from('pending_approvals')")
    expect(s).toContain(".not('payload->>project_id', 'is', null)")
    expect(s).toContain('if (pendingError)')
    expect(s, 'inte en query per projekt').not.toMatch(/\.contains\('payload', \{ project_id/)
  })

  test('stage ur den rena stegtabellen (ingen DB-runda) och next_todo via deriveProjectTodo', () => {
    expect(s).toContain("import { getSystemStage, PROJECT_SYSTEM_STAGES } from '@/lib/project-stages/stages'")
    expect(s).toContain('next_todo: deriveProjectTodo({')
    expect(s).toContain('pending: pendingByProject.get(project.project_id) || []')
  })

  test('över budget i listan kräver ekonomibehörighet', () => {
    expect(s).toContain('isOverBudget: canSeeFinancials && (')
  })

  test('listan använder samma fakturakälla som detaljen och räknar material utan tid', () => {
    expect(s).toContain("from '@/lib/projects/invoice-path'")
    expect(s).toContain(".from('project_material')")
    expect(s).toContain('hasInvoiceableProjectSources({')
    expect(s).toContain('uninvoicedMaterialCount')

    const detail = read('app/dashboard/projects/[id]/page.tsx')
    expect(detail).toContain('const invoicePath = projectInvoicePath({')
    expect(detail).toContain("router.push(`/dashboard/projects/${project.project_id}/invoice-preview`)")
    expect(detail).toContain('uninvoicedMaterialRevenue')
  })
})

test.describe('projektlistan renderar steg + nästa', () => {
  const s = read('app/dashboard/projects/page.tsx')

  test('stegchip med position/total och ärlig "Inget steg ännu"', () => {
    expect(s).toContain('{project.stage.position}/{project.stage.total}')
    expect(s).toContain('Inget steg ännu')
  })

  test('"Nästa"-raden visar etikett + agent för kort', () => {
    expect(s).toContain('{project.next_todo.label}')
    expect(s).toContain("project.next_todo.source === 'card' && project.next_todo.agent")
  })

  test('sortering: kräver handling → försenat → flest väntande kort', () => {
    const sort = s.slice(s.indexOf('.sort((a, b) =>'), s.indexOf('.sort((a, b) =>') + 400)
    expect(sort).toContain('needsAction')
    expect(sort).toContain('is_late')
    expect(sort).toContain('pending_count')
  })
})
