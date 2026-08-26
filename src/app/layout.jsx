import './globals.css'

export const metadata = {
  title: 'CKLC Coffee · Campus Counter',
  description: 'Fast, friendly point of sale for CKLC Coffee.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
}

export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f5f7f8' }

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>
}
