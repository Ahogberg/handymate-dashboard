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
  ...['market', '2006', 'not-system', 'works-for-you', 'team-reveal', 'matte', 'launch-soon', 'three-days', 'tomorrow', 'launch'].map((name, index) =>
    path.join('prelaunch', `prelaunch-${String(index + 1).padStart(2, '0')}-${name}.png`)),
  ...['primary-dark', 'light', 'teal-white', 'transparent', 'safe-area-guide'].map((name, index) =>
    path.join('profile', `profile-${String(index + 1).padStart(2, '0')}-${name}.png`)),
  path.join('linkedin', 'linkedin-banner-company.png'),
  ...['system-eller-team', 'vad-gor-ett-ai-team', 'fran-utfort-till-betalt', 'ai-som-kan-bevisa', 'nasta-affar-finns-redan', 'fem-onodiga-manuella-jobb', 'affarssystem-eller-ai-team'].map((name, index) =>
    path.join('article', `article-${String(index + 1).padStart(2, '0')}-${name}.png`)),
]

test.describe('Handymate content library V1', () => {
  test('levererar 52 publiceringsklara PNG-original', () => {
    expect(expectedAssets).toHaveLength(52)
    for (const relativePath of expectedAssets) {
      const file = path.join(assets, relativePath)
      expect(fs.existsSync(file), relativePath).toBe(true)
      const bytes = fs.readFileSync(file)
      expect(bytes.subarray(0, 8).toString('hex'), relativePath).toBe('89504e470d0a1a0a')
      const minimumBytes = relativePath.endsWith('profile-04-transparent.png') ? 5_000 : 20_000
      expect(bytes.length, relativePath).toBeGreaterThan(minimumBytes)
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

  test('kalendern kopplar förlansering och karuseller till exakta filer', () => {
    const calendar = fs.readFileSync(path.join(docs, 'publishing-calendar.md'), 'utf8')
    expect(calendar).toContain('Lanseringsdag: måndag 14 september 2026')
    for (const asset of [
      'prelaunch/prelaunch-01-market.png',
      'prelaunch/prelaunch-10-launch.png',
      'team/team-01-cover.png` → `team-08-cta.png',
      'future/future-01-cover.png` → `future-06-welcome.png',
      'work/work-01-cover.png` → `work-08-cta.png',
    ]) {
      expect(calendar, asset).toContain(asset)
    }
    expect(calendar).toContain('Publicera aldrig kontaktarken')
  })

  test('videopaketet separerar verkligt produktbevis från syntetisk B-roll', () => {
    const pack = fs.readFileSync(path.join(docs, 'video-production-pack.md'), 'utf8')
    for (const id of ['V1 —', 'V2 —', 'V3 —', 'V4 —', 'V5 —']) {
      expect(pack, id).toContain(id)
    }
    expect(pack).toContain('Andreas ansikte, röst eller repliker')
    expect(pack).toContain('Alla produktbilder spelas in i verklig produkt eller demo-tenant')
    expect(pack).toContain('Inga syntetiska testimonials eller påhittade resultat')
  })

  test('Seedance-guiden förbjuder fejkad UI, kundbevis och identitetsblandning', () => {
    const guide = fs.readFileSync(path.join(docs, 'seedance-2.5-prompts.md'), 'utf8')
    expect(guide).toContain('upp till 30 sekunder per generering')
    expect(guide).toContain('fejkade produktgränssnitt')
    expect(guide).toContain('påhittade kundresultat eller testimonials')
    expect(guide).toContain('no identity blending')
    expect(guide).toContain('Ett realistiskt klipp är inte automatiskt ett sant klipp.')
  })

  test('profilpaketet är 1080 kvadratiskt och har en riktig transparent master', () => {
    const primary = fs.readFileSync(path.join(assets, 'profile', 'profile-01-primary-dark.png'))
    const transparent = fs.readFileSync(path.join(assets, 'profile', 'profile-04-transparent.png'))
    expect(primary.readUInt32BE(16)).toBe(1080)
    expect(primary.readUInt32BE(20)).toBe(1080)
    expect(transparent.readUInt32BE(16)).toBe(1080)
    expect(transparent.readUInt32BE(20)).toBe(1080)
    expect(transparent[25]).toBe(6)
    const guide = fs.readFileSync(path.join(docs, 'profile-assets.md'), 'utf8')
    expect(guide).toContain('profile-01-primary-dark.png')
    expect(guide).toContain('Safe-area-guiden får aldrig laddas upp offentligt')
  })

  test('LinkedIn-bannern följer företagssidans aktuella format och säkra budskap', () => {
    const banner = fs.readFileSync(path.join(assets, 'linkedin', 'linkedin-banner-company.png'))
    expect(banner.readUInt32BE(16)).toBe(4200)
    expect(banner.readUInt32BE(20)).toBe(700)
    expect(banner.length).toBeLessThan(3_000_000)
    const source = fs.readFileSync(path.join(docs, 'render.html'), 'utf8')
    expect(source).toContain('Välkommen till framtidens hantverksföretag.')
    expect(source).toContain('Hittar pengar. Skyddar marginalen. Minskar admin.')
  })

  test('levererar sju kompletta LinkedIn-artiklar med egna omslag', () => {
    const articleDir = path.join(docs, 'linkedin-articles')
    const articleFiles = fs.readdirSync(articleDir).filter(file => /^\d{2}-.+\.md$/.test(file))
    expect(articleFiles).toHaveLength(7)
    for (const file of articleFiles) {
      const article = fs.readFileSync(path.join(articleDir, file), 'utf8')
      expect(article.split(/\s+/).length, file).toBeGreaterThan(650)
      expect(article, file).toContain('**Omslag:**')
      expect(article, file).toContain('**Inlinebild 1:**')
      expect(article, file).toContain('**Delningsfråga:**')
    }
    for (let index = 1; index <= 7; index += 1) {
      const prefix = `article-${String(index).padStart(2, '0')}-`
      const file = expectedAssets.find(asset => asset.includes(prefix))
      expect(file, prefix).toBeTruthy()
      const cover = fs.readFileSync(path.join(assets, file!))
      expect(cover.readUInt32BE(16), file).toBe(1920)
      expect(cover.readUInt32BE(20), file).toBe(1080)
      expect(cover.length, file).toBeLessThan(3_000_000)
    }
  })

  test('reaktiveringsartikeln håller isär laggrund, kanalregel och relevans', () => {
    const article = fs.readFileSync(path.join(docs, 'linkedin-articles', '05-nasta-affar-finns-redan.md'), 'utf8')
    expect(article).toContain('Marknadsföringslag (2008:486), 19–20 §§')
    expect(article).toContain('GDPR-frågan är dessutom separat')
    expect(article).toContain('Om personen invänder mot direktmarknadsföring ska behandlingen upphöra')
    expect(article).not.toMatch(/GDPR[- ]säker|garanterat laglig|alltid tillåtet/i)
  })
})
