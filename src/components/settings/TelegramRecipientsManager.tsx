'use client'

import { useState, useTransition } from 'react'
import { Send, Plus, Trash2, CheckCircle2, AlertCircle, Loader2, Info, Check, MessageSquare, KeyRound, Eye, EyeOff, Bot, ExternalLink } from 'lucide-react'
import type { TelegramRecipient } from '@/lib/types/database'
import {
  addTelegramRecipient,
  toggleTelegramRecipient,
  deleteTelegramRecipient,
  testTelegramNotification,
} from '@/app/actions/settings'

interface Props {
  initialRecipients: TelegramRecipient[]
}

export function TelegramRecipientsManager({ initialRecipients }: Props) {
  const [recipients, setRecipients] = useState<TelegramRecipient[]>(initialRecipients)
  const [isPending, startTransition] = useTransition()

  // Form state
  const [label, setLabel] = useState('')
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [showBotToken, setShowBotToken] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [testingChatId, setTestingChatId] = useState<string | null>(null)

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault()
    if (!botToken.trim()) {
      setFeedback({ type: 'error', message: 'Telegram Bot Token is required (from @BotFather).' })
      return
    }
    if (!chatId.trim()) {
      setFeedback({ type: 'error', message: 'Telegram Chat ID is required.' })
      return
    }

    setFeedback(null)
    startTransition(async () => {
      const res = await addTelegramRecipient({ label, botToken, chatId })
      if (res.success) {
        setFeedback({
          type: 'success',
          message: '✅ Telegram bot verified & welcome confirmation alert sent to your Telegram chat!',
        })
        setLabel('')
        setBotToken('')
        setChatId('')
        setRecipients((prev) => [
          {
            id: crypto.randomUUID(),
            label: label.trim() || null,
            bot_token: botToken.trim(),
            chat_id: chatId.trim(),
            is_active: true,
            created_at: new Date().toISOString(),
          },
          ...prev,
        ])
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to add recipient.' })
      }
    })
  }

  const handleToggle = (id: string, current: boolean) => {
    const next = !current
    setRecipients((prev) => prev.map((r) => (r.id === id ? { ...r, is_active: next } : r)))
    startTransition(async () => {
      await toggleTelegramRecipient(id, next)
    })
  }

  const handleDelete = (id: string, labelText?: string | null) => {
    if (!confirm(`Remove Telegram recipient ${labelText || 'entry'}?`)) return
    setRecipients((prev) => prev.filter((r) => r.id !== id))
    startTransition(async () => {
      await deleteTelegramRecipient(id)
    })
  }

  const handleTestNotification = async (recipient: TelegramRecipient) => {
    setTestingChatId(recipient.id)
    setFeedback(null)
    const res = await testTelegramNotification(recipient.bot_token, recipient.chat_id)
    setTestingChatId(null)
    if (res.success) {
      setFeedback({
        type: 'success',
        message: `✅ Telegram test message sent to ${recipient.label || recipient.chat_id}! Check your Telegram chat.`,
      })
    } else {
      setFeedback({
        type: 'error',
        message: `❌ ${res.error || 'Failed to send Telegram test message'}`,
      })
    }
  }

  return (
    <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center">
              <Send className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-zinc-100">Telegram Notification Bots & Associates</h2>
          </div>
          <p className="text-xs text-zinc-400">
            Connect any number of associate Telegram bots and chat IDs. Assign them to specific outreach campaigns or all campaigns.
          </p>
        </div>
      </div>

      {/* Bot Chat ID instructions */}
      <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-sky-950/20 border border-sky-500/20 text-[11px] text-sky-300 leading-relaxed">
        <Info className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
        <div className="space-y-1">
          <p>
            <strong>Setup instructions:</strong>
          </p>
          <ul className="list-disc pl-4 space-y-0.5 text-sky-300/90">
            <li><strong>Bot Token:</strong> Create a bot with <code>@BotFather</code> on Telegram and copy the API token (e.g. <code>7123456789:AA...</code>).</li>
            <li><strong>Chat ID:</strong> Start a chat with your bot, then use <code>@userinfobot</code> in Telegram to find your numeric Chat ID.</li>
          </ul>
        </div>
      </div>

      {/* Add Form */}
      <form onSubmit={handleAdd} className="space-y-3 bg-zinc-950/40 p-4 rounded-xl border border-zinc-800/80">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-zinc-300 uppercase tracking-wider flex items-center gap-2">
            <Bot className="w-4 h-4 text-blue-400" />
            Telegram Bot Token
          </label>
          <a
            href="https://t.me/BotFather"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition"
          >
            @BotFather <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-4">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Associate / Label (e.g. Alex - Lead)"
              disabled={isPending}
              className="w-full px-3.5 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
            />
          </div>
          <div className="sm:col-span-4">
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <input
                type={showBotToken ? 'text' : 'password'}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="Telegram Bot Token (from @BotFather)"
                disabled={isPending}
                className="w-full pl-9 pr-9 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowBotToken(!showBotToken)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                {showBotToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <div className="sm:col-span-3">
            <div className="relative">
              <MessageSquare className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <input
                type="text"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="Chat ID (e.g. 123456789)"
                disabled={isPending}
                className="w-full pl-9 pr-3.5 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 font-mono"
              />
            </div>
          </div>
          <div className="sm:col-span-1">
            <button
              type="submit"
              disabled={isPending || !chatId.trim() || !botToken.trim()}
              className="w-full py-2 px-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-xs font-medium text-white transition-all flex items-center justify-center gap-1 cursor-pointer shadow-md shadow-sky-600/20"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span className="hidden sm:inline">Connecting...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Feedback */}
      {feedback && (
        <div
          className={`flex items-center gap-2 p-3 rounded-xl text-xs border ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span className="flex-1">{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="text-current opacity-60 hover:opacity-100 text-[10px]">
            ✕
          </button>
        </div>
      )}

      {/* Recipients List */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-zinc-400 px-1">Configured Bots & Associates ({recipients.length})</div>

        {recipients.length > 0 ? (
          <div className="divide-y divide-zinc-800/60 rounded-xl border border-zinc-800 overflow-hidden bg-zinc-950/40">
            {recipients.map((r) => (
              <div
                key={r.id}
                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-900/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleToggle(r.id, r.is_active)}
                    className={`w-4 h-4 rounded border flex items-center justify-center transition-colors cursor-pointer ${
                      r.is_active
                        ? 'bg-emerald-600 border-emerald-500 text-white'
                        : 'bg-zinc-900 border-zinc-700 text-transparent'
                    }`}
                    title={r.is_active ? 'Active' : 'Inactive'}
                  >
                    <Check className="w-3 h-3" />
                  </button>

                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-zinc-200">{r.label || 'Unnamed Associate'}</span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-medium border ${
                          r.is_active
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                        }`}
                      >
                        {r.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-500">
                      <span>Chat ID: {r.chat_id}</span>
                      <span>•</span>
                      <span>Bot: {r.bot_token ? `${r.bot_token.slice(0, 8)}••••••••` : 'Missing Token'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => handleTestNotification(r)}
                    disabled={testingChatId === r.id}
                    className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] font-medium text-zinc-300 transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    {testingChatId === r.id ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin text-sky-400" />
                        <span>Testing...</span>
                      </>
                    ) : (
                      <span>Test Bot</span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDelete(r.id, r.label)}
                    className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                    title="Remove recipient"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-zinc-500 p-4 rounded-xl bg-zinc-950/20 border border-dashed border-zinc-800 text-center">
            No Telegram bots configured. Add an associate bot token and chat ID to receive instant alerts when leads reply.
          </p>
        )}
      </div>
    </div>
  )
}
