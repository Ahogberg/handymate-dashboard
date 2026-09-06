import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = fs.readFileSync('app/dashboard/projects/[id]/page.tsx', 'utf8')

test('every project tab opens the group which renders its content', () => {
  const groups = vm.runInNewContext('(' + source.match(/const NEW_GROUPS[^=]*= ([\s\S]*?\n\])/ )![1] + ')')
  const mapping = vm.runInNewContext('(' + source.match(/const GROUP_OF_TAB[^=]*= ([\s\S]*?\n\})/ )![1] + ')')
  for (const group of groups) for (const tab of group.tabs) expect(mapping[tab], tab).toBe(group.key)
})

test('an older project read cannot overwrite a refresh after saved work', async () => {
  const start = source.indexOf('    const version = ++projectReadVersion.current')
  const end = source.indexOf('\n  }, [projectId])', start)
  const pending: Array<(response: unknown) => void> = []
  const projects: unknown[] = []
  const setters = ['setQuote', 'setMilestones', 'setChanges', 'setAtaPricesRedacted', 'setTimeEntries', 'setSummary', 'setMaterials', 'setMaterialSummary', 'setLoading']
  const context: Record<string, unknown> = Object.fromEntries(setters.map(name => [name, () => {}]))
  Object.assign(context, { projectId: 'test', projectReadVersion: { current: 0 }, setProject: (value: unknown) => projects.push(value), fetch: () => new Promise(resolve => pending.push(resolve)) })
  const read = vm.runInNewContext(ts.transpileModule('(async (preserveOnError = false) => {' + source.slice(start, end) + '\n})', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context)
  const oldRead = read(), refresh = read(true)
  pending[1]({ ok: true, json: async () => ({ project: { id: 'new', hours: 1 }, materials: [] }) })
  await refresh
  pending[0]({ ok: true, json: async () => ({ project: { id: 'old', hours: 0 }, materials: [] }) })
  await oldRead
  expect(projects).toEqual([{ id: 'new', hours: 1 }])
  const failedRefresh = read(true)
  pending[2]({ ok: false })
  const failure = await failedRefresh.then(() => 'unexpected success', (error: Error) => error.message)
  expect(failure).toBe('Projektet kunde inte läsas om.')
  expect(projects).toEqual([{ id: 'new', hours: 1 }])
})
