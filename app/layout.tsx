import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TLW Coaching App',
  description: 'theLeadershipWell coaching platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen font-sans antialiased" style={{background:"#DDD9D3",color:"#111226"}}>
        {children}
      </body>
    </html>
  )
}
