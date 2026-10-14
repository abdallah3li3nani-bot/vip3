import type {
  AcademicYear, Booklet, BookletCost, BookletOrder, Charge, Student, StudentSubject, Subject,
} from './database.types'

/** طالب مشترك في الدروس داخل صف */
export interface LessonStudentRow {
  student: Student
  subjects: Subject[]
  outstanding: number
}

/** طالب حاجز مذكرات داخل صف (مرة واحدة مهما كان عدد مذكراته) */
export interface BookletStudentRow {
  student: Student
  orders: BookletOrder[]
  titles: string[]
  price: number
  paid: number
  remaining: number
  undelivered: number
}

export interface MoneyBlock {
  due: number
  collected: number
  remaining: number
}

export interface BookletMoney {
  sales: number
  collected: number
  remaining: number
  cost: number
  /** صافي الربح الفعلي = المحصّل − التكلفة */
  netProfit: number
  /** الربح المتوقع لو اتحصّل كل المتبقي = المبيعات − التكلفة */
  expectedProfit: number
}

export interface GradeStats {
  year: AcademicYear
  studentsTotal: number
  lessons: MoneyBlock & {
    students: LessonStudentRow[]
    bySubject: { subject: Subject; count: number }[]
  }
  booklets: BookletMoney & {
    students: BookletStudentRow[]
    paidStudents: BookletStudentRow[]
    unpaidStudents: BookletStudentRow[]
    notBooked: Student[]
    pendingCopies: number
    costs: BookletCost[]
  }
}

export interface StatsInput {
  years: AcademicYear[]
  students: Student[]
  enrollments: StudentSubject[]
  subjects: Subject[]
  charges: Charge[]
  orders: BookletOrder[]
  booklets: Booklet[]
  costs: BookletCost[]
}

const byName = (a: { student: Student }, b: { student: Student }) =>
  a.student.full_name.localeCompare(b.student.full_name, 'ar')

/** صف الطالب الفعلي: لو صفه مش موجود في التطبيق يتعامل كـ "بدون صف" */
export function computeGradeStats(input: StatsInput): GradeStats[] {
  const { years, students, enrollments, subjects, charges, orders, booklets, costs } = input
  const subjectById = new Map(subjects.map((s) => [s.id, s]))
  const bookletById = new Map(booklets.map((b) => [b.id, b]))
  const liveCharges = charges.filter((c) => !c.void_at)

  return years.map((year) => {
    const yearStudents = students.filter((s) => s.year_id === year.id)
    const ids = new Set(yearStudents.map((s) => s.id))

    /* ---------------- الدروس ---------------- */
    const subjMap = new Map<string, Subject[]>()
    for (const e of enrollments) {
      if (!e.is_active || !ids.has(e.student_id)) continue
      const sub = subjectById.get(e.subject_id)
      if (!sub) continue
      subjMap.set(e.student_id, [...(subjMap.get(e.student_id) || []), sub])
    }
    const lessonCharges = liveCharges.filter((c) => ids.has(c.student_id))
    const outByStudent = new Map<string, number>()
    for (const c of lessonCharges) {
      const d = Math.max(0, Number(c.amount) - Number(c.paid_amount))
      if (d > 0) outByStudent.set(c.student_id, (outByStudent.get(c.student_id) || 0) + d)
    }
    const lessonStudents: LessonStudentRow[] = yearStudents
      .filter((s) => subjMap.has(s.id))
      .map((s) => ({ student: s, subjects: subjMap.get(s.id)!, outstanding: outByStudent.get(s.id) || 0 }))
      .sort(byName)
    const subjCount = new Map<string, number>()
    for (const r of lessonStudents) for (const sub of r.subjects) subjCount.set(sub.id, (subjCount.get(sub.id) || 0) + 1)
    const bySubject = subjects
      .filter((s) => s.year_id === year.id)
      .map((subject) => ({ subject, count: subjCount.get(subject.id) || 0 }))
    const lDue = lessonCharges.reduce((a, c) => a + Number(c.amount), 0)
    const lPaid = lessonCharges.reduce((a, c) => a + Number(c.paid_amount), 0)

    /* ---------------- المذكرات ---------------- */
    const orderMap = new Map<string, BookletOrder[]>()
    for (const o of orders) {
      if (!ids.has(o.student_id)) continue
      orderMap.set(o.student_id, [...(orderMap.get(o.student_id) || []), o])
    }
    const bookletStudents: BookletStudentRow[] = yearStudents
      .filter((s) => orderMap.has(s.id))
      .map((s) => {
        const os = orderMap.get(s.id)!
        return {
          student: s,
          orders: os,
          titles: os.map((o) => bookletById.get(o.booklet_id)?.title || 'مذكرة'),
          price: os.reduce((a, o) => a + o.price, 0),
          paid: os.reduce((a, o) => a + o.paid_amount, 0),
          remaining: os.reduce((a, o) => a + o.remaining_amount, 0),
          undelivered: os.filter((o) => !o.is_delivered).length,
        }
      })
      .sort(byName)
    const gradeCosts = costs.filter((c) => c.year_id === year.id)
    const sales = bookletStudents.reduce((a, r) => a + r.price, 0)
    const collected = bookletStudents.reduce((a, r) => a + r.paid, 0)
    const cost = gradeCosts.reduce((a, c) => a + Number(c.amount), 0)

    return {
      year,
      studentsTotal: yearStudents.length,
      lessons: {
        due: lDue,
        collected: lPaid,
        remaining: Math.max(0, lDue - lPaid),
        students: lessonStudents,
        bySubject,
      },
      booklets: {
        sales,
        collected,
        remaining: bookletStudents.reduce((a, r) => a + r.remaining, 0),
        cost,
        netProfit: collected - cost,
        expectedProfit: sales - cost,
        students: bookletStudents,
        paidStudents: bookletStudents.filter((r) => r.remaining <= 0.001),
        unpaidStudents: bookletStudents.filter((r) => r.remaining > 0.001),
        notBooked: yearStudents.filter((s) => !orderMap.has(s.id) && s.status === 'active').sort((a, b) => a.full_name.localeCompare(b.full_name, 'ar')),
        pendingCopies: bookletStudents.reduce((a, r) => a + r.undelivered, 0),
        costs: gradeCosts,
      },
    }
  })
}

/** إجمالي كل الصفوف */
export function sumGrades(stats: GradeStats[]) {
  const t = {
    lessons: { due: 0, collected: 0, remaining: 0, students: 0 },
    booklets: { sales: 0, collected: 0, remaining: 0, cost: 0, netProfit: 0, expectedProfit: 0, students: 0 },
  }
  for (const g of stats) {
    t.lessons.due += g.lessons.due
    t.lessons.collected += g.lessons.collected
    t.lessons.remaining += g.lessons.remaining
    t.lessons.students += g.lessons.students.length
    t.booklets.sales += g.booklets.sales
    t.booklets.collected += g.booklets.collected
    t.booklets.remaining += g.booklets.remaining
    t.booklets.cost += g.booklets.cost
    t.booklets.netProfit += g.booklets.netProfit
    t.booklets.expectedProfit += g.booklets.expectedProfit
    t.booklets.students += g.booklets.students.length
  }
  return t
}
