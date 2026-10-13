import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'
import * as api from './api'
import type { Charge, Student, Booklet, BookletOrder, BackupSnapshot } from './database.types'

const FIVE_MIN = 5 * 60 * 1000

export function humanError(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e ?? '')
  return m || 'حدث خطأ غير متوقع'
}

/* ============================ استعلامات مرجعية ============================ */
export const useYears = () => useQuery({ queryKey: ['years'], queryFn: api.listYears, staleTime: FIVE_MIN })
export const useGroups = () => useQuery({ queryKey: ['groups'], queryFn: api.listGroups, staleTime: FIVE_MIN })
export const useSubjects = () => useQuery({ queryKey: ['subjects'], queryFn: api.listSubjects, staleTime: FIVE_MIN })
export const useStudents = () => useQuery({ queryKey: ['students'], queryFn: api.listStudents, staleTime: 30_000 })
export const useStudent = (id?: string) =>
  useQuery({ queryKey: ['student', id], queryFn: () => api.getStudent(id!), enabled: !!id })

export const useStudentSubjects = (studentId?: string) =>
  useQuery({ queryKey: ['student_subjects', studentId ?? 'all'], queryFn: () => api.listStudentSubjects(studentId) })

export const useSessions = (from?: string, to?: string) =>
  useQuery({ queryKey: ['sessions', from ?? '', to ?? ''], queryFn: () => api.listSessions(from, to) })

export const useSessionAttendance = (sessionId?: string) =>
  useQuery({ queryKey: ['attendance', sessionId], queryFn: () => api.listAttendance({ sessionId }), enabled: !!sessionId })

export const useAttendanceAll = () =>
  useQuery({ queryKey: ['attendance-all'], queryFn: () => api.listAttendance({}), staleTime: 30_000 })

export const useStudentAttendance = (studentId?: string) =>
  useQuery({ queryKey: ['attendance-student', studentId], queryFn: () => api.listAttendance({ studentId }), enabled: !!studentId })

export const useCycles = (studentId?: string) =>
  useQuery({ queryKey: ['cycles', studentId ?? 'all'], queryFn: () => api.listCycles(studentId) })

export const useCharges = (studentId?: string) =>
  useQuery({ queryKey: ['charges', studentId ?? 'all'], queryFn: () => api.listCharges(studentId) })

export const usePayments = (studentId?: string) =>
  useQuery({ queryKey: ['payments', studentId ?? 'all'], queryFn: () => api.listPayments(studentId) })

export const usePayment = (id?: string) =>
  useQuery({ queryKey: ['payments', 'one', id], queryFn: () => api.getPayment(id!), enabled: !!id })

export const useCollection = (from: string, to: string) =>
  useQuery({ queryKey: ['payments', 'collection', from, to], queryFn: () => api.collectionReport(from, to) })

/* ============================ المذكرات ============================ */
export const useBooklets = (yearId?: string) =>
  useQuery({ queryKey: ['booklets', yearId ?? 'all'], queryFn: () => api.listBooklets(yearId) })

export const useBookletOrders = (opts?: { bookletId?: string; studentId?: string; isDelivered?: boolean }) =>
  useQuery({
    queryKey: ['booklet_orders', opts?.bookletId ?? 'all', opts?.studentId ?? 'all', opts?.isDelivered ?? 'all'],
    queryFn: () => api.listBookletOrders(opts),
  })

/* ========================== النسخ والبيانات ==========================*/
export const useBackups = () => useQuery({ queryKey: ['backups'], queryFn: api.listBackups })
export const useStorage = () => useQuery({ queryKey: ['storage_status'], queryFn: api.getStorageStatus })

export const useDashboard = () => useQuery({ queryKey: ['dashboard'], queryFn: api.dashboardStats, staleTime: 15_000 })

// مصفوفات المشاريع والرسائل والملفات (للتوافق مع بقية الشاشات)
export const useProjects = () => useQuery({ queryKey: ['projects'], queryFn: async () => [] })
export const useQuestions = (projectId?: string) => useQuery({ queryKey: ['questions', projectId ?? 'all'], queryFn: async () => [] })
export const useEnrollments = (projectId?: string) => useQuery({ queryKey: ['enrollments', projectId ?? 'all'], queryFn: async () => [] })
export const useProgress = (opts: { studentId?: string; questionIds?: string[] } = {}) =>
  useQuery({ queryKey: ['progress'], queryFn: async () => [] })
export const useMessages = () => useQuery({ queryKey: ['messages'], queryFn: async () => [] })
export const useFiles = () => useQuery({ queryKey: ['files'], queryFn: async () => [] })
export const useNotifications = (studentId?: string) => useQuery({ queryKey: ['notifications'], queryFn: async () => [] })
export const useAuditLogs = () => useQuery({ queryKey: ['audit'], queryFn: async () => [] })

/* ============================ طفرات مع تنبيهات ============================ */
export function useAction<TArgs, TResult>(
  fn: (a: TArgs) => Promise<TResult>,
  opts: {
    success?: string | ((r: TResult) => string)
    invalidate?: QueryKey[]
    onDone?: (r: TResult) => void
  } = {},
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      if (opts.success) toast.success(typeof opts.success === 'function' ? opts.success(r) : opts.success)
      for (const k of opts.invalidate ?? []) qc.invalidateQueries({ queryKey: k })
      opts.onDone?.(r)
    },
    onError: (e) => toast.error(humanError(e)),
  })
}

/* ============================ حسابات مشتقة ============================ */
export interface StudentFinance {
  due: number
  paid: number
  outstanding: number
  unpaid: Charge[]
}

export function computeFinance(charges: Charge[]): StudentFinance {
  const live = charges.filter((c) => !c.void_at)
  const due = live.reduce((a, c) => a + Number(c.amount), 0)
  const paid = live.reduce((a, c) => a + Number(c.paid_amount), 0)
  return {
    due,
    paid,
    outstanding: Math.max(0, due - paid),
    unpaid: live.filter((c) => Number(c.amount) - Number(c.paid_amount) > 0.001),
  }
}

/** خريطة الأرصدة لكل الطلاب دفعة واحدة (دروس + مذكرات) */
export interface StudentBalance {
  due: number
  paid: number
  outstanding: number
  lessonsOutstanding: number
  bookletsOutstanding: number
}

export function useBalances() {
  const { data: charges = [], isLoading: l1 } = useCharges()
  const { data: orders = [], isLoading: l2 } = useBookletOrders()
  const map = useMemo(() => {
    const m = new Map<string, StudentBalance>()
    const get = (id: string) => {
      let cur = m.get(id)
      if (!cur) {
        cur = { due: 0, paid: 0, outstanding: 0, lessonsOutstanding: 0, bookletsOutstanding: 0 }
        m.set(id, cur)
      }
      return cur
    }
    for (const c of charges) {
      if (c.void_at) continue
      const cur = get(c.student_id)
      cur.due += Number(c.amount)
      cur.paid += Number(c.paid_amount)
      cur.lessonsOutstanding += Math.max(0, Number(c.amount) - Number(c.paid_amount))
    }
    for (const o of orders) {
      const cur = get(o.student_id)
      cur.due += Number(o.price)
      cur.paid += Number(o.paid_amount)
      cur.bookletsOutstanding += Number(o.remaining_amount)
    }
    for (const v of m.values()) v.outstanding = v.lessonsOutstanding + v.bookletsOutstanding
    return m
  }, [charges, orders])
  return { balances: map, isLoading: l1 || l2 }
}

/** فهارس سريعة للأسماء */
export function useLookups() {
  const years = useYears()
  const groups = useGroups()
  const subjects = useSubjects()
  return useMemo(() => {
    const yearName = new Map((years.data ?? []).map((y) => [y.id, y.name]))
    const groupName = new Map((groups.data ?? []).map((g) => [g.id, g.name]))
    const subjectName = new Map((subjects.data ?? []).map((s) => [s.id, s.name]))
    const subjectById = new Map((subjects.data ?? []).map((s) => [s.id, s]))
    const groupById = new Map((groups.data ?? []).map((g) => [g.id, g]))
    return {
      yearName, groupName, subjectName, subjectById, groupById,
      years: years.data ?? [], groups: groups.data ?? [], subjects: subjects.data ?? [],
      isLoading: years.isLoading || groups.isLoading || subjects.isLoading,
    }
  }, [years.data, groups.data, subjects.data, years.isLoading, groups.isLoading, subjects.isLoading])
}

export function studentLabel(s: Student) {
  return `${s.full_name} (${s.specialization || 'عام'})`
}
