import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const docs = path.join(root, 'docs', 'marketing', 'content-library-v1')
const assets = path.join(root, 'public', 'marketing', 'content-library-v1')

const expectedAssets = [
  ...['cover', 'matte', 'karin', 'daniel', 'lars', 'hanna', 'lisa', 'cta'].map((name, index) =>
    path.join('team', `team-${String(index + 1).padStart(2, '0')}-${name}.png`)),
  ...['cover', 'old-system', 'digital-team', 'category', 'control', 'welcome'].map((name, index) =>
    path.join('future', `future-${String(index + 1).padStart(2, '0')}-${name}.png`)),
  ...['cover', 'daniel', 'karin', 'lars', 'lisa', 'hanna', 'matte', 'cta'].map((name, index) =>
    path.join('work', `work-${String(index + 1).padStart(2, '0')}-${name}.png`)),
  ...['digital-team', 'customer-portal', 'reactivation', 'money'].map(name =>
    path.join('standalone', `standalone-${name}.png`)),
  ...['meet-team', '2006-2026', 'team-at-work'].map(name =>
    path.join('reel', `reel-${name}.png`)),
]

test.describe('Handymate content library V1', () => {
  test('levererar 29 publiceringsklara PNG-original', () => {
    expect(expectedAssets).toHaveLength(29)
    for (const relativePath of expectedAssets) {
      const file = path.join(assets, relativePath)
      expect(fs.existsSync(file), relativePath).toBe(true)
      const bytes = fs.readFileSync(file)
      expect(bytes.subarray(0, 8).toString('hex'), relativePath).toBe('89504e470d0a1a0a')
      expect(bytes.length, relativePath).toBeGreaterThan(20_000)
    }
  })

  test('har lokala porträtt för hela lanseringsteamet', () => {
    for (const agent of ['matte', 'karin', 'daniel', 'lars', 'hanna', 'lisa']) {
      const file = path.join(assets, 'avatars', `${agent}.png`)
      expect(fs.existsSync(file), agent).toBe(true)
      expect(fs.statSync(file).size, agent).toBeGreaterThan(20_000)
    }
  })

  test('positionerar Matte som chefsagent och Uppdrag som en produktberättelse', () => {
    const playbook = fs.readFileSync(path.join(docs, 'messaging-playbook.md'), 'utf8')
    expect(playbook).toContain('Matte — din chefsagent')
    expect(playbook).toContain('`Uppdrag` är en viktig funktion')
    expect(playbook).toContain('Det digitala teamet för hantverksföretag')
  })

  test('namnger inga konkurrenter och lovar inte en färdig talande Lisa', () => {
    const sources = ['campaign-copy.md', 'render.html']
      .map(file => fs.readFileSync(path.join(docs, file), 'utf8'))
      .join('\n')
    expect(sources).not.toMatch(/easoft|bygglet/i)
    expect(sources).not.toMatch(/Lisa svarar i telefonen/i)
    expect(sources).not.toMatch(/garanterad intäkt|garanterad tidsbesparing/i)
  })

  test('renderar med riktig logotyp och lokala original', () => {
    const renderer = fs.readFileSync(path.join(docs, 'render.html'), 'utf8')
    const script = fs.readFileSync(path.join(root, 'scripts', 'render-content-library.mjs'), 'utf8')
    expect(renderer).toContain("const logo = '../../../public/logo.png'")
    expect(renderer).toContain('content-library-v1/avatars/')
    expect(renderer).toContain('data-export')
    expect(script).toContain("page.locator('[data-export]')")
  })

  test('levererar ett samlat nedladdningspaket', () => {
    const archive = path.join(root, 'public', 'marketing', 'handymate-content-library-v1.zip')
    expect(fs.existsSync(archive)).toBe(true)
    expect(fs.statSync(archive).size).toBeGreaterThan(1_000_000)
  })
})
