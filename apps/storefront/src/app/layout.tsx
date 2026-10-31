import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: {
    template: '%s | iZone by Haider',
    default: 'iZone by Haider — Authentic Smartphones & Premium Mobile Accessories',
  },
  description:
    'Premier retail store for authentic smartphones, Apple AirPods, Samsung Galaxy Buds, GaN fast chargers, and accessories in Pakistan with verified warranty and WhatsApp ordering.',
  keywords: [
    'mobile accessories',
    'smartphones Pakistan',
    'fast chargers',
    'Anker GaN charger',
    'Samsung S24 Ultra',
    'iPhone 15 Pro Max',
    'AirPods Pro',
    'mobile shop',
  ],
  openGraph: {
    title: 'iZone by Haider — Authentic Mobile Phones & Accessories',
    description: 'Shop genuine mobile phones and premium accessories with official warranty and instant WhatsApp ordering.',
    siteName: 'iZone by Haider',
    locale: 'en_PK',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#0b0f19',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-[#0b0f19] text-slate-100">{children}</body>
    </html>
  )
}
