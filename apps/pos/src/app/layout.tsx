import type { Metadata, Viewport } from 'next'
import { AppShell } from '@/components/AppShell'
import './globals.css'
import { Providers } from '@/components/Providers'

export const metadata: Metadata = {
  title: {
    template: '%s | iZone by Haider',
    default: 'iZone by Haider — Smart Retail Management',
  },
  description: 'Professional retail management system for mobile phone shops. POS, inventory, sales reports, and more.',
  applicationName: 'iZone POS',
  keywords: ['retail', 'POS', 'inventory', 'mobile shop', 'Pakistan'],
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'iZone POS',
  },
  icons: {
    icon: '/brand-icon.svg',
    apple: '/brand-icon.svg',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  
  themeColor: '#f5f7fb',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-screen antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  )
}
