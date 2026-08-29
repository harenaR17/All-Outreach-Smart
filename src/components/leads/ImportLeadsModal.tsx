'use client'

import { useState, useRef, useTransition } from 'react'
import type { Campaign } from '@/lib/types/database'
import {
  X,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Sparkles,
  ShieldCheck,
  Megaphone,
  Info,
  Link2,
  ExternalLink,
  FileSearch,
} from 'lucide-react'
import { parseSpreadsheet, type ParseResult } from '@/lib/leads/parser'
import { importLeads, type ImportSummary } from '@/app/actions/leads'
import { fetchAndParseGoogleSheet } from '@/app/actions/google-sheets'

interface ImportLeadsModalProps {
  isOpen: boolean
  onClose: () => void
  campaigns: Campaign[]
}

type ImportMode = 'file' | 'drive'

export function ImportLeadsModal({
  isOpen,
  onClose,
  campaigns,
}: ImportLeadsModalProps) {
  const [isPending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Tab / Mode
  const [mode, setMode] = useState<ImportMode>('file')

  // File upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  // Google Drive state
  const [driveUrl, setDriveUrl] = useState('')
  const [isFetchingSheet, setIsFetchingSheet] = useState(false)
  const [driveFetchError, setDriveFetchError] = useState<string | null>(null)
  const [driveFetchHint, setDriveFetchHint] = useState<string | null>(null)

  // Shared parsing / import state
  const [isParsing, setIsParsing] = useState(false)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('')
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (!isOpen) return null

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    setErrorMsg(null)
    setImportSummary(null)
    setIsParsing(true)
    const result = await parseSpreadsheet(file)
    setIsParsing(false)
    setParseResult(result)
    if (!result.success) setErrorMsg(result.error || 'Failed to parse file')
  }

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    setSelectedFile(file)
    setErrorMsg(null)
    setImportSummary(null)
    setIsParsing(true)
    const result = await parseSpreadsheet(file)
    setIsParsing(false)
    setParseResult(result)
    if (!result.success) setErrorMsg(result.error || 'Failed to parse file')
  }

  const handleFetchDriveSheet = async () => {
    if (!driveUrl.trim()) return
    setDriveFetchError(null)
    setDriveFetchHint(null)
    setParseResult(null)
    setImportSummary(null)
    setErrorMsg(null)
    setIsFetchingSheet(true)

    const res = await fetchAndParseGoogleSheet(driveUrl.trim())
    setIsFetchingSheet(false)

    if (!res.success || !res.parseResult) {
      setDriveFetchError(res.error || 'Failed to fetch spreadsheet')
      setDriveFetchHint(res.hint || null)
      return
    }

    setParseResult(res.parseResult)
    if (!res.parseResult.success) {
      setErrorMsg(res.parseResult.error || 'Failed to parse sheet')
    }
  }

  const handleImport = () => {
    if (!parseResult || !parseResult.success || parseResult.validLeads.length === 0) return
    setErrorMsg(null)
    startTransition(async () => {
      const res = await importLeads({
        filename: parseResult.filename,
        totalRowsFound: parseResult.totalRowsFound,
        leads: parseResult.validLeads,
        campaignId: selectedCampaignId || null,
      })
      if (res.success) {
        setImportSummary(res)
      } else {
        setErrorMsg(res.error || 'Import failed')
      }
    })
  }

  const handleReset = () => {
    setSelectedFile(null)
    setDriveUrl('')
    setParseResult(null)
    setImportSummary(null)
    setErrorMsg(null)
    setDriveFetchError(null)
    setDriveFetchHint(null)
    setSelectedCampaignId('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleClose = () => {
    handleReset()
    onClose()
  }

  const handleModeSwitch = (newMode: ImportMode) => {
    setMode(newMode)
    handleReset()
  }

  // ─── Sub-render: Import source UI ─────────────────────────────────────────

  const renderSourcePanel = () => {
    if (mode === 'file') {
      if (!selectedFile) {
        return (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-zinc-800 hover:border-indigo-500/60 rounded-2xl p-8 text-center space-y-3 cursor-pointer bg-zinc-950/40 hover:bg-zinc-900/30 transition-all group"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv"
              onChange={handleFileSelect}
              className="hidden"
            />
            <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 group-hover:border-indigo-500/40 group-hover:text-indigo-400 text-zinc-400 flex items-center justify-center mx-auto transition-colors">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-200 group-hover:text-indigo-300 transition-colors">
                Click to upload or drag &amp; drop spreadsheet
              </p>
              <p className="text-[11px] text-zinc-400">
                Supports CSV, XLSX, and XLS with automated header mapping
              </p>
            </div>
          </div>
        )
      }

      return (
        <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-zinc-200">{selectedFile.name}</div>
              <div className="text-[11px] text-zinc-400">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </div>
            </div>
          </div>
          <button
            onClick={handleReset}
            disabled={isPending}
            className="text-xs text-zinc-400 hover:text-zinc-200 px-2.5 py-1 rounded-md bg-zinc-800/80 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            Change File
          </button>
        </div>
      )
    }

    // ── Google Drive mode ──
    return (
      <div className="space-y-3">
        {/* Info callout */}
        <div className="p-3.5 rounded-xl bg-blue-950/20 border border-blue-500/20 text-[11px] text-blue-300 space-y-1 leading-relaxed">
          <div className="flex items-center gap-1.5 font-semibold text-blue-200 text-xs mb-1">
            <Info className="w-3.5 h-3.5 shrink-0" />
            How to share the spreadsheet
          </div>
          <p>
            Option A (recommended): Share the Google Sheet with your service account email
            (visible on the <strong>Inboxes</strong> page as &ldquo;Service Account Email&rdquo;).
          </p>
          <p>
            Option B: Set sharing to <strong>Anyone with the link → Viewer</strong> — no account
            needed.
          </p>
        </div>

        {/* URL Input row */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
            <input
              type="url"
              value={driveUrl}
              onChange={(e) => {
                setDriveUrl(e.target.value)
                setDriveFetchError(null)
                setDriveFetchHint(null)
                if (parseResult) setParseResult(null)
              }}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              disabled={isFetchingSheet || isPending}
              className="w-full pl-9 pr-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-indigo-500/70 focus:ring-2 focus:ring-indigo-500/20 text-xs text-zinc-100 placeholder-zinc-500 outline-none transition-all"
            />
          </div>
          <button
            type="button"
            onClick={handleFetchDriveSheet}
            disabled={!driveUrl.trim() || isFetchingSheet || isPending || parseResult?.success === true}
            className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-medium text-white flex items-center gap-2 shrink-0 transition-colors cursor-pointer"
          >
            {isFetchingSheet ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Fetching…</span>
              </>
            ) : (
              <>
                <FileSearch className="w-3.5 h-3.5" />
                <span>Load Sheet</span>
              </>
            )}
          </button>
        </div>

        {/* Fetch error */}
        {driveFetchError && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs space-y-1.5">
            <div className="flex items-start gap-2 text-rose-300">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-px" />
              <span>{driveFetchError}</span>
            </div>
            {driveFetchHint && (
              <p className="text-[11px] text-rose-300/70 pl-5">{driveFetchHint}</p>
            )}
          </div>
        )}

        {/* Fetched sheet source indicator */}
        {parseResult?.success && (
          <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-zinc-200 truncate">{parseResult.filename}</div>
              <div className="text-[11px] text-zinc-400">Fetched from Google Drive</div>
            </div>
            <a
              href={driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Open in Google Drive"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              onClick={handleReset}
              disabled={isPending}
              className="text-xs text-zinc-400 hover:text-zinc-200 px-2.5 py-1 rounded-md bg-zinc-800/80 hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              Clear
            </button>
          </div>
        )}
      </div>
    )
  }

  // ─── Parsed Preview (shared between file and drive modes) ──────────────────

  const renderParsedPreview = () => {
    if (!parseResult) return null

    if (isParsing || isFetchingSheet) {
      return (
        <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 flex items-center gap-2.5 text-xs text-zinc-400">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
          <span>Inspecting columns and headers…</span>
        </div>
      )
    }

    if (!parseResult.success) return null

    return (
      <div className="space-y-4">
        {/* Detection Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800">
            <span className="text-[10px] text-zinc-400">Total Rows</span>
            <div className="text-sm font-bold text-zinc-100">{parseResult.totalRowsFound}</div>
          </div>
          <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800">
            <span className="text-[10px] text-zinc-400">Detected Email Column</span>
            <div className="text-sm font-mono font-bold text-indigo-400 truncate">
              {parseResult.detectedEmailColumn}
            </div>
          </div>
          <div className="p-3 rounded-xl bg-zinc-900/40 border border-zinc-800">
            <span className="text-[10px] text-zinc-400">Valid Unique Rows</span>
            <div className="text-sm font-bold text-emerald-400">{parseResult.validLeads.length}</div>
          </div>
        </div>

        {/* Extracted Variables */}
        <div className="space-y-2">
          <span className="text-xs font-medium text-zinc-300">Extracted Template Variables:</span>
          <div className="flex flex-wrap gap-1.5">
            {parseResult.headers
              .filter((h) => h !== parseResult.detectedEmailColumn)
              .map((h) => (
                <span
                  key={h}
                  className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-300"
                >
                  &#123;&#123;{h.toLowerCase().replace(/\s+/g, '_')}&#125;&#125;
                </span>
              ))}
          </div>
        </div>

        {/* Campaign Assignment */}
        <div className="space-y-2 pt-2 border-t border-zinc-800/80">
          <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
            <Megaphone className="w-3.5 h-3.5 text-indigo-400" />
            Assign Imported Leads to Campaign (Optional):
          </label>
          <select
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
            disabled={isPending}
            className="w-full px-3.5 py-2.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Do not assign to a campaign right now</option>
            {campaigns.map((camp) => (
              <option key={camp.id} value={camp.id}>
                {camp.name} ({camp.status})
              </option>
            ))}
          </select>
          <p className="text-[10px] text-zinc-400">
            Leads already in the chosen campaign will be skipped automatically.
          </p>
        </div>
      </div>
    )
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-950 border border-zinc-800/90 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/40">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center">
              <UploadCloud className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100">Import Leads</h2>
              <p className="text-xs text-zinc-400">CSV / XLSX / Google Sheets • Automatic Deduplication</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isPending}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {importSummary ? (
            /* ── Import Success Summary ── */
            <div className="space-y-6 animate-in fade-in">
              <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-emerald-300">Import Completed Successfully!</h3>
                  <p className="text-xs text-zinc-400 font-mono">{parseResult?.filename}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-zinc-900/60 border border-zinc-800 text-center space-y-1">
                  <span className="text-[11px] text-zinc-400">Total Rows</span>
                  <div className="text-xl font-bold text-zinc-100">{importSummary.totalRows}</div>
                </div>
                <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-center space-y-1">
                  <span className="text-[11px] text-emerald-400 font-medium">New Leads Added</span>
                  <div className="text-xl font-bold text-emerald-300">{importSummary.newLeads}</div>
                </div>
                <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/20 text-center space-y-1">
                  <span className="text-[11px] text-amber-400 font-medium">Duplicates Skipped</span>
                  <div className="text-xl font-bold text-amber-300">{importSummary.duplicateLeads}</div>
                </div>
                <div className="p-3.5 rounded-xl bg-indigo-950/20 border border-indigo-500/20 text-center space-y-1">
                  <span className="text-[11px] text-indigo-300 font-medium">Attached to Campaign</span>
                  <div className="text-xl font-bold text-indigo-200">{importSummary.attachedToCampaign}</div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 text-xs text-zinc-400 space-y-1.5">
                <div className="flex items-center gap-2 text-zinc-300 font-medium">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Deduplication Guarantee</span>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  Every lead was verified against existing database records. Duplicate emails were
                  skipped without modifying their previous history or campaign progress.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* ── Mode Tab Switch ── */}
              <div className="flex bg-zinc-900/60 p-1 rounded-xl border border-zinc-800 gap-1">
                <button
                  type="button"
                  onClick={() => handleModeSwitch('file')}
                  disabled={isPending}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    mode === 'file'
                      ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Upload File
                </button>
                <button
                  type="button"
                  onClick={() => handleModeSwitch('drive')}
                  disabled={isPending}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    mode === 'drive'
                      ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  Google Drive Link
                </button>
              </div>

              {/* ── Source Panel (File or Drive) ── */}
              {renderSourcePanel()}

              {/* ── Parsing loader (file only) ── */}
              {isParsing && (
                <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800 flex items-center gap-2.5 text-xs text-zinc-400">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>Inspecting columns and headers…</span>
                </div>
              )}

              {/* ── Parsed Preview ── */}
              {renderParsedPreview()}

              {/* ── Error Banner ── */}
              {errorMsg && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-800/80 bg-zinc-900/40 flex items-center justify-between">
          <div className="text-[11px] text-zinc-400 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            <span>Dedup checks global leads table by email</span>
          </div>

          <div className="flex items-center gap-3">
            {importSummary ? (
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition-all shadow-md cursor-pointer"
              >
                Done
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isPending}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={
                    isPending ||
                    !parseResult ||
                    !parseResult.success ||
                    parseResult.validLeads.length === 0
                  }
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-medium text-white transition-all shadow-md shadow-indigo-600/20 flex items-center gap-2 cursor-pointer"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Deduplicating &amp; Inserting…</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Start Import ({parseResult?.validLeads.length || 0} Leads)</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
