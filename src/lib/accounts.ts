import { supabase } from './supabase'

type Action = 'create' | 'reset' | 'disable'
type Result = { error?: string; pin?: string; code?: string; ok?: boolean; existed?: boolean }

/**
 * توكن صالح للحظة الحالية.
 * getSession قد يعيد توكنًا منتهيًا إن كان التبويب مفتوحًا من ساعات،
 * فالخادم يرفضه بـ«جلسة غير صالحة». لذلك نجدّد الجلسة قبل الإرسال
 * كلما اقترب انتهاؤها، ونجدّدها إجباريًا عند إعادة المحاولة.
 */
async function freshToken(force = false): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const s = data.session
  const nearExpiry = !s?.expires_at || s.expires_at * 1000 < Date.now() + 60_000

  if (s && !force && !nearExpiry) return s.access_token

  const { data: r, error } = await supabase.auth.refreshSession()
  if (error || !r.session) throw new Error('انتهت الجلسة، سجّل الدخول مرة أخرى')
  return r.session.access_token
}

async function post(action: Action, studentId: string, pin: string | undefined, token: string) {
  const res = await fetch('/api/students-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, studentId, pin }),
  })

  let json: Result = {}
  let raw = ''
  try {
    raw = await res.text()
    json = raw ? JSON.parse(raw) : {}
  } catch {
    throw new Error(
      res.status === 404
        ? 'خدمة الحسابات غير متاحة — تعمل فقط بعد النشر على Vercel'
        : `تعذّر تنفيذ العملية (${res.status})`,
    )
  }
  return { res, json }
}

async function call(action: Action, studentId: string, pin?: string) {
  if (pin && pin.trim().length < 6) throw new Error('الرمز السري يجب ألا يقل عن 6 خانات')

  let token = await freshToken()
  let { res, json } = await post(action, studentId, pin, token)

  // 401 = الخادم رفض التوكن. نجدّد الجلسة إجباريًا ونعيد المحاولة مرة واحدة.
  if (res.status === 401) {
    token = await freshToken(true)
    ;({ res, json } = await post(action, studentId, pin, token))
  }

  if (!res.ok) throw new Error(json.error || `تعذّر تنفيذ العملية (${res.status})`)
  return json
}

/** إنشاء حساب دخول للطالب وإرجاع الرمز السري لعرضه مرة واحدة */
export const createStudentAccount = (studentId: string, pin?: string) => call('create', studentId, pin)
export const resetStudentPin = (studentId: string, pin?: string) => call('reset', studentId, pin)
export const disableStudentAccount = (studentId: string) => call('disable', studentId)
