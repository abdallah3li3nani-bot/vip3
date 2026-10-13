/**
 * دالة خادم (Vercel Serverless) لإدارة حسابات دخول الطلاب.
 * تستخدم مفتاح الخدمة service_role — لا يصل هذا المفتاح للمتصفح إطلاقًا.
 *
 * الأمان: كل طلب يجب أن يحمل رأس Authorization بتوكن المدير،
 * ويتم التحقق من أن صاحب التوكن دوره admin قبل أي عملية.
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '')
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const ANON_KEY = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim()
const DOMAIN = process.env.STUDENT_EMAIL_DOMAIN || process.env.VITE_STUDENT_EMAIL_DOMAIN || 'students.moallem.app'

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** أقل طول يقبله Supabase لكلمة المرور */
const MIN_PIN = 6

/** نوع مفتاح Supabase (anon / service_role) من داخل التوكن نفسه — لا يكشف المفتاح */
function keyRole(k: string): string {
  if (!k) return 'missing'
  if (k.startsWith('sb_secret_')) return 'service_role (new format)'
  if (k.startsWith('sb_publishable_')) return 'publishable (NOT service key)'
  try {
    const payload = JSON.parse(Buffer.from(k.split('.')[1], 'base64').toString('utf8'))
    return String(payload.role || 'unknown')
  } catch {
    return 'unrecognized'
  }
}

/**
 * التحقق من هوية صاحب الطلب.
 * نحاول أولًا بعميل الخدمة، وإن فشل (مفتاح خدمة غير مطابق مثلًا)
 * نعيد المحاولة بعميل عادي يحمل توكن المستخدم — حتى لا يُرفض
 * المدير بـ«جلسة غير صالحة» بسبب إعداد خادم لا علاقة له بجلسته.
 */
async function resolveUser(token: string): Promise<{ id: string } | { fail: string }> {
  const { data, error } = await admin.auth.getUser(token)
  if (data?.user) return { id: data.user.id }

  if (ANON_KEY) {
    const asUser = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: d2 } = await asUser.auth.getUser(token)
    if (d2?.user) return { id: d2.user.id }
  }

  return { fail: error?.message || 'تعذّر التحقق من الجلسة' }
}

const studentEmail = (code: string) =>
  `${String(code).trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')}@${DOMAIN}`

const randomPin = () => String(Math.floor(100000 + Math.random() * 900000))

/**
 * هل صاحب الطلب مدير؟
 * (أ) نسأل قاعدة البيانات بدالة is_admin() بجلسة المستخدم نفسه — تعمل مهما كان
 *     المفتاح المحفوظ على الخادم، لأن الدالة تعتمد على auth.uid().
 * (ب) وإن تعذّر ذلك نقرأ جدول profiles بمفتاح الخادم.
 * أي فشل يُعاد سببه في الرسالة بدل رفض صامت.
 */
async function checkAdmin(token: string, userId: string): Promise<{ ok: boolean; why: string }> {
  if (ANON_KEY) {
    const asUser = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data, error } = await asUser.rpc('is_admin')
    if (!error && data === true) return { ok: true, why: '' }
    if (!error && data === false) return { ok: false, why: 'حسابك غير مسجَّل كمدير في جدول profiles' }
  }

  const { data: profile, error } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (error) return { ok: false, why: `تعذّر قراءة الصلاحيات (${error.message})` }
  if (!profile) return { ok: false, why: 'لا يوجد سجل صلاحيات لحسابك في جدول profiles' }
  if (profile.role !== 'admin') return { ok: false, why: `دور حسابك الحالي: ${profile.role}` }
  return { ok: true, why: '' }
}

export default async function handler(req: any, res: any) {
  // فحص سريع لإعدادات الخادم: /api/students-account?diag=1 — لا يكشف أي مفتاح
  if (req.method === 'GET' && req.query?.diag) {
    res.status(200).json({
      url_set: Boolean(SUPABASE_URL),
      url_host: SUPABASE_URL ? SUPABASE_URL.replace(/^https?:\/\//, '').split('.')[0] : null,
      service_key_set: Boolean(SERVICE_KEY),
      service_key_role: keyRole(SERVICE_KEY),
      service_key_works: await (async () => {
        const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
        return error ? `NO — ${error.message}` : 'YES'
      })(),
      anon_key_set: Boolean(ANON_KEY),
      anon_key_role: keyRole(ANON_KEY),
      domain: DOMAIN,
    })
    return
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'الطريقة غير مسموحة' })
    return
  }
  if (!SUPABASE_URL || !SERVICE_KEY) {
    res.status(500).json({ error: 'إعدادات الخادم ناقصة (SUPABASE_SERVICE_ROLE_KEY)' })
    return
  }

  try {
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (!token) return res.status(401).json({ error: 'مطلوب تسجيل الدخول' })

    const who = await resolveUser(token)
    if ('fail' in who) {
      return res.status(401).json({ error: `جلسة غير صالحة — ${who.fail}` })
    }

    const isAdmin = await checkAdmin(token, who.id)
    if (!isAdmin.ok) {
      return res.status(403).json({ error: `هذه العملية للمدير فقط — ${isAdmin.why}` })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}
    const { action, studentId } = body as { action?: string; studentId?: string; pin?: string }
    if (!studentId) return res.status(400).json({ error: 'معرّف الطالب مطلوب' })

    const { data: student, error: stErr } = await admin
      .from('students')
      .select('id, code, full_name, auth_user_id')
      .eq('id', studentId)
      .maybeSingle()
    // نفرّق بين «فشل الاستعلام» و«الطالب غير موجود» — الأول عادةً خطأ إعداد خادم
    if (stErr) return res.status(500).json({ error: `تعذّر قراءة بيانات الطالب — ${stErr.message}` })
    if (!student) return res.status(404).json({ error: 'الطالب غير موجود' })

    const email = studentEmail(student.code)
    const custom = body.pin ? String(body.pin).trim() : ''
    if (custom && custom.length < MIN_PIN) {
      return res.status(400).json({ error: `الرمز السري يجب ألا يقل عن ${MIN_PIN} خانات` })
    }
    const pin = custom || randomPin()

    if (action === 'create') {
      if (student.auth_user_id) {
        const { error: updErr } = await admin.auth.admin.updateUserById(student.auth_user_id, { password: pin })
        if (updErr) return res.status(400).json({ error: updErr.message })
        await admin.from('students').update({ has_account: true }).eq('id', student.id)
        return res.status(200).json({ ok: true, code: student.code, pin, existed: true })
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password: pin,
        email_confirm: true,
        user_metadata: { role: 'student', student_id: student.id, full_name: student.full_name },
      })

      if (createErr) {
        // الحساب موجود مسبقًا بنفس البريد — أعد ربطه
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
        const found = list?.users?.find((u: any) => u.email?.toLowerCase() === email)
        if (!found) return res.status(400).json({ error: createErr.message })
        await admin.auth.admin.updateUserById(found.id, {
          password: pin,
          user_metadata: { role: 'student', student_id: student.id, full_name: student.full_name },
        })
        await admin.from('profiles').upsert({ id: found.id, role: 'student', student_id: student.id, full_name: student.full_name })
        await admin.from('students').update({ auth_user_id: found.id, has_account: true }).eq('id', student.id)
        return res.status(200).json({ ok: true, code: student.code, pin, existed: true })
      }

      await admin.from('profiles').upsert({
        id: created.user.id, role: 'student', student_id: student.id, full_name: student.full_name,
      })
      await admin.from('students').update({ auth_user_id: created.user.id, has_account: true }).eq('id', student.id)
      await admin.from('audit_logs').insert({
        actor_id: who.id, action: 'create_student_account', entity: 'students', entity_id: student.id,
      })
      return res.status(200).json({ ok: true, code: student.code, pin })
    }

    if (action === 'reset') {
      if (!student.auth_user_id) return res.status(400).json({ error: 'لا يوجد حساب لهذا الطالب بعد' })
      const { error } = await admin.auth.admin.updateUserById(student.auth_user_id, { password: pin })
      if (error) return res.status(400).json({ error: error.message })
      await admin.from('audit_logs').insert({
        actor_id: who.id, action: 'reset_student_pin', entity: 'students', entity_id: student.id,
      })
      return res.status(200).json({ ok: true, code: student.code, pin })
    }

    if (action === 'disable') {
      if (student.auth_user_id) await admin.auth.admin.deleteUser(student.auth_user_id)
      await admin.from('students').update({ auth_user_id: null, has_account: false }).eq('id', student.id)
      await admin.from('audit_logs').insert({
        actor_id: who.id, action: 'disable_student_account', entity: 'students', entity_id: student.id,
      })
      return res.status(200).json({ ok: true })
    }

    return res.status(400).json({ error: 'إجراء غير معروف' })
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'خطأ داخلي' })
  }
}
