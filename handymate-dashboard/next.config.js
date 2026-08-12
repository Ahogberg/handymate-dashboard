/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Chromium-PDF (app/api/quotes/pdf): puppeteer-core + @sparticuz/chromium
    // måste lämnas utanför webpack-bundlingen — binär-uppackningen och
    // dynamiska require:s går sönder om de bundlas.
    serverComponentsExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  },
}

module.exports = nextConfig
