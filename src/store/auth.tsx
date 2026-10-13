import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { getSettings, saveSettings } from '@/lib/api'
import { triggerDailyRollingBackup, ensureStoragePersistence } from '@/lib/db'

interface AuthContextValue {
  isAuthenticated: boolean
  loading: boolean
  isAdmin: boolean
  isStudent: boolean
  unlock: (password: string) => Promise<boolean>
  lock: () => void
  changePassword: (newPass: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthCtx = createContext<AuthContextValue | null>(null)

const UNLOCK_STORAGE_KEY = 'moallem_unlocked_session'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)

  useEffect(() => {
    // تشغيل الحفظ الدائم وأخذ النسخة اليومية التلقائية في الخلفية
    ensureStoragePersistence().catch(() => {})
    triggerDailyRollingBackup().catch(() => {})

    // التحقق من حالة القفل
    getSettings()
      .then((settings) => {
        if (!settings.require_auth) {
          setIsAuthenticated(true)
        } else {
          const isSessionSaved = sessionStorage.getItem(UNLOCK_STORAGE_KEY) === 'true'
          setIsAuthenticated(isSessionSaved)
        }
      })
      .catch(() => {
        setIsAuthenticated(true)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  const unlock = async (password: string): Promise<boolean> => {
    const settings = await getSettings()
    const storedPass = settings.password || '1234'
    if (password.trim() === storedPass.trim()) {
      setIsAuthenticated(true)
      sessionStorage.setItem(UNLOCK_STORAGE_KEY, 'true')
      return true
    }
    return false
  }

  const lock = () => {
    setIsAuthenticated(false)
    sessionStorage.removeItem(UNLOCK_STORAGE_KEY)
  }

  const changePassword = async (newPass: string) => {
    await saveSettings({ password: newPass.trim() })
  }

  const signOut = async () => {
    lock()
  }

  return (
    <AuthCtx.Provider
      value={{
        isAuthenticated,
        loading,
        isAdmin: true,
        isStudent: false,
        unlock,
        lock,
        changePassword,
        signOut,
      }}
    >
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
