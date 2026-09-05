import type { ReplyCategory } from '@/lib/llm/gemini'

export type { ReplyCategory }

export interface ReplyCategoryBadge {
  label: string
  bg: string
  text: string
  border: string
}

/**
 * Shared styling for the 5 Gemini reply classification categories. Single
 * source of truth reused by the Overview "Recent Replies" card, the Activity
 * Feed, the Campaign Leads tab, and the SmartBox unified inbox — don't
 * copy-paste this map again, import it from here.
 */
export const CATEGORY_BADGES: Record<ReplyCategory, ReplyCategoryBadge> = {
  interested: {
    label: '🎯 Interested',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
  },
  not_interested: {
    label: '🛑 Not Interested',
    bg: 'bg-rose-500/10',
    text: 'text-rose-400',
    border: 'border-rose-500/20',
  },
  wrong_person: {
    label: '🔄 Wrong Person',
    bg: 'bg-amber-500/10',
    text: 'text-amber-400',
    border: 'border-amber-500/20',
  },
  undefined: {
    label: '❓ Undefined',
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/20',
  },
  out_of_office: {
    label: '🏖️ Out of Office',
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/20',
  },
}

/** All 5 filterable reply categories, in the order they should appear in filter UI. */
export const REPLY_CATEGORY_ORDER: ReplyCategory[] = [
  'interested',
  'not_interested',
  'out_of_office',
  'wrong_person',
  'undefined',
]
