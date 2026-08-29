'use client'

import { useState } from 'react'
import { Check, Copy, Terminal, Code, FileCode } from 'lucide-react'

interface CodeSnippetProps {
  title?: string
  snippets: {
    language: string
    label: string
    code: string
  }[]
  defaultLang?: string
}

export function CodeSnippet({ title, snippets, defaultLang }: CodeSnippetProps) {
  const [activeLang, setActiveLang] = useState(defaultLang || snippets[0]?.language || 'curl')
  const [copied, setCopied] = useState(false)

  const activeSnippet = snippets.find((s) => s.language === activeLang) || snippets[0]

  const handleCopy = async () => {
    if (!activeSnippet) return
    try {
      await navigator.clipboard.writeText(activeSnippet.code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  const getLanguageIcon = (lang: string) => {
    switch (lang) {
      case 'curl':
      case 'bash':
        return <Terminal className="w-3.5 h-3.5 text-emerald-400" />
      case 'javascript':
      case 'typescript':
      case 'js':
      case 'ts':
        return <Code className="w-3.5 h-3.5 text-amber-400" />
      case 'python':
        return <FileCode className="w-3.5 h-3.5 text-blue-400" />
      case 'json':
        return <FileCode className="w-3.5 h-3.5 text-violet-400" />
      default:
        return <Code className="w-3.5 h-3.5 text-zinc-400" />
    }
  }

  return (
    <div className="rounded-xl bg-zinc-950 border border-zinc-800/90 overflow-hidden shadow-lg shadow-black/40">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-900/80 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          {title && <span className="text-xs font-semibold text-zinc-300 mr-2">{title}</span>}
          {/* Tabs */}
          <div className="flex items-center gap-1 bg-zinc-950/60 p-0.5 rounded-lg border border-zinc-800/70">
            {snippets.map((snip) => {
              const isActive = snip.language === activeLang
              return (
                <button
                  key={snip.language}
                  onClick={() => setActiveLang(snip.language)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                    isActive
                      ? 'bg-zinc-800 text-zinc-100 shadow-sm border border-zinc-700/60 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50'
                  }`}
                >
                  {getLanguageIcon(snip.language)}
                  <span>{snip.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Copy button */}
        <button
          onClick={handleCopy}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
            copied
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              : 'bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 border border-zinc-700/60 hover:text-white'
          }`}
          title="Copy code snippet"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span className="text-[11px]">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>

      {/* Code body */}
      <div className="p-4 overflow-x-auto">
        <pre className="text-xs font-mono leading-relaxed text-zinc-200 selection:bg-indigo-500/30 selection:text-indigo-200">
          <code>{activeSnippet?.code}</code>
        </pre>
      </div>
    </div>
  )
}
