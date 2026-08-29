'use client'

import { formatDate } from '@/lib/utils'
import { FileSpreadsheet, Layers, ShieldCheck, CheckCircle2, Megaphone } from 'lucide-react'

interface LeadImportRow {
  id: string
  filename: string | null
  total_rows: number
  new_leads: number
  duplicate_leads: number
  imported_at: string
  campaigns?: {
    name: string
  } | null
}

interface LeadImportsHistoryProps {
  imports: LeadImportRow[]
}

export function LeadImportsHistory({ imports }: LeadImportsHistoryProps) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-800 overflow-hidden bg-zinc-950/60 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 font-medium">
              <tr>
                <th className="px-5 py-3.5">Uploaded File</th>
                <th className="px-5 py-3.5">Campaign Attached</th>
                <th className="px-5 py-3.5 text-center">Total Rows</th>
                <th className="px-5 py-3.5 text-center">New Leads</th>
                <th className="px-5 py-3.5 text-center">Duplicates Skipped</th>
                <th className="px-5 py-3.5 text-right">Imported At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
              {imports.length > 0 ? (
                imports.map((imp) => (
                  <tr key={imp.id} className="hover:bg-zinc-900/30 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                          <FileSpreadsheet className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="font-semibold text-zinc-100 block">
                            {imp.filename || 'manual_upload.csv'}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            ID: {imp.id.slice(0, 8)}...
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      {imp.campaigns?.name ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                          <Megaphone className="w-3 h-3 text-indigo-400" />
                          {imp.campaigns.name}
                        </span>
                      ) : (
                        <span className="text-zinc-500 text-[11px]">—</span>
                      )}
                    </td>

                    <td className="px-5 py-4 text-center font-mono font-semibold text-zinc-200">
                      {imp.total_rows}
                    </td>

                    <td className="px-5 py-4 text-center font-mono font-semibold text-emerald-400">
                      +{imp.new_leads}
                    </td>

                    <td className="px-5 py-4 text-center font-mono font-semibold text-amber-400">
                      {imp.duplicate_leads}
                    </td>

                    <td className="px-5 py-4 text-right text-[11px] text-zinc-400">
                      {formatDate(imp.imported_at)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-zinc-400 space-y-1">
                    <p className="text-xs">No spreadsheet imports recorded yet.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
