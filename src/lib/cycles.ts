import type { Attendance, Charge, ClassSession, Cycle, Subject } from './database.types'

export interface CycleSummary {
  cycle: Cycle
  subject: Subject | undefined
  /** الحصص المحسوبة في الدورة بالترتيب (تاريخ + حالة الحضور) */
  sessions: { date: string; status: Attendance['status'] }[]
  startedAt: string | null
  endedAt: string | null
  charge: Charge | undefined
  paid: number
  remaining: number
}

/**
 * ملخص كل شهر (دورة) للطالب: الحصص اللي اتحسبت فيه، بدأ امتى وانتهى امتى، واتدفع ولا لأ.
 * الحصص المحسوبة بتتوزع على الدورات بالترتيب الزمني (الدورة 1 أولاً).
 */
export function buildCycleSummaries(params: {
  cycles: Cycle[]
  attendance: Attendance[]
  sessions: ClassSession[]
  charges: Charge[]
  subjects: Subject[]
  absenceCounts: boolean
}): CycleSummary[] {
  const { cycles, attendance, sessions, charges, subjects, absenceCounts } = params
  const sessionById = new Map(sessions.map((s) => [s.id, s]))
  const subjectById = new Map(subjects.map((s) => [s.id, s]))
  const counts = (st: Attendance['status']) => st === 'present' || st === 'late' || (absenceCounts && st === 'absent')

  // حضور محسوب لكل مادة مرتب بالتاريخ
  const bySubject = new Map<string, { date: string; status: Attendance['status'] }[]>()
  for (const a of attendance) {
    const s = sessionById.get(a.session_id)
    if (!s || s.status === 'cancelled' || !counts(a.status)) continue
    const list = bySubject.get(s.subject_id) || []
    list.push({ date: s.session_date, status: a.status })
    bySubject.set(s.subject_id, list)
  }
  for (const list of bySubject.values()) list.sort((a, b) => a.date.localeCompare(b.date))

  const out: CycleSummary[] = []
  const subjectIds = [...new Set(cycles.map((c) => c.subject_id))]
  for (const sid of subjectIds) {
    const list = bySubject.get(sid) || []
    let cursor = 0
    const ordered = cycles.filter((c) => c.subject_id === sid).sort((a, b) => a.cycle_index - b.cycle_index)
    for (const c of ordered) {
      const take = Math.min(c.sessions_done, c.sessions_target)
      const chunk = list.slice(cursor, cursor + take)
      cursor += take
      const charge = charges.find((ch) => ch.cycle_id === c.id && !ch.void_at)
      const paid = charge ? Number(charge.paid_amount) : 0
      out.push({
        cycle: c,
        subject: subjectById.get(sid),
        sessions: chunk,
        startedAt: chunk[0]?.date ?? null,
        endedAt: c.status === 'completed' ? chunk[chunk.length - 1]?.date ?? null : null,
        charge,
        paid,
        remaining: charge ? Math.max(0, Number(charge.amount) - paid) : 0,
      })
    }
  }
  // الأحدث أولاً داخل كل مادة
  return out.sort(
    (a, b) =>
      (a.subject?.name || '').localeCompare(b.subject?.name || '', 'ar') || b.cycle.cycle_index - a.cycle.cycle_index,
  )
}
