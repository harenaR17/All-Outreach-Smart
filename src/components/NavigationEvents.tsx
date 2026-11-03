'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { useNavigation } from '@/lib/context/NavigationContext'

/**
 * Invisible component mounted once in AppShell.
 * - Listens for clicks on any internal <a> tag in the document and marks
 *   navigation as in-flight so the sidebar status card can react.
 * - Resets the flag as soon as the pathname changes (i.e. the new page renders).
 */
export function NavigationEvents() {
  const pathname = usePathname()
  const { setIsNavigating } = useNavigation()

  // Navigation complete — reset on every pathname change
  useEffect(() => {
    setIsNavigating(false)
  }, [pathname, setIsNavigating])

  // Intercept clicks on any internal anchor in the whole document
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      // Only internal routes, skip same-page and external
      if (!href || !href.startsWith('/') || href === pathname) return
      setIsNavigating(true)
    }

    document.addEventListener('click', handleClick, { capture: true })
    return () => document.removeEventListener('click', handleClick, { capture: true })
  }, [pathname, setIsNavigating])

  return null
}

