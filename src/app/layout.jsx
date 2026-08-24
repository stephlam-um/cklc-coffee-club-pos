import './globals.css'

export const metadata = {
  title: 'CKLC Coffee · Campus Counter',
  description: 'Fast, friendly point of sale for CKLC Coffee.',
}

export const viewport = { themeColor: '#f5f7f8' }

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>
}
