import { chromium } from '@playwright/test'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import fs from 'node:fs/promises'

const root = process.cwd()
const source = path.join(root, 'docs', 'marketing', 'social-launch-kit', 'render.html')
const output = path.join(root, 'public', 'marketing', 'social', 'launch-01')

const assets = [
  'linkedin-01-cover',
  'linkedin-02-goal',
  'linkedin-03-plan',
  'linkedin-04-team',
  'linkedin-05-proof',
  'linkedin-06-cta',
  'instagram-mission-control',
  'reel-cover-teamet-ar-igang',
]

await fs.mkdir(output, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1200, height: 2100 }, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(source).href)
await page.evaluate(async () => {
  await document.fonts.ready
  await Promise.all(Array.from(document.images).map(image => image.complete
    ? Promise.resolve()
    : new Promise(resolve => {
        image.addEventListener('load', resolve, { once: true })
        image.addEventListener('error', resolve, { once: true })
      })))
})

for (const id of assets) {
  const target = page.locator(`#${id}`)
  await target.screenshot({ path: path.join(output, `${id}.png`) })
}

await page.addStyleTag({ content: `
  body { display:grid !important; grid-template-columns:repeat(2, 270px);
    align-items:start !important; justify-content:start !important; gap:20px !important;
    padding:20px !important; width:600px !important; }
  .asset { zoom:.25; }
` })
await page.screenshot({ path: path.join(output, 'contact-sheet.png'), fullPage: true })

await browser.close()
console.log(`Rendered ${assets.length} social assets plus contact sheet to ${output}`)
