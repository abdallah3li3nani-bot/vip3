import {
  dbGetAll,
  dbGetById,
  dbPut,
  dbDelete,
  dbClear,
  uid,
  exportDatabaseDump,
  restoreDatabaseDump,
  triggerDailyRollingBackup,
  ensureStoragePersistence,
  getStorageStatus,
} from './db'
import type {
  AcademicYear,
  Attendance,
  Charge,
  ClassSession,
  Cycle,
  Group,
  Payment,
  Student,
  StudentSubject,
  Subject,
  Booklet,
  BookletOrder,
  BackupSnapshot,
  PaymentSplit,
  AppSettings,
  DashboardStats,
} from './database.types'
import { GRADE_LABEL, normalizeGradeText, yearLevel, type GradeLevel } from './grades'

/* ============================ السنوات الدراسية ============================ */
export const listYears = async (): Promise<AcademicYear[]> => {
  const years = await dbGetAll<AcademicYear>('years')
  return years.sort((a, b) => a.sort_order - b.sort_order)
}

export const saveYear = async (y: Partial<AcademicYear>): Promise<AcademicYear> => {
  const row: AcademicYear = {
    id: y.id || uid(),
    name: y.name || 'سنة دراسية جديدة',
    sort_order: y.sort_order ?? 1,
    is_active: y.is_active ?? true,
    created_at: y.created_at || new Date().toISOString(),
  }
  return dbPut('years', row)
}

export const deleteYear = async (id: string): Promise<void> => {
  await dbDelete('years', id)
}

/* ================================ المجموعات ================================ */
export const listGroups = async (): Promise<Group[]> => {
  const groups = await dbGetAll<Group>('groups')
  return groups.sort((a, b) => a.name.localeCompare(b.name, 'ar'))
}

export const saveGroup = async (g: Partial<Group>): Promise<Group> => {
  const row: Group = {
    id: g.id || uid(),
    year_id: g.year_id || '',
    name: g.name || 'مجموعة جديدة',
    notes: g.notes ?? null,
    created_at: g.created_at || new Date().toISOString(),
  }
  return dbPut('groups', row)
}

export const deleteGroup = async (id: string): Promise<void> => {
  await dbDelete('groups', id)
}

/* ================================== المواد ==================================*/
export const listSubjects = async (): Promise<Subject[]> => {
  const list = await dbGetAll<Subject>('subjects')
  return list.sort((a, b) => a.name.localeCompare(b.name, 'ar'))
}

export const saveSubject = async (s: Partial<Subject>): Promise<Subject> => {
  const row: Subject = {
    id: s.id || uid(),
    year_id: s.year_id || '',
    name: s.name || 'مادة جديدة',
    price: Number(s.price ?? 0),
    sessions_per_cycle: Number(s.sessions_per_cycle ?? 8),
    color: s.color || '#2563eb',
    is_active: s.is_active ?? true,
    notes: s.notes ?? null,
    created_at: s.created_at || new Date().toISOString(),
  }
  return dbPut('subjects', row)
}

export const deleteSubject = async (id: string): Promise<void> => {
  await dbDelete('subjects', id)
}

/* ================================= الطلاب =================================*/
export const listStudents = async (): Promise<Student[]> => {
  const list = await dbGetAll<Student>('students')
  return list.sort((a, b) => a.full_name.localeCompare(b.full_name, 'ar'))
}

export const getStudent = async (id: string): Promise<Student> => {
  const s = await dbGetById<Student>('students', id)
  if (!s) throw new Error('الطالب غير موجود')
  return s
}

/** توليد كود طالب مسلسل (S0001، S0002…) */
const nextStudentCode = async (existing?: Student[]): Promise<string> => {
  const list = existing ?? (await dbGetAll<Student>('students'))
  let max = 0
  for (const st of list) {
    const n = Number(String(st.code || '').replace(/\D/g, ''))
    if (n > max) max = n
  }
  return 'S' + String(max + 1).padStart(4, '0')
}

export const saveStudent = async (s: Partial<Student>): Promise<Student> => {
  const now = new Date().toISOString()
  const prev = s.id ? await dbGetById<Student>('students', s.id) : null
  const row: Student = {
    ...(prev || {}),
    id: s.id || uid(),
    code: s.code || prev?.code || (await nextStudentCode()),
    full_name: (s.full_name ?? prev?.full_name ?? '').trim(),
    year_id: s.year_id !== undefined ? s.year_id || null : prev?.year_id ?? null,
    group_id: s.group_id !== undefined ? s.group_id || null : prev?.group_id ?? null,
    specialization: s.specialization || prev?.specialization || 'عام',
    is_enrolled: s.is_enrolled ?? prev?.is_enrolled ?? false,
    status: s.status || prev?.status || 'active',
    enrolled_at: s.enrolled_at || prev?.enrolled_at || now.slice(0, 10),
    notes: s.notes !== undefined ? s.notes : prev?.notes ?? null,
    created_at: s.created_at || prev?.created_at || now,
    updated_at: now,
  }
  if (!row.full_name) throw new Error('اسم الطالب مطلوب')
  return dbPut('students', row)
}

/** حذف الطالب وكل ما يخصه (مواد، دورات، مستحقات، مدفوعات، حضور، مذكرات) */
export const deleteStudent = async (id: string): Promise<void> => {
  await dbDelete('students', id)
  const stores = ['student_subjects', 'cycles', 'charges', 'payments', 'attendance', 'booklet_orders'] as const
  for (const store of stores) {
    const rows = await dbGetAll<{ id: string; student_id: string }>(store)
    for (const r of rows) if (r.student_id === id) await dbDelete(store, r.id)
  }
}

/**
 * التأكد من وجود الصفوف الثلاثة في التطبيق وإرجاع خريطة: رقم الصف ← معرّف السنة الدراسية.
 * لو الصف موجود بأي اسم (مثلاً "أولى ثانوي") يُستخدم كما هو، ولو مش موجود يتعمل.
 */
export const ensureGradeYears = async (): Promise<Record<GradeLevel, string>> => {
  const years = await dbGetAll<AcademicYear>('years')
  const map = {} as Record<GradeLevel, string>
  for (const y of years.sort((a, b) => a.sort_order - b.sort_order)) {
    const lvl = yearLevel(y)
    if (lvl && !map[lvl]) map[lvl] = y.id
  }
  for (const lvl of [1, 2, 3] as GradeLevel[]) {
    if (map[lvl]) continue
    const row: AcademicYear = {
      id: years.some((y) => y.id === `year_grade_${lvl}`) ? uid() : `year_grade_${lvl}`,
      name: `${GRADE_LABEL[lvl]} الثانوي`,
      sort_order: lvl,
      is_active: true,
      created_at: new Date().toISOString(),
    }
    await dbPut('years', row)
    map[lvl] = row.id
  }
  return map
}

const nameKey = (n: string) => normalizeGradeText(n).replace(/\s+/g, ' ')

/**
 * استيراد كشف طلاب من الإكسيل مع التعرف على صف كل طالب.
 * - الطالب الجديد يتضاف في صفه.
 * - الطالب الموجود بنفس الاسم يتحدّث صفه وتخصصه (يصلح أي استيراد قديم اتعمل غلط).
 * - الطلاب اللي صفهم مش واضح يروحوا للصف الاحتياطي المختار.
 */
export const bulkImportStudents = async (
  studentsList: { full_name: string; specialization?: string; grade_level?: GradeLevel | null }[],
  fallbackYearId?: string | null,
): Promise<{ added: number; updated: number; skipped: number; unknownGrade: number }> => {
  const gradeYears = await ensureGradeYears()
  const existing = await dbGetAll<Student>('students')
  const byName = new Map<string, Student[]>()
  for (const st of existing) {
    const k = nameKey(st.full_name)
    byName.set(k, [...(byName.get(k) || []), st])
  }
  const touched = new Set<string>()
  let codeSeq = Number((await nextStudentCode(existing)).slice(1))
  const now = new Date().toISOString()

  let added = 0
  let updated = 0
  let skipped = 0
  let unknownGrade = 0

  for (const item of studentsList) {
    const cleanName = item.full_name.replace(/\s+/g, ' ').trim()
    if (!cleanName) continue
    const yearId = item.grade_level ? gradeYears[item.grade_level] : fallbackYearId || null
    if (!item.grade_level) unknownGrade++
    const spec = item.specialization?.trim() && item.specialization.trim() !== 'عام' ? item.specialization.trim() : null

    const candidates = (byName.get(nameKey(cleanName)) || []).filter((c) => !touched.has(c.id))
    const same = candidates.find((c) => c.year_id === yearId)
    const target = same || (candidates.length === 1 && item.grade_level ? candidates[0] : undefined)

    if (target) {
      touched.add(target.id)
      let changed = false
      if (yearId && target.year_id !== yearId) {
        target.year_id = yearId
        target.group_id = null // المجموعة تابعة للصف القديم
        changed = true
      }
      if (spec && target.specialization !== spec) {
        target.specialization = spec
        changed = true
      }
      if (changed) {
        target.updated_at = now
        await dbPut('students', target)
        updated++
      } else skipped++
      continue
    }

    const newStudent: Student = {
      id: uid(),
      code: 'S' + String(codeSeq++).padStart(4, '0'),
      full_name: cleanName,
      year_id: yearId,
      group_id: null,
      specialization: spec || 'عام',
      is_enrolled: false, // طلاب مدرسة في البداية حتى يشتركوا
      status: 'active',
      enrolled_at: now.slice(0, 10),
      notes: 'تم الاستيراد من كشف المدرسة',
      created_at: now,
      updated_at: now,
    }
    await dbPut('students', newStudent)
    touched.add(newStudent.id)
    added++
  }

  return { added, updated, skipped, unknownGrade }
}

/* =========================== ربط الطالب بالمواد ===========================*/
export const listStudentSubjects = async (studentId?: string): Promise<StudentSubject[]> => {
  const all = await dbGetAll<StudentSubject>('student_subjects')
  if (studentId) return all.filter((s) => s.student_id === studentId)
  return all
}

export const saveStudentSubject = async (r: Partial<StudentSubject>): Promise<StudentSubject> => {
  const row: StudentSubject = {
    id: r.id || uid(),
    student_id: r.student_id || '',
    subject_id: r.subject_id || '',
    price_override: r.price_override != null ? Number(r.price_override) : null,
    is_active: r.is_active ?? true,
    started_at: r.started_at || new Date().toISOString().slice(0, 10),
    created_at: r.created_at || new Date().toISOString(),
  }
  const saved = await dbPut('student_subjects', row)

  if (row.is_active && row.student_id) {
    // عند تسجيل مادة نشطة للطالب، نحدد أنه مشترك بالدروس
    const st = await dbGetById<Student>('students', row.student_id)
    if (st && !st.is_enrolled) {
      st.is_enrolled = true
      await dbPut('students', st)
    }
    // فتح أول دورة (وتسجيل رسومها لو الإعداد مفعّل) إن لم توجد دورة مفتوحة
    const cycles = (await dbGetAll<Cycle>('cycles')).filter(
      (c) => c.student_id === row.student_id && c.subject_id === row.subject_id,
    )
    if (!cycles.some((c) => c.status === 'open')) {
      await openCycle(row.student_id, row.subject_id)
    }
  }

  return saved
}

export const removeStudentSubject = async (id: string): Promise<void> => {
  const ss = await dbGetById<StudentSubject>('student_subjects', id)
  await dbDelete('student_subjects', id)

  // إذا لم يعد لديه مواد نشطة، نحدث حالة اشتراكه
  if (ss?.student_id) {
    const all = await listStudentSubjects(ss.student_id)
    if (all.filter((s) => s.is_active).length === 0) {
      const st = await dbGetById<Student>('students', ss.student_id)
      if (st) {
        st.is_enrolled = false
        await dbPut('students', st)
      }
    }
  }
}

/* ================================== الحصص ================================== */
export const listSessions = async (from?: string, to?: string): Promise<ClassSession[]> => {
  const all = await dbGetAll<ClassSession>('sessions')
  let filtered = all
  if (from) filtered = filtered.filter((s) => s.session_date >= from)
  if (to) filtered = filtered.filter((s) => s.session_date <= to)
  return filtered.sort((a, b) => b.session_date.localeCompare(a.session_date))
}

export const getSession = async (id: string): Promise<ClassSession> => {
  const s = await dbGetById<ClassSession>('sessions', id)
  if (!s) throw new Error('الحصة غير موجودة')
  return s
}

export const saveSession = async (s: Partial<ClassSession>): Promise<ClassSession> => {
  const now = new Date().toISOString()
  const row: ClassSession = {
    id: s.id || uid(),
    subject_id: s.subject_id || '',
    group_id: s.group_id || null,
    session_date: s.session_date || now.slice(0, 10),
    start_time: s.start_time || null,
    end_time: s.end_time || null,
    location: s.location || null,
    status: s.status || 'scheduled',
    rescheduled_to: s.rescheduled_to || null,
    reason: s.reason || null,
    notes: s.notes || null,
    created_at: s.created_at || now,
    updated_at: now,
  }
  return dbPut('sessions', row)
}

export const deleteSession = async (id: string): Promise<void> => {
  await dbDelete('sessions', id)
  const attendances = await dbGetAll<Attendance>('attendance')
  for (const a of attendances) {
    if (a.session_id === id) await dbDelete('attendance', a.id)
  }
}

/* ================================= الحضور =================================*/
export const listAttendance = async (opts: { sessionId?: string; studentId?: string }): Promise<Attendance[]> => {
  let list = await dbGetAll<Attendance>('attendance')
  if (opts.sessionId) list = list.filter((a) => a.session_id === opts.sessionId)
  if (opts.studentId) list = list.filter((a) => a.student_id === opts.studentId)
  return list
}

export const saveAttendance = async (a: Partial<Attendance>): Promise<Attendance> => {
  const row: Attendance = {
    id: a.id || uid(),
    session_id: a.session_id || '',
    student_id: a.student_id || '',
    status: a.status || 'present',
    note: a.note || null,
    recorded_at: a.recorded_at || new Date().toISOString(),
  }
  return dbPut('attendance', row)
}

/**
 * حفظ حضور حصة كاملة + تحديث دورات الطلاب ومستحقاتهم.
 * آمن للتكرار: إعادة الحفظ لنفس الحصة لا تحسب الحصة مرتين.
 */
export const saveSessionAttendance = async (
  sessionId: string,
  records: { student_id: string; status: Attendance['status']; note?: string | null }[],
): Promise<{ saved: number; chargesCreated: number }> => {
  const session = await dbGetById<ClassSession>('sessions', sessionId)
  if (!session) throw new Error('الحصة غير موجودة')
  const settings = await getSettings()
  const counts = (st?: Attendance['status']) =>
    st === 'present' || st === 'late' || (settings.absence_counts_in_cycle && st === 'absent')

  const existing = await listAttendance({ sessionId })
  const map = new Map(existing.map((e) => [e.student_id, e]))
  const now = new Date().toISOString()
  let chargesCreated = 0

  for (const r of records) {
    const cur = map.get(r.student_id)
    await dbPut('attendance', {
      id: cur?.id || uid(),
      session_id: sessionId,
      student_id: r.student_id,
      status: r.status,
      note: r.note ?? cur?.note ?? null,
      recorded_at: now,
    })
    const delta = (counts(r.status) ? 1 : 0) - (counts(cur?.status) ? 1 : 0)
    if (delta !== 0) chargesCreated += await applyCycleDelta(r.student_id, session.subject_id, delta)
  }

  if (session.status === 'scheduled') {
    session.status = 'done'
    session.updated_at = now
    await dbPut('sessions', session)
  }
  return { saved: records.length, chargesCreated }
}

/** للتوافق مع الشاشات القديمة */
export const saveBulkAttendance = async (
  sessionId: string,
  records: { student_id: string; status: Attendance['status']; note?: string }[],
): Promise<void> => {
  await saveSessionAttendance(sessionId, records)
}

/* ================================= الدورات =================================*/
export const listCycles = async (studentId?: string): Promise<Cycle[]> => {
  let list = await dbGetAll<Cycle>('cycles')
  if (studentId) list = list.filter((c) => c.student_id === studentId)
  return list.sort((a, b) => b.cycle_index - a.cycle_index)
}

export const saveCycle = async (c: Partial<Cycle>): Promise<Cycle> => {
  const row: Cycle = {
    id: c.id || uid(),
    student_id: c.student_id || '',
    subject_id: c.subject_id || '',
    cycle_index: c.cycle_index || 1,
    sessions_target: c.sessions_target || 8,
    sessions_done: c.sessions_done || 0,
    status: c.status || 'open',
    opened_at: c.opened_at || new Date().toISOString(),
    completed_at: c.completed_at || null,
  }
  return dbPut('cycles', row)
}

/** سعر المادة للطالب (السعر الخاص إن وجد، وإلا سعر المادة) */
const subjectPriceFor = async (studentId: string, subject: Subject): Promise<number> => {
  const enr = (await dbGetAll<StudentSubject>('student_subjects')).find(
    (e) => e.student_id === studentId && e.subject_id === subject.id,
  )
  return enr?.price_override != null ? Number(enr.price_override) : Number(subject.price || 0)
}

const chargeCycle = async (cycle: Cycle, subject: Subject): Promise<void> => {
  const amount = await subjectPriceFor(cycle.student_id, subject)
  if (amount <= 0) return
  await saveCharge({
    student_id: cycle.student_id,
    kind: 'cycle',
    title: `${subject.name} — الدورة ${cycle.cycle_index}`,
    amount,
    paid_amount: 0,
    subject_id: subject.id,
    cycle_id: cycle.id,
    due_date: new Date().toISOString().slice(0, 10),
  })
}

/** فتح دورة جديدة للطالب في مادة (مع تسجيل رسومها إن كان الإعداد «الرسوم مع بداية الدورة») */
export const openCycle = async (studentId: string, subjectId: string): Promise<Cycle | null> => {
  const subject = await dbGetById<Subject>('subjects', subjectId)
  if (!subject) return null
  const settings = await getSettings()
  const prev = (await dbGetAll<Cycle>('cycles')).filter((c) => c.student_id === studentId && c.subject_id === subjectId)
  const index = prev.reduce((m, c) => Math.max(m, c.cycle_index), 0) + 1
  const cycle = await saveCycle({
    student_id: studentId,
    subject_id: subjectId,
    cycle_index: index,
    sessions_target: subject.sessions_per_cycle || settings.default_sessions_per_cycle || 8,
    sessions_done: 0,
    status: 'open',
  })
  if (settings.charge_on_cycle_start) await chargeCycle(cycle, subject)
  return cycle
}

/** تحريك عدّاد الدورة بمقدار +1 أو -1 حصة. يرجّع عدد المستحقات الجديدة */
const applyCycleDelta = async (studentId: string, subjectId: string, delta: number): Promise<number> => {
  const subject = await dbGetById<Subject>('subjects', subjectId)
  if (!subject) return 0
  const settings = await getSettings()
  const all = (await dbGetAll<Cycle>('cycles'))
    .filter((c) => c.student_id === studentId && c.subject_id === subjectId)
    .sort((a, b) => b.cycle_index - a.cycle_index)
  let created = 0

  if (delta > 0) {
    let open = all.find((c) => c.status === 'open')
    if (!open) {
      const before = (await dbGetAll<Charge>('charges')).length
      open = (await openCycle(studentId, subjectId)) ?? undefined
      if (!open) return 0
      created += (await dbGetAll<Charge>('charges')).length - before
    }
    open.sessions_done += 1
    if (open.sessions_done >= open.sessions_target) {
      open.status = 'completed'
      open.completed_at = new Date().toISOString()
      if (!settings.charge_on_cycle_start) {
        await chargeCycle(open, subject)
        created++
      }
    }
    await saveCycle(open)
    return created
  }

  // delta < 0: تراجع عن حصة محسوبة (تعديل حضور)
  const open = all.find((c) => c.status === 'open')
  if (open && open.sessions_done > 0) {
    open.sessions_done -= 1
    // دورة جديدة رجعت صفر بسبب تصحيح حضور: نلغيها ونلغي رسومها لو لم يُدفع منها شيء
    if (open.sessions_done === 0 && open.cycle_index > 1) {
      const ch = (await dbGetAll<Charge>('charges')).find((c) => c.cycle_id === open.id && !c.void_at)
      if (!ch || Number(ch.paid_amount) === 0) {
        if (ch) await voidCharge(ch.id, 'تصحيح حضور: الدورة لم تبدأ')
        await dbDelete('cycles', open.id)
        return 0
      }
    }
    await saveCycle(open)
    return 0
  }
  const lastDone = all.find((c) => c.status === 'completed')
  if (!lastDone) return 0
  if (open && open.sessions_done === 0) {
    // دورة جديدة فارغة فُتحت للتو: نحذفها ونلغي رسومها إن لم يُدفع منها شيء
    const ch = (await dbGetAll<Charge>('charges')).find((c) => c.cycle_id === open.id && !c.void_at)
    if (ch && Number(ch.paid_amount) > 0) return 0
    if (ch) await voidCharge(ch.id, 'تعديل حضور: إلغاء دورة لم تبدأ')
    await dbDelete('cycles', open.id)
  }
  lastDone.status = 'open'
  lastDone.completed_at = null
  lastDone.sessions_done = Math.max(0, lastDone.sessions_target - 1)
  if (!settings.charge_on_cycle_start) {
    const ch = (await dbGetAll<Charge>('charges')).find((c) => c.cycle_id === lastDone.id && !c.void_at)
    if (ch && Number(ch.paid_amount) === 0) await voidCharge(ch.id, 'تعديل حضور: الدورة لم تكتمل')
  }
  await saveCycle(lastDone)
  return 0
}

/* ================================ المستحقات ================================*/
export const listCharges = async (studentId?: string): Promise<Charge[]> => {
  let list = await dbGetAll<Charge>('charges')
  if (studentId) list = list.filter((c) => c.student_id === studentId)
  return list.sort((a, b) => b.due_date.localeCompare(a.due_date))
}

const chargeStatus = (c: Pick<Charge, 'amount' | 'paid_amount' | 'void_at'>): Charge['status'] => {
  if (c.void_at) return 'void'
  const amount = Number(c.amount || 0)
  const paid = Number(c.paid_amount || 0)
  if (paid <= 0) return 'unpaid'
  if (paid + 0.001 >= amount) return 'paid'
  return 'partial'
}

export const saveCharge = async (c: Partial<Charge>): Promise<Charge> => {
  const row: Charge = {
    id: c.id || uid(),
    student_id: c.student_id || '',
    kind: c.kind || 'cycle',
    title: c.title || 'مستحق شهري',
    amount: Number(c.amount || 0),
    paid_amount: Number(c.paid_amount || 0),
    subject_id: c.subject_id || null,
    cycle_id: c.cycle_id || null,
    batch_id: c.batch_id || null,
    due_date: c.due_date || new Date().toISOString().slice(0, 10),
    status: 'unpaid',
    notes: c.notes || null,
    created_at: c.created_at || new Date().toISOString(),
    void_at: c.void_at || null,
    void_reason: c.void_reason || null,
  }
  row.status = chargeStatus(row)
  return dbPut('charges', row)
}

export const voidCharge = async (id: string, reason: string): Promise<void> => {
  const ch = await dbGetById<Charge>('charges', id)
  if (ch) {
    ch.void_at = new Date().toISOString()
    ch.void_reason = reason
    ch.status = 'void'
    await dbPut('charges', ch)
  }
}

/* ================================= المدفوعات =================================*/
export const listPayments = async (studentId?: string): Promise<Payment[]> => {
  let list = await dbGetAll<Payment>('payments')
  if (studentId) list = list.filter((p) => p.student_id === studentId)
  return list.sort((a, b) => b.paid_at.localeCompare(a.paid_at) || (b.receipt_no || 0) - (a.receipt_no || 0))
}

export const getPayment = async (id: string): Promise<Payment> => {
  const p = await dbGetById<Payment>('payments', id)
  if (!p) throw new Error('الإيصال غير موجود')
  return p
}

const nextReceiptNo = async (): Promise<number> => {
  const all = await dbGetAll<Payment>('payments')
  return all.reduce((m, p) => Math.max(m, p.receipt_no || 0), 0) + 1
}

export const savePayment = async (p: Partial<Payment>): Promise<Payment> => {
  const row: Payment = {
    id: p.id || uid(),
    student_id: p.student_id || '',
    receipt_no: p.receipt_no || (await nextReceiptNo()),
    allocations: p.allocations || [],
    source: p.source || 'general',
    amount: Number(p.amount || 0),
    method: p.method || 'cash',
    paid_at: p.paid_at || new Date().toISOString(),
    reference: p.reference || null,
    notes: p.notes || null,
    created_at: p.created_at || new Date().toISOString(),
    void_at: p.void_at || null,
    void_reason: p.void_reason || null,
  }
  return dbPut('payments', row)
}

/* ================================= المذكرات =================================*/
export const listBooklets = async (yearId?: string): Promise<Booklet[]> => {
  let list = await dbGetAll<Booklet>('booklets')
  if (yearId) list = list.filter((b) => b.year_id === yearId)
  return list.sort((a, b) => a.title.localeCompare(b.title, 'ar'))
}

export const saveBooklet = async (b: Partial<Booklet>): Promise<Booklet> => {
  const row: Booklet = {
    id: b.id || uid(),
    year_id: b.year_id || '',
    title: b.title || 'مذكرة جديدة',
    price: Number(b.price || 0),
    term: b.term || 'الترم الأول',
    notes: b.notes || null,
    created_at: b.created_at || new Date().toISOString(),
  }
  return dbPut('booklets', row)
}

export const deleteBooklet = async (id: string): Promise<void> => {
  await dbDelete('booklets', id)
  // حذف الحجوزات المرتبطة
  const orders = await dbGetAll<BookletOrder>('booklet_orders')
  for (const o of orders) {
    if (o.booklet_id === id) await dbDelete('booklet_orders', o.id)
  }
}

export const listBookletOrders = async (opts?: {
  bookletId?: string
  studentId?: string
  isDelivered?: boolean
}): Promise<BookletOrder[]> => {
  let list = await dbGetAll<BookletOrder>('booklet_orders')
  if (opts?.bookletId) list = list.filter((o) => o.booklet_id === opts.bookletId)
  if (opts?.studentId) list = list.filter((o) => o.student_id === opts.studentId)
  if (opts?.isDelivered !== undefined) list = list.filter((o) => o.is_delivered === opts.isDelivered)
  return list.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export const saveBookletOrder = async (o: Partial<BookletOrder>): Promise<BookletOrder> => {
  const prev = o.id ? await dbGetById<BookletOrder>('booklet_orders', o.id) : null
  const price = Math.max(0, Number(o.price || 0))
  const paid = Math.min(price, Math.max(0, Number(o.paid_amount || 0)))
  const remaining = Math.max(0, price - paid)
  const isDelivered = o.is_delivered ?? false

  const row: BookletOrder = {
    id: o.id || uid(),
    booklet_id: o.booklet_id || '',
    student_id: o.student_id || '',
    price,
    paid_amount: paid,
    remaining_amount: remaining,
    payment_method: o.payment_method || 'cash',
    is_delivered: isDelivered,
    delivered_at: isDelivered ? o.delivered_at || prev?.delivered_at || new Date().toISOString() : null,
    notes: o.notes || null,
    created_at: o.created_at || prev?.created_at || new Date().toISOString(),
  }
  const saved = await dbPut('booklet_orders', row)

  // تسجيل الفرق المدفوع في سجل المدفوعات حتى يظهر في الحسابات والتقارير
  const delta = paid - (prev?.paid_amount || 0)
  if (Math.abs(delta) > 0.001 && row.student_id) {
    const booklet = await dbGetById<Booklet>('booklets', row.booklet_id)
    await savePayment({
      student_id: row.student_id,
      amount: delta,
      method: row.payment_method,
      source: 'booklet',
      allocations: [{ kind: 'booklet', id: row.id, amount: delta }],
      notes: delta > 0 ? `مذكرة: ${booklet?.title || ''}` : `تصحيح مبلغ مذكرة: ${booklet?.title || ''}`,
    })
  }
  return saved
}

export const saveMultipleBookletOrders = async (params: {
  studentId: string
  items: { bookletId: string; price: number; paid: number }[]
  paymentMethod: 'cash' | 'wallet' | 'instapay'
  isDelivered: boolean
  notes?: string | null
}): Promise<{ created: number; totalRemaining: number }> => {
  if (!params.studentId) throw new Error('يرجى اختيار الطالب')
  if (params.items.length === 0) throw new Error('يرجى اختيار مذكرة واحدة على الأقل')
  // طالب بدون صف: نعرف صفه من صف المذكرات المحجوزة
  const st = await dbGetById<Student>('students', params.studentId)
  if (st && !st.year_id) {
    const b = await dbGetById<Booklet>('booklets', params.items[0].bookletId)
    if (b?.year_id) {
      st.year_id = b.year_id
      st.updated_at = new Date().toISOString()
      await dbPut('students', st)
    }
  }
  let created = 0
  let totalRemaining = 0
  for (const it of params.items) {
    const price = Math.max(0, Number(it.price || 0))
    const paid = Math.min(price, Math.max(0, Number(it.paid || 0)))
    const o = await saveBookletOrder({
      student_id: params.studentId,
      booklet_id: it.bookletId,
      price,
      paid_amount: paid,
      payment_method: params.paymentMethod,
      is_delivered: params.isDelivered,
      notes: params.notes || null,
    })
    totalRemaining += o.remaining_amount
    created++
  }
  return { created, totalRemaining }
}

export const toggleBookletDelivery = async (id: string): Promise<BookletOrder> => {
  const order = await dbGetById<BookletOrder>('booklet_orders', id)
  if (!order) throw new Error('الطلب غير موجود')
  order.is_delivered = !order.is_delivered
  order.delivered_at = order.is_delivered ? new Date().toISOString() : null
  return dbPut('booklet_orders', order)
}

export const deleteBookletOrder = async (id: string): Promise<void> => {
  // إلغاء الدفعات الخاصة بهذا الحجز فقط حتى لا تظل محسوبة في التحصيل
  const payments = await dbGetAll<Payment>('payments')
  for (const p of payments) {
    if (p.void_at || !p.allocations?.length) continue
    if (p.allocations.every((a) => a.kind === 'booklet' && a.id === id)) {
      p.void_at = new Date().toISOString()
      p.void_reason = 'حذف حجز المذكرة'
      await dbPut('payments', p)
    }
  }
  await dbDelete('booklet_orders', id)
}

export const bulkDeliverBookletOrders = async (
  orderIds: string[],
  isDelivered: boolean = true,
): Promise<number> => {
  let count = 0
  for (const id of orderIds) {
    const order = await dbGetById<BookletOrder>('booklet_orders', id)
    if (order && order.is_delivered !== isDelivered) {
      order.is_delivered = isDelivered
      order.delivered_at = isDelivered ? new Date().toISOString() : null
      await dbPut('booklet_orders', order)
      count++
    }
  }
  return count
}

export const bulkDeliverByFilter = async (params: {
  bookletId?: string
  yearId?: string
}): Promise<number> => {
  const orders = await dbGetAll<BookletOrder>('booklet_orders')
  const students = await dbGetAll<Student>('students')
  const booklets = await dbGetAll<Booklet>('booklets')

  const studentMap = new Map(students.map((s) => [s.id, s]))
  const bookletMap = new Map(booklets.map((b) => [b.id, b]))

  let count = 0
  for (const o of orders) {
    if (o.is_delivered) continue
    if (params.bookletId && o.booklet_id !== params.bookletId) continue

    if (params.yearId) {
      const s = studentMap.get(o.student_id)
      const b = bookletMap.get(o.booklet_id)
      if (s?.year_id !== params.yearId && b?.year_id !== params.yearId) continue
    }

    o.is_delivered = true
    o.delivered_at = new Date().toISOString()
    await dbPut('booklet_orders', o)
    count++
  }
  return count
}

export const bulkIssueBookletToYear = async (params: {
  bookletId: string
  yearId: string
  targetStudentIds?: string[]
  onlyEnrolled?: boolean
  isDelivered?: boolean
  defaultPaid?: number
}): Promise<{ created: number; updated: number; untouched: number; total: number }> => {
  const booklet = await dbGetById<Booklet>('booklets', params.bookletId)
  if (!booklet) throw new Error('المذكرة غير موجودة')

  const students = await dbGetAll<Student>('students')
  const targetStudents = students.filter((s) => {
    if (s.year_id !== params.yearId) return false
    if (params.targetStudentIds && params.targetStudentIds.length > 0) {
      return params.targetStudentIds.includes(s.id)
    }
    if (params.onlyEnrolled && !s.is_enrolled) return false
    return true
  })

  const existingOrders = await dbGetAll<BookletOrder>('booklet_orders')
  const existingMap = new Map<string, BookletOrder>()
  for (const o of existingOrders) {
    if (o.booklet_id === params.bookletId) {
      existingMap.set(o.student_id, o)
    }
  }

  let created = 0
  let updated = 0
  let untouched = 0
  const isDelivered = params.isDelivered ?? true
  const paid = Math.min(booklet.price, Math.max(0, Number(params.defaultPaid || 0)))
  const remaining = Math.max(0, booklet.price - paid)

  for (const s of targetStudents) {
    const existing = existingMap.get(s.id)
    if (existing) {
      if (isDelivered && !existing.is_delivered) {
        existing.is_delivered = true
        existing.delivered_at = new Date().toISOString()
        await dbPut('booklet_orders', existing)
        updated++
      } else {
        untouched++
      }
    } else {
      const newOrder: BookletOrder = {
        id: uid(),
        booklet_id: params.bookletId,
        student_id: s.id,
        price: booklet.price,
        paid_amount: paid,
        remaining_amount: remaining,
        payment_method: 'cash',
        is_delivered: isDelivered,
        delivered_at: isDelivered ? new Date().toISOString() : null,
        notes: paid === 0 ? 'استلم مع تأجيل الدفع (تسليم جماعي)' : null,
        created_at: new Date().toISOString(),
      }
      await dbPut('booklet_orders', newOrder)
      if (paid > 0) {
        await savePayment({
          student_id: s.id,
          amount: paid,
          method: 'cash',
          source: 'booklet',
          allocations: [{ kind: 'booklet', id: newOrder.id, amount: paid }],
          notes: `مذكرة: ${booklet.title} (تسليم جماعي)`,
        })
      }
      created++
    }
  }

  return { created, updated, untouched, total: targetStudents.length }
}

/** تسجيل وحجز مواد متعددة لطالب دفعة واحدة مع تطبيق أسعار الباقات */
export const enrollStudentInMultipleSubjects = async (params: {
  studentId: string
  subjectIds: string[]
  prices?: Record<string, number | null>
}): Promise<{ added: number; removed: number; kept: number }> => {
  const existing = await listStudentSubjects(params.studentId)
  const existingMap = new Map(existing.map((e) => [e.subject_id, e]))
  const targetSet = new Set(params.subjectIds)

  let added = 0
  let removed = 0
  let kept = 0

  // 1. حذف المواد غير المحددة
  for (const e of existing) {
    if (!targetSet.has(e.subject_id)) {
      await removeStudentSubject(e.id)
      removed++
    }
  }

  // 2. حفظ المواد المحددة
  for (const subId of params.subjectIds) {
    const cur = existingMap.get(subId)
    const override = params.prices?.[subId] !== undefined ? params.prices[subId] : (cur?.price_override ?? null)
    if (cur) {
      if (cur.price_override !== override || !cur.is_active) {
        cur.price_override = override
        cur.is_active = true
        await saveStudentSubject(cur)
      }
      kept++
    } else {
      await saveStudentSubject({
        student_id: params.studentId,
        subject_id: subId,
        price_override: override,
        is_active: true,
      })
      added++
    }
  }

  // 3. تحديث حالة اشتراك الطالب
  const st = await dbGetById<Student>('students', params.studentId)
  if (st) {
    st.is_enrolled = params.subjectIds.length > 0
    await dbPut('students', st)
  }

  return { added, removed, kept }
}

export const payBookletOrder = async (
  orderId: string,
  paymentAmount: number,
  method: 'cash' | 'wallet' | 'instapay' = 'cash',
): Promise<BookletOrder> => {
  const order = await dbGetById<BookletOrder>('booklet_orders', orderId)
  if (!order) throw new Error('الطلب غير موجود')
  await recordPayment({
    studentId: order.student_id,
    amount: Math.min(order.remaining_amount, Math.max(0, paymentAmount)),
    method,
    bookletOrderId: orderId,
    onlyTarget: true,
  })
  return (await dbGetById<BookletOrder>('booklet_orders', orderId))!
}

/* ================================= الإعدادات =================================*/
export const getSettings = async (): Promise<AppSettings> => {
  let s = await dbGetById<AppSettings>('settings', 'app_settings')
  if (!s) {
    s = {
      id: 'app_settings',
      app_name: 'منصّة المعلّم',
      short_name: 'المعلّم',
      tagline: 'نظام إدارة الدروس والطلاب',
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
      default_sessions_per_cycle: 8,
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
    await dbPut('settings', s)
  }
  return s
}

export const saveSettings = async (patch: Partial<AppSettings>): Promise<AppSettings> => {
  const current = await getSettings()
  const updated: AppSettings = {
    ...current,
    ...patch,
    updated_at: new Date().toISOString(),
  }
  return dbPut('settings', updated)
}

/* ========================== النسخ الاحتياطي ==========================*/
export const listBackups = async (): Promise<BackupSnapshot[]> => {
  const list = await dbGetAll<BackupSnapshot>('backups')
  return list.sort((a, b) => b.timestamp - a.timestamp)
}

export const restoreBackupById = async (id: string): Promise<void> => {
  const snapshot = await dbGetById<BackupSnapshot>('backups', id)
  if (!snapshot) throw new Error('النسخة الاحتياطية غير موجودة')
  const dump = JSON.parse(snapshot.dump_json)
  await restoreDatabaseDump(dump)
}

export const deleteBackup = async (id: string): Promise<void> => {
  await dbDelete('backups', id)
}

export const exportBackupJSON = async (): Promise<string> => {
  const dump = await exportDatabaseDump()
  return JSON.stringify(dump, null, 2)
}

export const importBackupJSON = async (jsonString: string): Promise<void> => {
  const dump = JSON.parse(jsonString)
  await restoreDatabaseDump(dump)
}

export { triggerDailyRollingBackup, ensureStoragePersistence, getStorageStatus }

/** تسجيل أن المستخدم حفظ نسخة كملف على جهازه */
export const markFileBackupDone = async (): Promise<void> => {
  await saveSettings({ last_file_backup_at: new Date().toISOString() })
}

/* ============================ الإحصائيات العامة ============================*/
export const dashboardStats = async (): Promise<DashboardStats> => {
  const [students, charges, sessions, years, bookletOrders, payments] = await Promise.all([
    listStudents(),
    listCharges(),
    listSessions(),
    listYears(),
    listBookletOrders(),
    listPayments(),
  ])

  const activeStudents = students.filter((s) => s.status === 'active')
  const enrolledStudents = students.filter((s) => s.is_enrolled)
  const schoolOnlyStudents = students.filter((s) => !s.is_enrolled)

  const liveCharges = charges.filter((c) => !c.void_at)
  const livePayments = payments.filter((p) => !p.void_at)
  const total_due = liveCharges.reduce((acc, c) => acc + Number(c.amount), 0)
  const lessonsPaid = liveCharges.reduce((acc, c) => acc + Number(c.paid_amount), 0)
  const outstanding = Math.max(0, total_due - lessonsPaid)

  // الطلاب المديونون (دروس + مذكرات)
  const studentDebtMap = new Map<string, number>()
  for (const c of liveCharges) {
    const diff = Number(c.amount) - Number(c.paid_amount)
    if (diff > 0.001) studentDebtMap.set(c.student_id, (studentDebtMap.get(c.student_id) || 0) + diff)
  }
  for (const o of bookletOrders) {
    if (o.remaining_amount > 0.001) studentDebtMap.set(o.student_id, (studentDebtMap.get(o.student_id) || 0) + o.remaining_amount)
  }

  const students_debt = studentDebtMap.size
  const students_clear = Math.max(0, students.length - students_debt)

  const now = new Date()
  const today = localISO(now)
  const monthKey = today.slice(0, 7)
  const yearKey = today.slice(0, 4)
  const weekEnd = localISO(new Date(now.getTime() + 6 * 86400000))
  const sessions_today = sessions.filter((s) => s.session_date === today && s.status !== 'cancelled').length
  const sessions_week = sessions.filter((s) => s.session_date >= today && s.session_date <= weekEnd && s.status !== 'cancelled').length

  const total_paid = livePayments.reduce((a, p) => a + Number(p.amount), 0)
  const paid_this_month = livePayments.filter((p) => localISO(new Date(p.paid_at)).startsWith(monthKey)).reduce((a, p) => a + Number(p.amount), 0)
  const paid_this_year = livePayments.filter((p) => localISO(new Date(p.paid_at)).startsWith(yearKey)).reduce((a, p) => a + Number(p.amount), 0)

  // إحصائيات المذكرات
  const booklets_delivered = bookletOrders.filter((o) => o.is_delivered).length
  const booklets_pending_delivery = bookletOrders.filter((o) => !o.is_delivered).length
  const booklets_debt = bookletOrders.reduce((sum, o) => sum + o.remaining_amount, 0)

  // توزيع السنوات (دروس + مذكرات)
  const yearOf = new Map(students.map((s) => [s.id, s.year_id]))
  const by_year = years.map((y) => {
    const paid = livePayments.filter((p) => yearOf.get(p.student_id) === y.id).reduce((a, p) => a + Number(p.amount), 0)
    let out = 0
    for (const [sid, debt] of studentDebtMap) if (yearOf.get(sid) === y.id) out += debt
    return {
      id: y.id,
      name: y.name,
      paid,
      outstanding: out,
      students: students.filter((s) => s.year_id === y.id).length,
    }
  })

  return {
    students_total: students.length,
    students_active: activeStudents.length,
    students_enrolled: enrolledStudents.length,
    students_school_only: schoolOnlyStudents.length,
    students_debt,
    students_clear,
    total_due,
    total_paid,
    outstanding,
    paid_this_month,
    paid_this_year,
    sessions_today,
    sessions_week,
    booklets_total_orders: bookletOrders.length,
    booklets_delivered,
    booklets_pending_delivery,
    booklets_debt,
    by_year,
  }
}

/** تاريخ محلي بصيغة YYYY-MM-DD (بدون انزياح المنطقة الزمنية) */
export const localISO = (d: Date): string => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/* ============================ ترحيل البيانات القديمة ============================ */
const DATA_VERSION = 3

/**
 * يُشغَّل مرة واحدة عند فتح التطبيق: يعطي الطلاب أكواداً، ويسجّل مدفوعات المذكرات القديمة
 * في سجل المدفوعات، ويصحح حالات المستحقات، ويحذف سجلات الحضور التالفة.
 */
export const runMigrations = async (): Promise<void> => {
  const settings = await getSettings()
  if ((settings.data_version || 0) >= DATA_VERSION) return

  // 1) أكواد الطلاب
  const students = await dbGetAll<Student>('students')
  let seq = Number((await nextStudentCode(students)).slice(1))
  for (const st of students.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (!st.code) {
      st.code = 'S' + String(seq++).padStart(4, '0')
      await dbPut('students', st)
    }
  }

  // 2) مدفوعات المذكرات القديمة
  const payments = await dbGetAll<Payment>('payments')
  const loggedPerOrder = new Map<string, number>()
  for (const p of payments) {
    if (p.void_at) continue
    for (const a of p.allocations || []) if (a.kind === 'booklet') loggedPerOrder.set(a.id, (loggedPerOrder.get(a.id) || 0) + a.amount)
  }
  const booklets = new Map((await dbGetAll<Booklet>('booklets')).map((b) => [b.id, b]))
  let receipt = payments.reduce((m, p) => Math.max(m, p.receipt_no || 0), 0)
  for (const p of payments.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (!p.receipt_no) {
      p.receipt_no = ++receipt
      await dbPut('payments', p)
    }
  }
  for (const o of await dbGetAll<BookletOrder>('booklet_orders')) {
    const missing = o.paid_amount - (loggedPerOrder.get(o.id) || 0)
    if (missing > 0.001) {
      await dbPut('payments', {
        id: uid(),
        student_id: o.student_id,
        receipt_no: ++receipt,
        allocations: [{ kind: 'booklet', id: o.id, amount: missing }],
        source: 'booklet',
        amount: missing,
        method: o.payment_method,
        paid_at: o.created_at,
        reference: null,
        notes: `مذكرة: ${booklets.get(o.booklet_id)?.title || ''} (سجل سابق)`,
        created_at: o.created_at,
        void_at: null,
        void_reason: null,
      } as Payment)
    }
  }

  // 3) حالات المستحقات
  for (const c of await dbGetAll<Charge>('charges')) {
    const st = chargeStatus(c)
    if (st !== c.status) {
      c.status = st
      await dbPut('charges', c)
    }
  }

  // 4) التأكد من وجود الصف الأول والثاني والثالث
  await ensureGradeYears()

  // 5) سجلات حضور تالفة من الإصدار السابق
  for (const a of await dbGetAll<Attendance>('attendance')) {
    if (!a.session_id || !a.student_id) await dbDelete('attendance', a.id)
  }

  await saveSettings({ data_version: DATA_VERSION })
}

/* ============================ التقارير ============================ */
export interface CollectionRow {
  payment: Payment
  studentName: string
  studentCode: string
  yearId: string | null
}

/** مدفوعات فترة (افتراضياً يوم واحد) مع إجمالي لكل طريقة دفع */
export const collectionReport = async (from: string, to: string) => {
  const [payments, students] = await Promise.all([listPayments(), listStudents()])
  const sMap = new Map(students.map((s) => [s.id, s]))
  const rows: CollectionRow[] = payments
    .filter((p) => !p.void_at)
    .filter((p) => {
      const d = localISO(new Date(p.paid_at))
      return d >= from && d <= to
    })
    .map((p) => ({
      payment: p,
      studentName: sMap.get(p.student_id)?.full_name || 'طالب محذوف',
      studentCode: sMap.get(p.student_id)?.code || '',
      yearId: sMap.get(p.student_id)?.year_id || null,
    }))
    .sort((a, b) => a.payment.paid_at.localeCompare(b.payment.paid_at))
  const byMethod: Record<string, number> = {}
  let lessons = 0
  let booklets = 0
  for (const r of rows) {
    const amt = Number(r.payment.amount)
    byMethod[r.payment.method] = (byMethod[r.payment.method] || 0) + amt
    const allocs = r.payment.allocations || []
    if (allocs.length === 0) {
      if (r.payment.source === 'booklet') booklets += amt
      else lessons += amt
    } else {
      for (const a of allocs) {
        if (a.kind === 'booklet') booklets += a.amount
        else lessons += a.amount
      }
      const unalloc = amt - allocs.reduce((x, a) => x + a.amount, 0)
      if (unalloc > 0.001) lessons += unalloc
    }
  }
  const total = rows.reduce((a, r) => a + Number(r.payment.amount), 0)
  return { rows, byMethod, total, lessons, booklets }
}

/* ============================ دوال إضافية للنظام ============================ */
/** تاريخ الدفع: لو تم اختيار يوم فقط نضيف له الوقت الحالي بالتوقيت المحلي */
const paidAtISO = (v?: string): string => {
  if (!v) return new Date().toISOString()
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split('-').map(Number)
    const now = new Date()
    return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString()
  }
  return new Date(v).toISOString()
}

/**
 * تسجيل دفعة للطالب وتوزيعها تلقائياً: البند المحدد أولاً، ثم أقدم مستحقات الدروس، ثم أقدم المذكرات.
 */
export const recordPayment = async (data: {
  studentId: string
  amount: number
  method?: string
  paidAt?: string
  notes?: string | null
  chargeId?: string | null
  bookletOrderId?: string | null
  /** الخصم من البند المحدد فقط */
  onlyTarget?: boolean
  /** تضمين ديون المذكرات في التوزيع التلقائي (افتراضياً نعم) */
  includeBooklets?: boolean
  reference?: string | null
}): Promise<Payment> => {
  const amount = Math.round(Number(data.amount || 0) * 100) / 100
  if (!data.studentId) throw new Error('اختر الطالب أولاً')
  if (!(amount > 0)) throw new Error('أدخل مبلغاً صحيحاً')

  let remaining = amount
  const allocations: PaymentSplit[] = []

  const charges = (await listCharges(data.studentId))
    .filter((c) => !c.void_at && Number(c.amount) - Number(c.paid_amount) > 0.001)
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.created_at.localeCompare(b.created_at))
  const orders = (await listBookletOrders({ studentId: data.studentId }))
    .filter((o) => o.remaining_amount > 0.001)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  const payCharge = async (c: Charge) => {
    if (remaining <= 0) return
    const pay = Math.min(remaining, Number(c.amount) - Number(c.paid_amount))
    if (pay <= 0) return
    c.paid_amount = Number(c.paid_amount) + pay
    remaining -= pay
    allocations.push({ kind: 'charge', id: c.id, amount: pay })
    await saveCharge(c)
  }
  const payOrder = async (o: BookletOrder) => {
    if (remaining <= 0) return
    const pay = Math.min(remaining, o.remaining_amount)
    if (pay <= 0) return
    o.paid_amount += pay
    o.remaining_amount = Math.max(0, o.price - o.paid_amount)
    if (data.method === 'cash' || data.method === 'wallet' || data.method === 'instapay') o.payment_method = data.method
    remaining -= pay
    allocations.push({ kind: 'booklet', id: o.id, amount: pay })
    await dbPut('booklet_orders', o)
  }

  if (data.chargeId) {
    const t = charges.find((c) => c.id === data.chargeId)
    if (t) await payCharge(t)
  }
  if (data.bookletOrderId) {
    const t = orders.find((o) => o.id === data.bookletOrderId)
    if (t) await payOrder(t)
  }
  if (!data.onlyTarget) {
    for (const c of charges) if (c.id !== data.chargeId) await payCharge(c)
    if (data.includeBooklets !== false) for (const o of orders) if (o.id !== data.bookletOrderId) await payOrder(o)
  }

  const onlyBooklets = allocations.length > 0 && allocations.every((a) => a.kind === 'booklet')
  const extra = remaining > 0.001 ? `رصيد زائد ${remaining} لم يُخصم من أي بند` : ''
  return savePayment({
    student_id: data.studentId,
    amount,
    method: (data.method as Payment['method']) || 'cash',
    paid_at: paidAtISO(data.paidAt),
    notes: [data.notes, extra].filter(Boolean).join(' · ') || null,
    reference: data.reference || null,
    allocations,
    source: onlyBooklets ? 'booklet' : 'general',
  })
}

/** إلغاء دفعة وإرجاع مبالغها إلى البنود التي سددتها */
export const voidPayment = async (id: string, reason?: string): Promise<void> => {
  const p = await dbGetById<Payment>('payments', id)
  if (!p || p.void_at) return
  for (const a of p.allocations || []) {
    if (a.kind === 'charge') {
      const c = await dbGetById<Charge>('charges', a.id)
      if (c) {
        c.paid_amount = Math.max(0, Number(c.paid_amount) - a.amount)
        await saveCharge(c)
      }
    } else {
      const o = await dbGetById<BookletOrder>('booklet_orders', a.id)
      if (o) {
        o.paid_amount = Math.min(o.price, Math.max(0, o.paid_amount - a.amount))
        o.remaining_amount = Math.max(0, o.price - o.paid_amount)
        await dbPut('booklet_orders', o)
      }
    }
  }
  p.void_at = new Date().toISOString()
  p.void_reason = reason || 'إلغاء الدفعة'
  await dbPut('payments', p)
}

export const addBulkCharge = async (params: {
  title: string
  amount: number
  due?: string
  dueDate?: string
  notes?: string | null
  studentIds?: string[]
  groupIds?: string[]
  yearIds?: string[]
  all?: boolean
}): Promise<number> => {
  const students = (await dbGetAll<Student>('students')).filter((s) => s.status === 'active')
  const target = new Set<string>(params.studentIds || [])
  for (const s of students) {
    if (params.all) target.add(s.id)
    else if (s.group_id && params.groupIds?.includes(s.group_id)) target.add(s.id)
    else if (s.year_id && params.yearIds?.includes(s.year_id)) target.add(s.id)
  }
  if (target.size === 0) throw new Error('لا يوجد طلاب مطابقون للاختيار')
  const batch = uid()
  for (const sId of target) {
    await saveCharge({
      student_id: sId,
      kind: 'extra',
      amount: params.amount,
      title: params.title,
      notes: params.notes || null,
      batch_id: batch,
      due_date: params.due || params.dueDate || new Date().toISOString().slice(0, 10),
      paid_amount: 0,
    })
  }
  return target.size
}

export const generateSessions = async (rows: Partial<ClassSession>[]): Promise<ClassSession[]> => {
  const result: ClassSession[] = []
  for (const row of rows) {
    const s = await saveSession(row)
    result.push(s)
  }
  return result
}

// مشاريع / بنك أسئلة (أوفلاين)
export const saveProject = async (p: any) => p
export const deleteProject = async (id: string) => {}
export const saveQuestion = async (q: any) => q
export const deleteQuestion = async (id: string) => {}
export const setEnrollments = async (pId: string, sIds: string[]) => {}
export const saveProgress = async (prog: any) => prog

// رسائل وملفات (أوفلاين)
export const listMessageFiles = async () => []
export const deleteMessage = async (id: string) => {}
export const sendMessage = async (m: any) => m
export const deleteFile = async (id: string) => {}
export const uploadFile = async (f: any) => ({ url: '' })
export const fileUrl = (path: string) => path
