import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = path.resolve(__dirname, '..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8')
const ASSET_DIR = path.join(ROOT, 'public', 'marketing', 'social', 'launch-01')

const FINAL_ASSETS = [
  'linkedin-01-cover.png',
  'linkedin-02-goal.png',
  'linkedin-03-plan.png',
  'linkedin-04-team.png',
  'linkedin-05-proof.png',
  'linkedin-06-cta.png',
  'instagram-mission-control.png',
  'reel-cover-teamet-ar-igang.png',
]

test.describe('Social Launch Kit — kampanj 01', () => {
  test('30-dagarsplanen har exakt 30 daterade innehållsrader', () => {
    const plan = read('docs/marketing/social-launch-kit/30-day-plan.md')
    const days = Array.from(plan.matchAll(/^\|\s*(\d+)\s*\|/gm), match => Number(match[1]))
    expect(days).toEqual(Array.from({ length: 30 }, (_, index) => index + 1))
  })

  test('kampanjmanuset bär inga påhittade tresiffriga kronbelopp', () => {
    const campaign = read('docs/marketing/social-launch-kit/campaign-01.md')
    expect(campaign).not.toMatch(/\d{3,}\s*(?:kr|kronor)/i)
  })

  test('ImageGen-prompterna förbjuder text, UI och falska kundcase', () => {
    const prompts = read('docs/marketing/social-launch-kit/imagegen-prompts.md')
    expect(prompts).toContain('no text, UI, logos')
    expect(prompts).toMatch(/Do not imply a testimonial|Conceptual campaign photography only/)
    expect(prompts).toContain('Generera aldrig siffror, kundcitat, produkt-UI')
  })

  test('alla åtta finalassets finns och är riktiga PNG-filer', () => {
    for (const file of FINAL_ASSETS) {
      const bytes = fs.readFileSync(path.join(ASSET_DIR, file))
      expect(bytes.length, `${file} är tom`).toBeGreaterThan(20_000)
      expect(Array.from(bytes.subarray(0, 8)), `${file} har fel filsignatur`).toEqual([
        137, 80, 78, 71, 13, 10, 26, 10,
      ])
    }
  })

  test('renderaren använder riktig logotyp och kampanjens exakta huvudbudskap', () => {
    const html = read('docs/marketing/social-launch-kit/render.html')
    expect(html).toContain('../../../public/marketing/content-library-v1/brand/handymate-mark.png')
    expect(html).toContain('Ge Handymate ett mål.')
    expect(html).toContain('Se teamet arbeta.')
    expect(html).not.toMatch(/kundomdöme|kundcitat/i)
  })

  test('alla sociala original har ren topp och centrerad webbplats', async ({ page }) => {
    await page.goto(pathToFileURL(path.join(ROOT, 'docs/marketing/social-launch-kit/render.html')).href)
    await page.evaluate(async () => { await document.fonts.ready })

    await expect(page.locator('.slide-no')).toHaveCount(0)
    const brands = await page.locator('.brand').evaluateAll(nodes => nodes.map(node => ({
      children: node.children.length,
      tag: node.firstElementChild?.tagName,
      height: node.firstElementChild?.getBoundingClientRect().height,
    })))
    for (const brand of brands) {
      expect(brand.children).toBe(1)
      expect(brand.tag).toBe('IMG')
      expect(brand.height).toBeGreaterThanOrEqual(80)
    }

    const footers = await page.locator('.footer').evaluateAll(nodes => nodes.map(node => {
      const footer = node.getBoundingClientRect()
      const asset = node.closest('.asset')!.getBoundingClientRect()
      return {
        text: node.textContent?.trim(),
        children: node.children.length,
        centerDelta: Math.abs((footer.left + footer.width / 2) - (asset.left + asset.width / 2)),
      }
    }))
    for (const footer of footers) {
      expect(footer.text).toBe('handymate.se')
      expect(footer.children).toBe(1)
      expect(footer.centerDelta).toBeLessThanOrEqual(1)
    }
  })
})
