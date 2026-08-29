'use client'

import React, { useState } from 'react'
import { createAdminUser } from '@/app/actions/setup'
import { UserCheck, Lock, Mail, CheckCircle2, AlertCircle, Loader2, ArrowRight, ArrowLeft } from 'lucide-react'

interface StepAdminUserProps {
  formData: {
    supabaseUrl: string
    supabaseServiceRoleKey: string
    adminEmail: string
    adminPassword: string
  }
  updateFormData: (data: Partial<StepAdminUserProps['formData']>) => void
  onNext: () => void
  onBack: () => void
}

export function StepAdminUser({ formData, updateFormData, onNext, onBack }: StepAdminUserProps) {
  const [confirmPassword, setConfirmPassword] = useState(formData.adminPassword || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!formData.adminEmail || !formData.adminEmail.includes('@')) {
      setError('Please enter a valid email address.')
      return
    }

    if (!formData.adminPassword || formData.adminPassword.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }

    if (formData.adminPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      const res = await createAdminUser({
        supabaseUrl: formData.supabaseUrl,
        supabaseServiceRoleKey: formData.supabaseServiceRoleKey,
        email: formData.adminEmail,
        password: formData.adminPassword,
      })

      if (res.success) {
        setSuccess(true)
      } else {
        setError(res.error || 'Failed to create admin user.')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Execution error.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleCreate} className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h2 className="text-xl font-semibold text-zinc-100 flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-indigo-400" />
          Create Operator Account
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          Sets up the primary admin credentials in Supabase Auth. The account is auto-confirmed so you can log in immediately.
        </p>
      </div>

      <div className="space-y-4">
        {/* Email */}
        <div>
          <label className="block text-xs font-medium text-zinc-300 uppercase tracking-wider mb-1.5">
            Admin Email Address <span className="text-rose-400">*</span>
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="email"
              required
              placeholder="operator@company.com"
              value={formData.adminEmail}
              onChange={(e) => {
                updateFormData({ adminEmail: e.target.value })
                setSuccess(false)
              }}
              className="w-full bg-zinc-900/90 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 transition-all"
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label className="block text-xs font-medium text-zinc-300 uppercase tracking-wider mb-1.5">
            Admin Password <span className="text-rose-400">*</span>
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="password"
              required
              minLength={8}
              placeholder="••••••••••••"
              value={formData.adminPassword}
              onChange={(e) => {
                updateFormData({ adminPassword: e.target.value })
                setSuccess(false)
              }}
              className="w-full bg-zinc-900/90 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 transition-all font-mono"
            />
          </div>
          <p className="text-[11px] text-zinc-500 mt-1">Minimum 8 characters.</p>
        </div>

        {/* Confirm Password */}
        <div>
          <label className="block text-xs font-medium text-zinc-300 uppercase tracking-wider mb-1.5">
            Confirm Password <span className="text-rose-400">*</span>
          </label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="password"
              required
              placeholder="••••••••••••"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value)
                setSuccess(false)
              }}
              className="w-full bg-zinc-900/90 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl pl-10 pr-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 transition-all font-mono"
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3 text-rose-300 text-xs animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Error Creating Admin</p>
            <p className="text-rose-400 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3 text-emerald-300 text-xs animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <div>
            <p className="font-medium">Admin Account Created & Auto-Confirmed!</p>
            <p className="text-emerald-400/80 mt-0.5">Ready for instant login to the dashboard.</p>
          </div>
        </div>
      )}

      {/* Buttons */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80">
        <button
          type="button"
          onClick={onBack}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-sm font-medium transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-3">
          {!success ? (
            <button
              type="submit"
              disabled={loading || !formData.adminEmail || !formData.adminPassword || formData.adminPassword.length < 8}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition shadow-lg shadow-indigo-500/20 disabled:opacity-50 cursor-pointer"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : <UserCheck className="w-4 h-4" />}
              <span>{loading ? 'Creating Account...' : 'Create Account'}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onNext}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white text-sm font-medium shadow-lg shadow-indigo-500/20 transition cursor-pointer"
            >
              <span>Next: Integrations (Optional)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </form>
  )
}
