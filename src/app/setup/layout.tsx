import React from 'react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Outreach Smart Setup Wizard — Quick Start',
  description: 'Zero-configuration database initialization, admin user creation, and integration setup.',
}

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-between selection:bg-indigo-500/30 selection:text-indigo-200">
      <div className="w-full flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        {children}
      </div>
      <footer className="py-4 text-center text-xs text-zinc-600 border-t border-zinc-900/50">
        Outreach Smart &bull; Automated Cold Outreach Infrastructure
      </footer>
    </div>
  )
}
