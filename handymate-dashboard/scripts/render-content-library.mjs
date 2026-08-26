import { chromium } from '@playwright/test'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import fs from 'node:fs/promises'
import sharp from 'sharp'

const root = process.cwd()
const source = path.join(root, 'docs', 'marketing', 'content-library-v1', 'render.html')
const output = path.join(root, 'public', 'marketing', 'content-library-v1')
const logoSource = pathToFileURL(path.join(root, 'public', 'logo.png')).href
const campaignFilter = process.argv[2]

async function writePng(file, bytes) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await fs.writeFile(file, bytes)
      return
    } catch (error) {
      if (attempt === 5) throw error
      await new Promise(resolve => setTimeout(resolve, attempt * 100))
    }
  }
}

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

const allAssets = await page.locator('[data-export]').evaluateAll(nodes => nodes.map(node => ({
  id: node.id,
  campaign: node.getAttribute('data-campaign') || 'other',
})))
const assets = campaignFilter
  ? allAssets.filter(asset => asset.campaign === campaignFilter)
  : allAssets

if (campaignFilter && assets.length === 0) {
  throw new Error(`Unknown campaign: ${campaignFilter}`)
}

for (const asset of assets) {
  const directory = path.join(output, asset.campaign)
  await fs.mkdir(directory, { recursive: true })
  if (asset.campaign === 'linkedin' || asset.campaign === 'article') {
    const wideViewport = asset.campaign === 'linkedin'
      ? { width: 1612, height: 356 }
      : { width: 2020, height: 1180 }
    const widePage = await browser.newPage({ viewport: wideViewport, deviceScaleFactor: 1 })
    await widePage.goto(pathToFileURL(source).href)
    await widePage.evaluate(async () => {
      await document.fonts.ready
      await Promise.all(Array.from(document.images).map(image => image.complete
        ? Promise.resolve()
        : new Promise(resolve => {
            image.addEventListener('load', resolve, { once: true })
            image.addEventListener('error', resolve, { once: true })
          })))
    })
    await widePage.evaluate(id => {
      document.querySelectorAll('[data-export]').forEach(node => {
        node.style.display = node.id === id ? 'block' : 'none'
      })
    }, asset.id)
    const bytes = await widePage.locator(`#${asset.id}`).screenshot()
    await writePng(path.join(directory, `${asset.id}.png`), bytes)
    if (asset.campaign === 'linkedin') {
      await sharp(bytes)
        .jpeg({ quality: 92, progressive: true, chromaSubsampling: '4:4:4' })
        .toFile(path.join(directory, `${asset.id}-upload.jpg`))
    }
    await widePage.close()
    continue
  }
  await page.evaluate(id => {
    document.querySelectorAll('[data-export]').forEach(node => {
      node.style.display = node.id === id ? 'block' : 'none'
    })
  }, asset.id)
  const target = page.locator(`#${asset.id}`)
  const transparent = await target.getAttribute('data-transparent') === 'true'
  if (transparent) {
    const transparentPage = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 })
    await transparentPage.setContent(`<!doctype html><style>
      html,body{margin:0;width:1080px;height:1080px;background:transparent;overflow:hidden}
      body{display:grid;place-items:center}
      img{width:950px;height:950px;object-fit:contain}
    </style><img src="${logoSource}" alt="Handymate">`)
    await transparentPage.locator('img').evaluate(image => image.complete
      ? Promise.resolve()
      : new Promise(resolve => image.addEventListener('load', resolve, { once: true })))
    const bytes = await transparentPage.screenshot({ omitBackground: true })
    await writePng(path.join(directory, `${asset.id}.png`), bytes)
    await transparentPage.close()
    continue
  }
  const bytes = await target.screenshot()
  await writePng(path.join(directory, `${asset.id}.png`), bytes)
}

for (const campaign of [...new Set(assets.map(asset => asset.campaign))]) {
  await page.evaluate(name => {
    document.querySelectorAll('[data-export]').forEach(node => {
      node.style.display = node.getAttribute('data-campaign') === name ? 'block' : 'none'
    })
  }, campaign)
  await page.addStyleTag({ content: `
    body { display:grid !important; grid-template-columns:repeat(2, 270px);
      align-items:start !important; justify-content:start !important; gap:20px !important;
      padding:20px !important; width:600px !important; }
    .asset { zoom:.25; }
  ` })
  const bytes = await page.screenshot({ fullPage: true })
  await writePng(path.join(output, `contact-sheet-${campaign}.png`), bytes)
  await page.reload()
  await page.evaluate(async () => { await document.fonts.ready })
}

await browser.close()
console.log(`Rendered ${assets.length} assets and ${new Set(assets.map(asset => asset.campaign)).size} contact sheets to ${output}`)
