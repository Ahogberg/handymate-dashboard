import { test, expect } from '@playwright/test'
import React from 'react'
import { c5Modules } from './helpers/c5-module'
const { act } = require('react-dom/test-utils'),
  { createRoot } = require('react-dom/client')
const originalFetch = global.fetch
let dom: any, root: any, host: HTMLElement
const originals = new Map<string, PropertyDescriptor | undefined>()
test.beforeEach(() => {
  const { JSDOM } = require('jsdom')
  dom = new JSDOM('<div id="root"></div>', { url: 'https://local.test/' })
  for (const key of [
    'window',
    'self',
    'document',
    'navigator',
    'HTMLElement',
    'IS_REACT_ACT_ENVIRONMENT',
  ]) {
    originals.set(key, Object.getOwnPropertyDescriptor(global, key))
    Object.defineProperty(global, key, {
      configurable: true,
      writable: true,
      value: key === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[key],
    })
  }
  host = dom.window.document.getElementById('root')
  root = createRoot(host)
})
test.afterEach(async () => {
  await act(async () => root.unmount())
  dom.window.close()
  global.fetch = originalFetch
  for (const [key, value] of Array.from(originals)) {
    if (value) Object.defineProperty(global, key, value)
    else delete (global as any)[key]
  }
  originals.clear()
})
const Consent = c5Modules({})(
  'components/dashboard/AutonomyConsentCard.tsx',
).default
const Inbox = c5Modules({})('components/dashboard/HandoffInbox.tsx').default
async function click(text: string) {
  await act(async () => {
    const b = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(text),
    )
    expect(b).toBeTruthy()
    b!.click()
  })
}
for (const answer of [true, false])
  test(`explicit choice ${answer} persists once, answered question disappears on remount`, async () => {
    let saved: boolean | null = null
    const posts: any[] = []
    global.fetch = (async (_url: any, opts: any) => {
      if (opts?.method === 'POST') {
        const body = JSON.parse(opts.body)
        posts.push(body)
        saved = body.answer
        return Response.json({ changed: true })
      }
      return Response.json({
        consent: saved === null ? null : { answer: saved },
      })
    }) as typeof fetch
    await act(async () =>
      root.render(React.createElement(Consent, { businessId: 'a' })),
    )
    expect(posts).toEqual([])
    expect(host.textContent).toContain('Får Handymate')
    await click(answer ? 'Ja, sköt' : 'Nej, aktivera')
    expect(posts).toEqual([{ answer, expected_business_id: 'a' }])
    expect(host.textContent).toContain(
      answer ? 'godkännande är sparat' : 'nej är sparat',
    )
    await act(async () => root.render(null))
    await act(async () =>
      root.render(React.createElement(Consent, { businessId: 'a' })),
    )
    expect(host.textContent).toBe('')
    expect(posts).toHaveLength(1)
  })
test('old tenant response is aborted and cannot reveal consent after account switch', async () => {
  let resolveOld!: (v: Response) => void, signal: AbortSignal | undefined
  let reads = 0
  global.fetch = (async (_u: any, o: any) => {
    reads++
    if (reads === 1) {
      signal = o.signal
      return new Promise<Response>((r) => (resolveOld = r))
    }
    return Response.json({ consent: { answer: false } })
  }) as typeof fetch
  await act(async () =>
    root.render(React.createElement(Consent, { businessId: 'a' })),
  )
  await act(async () =>
    root.render(React.createElement(Consent, { businessId: 'b' })),
  )
  await act(async () => resolveOld(Response.json({ consent: null })))
  expect(signal?.aborted).toBe(true)
  expect(host.textContent).toBe('')
})
test('inbox keeps old notices folded, exposes uncertain receipt and confirms off only after successful POST', async () => {
  let failing = true
  const posts: any[] = []
  const data = {
    notices: [
      {
        id: 'n',
        title: 'Äldre information',
        description: 'Kvar',
        created_at: '2020-01-01',
      },
    ],
    next: null,
    channels: [],
    off_tokens: {},
    digests: [
      {
        day: '2026-09-15',
        status: 'unknown',
        snapshot: {
          decisions: [],
          remaining: 2,
          items: [
            {
              id: 'i',
              kind: 'autonomy',
              mode: 'supervised',
              outcome: 'unknown',
              autonomy_key: 'booking_reminder',
              title: 'Bokningspåminnelse',
            },
          ],
        },
      },
    ],
  }
  global.fetch = (async (_u: any, o: any) => {
    if (o?.method === 'POST') {
      posts.push(JSON.parse(o.body))
      return Response.json({}, { status: failing ? 503 : 200 })
    }
    return Response.json(data)
  }) as typeof fetch
  await act(async () =>
    root.render(React.createElement(Inbox, { businessId: 'a' })),
  )
  expect(host.querySelector('details')?.open).toBe(false)
  expect(host.textContent).toContain('Äldre information')
  expect(host.textContent).toContain('utfallet är inte bekräftat')
  await click('Stäng av')
  expect(host.textContent).not.toContain('Avstängt')
  expect(host.querySelector('[role=alert]')).toBeTruthy()
  failing = false
  await click('Försök igen')
  await click('Stäng av')
  expect(host.textContent).toContain('Avstängt')
  expect(posts[1]).toMatchObject({
    expected_business_id: 'a',
    key: 'booking_reminder',
  })
})
