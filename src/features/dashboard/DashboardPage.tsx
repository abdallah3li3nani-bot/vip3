import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Cell,
} from 'recharts'
import {
  AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, ClipboardCheck, GraduationCap,
  Plus, TrendingUp, UserCheck, Wallet, Users, BookText, Clock,
} from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { StatCard } from '@/components/common/StatCard'
import { Money } from '@/components/common/Money'
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, StatSkeleton, Badge, Avatar } from '@/components/ui'
import { useDashboard, useSessions, useLookups, useStudents, useBalances, useBookletOrders, useGradeStats } from '@/lib/hooks'
import { FinanceSplit, GradeCards } from './GradeInsights'
import { fmtDate, fmtNumber, fmtTime, todayISO } from '@/lib/format'
import { useUi } from '@/store/ui'
import { SessionBadge } from '@/components/common/Status'

export default function DashboardPage() {
  const { data: stats, isLoading } = useDashboard()
  const { data: sessions = [] } = useSessions(todayISO(), todayISO())
  const { subjectName, groupName } = useLookups()
  const { data: students = [] } = useStudents()
  const { balances } = useBalances()
  const { data: bookletOrders = [] } = useBookletOrders()
  const hide = useUi((s) => s.hideBalances)
  const nav = useNavigate()

  const debtors = useMemo(() => {
    return students
      .map((s) => ({ s, out: balances.get(s.id)?.outstanding ?? 0 }))
      .filter((x) => x.out > 0)
      .sort((a, b) => b.out - a.out)
      .slice(0, 6)
  }, [students, balances])

  const chartData = useMemo(
    () =>
      (stats?.by_year ?? []).map((y) => ({
        name: y.name,
        محصّل: Number(y.paid),
        متبقٍ: Number(y.outstanding),
      })),
    [stats],
  )

  const { stats: gradeStats } = useGradeStats()

  // عدد الطلاب (مش الحجوزات) اللي لسه ما استلموش مذكرة واحدة على الأقل
  const pendingBooklets = useMemo(
    () => new Set(bookletOrders.filter((o) => !o.is_delivered).map((o) => o.student_id)).size,
    [bookletOrders],
  )
  const pendingCopies = useMemo(() => bookletOrders.filter((o) => !o.is_delivered).length, [bookletOrders])

  return (
    <div className="space-y-5 pb-12">
      <PageHeader
        title="لوحة المعلومات"
        subtitle={fmtDate(new Date())}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => nav('/booklets')}>
              <BookText className="size-4" /> المذكرات
            </Button>
            <Button variant="secondary" size="sm" onClick={() => nav('/attendance')}>
              <ClipboardCheck className="size-4" /> تسجيل حضور
            </Button>
            <Button size="sm" onClick={() => nav('/students')}>
              <Plus className="size-4" /> إدارة الطلاب
            </Button>
          </div>
        }
      />

      {isLoading || !stats ? (
        <StatSkeleton count={4} />
      ) : (
        <>
          {/* ============ أرقام الطلاب والدروس والمذكرات ============ */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="إجمالي الطلاب المسجلين"
              value={<span className="num">{fmtNumber(stats.students_total)}</span>}
              hint={`${fmtNumber(stats.students_enrolled)} مشترك بالدروس`}
              icon={Users}
              tone="brand"
              onClick={() => nav('/students')}
            />
            <StatCard
              label="طلاب لسه ما استلموش مذكرات"
              value={<span className="num text-blue-600">{fmtNumber(pendingBooklets)}</span>}
              hint={`${fmtNumber(pendingCopies)} نسخة مطلوب تسليمها`}
              icon={BookText}
              tone="info"
              onClick={() => nav('/booklets')}
            />
            <StatCard
              label="عليهم مستحقات"
              value={<span className="num text-danger">{fmtNumber(stats.students_debt)}</span>}
              hint="طالب عليه متبقي"
              icon={AlertTriangle}
              tone="danger"
              onClick={() => nav('/students?tab=debt')}
            />
            <StatCard
              label="حصص اليوم"
              value={<span className="num">{fmtNumber(stats.sessions_today)}</span>}
              hint="وفق جدول اليوم"
              icon={CalendarDays}
              tone="success"
              onClick={() => nav('/schedule')}
            />
          </div>

          {/* ============ الحسابات: الدروس لوحدها والمذكرات لوحدها ============ */}
          <section className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-[15px] font-extrabold text-ink">الحسابات</h2>
              <p className="text-[12px] text-ink-2">
                تحصيل هذا الشهر: <Money value={stats.paid_this_month} className="font-bold text-ink" />
              </p>
            </div>
            <FinanceSplit stats={gradeStats} />
          </section>

          {/* ============ تفاصيل كل صف ============ */}
          <section className="space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-[15px] font-extrabold text-ink">تفاصيل الصفوف</h2>
              <p className="text-[11.5px] text-muted">اضغط على أي رقم لعرض أسماء الطلاب</p>
            </div>
            <GradeCards stats={gradeStats} />
          </section>

          <div className="grid gap-4 lg:grid-cols-5">
            {/* ============ الرسم البياني ============ */}
            <Card className="lg:col-span-3">
              <CardHeader>
                <div>
                  <CardTitle>الدخل حسب الصف الدراسي</CardTitle>
                  <p className="mt-0.5 text-[12px] text-muted">المحصّل مقابل المتبقي</p>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/reports">التقارير <ArrowLeft className="size-3.5" /></Link>
                </Button>
              </CardHeader>
              <CardContent>
                {hide ? (
                  <div className="grid h-56 place-items-center rounded-xl bg-surface-2 text-[13px] text-muted">
                    الأرقام المالية مخفيّة
                  </div>
                ) : chartData.length === 0 ? (
                  <EmptyState title="لا توجد بيانات بعد" description="أضف صفوفاً وطلاباً لتظهر الإحصائيات هنا." />
                ) : (
                  <div className="h-56 w-full" dir="ltr">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-2)' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} width={54} />
                        <Tooltip
                          contentStyle={{
                            background: 'var(--surface)', border: '1px solid var(--border)',
                            borderRadius: 12, fontSize: 12, fontFamily: 'Cairo', direction: 'rtl',
                          }}
                          cursor={{ fill: 'var(--surface-2)' }}
                        />
                        <Bar dataKey="محصّل" radius={[6, 6, 0, 0]} maxBarSize={44}>
                          {chartData.map((_, i) => <Cell key={i} fill="var(--brand)" />)}
                        </Bar>
                        <Bar dataKey="متبقٍ" radius={[6, 6, 0, 0]} maxBarSize={44}>
                          {chartData.map((_, i) => <Cell key={i} fill="var(--warning)" />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ============ أعلى المتأخرين ============ */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>الأكثر تأخرًا في الدفع</CardTitle>
                <Button variant="ghost" size="sm" asChild><Link to="/finance">الكل</Link></Button>
              </CardHeader>
              <CardContent>
                {debtors.length === 0 ? (
                  <EmptyState icon={CheckCircle2} title="ممتاز — لا توجد متأخرات" description="كل الطلاب خالصون حاليًا." className="py-8" />
                ) : (
                  <div className="space-y-1">
                    {debtors.map(({ s, out }) => (
                      <Link key={s.id} to={`/students/${s.id}`} className="tap flex items-center gap-3 rounded-xl p-2 transition hover:bg-surface-2">
                        <Avatar name={s.full_name} size={34} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-bold text-ink">{s.full_name}</p>
                          <p className="truncate text-[11px] text-muted">{s.specialization || 'عام'}</p>
                        </div>
                        <Badge tone="danger"><Money value={out} /></Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ============ حصص اليوم ============ */}
          <Card>
            <CardHeader>
              <CardTitle>حصص اليوم</CardTitle>
              <Button variant="ghost" size="sm" asChild><Link to="/schedule">الجدول الكامل <ArrowLeft className="size-3.5" /></Link></Button>
            </CardHeader>
            <CardContent>
              {sessions.length === 0 ? (
                <EmptyState icon={CalendarDays} title="لا توجد حصص اليوم" description="لا توجد حصص مجدولة لهذا اليوم." className="py-8"
                  action={<Button size="sm" variant="secondary" asChild><Link to="/schedule"><Plus className="size-4" /> إضافة حصة</Link></Button>} />
              ) : (
                <div className="space-y-2">
                  {sessions.map((s) => (
                    <Link key={s.id} to={`/attendance?session=${s.id}`} className="tap flex items-center gap-3 rounded-xl border border-[var(--border)] p-3 transition hover:bg-surface-2">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-[var(--brand)]">
                        <GraduationCap className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-bold text-ink">{subjectName.get(s.subject_id) ?? 'مادة'}</p>
                        <p className="truncate text-[12px] text-muted">
                          {s.group_id ? groupName.get(s.group_id) : 'بدون مجموعة'}
                          {s.start_time ? ` • ${fmtTime(s.start_time)}` : ''}
                        </p>
                      </div>
                      <SessionBadge status={s.status} />
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
