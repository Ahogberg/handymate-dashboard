import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import CookieConsent from '@/components/CookieConsent'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Handymate - Dashboard',
  description: 'AI-powered back office for craftspeople',
  manifest: '/manifest.json',
  themeColor: '#0F766E',
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
    <html lang="sv">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0F766E" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Handymate" />
      </head>
      <body className={inter.className}>
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
