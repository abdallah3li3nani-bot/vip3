import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, Printer, Download } from 'lucide-react'
import { Button, Card, EmptyState, PageLoader, Badge } from '@/components/ui'
import { PAYMENT_METHOD_LABEL } from '@/components/common/Status'
import {
  useBooklets, useBookletOrders, useCharges, useCycles, useLookups, usePayments, useSessions, useStudent,
  useStudentAttendance, useStudentSubjects,
} from '@/lib/hooks'
import { useSettings } from '@/store/settings'
import { fmtDate, fmtMoney } from '@/lib/format'
import { exportCsv } from '@/lib/utils'

type Entry = { date: string; label: string; debit: number; credit: number; ref?: string; payId?: string }

/** كشف حساب الطالب: كل المستحقات (دروس ومذكرات) والمدفوعات بترتيب زمني مع الرصيد */
export default function StudentReportPage() {
  const { id } = useParams()
  const { settings } = useSettings()
  const sym = settings.currency_symbol
  const { data: student, isLoading } = useStudent(id)
  const { yearName, groupName, subjectName } = useLookups()
  const { data: enrollments = [] } = useStudentSubjects(id)
  const { data: cycles = [] } = useCycles(id)
  const { data: charges = [] } = useCharges(id)
  const { data: payments = [] } = usePayments(id)
  const { data: orders = [] } = useBookletOrders({ studentId: id })
  const { data: booklets = [] } = useBooklets()
  const { data: attendance = [] } = useStudentAttendance(id)
  const { data: sessions = [] } = useSessions()

  const bookletName = useMemo(() => new Map(booklets.map((b) => [b.id, b.title])), [booklets])

  const ledger = useMemo(() => {
    const rows: Entry[] = []
    for (const c of charges) {
      if (c.void_at) continue
      rows.push({ date: c.due_date, label: c.title, debit: Number(c.amount), credit: 0 })
    }
    for (const o of orders) {
      rows.push({ date: o.created_at.slice(0, 10), label: `مذكرة: ${bookletName.get(o.booklet_id) || '—'}`, debit: Number(o.price), credit: 0 })
    }
    for (const p of payments) {
      if (p.void_at) continue
      const amt = Number(p.amount)
      rows.push({
        date: p.paid_at.slice(0, 10),
        label: amt >= 0 ? `دفعة (${PAYMENT_METHOD_LABEL[p.method] ?? p.method})` : 'تصحيح / استرداد',
        debit: amt < 0 ? -amt : 0,
        credit: amt > 0 ? amt : 0,
        ref: p.receipt_no ? `#${String(p.receipt_no).padStart(5, '0')}` : undefined,
        payId: p.id,
      })
    }
    rows.sort((a, b) => a.date.localeCompare(b.date) || (a.debit > 0 ? -1 : 1))
    let bal = 0
    return rows.map((r) => {
      bal += r.debit - r.credit
      return { ...r, balance: bal }
    })
  }, [charges, orders, payments, bookletName])

  const totals = useMemo(() => {
    const lessonsDue = charges.filter((c) => !c.void_at).reduce((a, c) => a + Number(c.amount), 0)
    const lessonsPaid = charges.filter((c) => !c.void_at).reduce((a, c) => a + Number(c.paid_amount), 0)
    const bookletsDue = orders.reduce((a, o) => a + Number(o.price), 0)
    const bookletsPaid = orders.reduce((a, o) => a + Number(o.paid_amount), 0)
    return {
      lessonsDue, lessonsPaid, bookletsDue, bookletsPaid,
      outstanding: Math.max(0, lessonsDue - lessonsPaid) + Math.max(0, bookletsDue - bookletsPaid),
    }
  }, [charges, orders])

  const att = useMemo(() => {
    const sessionIds = new Set(sessions.map((s) => s.id))
    const a = attendance.filter((x) => sessionIds.has(x.session_id))
    return {
      present: a.filter((x) => x.status === 'present').length,
      absent: a.filter((x) => x.status === 'absent').length,
      late: a.filter((x) => x.status === 'late').length,
      excused: a.filter((x) => x.status === 'excused').length,
    }
  }, [attendance, sessions])

  if (isLoading) return <PageLoader />
  if (!student) return <EmptyState title="الطالب غير موجود" />

  const openCycles = cycles.filter((c) => c.status === 'open')

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="no-print flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild className="-mr-2">
          <Link to={`/students/${student.id}`}><ArrowRight className="size-4" /> ملف الطالب</Link>
        </Button>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              exportCsv(
                ledger.map((r) => ({
                  التاريخ: r.date, البيان: r.label, 'رقم الإيصال': r.ref || '',
                  مدين: r.debit || '', دائن: r.credit || '', الرصيد: r.balance,
                })),
                `كشف-حساب-${student.code || student.full_name}`,
              )
            }
          >
            <Download className="size-4" /> Excel/CSV
          </Button>
          <Button size="sm" onClick={() => window.print()}><Printer className="size-4" /> طباعة / PDF</Button>
        </div>
      </div>

      <div className="print-area space-y-4">
        {/* الترويسة */}
        <Card className="print-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
            <div>
              <p className="text-[12px] font-semibold text-muted">{settings.app_name}{settings.teacher_name ? ` — ${settings.teacher_name}` : ''}</p>
              <h1 className="mt-1 text-xl font-extrabold text-ink">كشف حساب طالب</h1>
              <p className="mt-0.5 text-[12px] text-muted">بتاريخ {fmtDate(new Date())}</p>
            </div>
            <div className="text-left">
              <p className="text-[16px] font-extrabold text-ink">{student.full_name}</p>
              <p className="num text-[12.5px] text-ink-2">
                {student.code}
                {student.year_id ? ` · ${yearName.get(student.year_id) || ''}` : ''}
                {student.group_id ? ` · ${groupName.get(student.group_id) || ''}` : ''}
              </p>
              <p className="text-[12px] text-muted">{student.specialization || 'عام'}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Box label="مستحقات الدروس" value={fmtMoney(totals.lessonsDue, sym)} sub={`مدفوع ${fmtMoney(totals.lessonsPaid, sym)}`} />
            <Box label="المذكرات" value={fmtMoney(totals.bookletsDue, sym)} sub={`مدفوع ${fmtMoney(totals.bookletsPaid, sym)}`} />
            <Box label="إجمالي المدفوع" value={fmtMoney(totals.lessonsPaid + totals.bookletsPaid, sym)} tone="success" />
            <Box label="المتبقي على الطالب" value={fmtMoney(totals.outstanding, sym)} tone={totals.outstanding > 0 ? 'danger' : 'success'} />
          </div>
        </Card>

        {/* المواد والدورات */}
        <Card className="print-card p-5">
          <h2 className="mb-3 text-[14px] font-bold text-ink">المواد المسجّلة</h2>
          {enrollments.filter((e) => e.is_active).length === 0 ? (
            <p className="text-[12.5px] text-muted">غير مشترك في دروس حالياً</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {enrollments.filter((e) => e.is_active).map((e) => {
                const c = openCycles.find((x) => x.subject_id === e.subject_id)
                return (
                  <Badge key={e.id} tone="brand">
                    {subjectName.get(e.subject_id)}
                    {c ? ` · الدورة ${c.cycle_index}: ${c.sessions_done}/${c.sessions_target} حصة` : ''}
                  </Badge>
                )
              })}
            </div>
          )}
          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            <Mini label="حاضر" value={att.present} cls="text-success" />
            <Mini label="غائب" value={att.absent} cls="text-danger" />
            <Mini label="متأخر" value={att.late} cls="text-warning" />
            <Mini label="بعذر" value={att.excused} cls="text-info" />
          </div>
        </Card>

        {/* الكشف */}
        <Card className="print-card p-5">
          <h2 className="mb-3 text-[14px] font-bold text-ink">الحركات المالية</h2>
          {ledger.length === 0 ? (
            <p className="text-[12.5px] text-muted">لا توجد حركات مالية</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-[12.5px]">
                <thead>
                  <tr className="border-b border-line text-[11.5px] text-ink-2">
                    <th className="px-2 py-2 font-semibold">التاريخ</th>
                    <th className="px-2 py-2 font-semibold">البيان</th>
                    <th className="px-2 py-2 font-semibold">إيصال</th>
                    <th className="px-2 py-2 font-semibold">عليه</th>
                    <th className="px-2 py-2 font-semibold">دفع</th>
                    <th className="px-2 py-2 font-semibold">الرصيد</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((r, i) => (
                    <tr key={i} className="border-b border-line last:border-0">
                      <td className="num whitespace-nowrap px-2 py-2 text-ink-2">{fmtDate(r.date)}</td>
                      <td className="px-2 py-2 text-ink">{r.label}</td>
                      <td className="num px-2 py-2">
                        {r.payId ? (
                          <Link to={`/receipt/${r.payId}`} className="text-[var(--brand)] hover:underline">{r.ref}</Link>
                        ) : '—'}
                      </td>
                      <td className="num whitespace-nowrap px-2 py-2 text-danger">{r.debit ? fmtMoney(r.debit, sym) : ''}</td>
                      <td className="num whitespace-nowrap px-2 py-2 text-success">{r.credit ? fmtMoney(r.credit, sym) : ''}</td>
                      <td className={`num whitespace-nowrap px-2 py-2 font-bold ${r.balance > 0 ? 'text-danger' : 'text-ink'}`}>
                        {fmtMoney(r.balance, sym)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {settings.report_footer && <p className="mt-4 text-center text-[11.5px] text-muted">{settings.report_footer}</p>}
        </Card>
      </div>
    </div>
  )
}

function Box({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'success' | 'danger' }) {
  const cls = tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-ink'
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="text-[11.5px] font-semibold text-ink-2">{label}</p>
      <p className={`num mt-1 text-[16px] font-extrabold ${cls}`}>{value}</p>
      {sub && <p className="num mt-0.5 text-[11px] text-muted">{sub}</p>}
    </div>
  )
}

function Mini({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className="rounded-xl bg-surface-2 p-2">
      <p className={`num text-lg font-extrabold ${cls}`}>{value}</p>
      <p className="text-[11px] text-ink-2">{label}</p>
    </div>
  )
}
