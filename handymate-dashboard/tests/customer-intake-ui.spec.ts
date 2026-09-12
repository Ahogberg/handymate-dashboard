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
const { CustomerIntakeSetup } = component('app/onboarding/components/CustomerIntakeSetup.tsx')
const form = { businessId: 'real-test-company', primaryLeadChannel: 'email' }
test('choosing the main channel changes only form data and sends no activation request', async () => {
  const requests:string[]=[]; global.fetch=(async (url:any)=>{requests.push(String(url));return Response.json({})}) as typeof fetch
  let saved:any={businessId:'real-test-company'}
  await render(CustomerIntakeSetup,{data:saved,setData:(fn:any)=>{saved=fn(saved)}})
  await click('E-post')
  expect(saved.primaryLeadChannel).toBe('email');expect(requests).toHaveLength(0)
})
test('email starts with read-only status and requires a click to provision', async () => {
  const methods:string[]=[]
  global.fetch=(async (_url:any, options:any)=>{methods.push(options?.method||'GET');return Response.json(options?.method==='POST'?{address:'test@example.invalid',active:true}:{address:null,active:false})}) as typeof fetch
  await render(CustomerIntakeSetup,{data:form,setData:()=>{}})
  expect(methods).toEqual(['GET'])
  await click('Skapa mottagaradress')
  expect(methods).toEqual(['GET','POST']);expect(host.textContent).toContain('test@example.invalid')
  expect(host.textContent).toContain('skicka sedan ett provmejl')
  expect(host.textContent).not.toContain('tidigare tagits emot')
})
test('failed provisioning remains visible and retryable', async () => {
  global.fetch=(async (_url:any, options:any)=>Response.json(options?.method==='POST'?{error:'Prova senare'}:{address:null},{status:options?.method==='POST'?503:200})) as typeof fetch
  await render(CustomerIntakeSetup,{data:form,setData:()=>{}})
  await click('Skapa mottagaradress')
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Prova senare')
  expect(button('Skapa mottagaradress').disabled).toBe(false)
})
test('provider choice is saved without pretending Outlook or Gmail is connected', async () => {
  global.fetch=(async()=>Response.json({address:null,active:false})) as typeof fetch
  let saved:any=form
  await render(CustomerIntakeSetup,{data:saved,setData:(fn:any)=>{saved=fn(saved)}})
  await act(async()=>{Simulate.change(host.querySelector('select')!,{target:{value:'microsoft'}} as any)})
  expect(saved.customerMailProvider).toBe('microsoft')
  expect(host.textContent).toContain('Direktkoppling av Gmail och Outlook förbereds')
})
