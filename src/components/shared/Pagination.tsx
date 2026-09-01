'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  /** 1-indexed current page */
  currentPage: number
  /** total number of items across all pages (pre-slicing) */
  totalItems: number
  /** number of items per page */
  pageSize: number
  /** called with the next 1-indexed page number */
  onPageChange: (page: number) => void
  /** optional noun for the "X-Y of Z {itemLabel}" text, defaults to "items" */
  itemLabel?: string
}

/**
 * Shared pagination control for lists/tables. Renders nothing when everything
 * fits on a single page. Purely presentational + page-index bookkeeping —
 * callers own slicing their own data with `.slice((page - 1) * pageSize, page * pageSize)`.
 */
export function Pagination({ currentPage, totalItems, pageSize, onPageChange, itemLabel = 'items' }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))

  if (totalPages <= 1) return null

  const startItem = (currentPage - 1) * pageSize + 1
  const endItem = Math.min(currentPage * pageSize, totalItems)

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-zinc-800">
      <span className="text-xs text-zinc-400">
        Showing <span className="text-zinc-200 font-medium">{startItem}-{endItem}</span> of{' '}
        <span className="text-zinc-200 font-medium">{totalItems}</span> {itemLabel}
      </span>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          title="Previous page"
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        <span className="text-xs text-zinc-400 px-2 min-w-[5.5rem] text-center">
          Page <span className="text-indigo-400 font-semibold">{currentPage}</span> of {totalPages}
        </span>

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          title="Next page"
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
