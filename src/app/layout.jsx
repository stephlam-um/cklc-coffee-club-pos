import './globals.css'

export const metadata = {
  title: 'CKLC Coffee POS',
  description: 'CKLC Coffee point of sale.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
}

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f5f7f8' }

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>
}
