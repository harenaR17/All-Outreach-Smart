'use client'

import React, { useState } from 'react'
import { testIntegrations } from '@/app/actions/setup'
import { Bot, Sparkles, Send, CheckCircle2, AlertCircle, Loader2, ArrowRight, ArrowLeft, ExternalLink } from 'lucide-react'

interface StepIntegrationsProps {
  formData: {
    geminiApiKey: string
    telegramBotToken: string
    telegramChatId: string
  }
  updateFormData: (data: Partial<StepIntegrationsProps['formData']>) => void
  onNext: () => void
  onBack: () => void
}

export function StepIntegrations({ formData, updateFormData, onNext, onBack }: StepIntegrationsProps) {
  const [testing, setTesting] = useState(false)
  const [geminiResult, setGeminiResult] = useState<{ success: boolean; model?: string; error?: string } | null>(null)
  const [telegramResult, setTelegramResult] = useState<{ success: boolean; botName?: string; error?: string } | null>(null)

  const handleTest = async () => {
    setTesting(true)
    setGeminiResult(null)
    setTelegramResult(null)

    try {
      const res = await testIntegrations({
        geminiApiKey: formData.geminiApiKey,
        telegramBotToken: formData.telegramBotToken,
        telegramChatId: formData.telegramChatId,
      })

      if (res.gemini) setGeminiResult(res.gemini)
      if (res.telegram) setTelegramResult(res.telegram)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-xl font-semibold text-zinc-100 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          AI & Alert Integrations <span className="text-xs font-normal text-zinc-500">(Optional)</span>
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          Configure Google Gemini for automated reply classification and Telegram for real-time lead alerts. You can also configure these later in Settings.
        </p>
      </div>

      <div className="space-y-5">
        {/* Gemini API Key */}
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-zinc-300 uppercase tracking-wider flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              Google Gemini API Key
            </label>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition"
            >
              Get Free Key <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          <input
            type="password"
            placeholder="AIzaSy..."
            value={formData.geminiApiKey}
            onChange={(e) => {
              updateFormData({ geminiApiKey: e.target.value })
              setGeminiResult(null)
            }}
            className="w-full bg-zinc-900/90 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 transition font-mono"
          />
          {geminiResult && (
            <div className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
              geminiResult.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}>
              {geminiResult.success ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Gemini API verified: Active</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                  <span>{geminiResult.error}</span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Telegram Bot */}
        <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-4 space-y-3">
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
          <input
            type="password"
            placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ..."
            value={formData.telegramBotToken}
            onChange={(e) => {
              updateFormData({ telegramBotToken: e.target.value })
              setTelegramResult(null)
            }}
            className="w-full bg-zinc-900/90 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 transition font-mono"
          />

          <div>
            <label className="block text-xs font-medium text-zinc-400 uppercase tracking-wider mb-1.5">
              Your Telegram Chat ID (For Test Notification)
            </label>
            <input
              type="text"
              placeholder="e.g. 12345678"
              value={formData.telegramChatId}
              onChange={(e) => updateFormData({ telegramChatId: e.target.value })}
              className="w-full bg-zinc-900/90 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2 text-xs text-zinc-100 placeholder:text-zinc-600 transition font-mono"
            />
          </div>

          {telegramResult && (
            <div className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
              telegramResult.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}>
              {telegramResult.success ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Telegram Connected ({telegramResult.botName})</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-rose-400" />
                  <span>{telegramResult.error}</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
        <button
          type="button"
          onClick={onBack}
          disabled={testing}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-sm font-medium transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-3">
          {(formData.geminiApiKey || formData.telegramBotToken) && (
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 text-sm font-medium transition disabled:opacity-50 cursor-pointer"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin text-indigo-400" /> : <Send className="w-4 h-4 text-zinc-400" />}
              <span>{testing ? 'Verifying...' : 'Test Integrations'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onNext}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-sm font-medium shadow-lg shadow-indigo-500/20 transition cursor-pointer"
          >
            <span>{formData.geminiApiKey || formData.telegramBotToken ? 'Next: Edge Functions' : 'Skip & Continue'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
