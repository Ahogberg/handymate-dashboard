import {test,expect} from '@playwright/test'
import fs from 'fs'
test('local contracts run the exact CI spec list and customer preparation Node contracts',()=>{
  const yaml=fs.readFileSync('../.github/workflows/contracts.yml','utf8').replace(/\r\n/g,'\n')
  const start=yaml.indexOf('      - name: Browserlösa kontraktssviter')
  const block=yaml.slice(start,yaml.indexOf('          --reporter=line',start))
  const ci=Array.from(block.matchAll(/tests\/[a-z0-9-]+\.spec\.ts/g)).map(m=>m[0])
  const scripts=JSON.parse(fs.readFileSync('package.json','utf8')).scripts
  const local=Array.from(scripts['test:contracts'].matchAll(/tests\/[a-z0-9-]+\.spec\.ts/g)).map((m:any)=>m[0])
  expect(local).toEqual(ci)
  expect(scripts['test:contracts']).toContain('node --test tests/customer-preparation/contract.test.mjs')
  expect(fs.readFileSync('../.github/workflows/feature-integration.yml','utf8')).toContain('run: npm run test:feature-integration')
  expect(scripts['test:feature-integration']).toContain('tests/lars-preparation-review.ui.spec.ts')
})
