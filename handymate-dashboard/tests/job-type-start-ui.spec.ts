/** Riktiga React-komponenter + lokal DOM; ingen browser/auth/API i produktion. */
import { test, expect } from '@playwright/test'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act, Simulate } from 'react-dom/test-utils'
import { toSetupTemplate } from '../lib/quotes/job-type-setup'
import fs from 'fs'
import path from 'path'
import ts from 'typescript'

require.extensions['.css'] = () => {}
const { JSDOM } = require('jsdom')
// Playwrights TSX-transform producerar component-test-deskriptorer (__pw_type),
// inte React-element. Använd vanlig TS→React-transform för dessa tre riktiga
// komponenter; ingen handskriven mock av deras beteende.
function component(relative: string) {
  const filename = path.resolve(__dirname, '..', relative)
  const Module = require('module')
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(path.dirname(filename))
  loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
  } }).outputText, filename)
  return loaded.exports
}
const { QuoteJobTypeStart } = component('components/onboarding/QuoteJobTypeStart.tsx')
const { FirstQuoteLaunch } = component('components/onboarding/FirstQuoteLaunch.tsx')
const { QuickPriceInput } = component('components/products/QuickPriceInput.tsx')
test.describe.configure({ mode: 'serial' })

const selection = { jobTypeSlug: 'service', templateId: 't1' }
const raw = { id: 't1', name: 'Serviceupplägg', job_type_slug: 'service', default_items: [{ description: 'Arbete', unit: 'tim' }] }
const setup = { linkingAvailable: true, jobTypes: [{ id: 'j1', name: 'Service', slug: 'service' }], templates: [toSetupTemplate(raw)], products: [] }
let dom: any, root: Root, host: HTMLElement
let originalFetch: typeof fetch
const originals = new Map<string, PropertyDescriptor | undefined>()

test.beforeEach(() => {
  dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost' })
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'IS_REACT_ACT_ENVIRONMENT']) {
    originals.set(key, Object.getOwnPropertyDescriptor(global, key))
    Object.defineProperty(global, key, { configurable: true, writable: true, value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key] })
  }
  host = dom.window.document.getElementById('root')
  root = createRoot(host)
  originalFetch = global.fetch
  global.fetch = (async () => Response.json(setup)) as typeof fetch
})
test.afterEach(async () => {
  await act(async () => root.unmount())
  dom.window.close()
  global.fetch = originalFetch
  for (const [key, descriptor] of Array.from(originals)) {
    if (descriptor) Object.defineProperty(global, key, descriptor)
    else delete (global as any)[key]
  }
  originals.clear()
})

async function render(Component: React.ComponentType<any>, props: object) {
  await act(async () => { root.render(React.createElement(Component, props)) })
}
function button(text: string): HTMLButtonElement {
  const found = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes(text))
  if (!found) throw new Error(`Ingen knapp: ${text}. ${host.textContent}`)
  return found
}
async function click(text: string) { await act(async () => button(text).click()) }
const base = { jobType: 'service', inherited: true, initialIntent: null, onSelectJobType: () => {} }

test('ärvd jobbtyp + en mall tillämpas en gång, aldrig igen vid rerender', async () => {
  let calls = 0
  const props = { ...base, onApply: async (s: unknown) => { expect(s).toEqual(selection); calls++ } }
  await render(QuoteJobTypeStart, props)
  await render(QuoteJobTypeStart, { ...props })
  expect(calls).toBe(1)
  expect(host.textContent).toContain('Ditt underlag för jobbet')
})

test('flera mallar kräver ett verkligt knappval', async () => {
  global.fetch = (async () => Response.json({ ...setup, templates: [setup.templates[0], { ...setup.templates[0], id: 't2', name: 'Alternativ' }] })) as typeof fetch
  let calls = 0
  await render(QuoteJobTypeStart, { ...base, onApply: async () => { calls++ } })
  expect(calls).toBe(0)
  await click('Alternativ')
  expect(calls).toBe(1)
})

test('jobbtypschipens aria-pressed följer valet — kompakteringen får inte tappa den', async () => {
  const props = { ...base, inherited: false, jobType: null, onApply: async () => {} }
  await render(QuoteJobTypeStart, props)
  expect(button('Service').getAttribute('aria-pressed')).toBe('false')
  await render(QuoteJobTypeStart, { ...props, jobType: 'service' })
  expect(button('Service').getAttribute('aria-pressed')).toBe('true')
})

test('pågående hämtning annonseras via role=status', async () => {
  global.fetch = (() => new Promise(() => {})) as typeof fetch
  await render(QuoteJobTypeStart, { ...base, onApply: async () => {} })
  expect(host.querySelector('[role=status]')?.textContent).toContain('Hämtar ditt upplägg')
})

test('pågående mallkontroll annonseras via role=status', async () => {
  await render(QuoteJobTypeStart, { ...base, onApply: () => new Promise<void>(() => {}) })
  expect(host.querySelector('[role=status]')?.textContent).toContain('Kontrollerar mall')
})

test('onboardingens specifika mallval får inte bytas mot första mall i listan', async () => {
  let chosen: unknown
  await render(QuoteJobTypeStart, { ...base, initialIntent: { ...selection, templateId: 'explicit' }, onApply: async (s: unknown) => { chosen = s } })
  expect(chosen).toEqual({ ...selection, templateId: 'explicit' })
})

test('återmontering efter ett eget startval återaktiverar inte automatiken', async () => {
  let calls = 0
  await render(QuoteJobTypeStart, { ...base, automatic: false, onApply: async () => { calls++ } })
  expect(calls).toBe(0)
  await click('Serviceupplägg')
  expect(calls).toBe(1)
})

test('underlagsfel visas och mallknappen går att försöka med igen', async () => {
  let calls = 0
  await render(QuoteJobTypeStart, { ...base, onApply: async () => { calls++; throw new Error('Kunde inte läsa mallen') } })
  expect(host.querySelector('[role=alert]')?.textContent).toContain('Kunde inte läsa mallen')
  await click('Serviceupplägg')
  expect(calls).toBe(2)
})

test('synligt återförsök fungerar även efter att föräldern stängt automatiken', async () => {
  let calls = 0
  const props = { ...base, onApply: async () => { calls++; if (calls === 1) throw new Error('Tillfälligt fel') } }
  await render(QuoteJobTypeStart, props)
  await render(QuoteJobTypeStart, { ...props, automatic: false })
  await click('Försök igen')
  expect(calls).toBe(2)
  expect(host.querySelector('[role=alert]')).toBeNull()
})

test('okörd migration startar inte ens en automatisk mallhämtning', async () => {
  global.fetch = (async () => Response.json({ ...setup, linkingAvailable: false })) as typeof fetch
  let calls = 0
  await render(QuoteJobTypeStart, { ...base, onApply: async () => { calls++ } })
  expect(calls).toBe(0)
  expect(host.textContent).toContain('inte aktiverad')
})

test('läsfel på jobbtyper är synligt, inte en lyckad tom lista', async () => {
  global.fetch = (async () => new Response('{}', { status: 503 })) as typeof fetch
  await render(QuoteJobTypeStart, { ...base, onApply: async () => { throw new Error('får inte köras') } })
  expect(host.querySelector('[role=alert]')?.textContent).toContain('Kunde inte hämta dina jobbtyper')
})

test('Matte-kortet låser dubbelklick och återställer knappar med ärligt fel', async () => {
  let reject!: (reason: Error) => void
  let calls = 0
  const pending = new Promise<void>((_, r) => { reject = r })
  await render(FirstQuoteLaunch, { companyName: 'El AB', jobName: 'Service', templateName: 'Mall',
    onContinue: () => { calls++; return pending }, onSkip: () => {} })
  await act(async () => { button('Skapa min första offert').click(); button('Skapa min första offert').click() })
  expect(calls).toBe(1)
  expect(button('Till översikten').disabled).toBe(true)
  await act(async () => { reject(new Error('misslyckades')) })
  expect(host.querySelector('[role=alert]')?.textContent).toContain('Kunde inte öppna offerten')
  expect(button('Skapa min första offert').disabled).toBe(false)
})

test('prisinmatningen är namngiven och ett osparat pris kan inte visas som sparat', async () => {
  await render(QuickPriceInput, { productId: 'p1', unit: 'tim', label: 'Pris för Servicearbete', onSaved: () => { throw new Error('inte sparat') } })
  expect(host.querySelector('input')?.getAttribute('aria-label')).toBe('Pris för Servicearbete')
  expect(host.querySelector('button')?.disabled).toBe(true)
})

test('prissparning flaggar väntan till föräldern och synligt fel vid 503, aldrig onSaved', async () => {
  const states: boolean[] = []
  let saved = false
  global.fetch = (async () => new Response('{}', { status: 503 })) as typeof fetch
  await render(QuickPriceInput, { productId: 'p1', unit: 'tim', onSavingChange: (state: boolean) => states.push(state), onSaved: () => { saved = true } })
  const input = host.querySelector('input')!
  await act(async () => Simulate.change(input, { target: { value: '950' } } as any))
  await act(async () => host.querySelector('button')!.click())
  expect(states).toEqual([true, false])
  expect(saved).toBe(false)
  expect(host.querySelector('[role=alert]')?.textContent).toContain('Kunde inte spara')
})
