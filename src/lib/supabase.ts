/**
 * محاكي محلي متوافق - تم إيقاف Supabase لصالح نظام التخزين المحلي Offline IndexedDB
 */

export const isConfigured = true

export const STUDENT_EMAIL_DOMAIN = 'local.moallem.app'

export const studentEmail = (code: string) => `${code}@${STUDENT_EMAIL_DOMAIN}`

export const AUTH_STORAGE_KEY = 'moallem.auth'

export function purgeStoredSession() {}

export const supabase: any = {
  from: () => ({
    select: () => Promise.resolve({ data: [], error: null }),
    insert: () => Promise.resolve({ data: null, error: null }),
    update: () => Promise.resolve({ data: null, error: null }),
    delete: () => Promise.resolve({ data: null, error: null }),
    eq: () => ({ select: () => Promise.resolve({ data: [], error: null }), single: () => Promise.resolve({ data: null, error: null }) }),
  }),
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    signOut: () => Promise.resolve({ error: null }),
  },
}

export function withTimeout<T>(promise: PromiseLike<T>, _ms?: number): Promise<T> {
  return Promise.resolve(promise)
}

export function humanError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e ?? '')
  return m || 'حدث خطأ غير متوقع'
}
