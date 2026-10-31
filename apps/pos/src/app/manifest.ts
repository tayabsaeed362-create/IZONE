import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'iZone by Haider — POS',
    short_name: 'iZone POS',
    description: 'Smart Retail & Offline-First POS System',
    start_url: '/',
    display: 'standalone',
    background_color: '#f5f7fb',
    theme_color: '#f5f7fb',
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  }
}
