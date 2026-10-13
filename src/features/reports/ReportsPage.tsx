import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { DailyCollectionReport } from './DailyCollectionReport'
import { BookletsReport } from './BookletsReport'
import { BarChart, Bar, Cell, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { BarChart3, Download, Printer, Users, Wallet, BookOpen, CalendarCheck } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { Money } from '@/components/common/Money'
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Segmented, Select, ListSkeleton } from '@/components/ui'
import {
  useAttendanceAll, useCharges, useLookups, usePayments, useSessions, useStudents, useStudentSubjects,
} from '@/lib/hooks'
import { exportCsv, sum } from '@/lib/utils'
import { fmtDate, fmtNumber } from '@/lib/format'
import { useUi } from '@/store/ui'

type Tab = 'daily' | 'financial' | 'booklets' | 'students' | 'attendance'

export default function ReportsPage() {
  const [params, setParams] = useSearchParams()
  const tab = ((params.get('tab') as Tab) || 'daily') as Tab
  const setTab = (t: Tab) => {
    params.set('tab', t)
    setParams(params, { replace: true })
  }
  const [year, setYear] = useState('')
  const hide = useUi((s) => s.hideBalances)

  const { data: students = [], isLoading } = useStudents()
  const { data: allCharges = [] } = useCharges()
  const { data: allPayments = [] } = usePayments()
  const charges = useMemo(() => allCharges.filter((c) => !c.void_at), [allCharges])
  const payments = useMemo(() => allPayments.filter((p) => !p.void_at), [allPayments])
  const { data: enrollments = [] } = useStudentSubjects()
  const { years, groups, subjects, yearName, groupName, subjectName } = useLookups()

  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students])
  const inYear = (sid: string) => !year || studentById.get(sid)?.year_id === year

  /* ------------------------- التقرير المالي ------------------------- */
  const byYear = useMemo(
    () =>
      years.map((y) => {
        const ids = new Set(students.filter((s) => s.year_id === y.id).map((s) => s.id))
        const cs = charges.filter((c) => ids.has(c.student_id))
        const due = sum(cs, (c) => Number(c.amount))
        const paid = sum(cs, (c) => Number(c.paid_amount))
        return { id: y.id, name: y.name, students: ids.size, due, paid, outstanding: Math.max(0, due - paid) }
      }),
    [years, students, charges],
  )

  const bySubject = useMemo(
    () =>
      subjects
        .filter((s) => !year || s.year_id === year)
        .map((s) => {
          const cs = charges.filter((c) => c.subject_id === s.id && inYear(c.student_id))
          const due = sum(cs, (c) => Number(c.amount))
          const paid = sum(cs, (c) => Number(c.paid_amount))
          const count = enrollments.filter((e) => e.subject_id === s.id && e.is_active).length
          return { id: s.id, name: s.name, yearName: yearName.get(s.year_id) ?? '', students: count, due, paid, outstanding: Math.max(0, due - paid) }
        })
        .sort((a, b) => b.paid - a.paid),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [subjects, charges, enrollments, year, yearName],
  )

  const byGroup = useMemo(
    () =>
      groups
        .filter((g) => !year || g.year_id === year)
        .map((g) => {
          const ids = new Set(students.filter((s) => s.group_id === g.id).map((s) => s.id))
          const cs = charges.filter((c) => ids.has(c.student_id))
          const due = sum(cs, (c) => Number(c.amount))
          const paid = sum(cs, (c) => Number(c.paid_amount))
          return { id: g.id, name: g.name, yearName: yearName.get(g.year_id) ?? '', students: ids.size, due, paid, outstanding: Math.max(0, due - paid) }
        }),
    [groups, students, charges, year, yearName],
  )

  const totals = useMemo(() => {
    const cs = charges.filter((c) => inYear(c.student_id))
    const ps = payments.filter((p) => inYear(p.student_id))
    const due = sum(cs, (c) => Number(c.amount))
    const paid = sum(cs, (c) => Number(c.paid_amount))
    return { due, paid, outstanding: Math.max(0, due - paid), payments: sum(ps, (p) => Number(p.amount)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charges, payments, year, studentById])

  /* ------------------------- تقرير الطلاب ------------------------- */
  const studentRows = useMemo(
    () =>
      groups
        .filter((g) => !year || g.year_id === year)
        .map((g) => ({
          group: g.name,
          year: yearName.get(g.year_id) ?? '',
          total: students.filter((s) => s.group_id === g.id).length,
          active: students.filter((s) => s.group_id === g.id && s.status === 'active').length,
        })),
    [groups, students, year, yearName],
  )

  const chart = useMemo(
    () => byYear.map((y) => ({ name: y.name, محصّل: y.paid, متبقٍ: y.outstanding })),
    [byYear],
  )

  return (
    <div>
      <PageHeader
        title="التقارير"
        icon={BarChart3}
        subtitle="ملخصات مالية وأكاديمية جاهزة للطباعة والتصدير"
        actions={
          <>
            {tab !== 'daily' && tab !== 'booklets' && (
              <Button variant="secondary" size="sm" onClick={() => window.print()}><Printer className="size-4" /> طباعة</Button>
            )}
            <Button variant="secondary" size="sm" asChild><Link to="/students"><Users className="size-4" /> تقرير طالب</Link></Button>
          </>
        }
      />

      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'daily', label: 'التحصيل اليومي' },
            { value: 'financial', label: 'الدروس' },
            { value: 'booklets', label: 'المذكرات' },
            { value: 'students', label: 'الطلاب' },
            { value: 'attendance', label: 'الحضور' },
          ]}
        />
        <Select value={year} onChange={(e) => setYear(e.target.value)} className="w-44">
          <option value="">كل السنوات</option>
          {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
        </Select>
      </div>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : tab === 'daily' ? (
        <DailyCollectionReport year={year} />
      ) : tab === 'booklets' ? (
        <BookletsReport year={year} />
      ) : tab === 'financial' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ['إجمالي المطالبات', totals.due, 'text-ink'],
              ['إجمالي المحصّل', totals.paid, 'text-success'],
              ['المتبقي', totals.outstanding, 'text-danger'],
              ['كل المدفوعات (دروس ومذكرات)', totals.payments, 'text-ink'],
            ].map(([label, v, cls]) => (
              <Card key={label as string} className="p-4">
                <p className="text-[12.5px] font-semibold text-ink-2">{label as string}</p>
                <p className={`mt-1.5 text-[20px] font-extrabold ${cls as string}`}><Money value={v as number} /></p>
              </Card>
            ))}
          </div>

          {!hide && chart.length > 0 && (
            <Card>
              <CardHeader><CardTitle>الدخل حسب السنة الدراسية</CardTitle></CardHeader>
              <CardContent>
                <div className="h-60 w-full" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chart}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-2)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={58} />
                      <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12, fontFamily: 'Cairo', direction: 'rtl' }} cursor={{ fill: 'var(--surface-2)' }} />
                      <Bar dataKey="محصّل" radius={[6, 6, 0, 0]} maxBarSize={46}>{chart.map((_, i) => <Cell key={i} fill="var(--brand)" />)}</Bar>
                      <Bar dataKey="متبقٍ" radius={[6, 6, 0, 0]} maxBarSize={46}>{chart.map((_, i) => <Cell key={i} fill="var(--warning)" />)}</Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          <ReportTable
            title="حسب السنة الدراسية"
            icon={Users}
            rows={byYear}
            columns={[
              { key: 'name', label: 'السنة' },
              { key: 'students', label: 'الطلاب', num: true },
              { key: 'due', label: 'المطالبات', money: true },
              { key: 'paid', label: 'المحصّل', money: true },
              { key: 'outstanding', label: 'المتبقي', money: true, danger: true },
            ]}
            onExport={() => exportCsv(byYear.map((r) => ({ السنة: r.name, الطلاب: r.students, المطالبات: r.due, المحصّل: r.paid, المتبقي: r.outstanding })), 'تقرير-السنوات')}
          />

          <ReportTable
            title="حسب المادة"
            icon={BookOpen}
            rows={bySubject}
            columns={[
              { key: 'name', label: 'المادة' },
              { key: 'yearName', label: 'السنة' },
              { key: 'students', label: 'الطلاب', num: true },
              { key: 'due', label: 'المطالبات', money: true },
              { key: 'paid', label: 'المحصّل', money: true },
              { key: 'outstanding', label: 'المتبقي', money: true, danger: true },
            ]}
            onExport={() => exportCsv(bySubject.map((r) => ({ المادة: r.name, السنة: r.yearName, الطلاب: r.students, المطالبات: r.due, المحصّل: r.paid, المتبقي: r.outstanding })), 'تقرير-المواد')}
          />

          <ReportTable
            title="حسب المجموعة"
            icon={Users}
            rows={byGroup}
            columns={[
              { key: 'name', label: 'المجموعة' },
              { key: 'yearName', label: 'السنة' },
              { key: 'students', label: 'الطلاب', num: true },
              { key: 'paid', label: 'المحصّل', money: true },
              { key: 'outstanding', label: 'المتبقي', money: true, danger: true },
            ]}
            onExport={() => exportCsv(byGroup.map((r) => ({ المجموعة: r.name, السنة: r.yearName, الطلاب: r.students, المحصّل: r.paid, المتبقي: r.outstanding })), 'تقرير-المجموعات')}
          />
        </div>
      ) : tab === 'students' ? (
        <ReportTable
          title="توزيع الطلاب"
          icon={Users}
          rows={studentRows}
          columns={[
            { key: 'group', label: 'المجموعة' },
            { key: 'year', label: 'السنة' },
            { key: 'total', label: 'إجمالي', num: true },
            { key: 'active', label: 'نشط', num: true },
          ]}
          onExport={() => exportCsv(studentRows.map((r) => ({ المجموعة: r.group, السنة: r.year, الإجمالي: r.total, النشط: r.active })), 'تقرير-الطلاب')}
        />
      ) : (
        <AttendanceReport year={year} />
      )}
    </div>
  )
}

/* ------------------------------ جدول تقرير ------------------------------ */
interface Col { key: string; label: string; money?: boolean; num?: boolean; danger?: boolean }

function ReportTable({
  title, rows, columns, onExport, icon: Icon,
}: {
  title: string
  rows: Record<string, unknown>[]
  columns: Col[]
  onExport?: () => void
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card className="print-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {Icon ? <Icon className="size-4 text-muted" /> : null}
          {title}
        </CardTitle>
        {onExport && (
          <Button variant="ghost" size="sm" onClick={onExport} className="no-print">
            <Download className="size-3.5" /> CSV
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState title="لا توجد بيانات" className="py-8" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-[13px]">
              <thead>
                <tr className="border-b border-line text-[12px] text-ink-2">
                  {columns.map((c) => <th key={c.key} className="whitespace-nowrap px-2 py-2 font-semibold">{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    {columns.map((c) => (
                      <td key={c.key} className={`whitespace-nowrap px-2 py-2.5 ${c.danger && Number(r[c.key]) > 0 ? 'font-bold text-danger' : 'text-ink'}`}>
                        {c.money ? <Money value={Number(r[c.key])} /> : c.num ? <span className="num">{fmtNumber(Number(r[c.key]))}</span> : String(r[c.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ----------------------------- تقرير الحضور ----------------------------- */
function AttendanceReport({ year }: { year: string }) {
  const { data: attendance = [], isLoading } = useAttendanceAll()
  const { data: sessions = [] } = useSessions()
  const { data: students = [] } = useStudents()
  const { subjectName, yearName } = useLookups()

  const sessionById = useMemo(() => new Map(sessions.map((s) => [s.id, s])), [sessions])
  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students])

  const rows = useMemo(() => {
    const m = new Map<string, { name: string; code: string; year: string; present: number; absent: number; late: number }>()
    for (const a of attendance) {
      const st = studentById.get(a.student_id)
      if (!st) continue
      if (year && st.year_id !== year) continue
      const cur = m.get(a.student_id) ?? {
        name: st.full_name, code: st.code ?? "", year: st.year_id ? yearName.get(st.year_id) ?? '' : '',
        present: 0, absent: 0, late: 0,
      }
      if (a.status === 'present') cur.present++
      else if (a.status === 'absent') cur.absent++
      else if (a.status === 'late') cur.late++
      m.set(a.student_id, cur)
    }
    return [...m.values()].sort((a, b) => b.absent - a.absent)
  }, [attendance, studentById, year, yearName])

  if (isLoading) return <ListSkeleton rows={5} />

  return (
    <ReportTable
      title="الحضور والغياب حسب الطالب"
      icon={CalendarCheck}
      rows={rows}
      columns={[
        { key: 'name', label: 'الطالب' },
        { key: 'code', label: 'الكود' },
        { key: 'year', label: 'السنة' },
        { key: 'present', label: 'حاضر', num: true },
        { key: 'absent', label: 'غائب', num: true, danger: true },
        { key: 'late', label: 'متأخر', num: true },
      ]}
      onExport={() =>
        exportCsv(
          rows.map((r) => ({ الطالب: r.name, الكود: r.code, السنة: r.year, حاضر: r.present, غائب: r.absent, متأخر: r.late })),
          'تقرير-الحضور',
        )
      }
    />
  )
}
