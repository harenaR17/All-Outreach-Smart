'use client'

import { createContext, useContext, useState } from 'react'

interface NavigationContextValue {
  isNavigating: boolean
  setIsNavigating: (v: boolean) => void
}

const NavigationContext = createContext<NavigationContextValue>({
  isNavigating: false,
  setIsNavigating: () => {},
})

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [isNavigating, setIsNavigating] = useState(false)
  return (
    <NavigationContext.Provider value={{ isNavigating, setIsNavigating }}>
      {children}
    </NavigationContext.Provider>
  )
}

export function useNavigation() {
  return useContext(NavigationContext)
}

