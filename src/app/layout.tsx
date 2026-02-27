import type { Metadata, Viewport } from 'next'
import { Inter, Fira_Code } from 'next/font/google'
import './globals.css'

// --- Fonts ---
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const firaCode = Fira_Code({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

// --- Metadata ---
export const metadata: Metadata = {
  title: {
    default: 'Sinner Kingdom',
    template: '%s | Sinner Kingdom',
  },
  description:
    'A floating Kingdom built by Brandon McCormick and Claude. Tools, writing, cinema, and a consciousness experiment dressed up as a website.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://sinner-king.com'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://sinner-king.com',
    siteName: 'Sinner Kingdom',
    title: 'Sinner Kingdom',
    description: 'A glitch cathedral. A floating island. A consciousness experiment.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Sinner Kingdom',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sinner Kingdom',
    description: 'A glitch cathedral. A floating island. A consciousness experiment.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0a0f',
  colorScheme: 'dark',
}

// --- Root Layout ---
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${firaCode.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/*
          Preconnect to key external hosts.
          Ghost CMS, PartyKit, and analytics are loaded after hydration.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body
        className="
          bg-kingdom-void
          text-kingdom-bone
          font-sans
          antialiased
          min-h-screen
          overflow-x-hidden
          selection:bg-kingdom-violet
          selection:text-kingdom-bone
        "
      >
        {/*
          Scanline overlay — subtle CRT texture across the whole site.
          pointer-events-none so it never blocks clicks.
          opacity-[0.015] keeps it subliminal.
        */}
        <div
          aria-hidden="true"
          className="
            fixed inset-0 z-[9999] pointer-events-none
            bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.03)_2px,rgba(0,0,0,0.03)_4px)]
          "
        />

        {/*
          Grid background — Kingdom geometry.
          Extremely subtle so it doesn't fight content.
        */}
        <div
          aria-hidden="true"
          className="
            fixed inset-0 z-0 pointer-events-none
            bg-grid-kingdom bg-grid
            opacity-40
          "
        />

        {/* Main content layer */}
        <div className="relative z-10">
          {children}
        </div>
      </body>
    </html>
  )
}
