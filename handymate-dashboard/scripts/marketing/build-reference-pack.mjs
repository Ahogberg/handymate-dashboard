// Bygger docs/marketing/reference-pack/assets/ från källorna i public/.
// Kör: node scripts/marketing/build-reference-pack.mjs [--zip]
// Kopiera aldrig assets för hand — kör scriptet så att paketet alltid matchar källan.
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const out = path.join(root, 'docs', 'marketing', 'reference-pack', 'assets')
const lib = 'public/marketing/content-library-v1'

const files = [
  ['brand', `${lib}/profile/profile-04-transparent.png`, 'handymate-mark-transparent.png'],
  ['brand', 'public/logo.png', 'logo-612.png'],
  ...['matte', 'karin', 'daniel', 'lars', 'hanna', 'lisa'].map((a) => ['agents', `${lib}/avatars/${a}.png`, `${a}.png`]),
  ['light', 'public/marketing/social/launch-01/worksite-morning-source.png', 'worksite-morning-source.png'],
  ['light', 'public/marketing/social/launch-01/van-morning-source.png', 'van-morning-source.png'],
  ['fonts', 'public/marketing/social/launch-01/fonts/space-grotesk-latin.woff2', 'space-grotesk-latin.woff2'],
  ['fonts', 'public/marketing/social/launch-01/fonts/dm-sans-latin.woff2', 'dm-sans-latin.woff2'],
]

let bytes = 0
for (const [sub, src, name] of files) {
  const from = path.join(root, src)
  if (!fs.existsSync(from)) {
    console.error(`SAKNAS: ${src}`)
    process.exit(1)
  }
  const dir = path.join(out, sub)
  fs.mkdirSync(dir, { recursive: true })
  fs.copyFileSync(from, path.join(dir, name))
  bytes += fs.statSync(from).size
  console.log(`${sub}/${name}  ←  ${src}`)
}
console.log(`\n${files.length} filer, ${(bytes / 1024 / 1024).toFixed(1)} MB → ${path.relative(root, out)}`)

if (process.argv.includes('--zip')) {
  const pack = path.join(root, 'docs', 'marketing', 'reference-pack')
  const zip = path.join(root, 'docs', 'marketing', 'Handymate-Reference-Pack-v1.zip')
  if (fs.existsSync(zip)) fs.unlinkSync(zip)
  execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${pack}\\*' -DestinationPath '${zip}'"`, { stdio: 'inherit' })
  console.log(`zip → ${path.relative(root, zip)} (${(fs.statSync(zip).size / 1024 / 1024).toFixed(1)} MB)`)
}
