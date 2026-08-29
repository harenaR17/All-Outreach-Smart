'use client'

import React, { useState, useEffect } from 'react'
import { getSetupStatus } from '@/app/actions/setup'
import { StepSupabase } from '@/components/setup/StepSupabase'
import { StepMigration } from '@/components/setup/StepMigration'
import { StepAdminUser } from '@/components/setup/StepAdminUser'
import { StepIntegrations } from '@/components/setup/StepIntegrations'
import { StepEdgeFunctions } from '@/components/setup/StepEdgeFunctions'
import { Send, Database, Layers, UserCheck, Sparkles, Rocket, Check, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

const STEPS = [
  { id: 1, label: 'Supabase', icon: Database },
  { id: 2, label: 'Migration', icon: Layers },
  { id: 3, label: 'Admin', icon: UserCheck },
  { id: 4, label: 'Integrations', icon: Sparkles },
  { id: 5, label: 'Edge & Deploy', icon: Rocket },
]

export default function SetupPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(1)
  const [initialLoading, setInitialLoading] = useState(true)

  const [formData, setFormData] = useState({
    supabaseUrl: '',
    supabaseAnonKey: '',
    supabaseServiceRoleKey: '',
    dbConnectionString: '',
    cronSecret: '',
    adminEmail: '',
    adminPassword: '',
    geminiApiKey: '',
    telegramBotToken: '',
    telegramChatId: '',
  })

  const updateFormData = (data: Partial<typeof formData>) => {
    setFormData((prev) => ({ ...prev, ...data }))
  }

  // Generate initial random cron secret on client mount
  useEffect(() => {
    const randomBytes = new Uint8Array(24)
    if (typeof window !== 'undefined' && window.crypto) {
      window.crypto.getRandomValues(randomBytes)
      const secret = Array.from(randomBytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
      setFormData((prev) => ({
        ...prev,
        cronSecret: prev.cronSecret || secret,
      }))
    }

    // Check if system is already configured
    getSetupStatus().then((status) => {
      if (status.isConfigured && status.isDatabaseReady && status.hasAdminUser) {
        // Already fully configured, bounce to dashboard
        router.push('/')
      } else {
        if (status.supabaseUrl) {
          setFormData((prev) => ({ ...prev, supabaseUrl: status.supabaseUrl || '' }))
        }
        setInitialLoading(false)
      }
    }).catch(() => {
      setInitialLoading(false)
    })
  }, [router])

  if (initialLoading) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-blue-500 to-cyan-400 p-[1px] shadow-xl shadow-indigo-500/20 animate-pulse">
          <div className="w-full h-full bg-zinc-950 rounded-[15px] flex items-center justify-center">
            <Send className="w-5 h-5 text-indigo-400" />
          </div>
        </div>
        <div className="flex items-center gap-2 text-zinc-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
          <span>Checking system configuration...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-2xl">
      {/* Header Branding */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium mb-4 shadow-inner">
          <Send className="w-3.5 h-3.5 text-indigo-400" />
          <span>Outreach Smart &bull; Setup Wizard</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100">
          Infrastructure Initialization
        </h1>
        <p className="text-sm text-zinc-400 mt-2 max-w-md mx-auto">
          Get your cold outreach engine ready with automated database migrations, credentials, and background workers.
        </p>
      </div>

      {/* Step Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between relative">
          {/* Connector Line */}
          <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-[2px] bg-zinc-800 -z-0" />
          <div
            className="absolute left-6 top-1/2 -translate-y-1/2 h-[2px] bg-gradient-to-r from-indigo-500 to-blue-500 transition-all duration-500 -z-0"
            style={{
              width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%`,
              maxWidth: 'calc(100% - 3rem)',
            }}
          />

          {STEPS.map((step) => {
            const isCompleted = currentStep > step.id
            const isCurrent = currentStep === step.id
            const StepIcon = step.icon

            return (
              <div key={step.id} className="relative z-10 flex flex-col items-center">
                <button
                  type="button"
                  disabled={step.id > currentStep}
                  onClick={() => step.id < currentStep && setCurrentStep(step.id)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300 ${
                    isCompleted
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25 ring-2 ring-indigo-500/50 cursor-pointer'
                      : isCurrent
                      ? 'bg-zinc-900 border-2 border-indigo-500 text-indigo-300 shadow-xl shadow-indigo-500/20 scale-110'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-600'
                  }`}
                >
                  {isCompleted ? <Check className="w-4 h-4 stroke-[2.5]" /> : <StepIcon className="w-4 h-4" />}
                </button>
                <span
                  className={`text-[11px] font-medium mt-2 transition-colors hidden sm:block ${
                    isCurrent ? 'text-indigo-300' : isCompleted ? 'text-zinc-300' : 'text-zinc-600'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Main Glassmorphic Card */}
      <div className="bg-zinc-900/70 border border-zinc-800/80 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl shadow-black/40">
        {currentStep === 1 && (
          <StepSupabase
            formData={formData}
            updateFormData={updateFormData}
            onNext={() => setCurrentStep(2)}
          />
        )}

        {currentStep === 2 && (
          <StepMigration
            formData={formData}
            onNext={() => setCurrentStep(3)}
            onBack={() => setCurrentStep(1)}
          />
        )}

        {currentStep === 3 && (
          <StepAdminUser
            formData={formData}
            updateFormData={updateFormData}
            onNext={() => setCurrentStep(4)}
            onBack={() => setCurrentStep(2)}
          />
        )}

        {currentStep === 4 && (
          <StepIntegrations
            formData={formData}
            updateFormData={updateFormData}
            onNext={() => setCurrentStep(5)}
            onBack={() => setCurrentStep(3)}
          />
        )}

        {currentStep === 5 && (
          <StepEdgeFunctions
            formData={formData}
            onBack={() => setCurrentStep(4)}
          />
        )}
      </div>
    </div>
  )
}
