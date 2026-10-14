import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import App from './App'
import { AuthProvider } from './store/auth'
import { SettingsProvider } from './store/settings'
import { ConfirmProvider } from './components/ui'
import { ErrorBoundary } from './components/ErrorBoundary'
import { UpdatePrompt } from './components/UpdatePrompt'
import { applyTheme, useUi } from './store/ui'
import './index.css'
import { runMigrations } from './lib/api'

applyTheme(useUi.getState().theme)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      gcTime: 10 * 60_000,
    },
  },
})

// ترحيل البيانات القديمة (مرة واحدة) قبل عرض التطبيق
runMigrations()
  .catch((e) => console.error('migration failed', e))
  .finally(() => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <AuthProvider>
          <ConfirmProvider>
            <HashRouter>
              <App />
              <UpdatePrompt />
            </HashRouter>
            <Toaster
              position="top-center"
              dir="rtl"
              closeButton
              richColors
              toastOptions={{ style: { fontFamily: 'Cairo, system-ui, sans-serif' } }}
            />
          </ConfirmProvider>
        </AuthProvider>
      </SettingsProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
  ))

// إزالة شاشة الإقلاع
requestAnimationFrame(() => {
  const boot = document.getElementById('boot')
  if (boot) {
    boot.style.opacity = '0'
    setTimeout(() => boot.remove(), 320)
  }
})
