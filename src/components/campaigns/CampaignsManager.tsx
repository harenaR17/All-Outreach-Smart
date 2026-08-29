'use client'

import { useState } from 'react'
import { Plus, Megaphone, Search } from 'lucide-react'
import type { CampaignWithMeta } from '@/app/actions/campaigns'
import { deleteCampaign, pauseCampaign, launchCampaign } from '@/app/actions/campaigns'
import { CampaignCard } from './CampaignCard'
import { CreateCampaignModal } from './CreateCampaignModal'

interface Props {
  initialCampaigns: CampaignWithMeta[]
}

export function CampaignsManager({ initialCampaigns }: Props) {
  const [campaigns, setCampaigns] = useState<CampaignWithMeta[]>(initialCampaigns)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this campaign? All sequence steps and assignment associations will be deleted.')) {
      return
    }
    const res = await deleteCampaign(id)
    if (res.success) {
      setCampaigns((prev) => prev.filter((c) => c.id !== id))
    }
  }

  const handleTogglePause = async (id: string, currentStatus: string) => {
    if (currentStatus === 'active') {
      const res = await pauseCampaign(id)
      if (res.success) {
        setCampaigns((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: 'paused' } : c))
        )
      }
    } else if (currentStatus === 'paused') {
      const res = await launchCampaign(id)
      if (res.success) {
        setCampaigns((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: 'active' } : c))
        )
      }
    }
  }

  const filtered = campaigns.filter((c) => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6">
      {/* Action Header / Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search campaigns..."
              className="w-full pl-9 pr-3.5 py-2 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-indigo-500/70 focus:ring-2 focus:ring-indigo-500/20 text-xs text-zinc-100 placeholder-zinc-500 outline-none transition-all"
            />
          </div>

          <div className="flex items-center gap-1 bg-zinc-900/60 p-1 rounded-lg border border-zinc-800">
            {['all', 'draft', 'active', 'paused', 'completed'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize transition-all cursor-pointer ${
                  statusFilter === st
                    ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-600/20 cursor-pointer shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Campaign</span>
        </button>
      </div>

      {/* Campaign Cards Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onDelete={handleDelete}
              onTogglePause={handleTogglePause}
            />
          ))}
        </div>
      ) : (
        <div className="p-12 rounded-2xl bg-zinc-900/20 border border-dashed border-zinc-800 text-center space-y-3">
          <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-500 flex items-center justify-center mx-auto">
            <Megaphone className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-zinc-300">
              {search || statusFilter !== 'all' ? 'No campaigns match your filters' : 'No outreach campaigns created yet'}
            </p>
            <p className="text-[11px] text-zinc-500">
              Create your first campaign to configure email sequence steps, delays, and assign inbox pools.
            </p>
          </div>
          {!search && statusFilter === 'all' && (
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Campaign
            </button>
          )}
        </div>
      )}

      <CreateCampaignModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
    </div>
  )
}
