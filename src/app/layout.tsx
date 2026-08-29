import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/components/auth/AuthContext'
import { AppShell } from '@/components/AppShell'

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
})

const mono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Outreach Smart — Cold Outreach Automation',
  description:
    'Single-operator automated cold outreach dashboard with Google Workspace service accounts and Telegram reply notifications.',
  icons: {
    icon: 'https://mrq02oy9yi.ufs.sh/f/MjT0Ey7Y1AFNzyS19holOKFg4YUPbhoNxnpX0Zt6udeED2sS',
    shortcut: 'https://mrq02oy9yi.ufs.sh/f/MjT0Ey7Y1AFNzyS19holOKFg4YUPbhoNxnpX0Zt6udeED2sS',
    apple: 'https://mrq02oy9yi.ufs.sh/f/MjT0Ey7Y1AFNzyS19holOKFg4YUPbhoNxnpX0Zt6udeED2sS',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} dark h-full antialiased`}>
      <body className="bg-zinc-950 text-zinc-100 font-sans min-h-full selection:bg-indigo-500/30 selection:text-indigo-200">
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  )
}
