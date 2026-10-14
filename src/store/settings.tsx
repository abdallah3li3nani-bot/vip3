import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '@/lib/api'
import type { AppSettings } from '@/lib/database.types'

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'app_settings',
  app_name: 'منصّة المعلّم',
  short_name: 'المعلّم',
  tagline: 'إدارة الدروس والطلاب والمذكرات',
  teacher_name: 'الأستاذ',
  teacher_phone: null,
  teacher_email: null,
  teacher_address: null,
  logo_url: null,
  icon_url: null,
  avatar_url: null,
  primary_color: '#2563eb',
  accent_color: '#10b981',
  theme_mode: 'dark',
  currency: 'EGP',
  currency_symbol: 'ج.م',
  default_sessions_per_cycle: 4,
  absence_counts_in_cycle: false,
  charge_on_cycle_start: true,
  pricing_bundles: {
    year_grade_1: { 1: 150, 2: 250 },
    year_grade_2: { 1: 150, 2: 280, 3: 390, 4: 480 },
  },
  password: '1234',
  require_auth: true,
  report_header: null,
  report_footer: null,
  updated_at: new Date().toISOString(),
}

interface SettingsContextValue {
  settings: AppSettings
  reload: () => void
  updateSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
}

const Ctx = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  reload: () => {},
  updateSettings: async () => DEFAULT_SETTINGS,
})

function applyBrand(primary: string, accent: string) {
  const root = document.documentElement
  root.style.setProperty('--brand', primary)
  root.style.setProperty('--accent', accent)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta && !root.classList.contains('dark')) meta.setAttribute('content', primary)
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['app_settings'],
    queryFn: api.getSettings,
    staleTime: 60_000,
  })

  const settings = data ?? DEFAULT_SETTINGS

  useEffect(() => {
    applyBrand(settings.primary_color, settings.accent_color)
  }, [settings.primary_color, settings.accent_color])

  const updateSettings = async (patch: Partial<AppSettings>) => {
    const updated = await api.saveSettings(patch)
    qc.invalidateQueries({ queryKey: ['app_settings'] })
    return updated
  }

  return (
    <Ctx.Provider
      value={{
        settings,
        reload: () => qc.invalidateQueries({ queryKey: ['app_settings'] }),
        updateSettings,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useSettings() {
  return useContext(Ctx)
}
