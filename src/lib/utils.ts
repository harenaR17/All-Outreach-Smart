import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "—"
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(dateString))
  } catch {
    return dateString
  }
}

export function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return "—"
  try {
    const diffMs = new Date(dateString).getTime() - Date.now()
    const isFuture = diffMs > 0
    const absDiff = Math.abs(diffMs)

    const minutes = Math.floor(absDiff / (1000 * 60))
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) {
      return isFuture ? `in ${days}d` : `${days}d ago`
    }
    if (hours > 0) {
      return isFuture ? `in ${hours}h` : `${hours}h ago`
    }
    if (minutes > 0) {
      return isFuture ? `in ${minutes}m` : `${minutes}m ago`
    }
    return isFuture ? "in a moment" : "just now"
  } catch {
    return dateString
  }
}

