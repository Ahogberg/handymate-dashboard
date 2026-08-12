/** @type {import('next').NextConfig} */
const nextConfig = {
  // TILLFÄLLIGT (2026-08-12) — felsöker settings-kraschen ("Cannot access
  // 'sG' before initialization"). Tas bort igen så fort Andreas har läst av
  // exakt rad i DevTools. Se tasks/lessons.md / chattloggen om den blir kvar.
  productionBrowserSourceMaps: true,
  experimental: {
    // Chromium-PDF (app/api/quotes/pdf): puppeteer-core + @sparticuz/chromium
    // måste lämnas utanför webpack-bundlingen — binär-uppackningen och
    // dynamiska require:s går sönder om de bundlas.
    serverComponentsExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  },
}

module.exports = nextConfig
