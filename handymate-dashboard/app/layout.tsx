import type { Metadata } from 'next'
import { Space_Grotesk, DM_Sans, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import CookieConsent from '@/components/CookieConsent'

// Designfundament (mockup-integrationen 2026-08-17): varumärkets tre
// typsnitt laddas self-hostade via next/font (swap, latin+latin-ext) i
// stället för det render-blockerande @import:et i globals.css. Inter är
// borttagen — den var aldrig del av varumärket men VANN över DM Sans på
// all body-text via className-specificitet (inter.className på <body>).
// Tailwinds font-heading/font-body/font-mono pekar på CSS-variablerna.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-heading',
})
const dmSans = DM_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-body',
})
// JetBrains Mono används sparsamt: stora belopp/räknare i hero-ytor och
// monospace-tider — inte all löptext.
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'Handymate - Dashboard',
  description: 'AI-powered back office for craftspeople',
  manifest: '/manifest.json',
  themeColor: '#0F766E',
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Handymate',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="sv" className={`${spaceGrotesk.variable} ${dmSans.variable} ${jetbrainsMono.variable}`}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0F766E" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Handymate" />
      </head>
      <body className="font-body">
        {children}
        <CookieConsent />
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(e){console.warn('SW reg failed:',e)})})}`
          }}
        />
      </body>
    </html>
  )
}
