import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ThemeMode = 'light' | 'dark' | 'system'

interface UiState {
  theme: ThemeMode
  hideBalances: boolean
  sidebarCollapsed: boolean
  lastYearFilter: string | null
  setTheme: (t: ThemeMode) => void
  toggleBalances: () => void
  setHideBalances: (v: boolean) => void
  toggleSidebar: () => void
  setLastYearFilter: (v: string | null) => void
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      theme: 'system',
      hideBalances: false,
      sidebarCollapsed: false,
      lastYearFilter: null,
      setTheme: (theme) => set({ theme }),
      toggleBalances: () => set((s) => ({ hideBalances: !s.hideBalances })),
      setHideBalances: (hideBalances) => set({ hideBalances }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setLastYearFilter: (lastYearFilter) => set({ lastYearFilter }),
    }),
    { name: 'moallem.ui' },
  ),
)

/** تطبيق الوضع الليلي على عنصر <html> */
export function applyTheme(mode: ThemeMode) {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = mode === 'dark' || (mode === 'system' && prefersDark)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#0b1220' : '#ffffff')
}
