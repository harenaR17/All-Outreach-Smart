'use client'

import { useState } from 'react'
import type { Lead, Campaign } from '@/lib/types/database'
import { LeadsTable } from './LeadsTable'
import { LeadImportsHistory } from './LeadImportsHistory'
import { ImportLeadsModal } from './ImportLeadsModal'
import { AddLeadModal } from './AddLeadModal'
import {
  Users,
  UploadCloud,
  ShieldBan,
  ShieldCheck,
  History,
  FileSpreadsheet,
  Plus,
  UserPlus,
  Sparkles
} from 'lucide-react'

interface LeadsManagerProps {
  initialLeads: Lead[]
  imports: any[]
  campaigns: Campaign[]
}

export function LeadsManager({
  initialLeads,
  imports,
  campaigns,
}: LeadsManagerProps) {
  const [activeTab, setActiveTab] = useState<'leads' | 'history'>('leads')
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isAddLeadModalOpen, setIsAddLeadModalOpen] = useState(false)

  const activeCount = initialLeads.filter((l) => l.status === 'active').length
  const dncCount = initialLeads.filter((l) => l.status === 'do_not_contact').length
  const bouncedCount = initialLeads.filter((l) => l.status === 'bounced').length

  return (
    <div className="space-y-6">
      {/* Top Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Global Leads Pool</span>
            <Users className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100">{initialLeads.length}</div>
          <p className="text-[11px] text-zinc-400">Total deduplicated contacts</p>
        </div>

        <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Active Outreach Target</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">{activeCount}</div>
          <p className="text-[11px] text-zinc-400">Eligible for campaign sequences</p>
        </div>

        <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Do Not Contact / Bounced</span>
            <ShieldBan className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400">{dncCount + bouncedCount}</div>
          <p className="text-[11px] text-zinc-400">
            {dncCount} DNC • {bouncedCount} Bounced
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Spreadsheets Imported</span>
            <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-cyan-400">{imports.length}</div>
          <p className="text-[11px] text-zinc-400">Batch files ingested</p>
        </div>
      </div>

      {/* Main Tabs and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-zinc-900/30 border border-zinc-800/80">
        <div className="flex items-center gap-2 p-1 rounded-xl bg-zinc-950 border border-zinc-800">
          <button
            onClick={() => setActiveTab('leads')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'leads'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Global Leads Explorer ({initialLeads.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'history'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Import History ({imports.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setIsAddLeadModalOpen(true)}
            className="px-3.5 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-zinc-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-indigo-400" />
            <span>Add Single Lead</span>
          </button>

          <button
            onClick={() => setIsImportModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Upload Spreadsheet</span>
          </button>
        </div>
      </div>

      {/* Tab Views */}
      {activeTab === 'leads' ? (
        <LeadsTable initialLeads={initialLeads} campaigns={campaigns} />
      ) : (
        <LeadImportsHistory imports={imports} />
      )}

      {/* Add Single Lead Modal */}
      <AddLeadModal
        isOpen={isAddLeadModalOpen}
        onClose={() => setIsAddLeadModalOpen(false)}
        campaigns={campaigns}
      />

      {/* Import Modal */}
      <ImportLeadsModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        campaigns={campaigns}
      />
    </div>
  )
}
