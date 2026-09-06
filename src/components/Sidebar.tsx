'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Mail,
  Users,
  Megaphone,
  Activity,
  Settings,
  Send,
  Code2,
  Layers,
  Lock,
  Terminal,
  Sparkles,
  Workflow,
  Database,
  ChevronDown,
  Inbox,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: LayoutDashboard, badge: 'Phase 0' },
  { href: '/inboxes', label: 'Inboxes', icon: Mail, badge: 'Phase 1' },
  { href: '/leads', label: 'Leads & Import', icon: Users, badge: 'Phase 2' },
  { href: '/campaigns', label: 'Campaigns', icon: Megaphone, badge: 'Phase 3' },
  { href: '/activity', label: 'Live Activity', icon: Activity, badge: 'Phase 4' },
  { href: '/smartbox', label: 'SmartBox', icon: Inbox, badge: 'Phase 5' },
  { href: '/settings', label: 'Settings & Telegram', icon: Settings, badge: 'Phase 5' },
  { href: '/api-docs', label: 'API Documentation', icon: Code2, badge: 'REST' },
]

const API_DOCS_SECTIONS = [
  { id: 'overview', label: 'Overview & Quickstart', icon: Layers },
  { id: 'auth', label: 'Authentication', icon: Lock },
  { id: 'endpoints', label: 'Endpoints Directory', icon: Terminal },
  { id: 'playground', label: 'Interactive Playground', icon: Sparkles },
  { id: 'automations', label: 'Automations (n8n / Zapier)', icon: Workflow },
  { id: 'models', label: 'Schemas & Guarantees', icon: Database },
]

export function Sidebar() {
  const pathname = usePathname()
  const isApiDocs = pathname === '/api-docs'
  const [activeSection, setActiveSection] = useState('overview')

  useEffect(() => {
    if (!isApiDocs) return

    const handleScroll = () => {
      const scrollPosition = window.scrollY + 140
      for (const section of API_DOCS_SECTIONS) {
        const el = document.getElementById(section.id)
        if (el) {
          const top = el.offsetTop
          const height = el.offsetHeight
          if (scrollPosition >= top && scrollPosition < top + height) {
            setActiveSection(section.id)
            break
          }
        }
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => window.removeEventListener('scroll', handleScroll)
  }, [isApiDocs])

  const scrollToSection = (id: string) => {
    setActiveSection(id)
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      window.history.replaceState(null, '', `/api-docs#${id}`)
    }
  }

  return (
    <aside className="w-64 bg-zinc-950/90 border-r border-zinc-800/80 flex flex-col justify-between shrink-0 h-screen fixed top-0 left-0 bottom-0 z-40 backdrop-blur-xl">
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        {/* Brand Header */}
        <div className="h-16 px-6 flex items-center gap-3 border-b border-zinc-800/80 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-blue-500 to-cyan-400 p-[1px] shadow-lg shadow-indigo-500/20 flex items-center justify-center">
            <div className="w-full h-full bg-zinc-950 rounded-[11px] flex items-center justify-center">
              <Send className="w-4 h-4 text-indigo-400" />
            </div>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-zinc-100 tracking-tight flex items-center gap-1.5">
              Outreach Smart
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                v0.1
              </span>
            </h1>
            <p className="text-[11px] text-zinc-400 font-mono">thereachsmart.net</p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1 flex-1 overflow-y-auto">
          {/* <div className="px-3 py-2 text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
            Main Navigation
          </div> */}
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href

            return (
              <div key={item.href} className="space-y-1">
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all group',
                    isActive
                      ? 'bg-zinc-800/90 text-zinc-100 shadow-sm border border-zinc-700/60'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/80'
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon
                      className={cn(
                        'w-4 h-4 transition-colors',
                        isActive ? 'text-indigo-400' : 'text-zinc-400 group-hover:text-zinc-300'
                      )}
                    />
                    <span>{item.label}</span>
                  </div>

                  {item.href === '/api-docs' && (
                    <span
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded transition-colors flex items-center gap-1',
                        isActive
                          ? 'bg-indigo-500/20 text-indigo-300 font-semibold'
                          : 'bg-zinc-900 text-zinc-400 group-hover:text-zinc-300'
                      )}
                    >
                      {item.badge}
                      {isActive && <ChevronDown className="w-3 h-3 text-indigo-400" />}
                    </span>
                  )}
                </Link>

                {/* Nested API Documentation Subsections */}
                {item.href === '/api-docs' && isApiDocs && (
                  <div className="ml-4 pl-3 py-1 space-y-0.5 border-l border-zinc-800 animate-in fade-in slide-in-from-top-1 duration-200">
                    {API_DOCS_SECTIONS.map((sec) => {
                      const SecIcon = sec.icon
                      const isSecActive = activeSection === sec.id

                      return (
                        <button
                          key={sec.id}
                          onClick={() => scrollToSection(sec.id)}
                          className={cn(
                            'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all text-left group',
                            isSecActive
                              ? 'text-indigo-300 bg-indigo-500/10 font-semibold border border-indigo-500/20 shadow-xs'
                              : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
                          )}
                        >
                          <SecIcon
                            className={cn(
                              'w-3 h-3 shrink-0 transition-colors',
                              isSecActive ? 'text-indigo-400' : 'text-zinc-500 group-hover:text-zinc-400'
                            )}
                          />
                          <span className="truncate">{sec.label}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
      </div>

      {/* Bottom Status Card */}
      <div className="p-4 m-3 rounded-xl bg-zinc-900/60 border border-zinc-800/80">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium text-zinc-400">Database Engine</span>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] text-emerald-400 font-medium">Connected</span>
          </div>
        </div>
        <div className="text-[11px] text-zinc-400 space-y-1">
          <div className="flex justify-between">
            <span>Region</span>
            <span className="font-mono text-zinc-300">eu-central-1</span>
          </div>
          <div className="flex justify-between">
            <span>Auth Mode</span>
            <span className="text-indigo-400 font-mono">Service-Role</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
