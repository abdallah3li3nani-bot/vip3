import { useMemo, useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import {
  ArrowRight, BookOpen, CalendarCheck, FileText, Pencil, Plus,
  ReceiptText, Trash2, TrendingUp, Wallet, BookText, CheckCircle2, Clock,
  Banknote, AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  Avatar, Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, KeyValue,
  PageLoader, Progress, useConfirm, Modal, Field, Input,
} from '@/components/ui'
import { Money } from '@/components/common/Money'
import { AttendanceBadge, PAYMENT_METHOD_LABEL } from '@/components/common/Status'
import { StudentForm } from './StudentForm'
import { EnrollSubjectsModal } from './EnrollSubjectsModal'
import { PaymentDialog, ChargeDialog } from '@/features/finance/dialogs'
import {
  useAction, useCharges, useCycles, useLookups, usePayments,
  useStudent, useStudentAttendance, useStudentSubjects, computeFinance,
  useBookletOrders, useBooklets,
} from '@/lib/hooks'
import * as api from '@/lib/api'
import { fmtDate, fmtMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useSettings } from '@/store/settings'
import { useQuery } from '@tanstack/react-query'
import type { BookletOrder } from '@/lib/database.types'

const TABS = [
  { v: 'overview', label: 'نظرة عامة', icon: TrendingUp },
  { v: 'finance', label: 'المستحقات والديون', icon: Wallet },
  { v: 'booklets', label: 'المذكرات والكتب', icon: BookText },
  { v: 'subjects', label: 'المواد والاشتراك', icon: BookOpen },
  { v: 'attendance', label: 'الحضور', icon: CalendarCheck },
  { v: 'payments', label: 'المدفوعات', icon: ReceiptText },
]

export default function StudentProfilePage() {
  const { id } = useParams()
  const { settings } = useSettings()
  const confirm = useConfirm()
  const { data: student, isLoading } = useStudent(id)
  const { yearName, groupName, subjectById, subjectName } = useLookups()
  const { data: ss = [] } = useStudentSubjects(id)
  const { data: cycles = [] } = useCycles(id)
  const { data: charges = [] } = useCharges(id)
  const { data: payments = [] } = usePayments(id)
  const { data: attendance = [] } = useStudentAttendance(id)
  const { data: studentOrders = [] } = useBookletOrders({ studentId: id })
  const { data: allBooklets = [] } = useBooklets()

  const [tab, setTab] = useState('overview')
  const [editOpen, setEditOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [chargeOpen, setChargeOpen] = useState(false)
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [payBookletTarget, setPayBookletTarget] = useState<BookletOrder | null>(null)

  const bookletMap = useMemo(() => new Map(allBooklets.map((b) => [b.id, b])), [allBooklets])
  const fin = useMemo(() => computeFinance(charges), [charges])

  const { data: sessions = [] } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.listSessions(),
  })

  const sessionsMap = useMemo(() => {
    const m = new Map<string, { date: string; subject: string; status: string }>()
    for (const s of sessions) {
      m.set(s.id, { date: s.session_date, subject: s.subject_id, status: s.status })
    }
    return m
  }, [sessions])

  const toggleDelivery = useAction(api.toggleBookletDelivery, {
    success: 'تم تحديث حالة تسليم المذكرة',
    invalidate: [['booklet_orders'], ['dashboard'], ['payments']],
  })

  if (isLoading) return <PageLoader />
  if (!student) return <EmptyState title="الطالب غير موجود" description="ربما تم حذفه." />

  const attendanceStats = {
    present: attendance.filter((a) => a.status === 'present').length,
    absent: attendance.filter((a) => a.status === 'absent').length,
    late: attendance.filter((a) => a.status === 'late').length,
  }

  // تفصيل الحسابات المالية: دروس ومذكرات
  const lessonDebt = fin.outstanding
  const bookletDebt = studentOrders.reduce((sum, o) => sum + o.remaining_amount, 0)
  const totalDebt = lessonDebt + bookletDebt
  const bookletPaid = studentOrders.reduce((sum, o) => sum + o.paid_amount, 0)
  const totalPaidAll = fin.paid + bookletPaid
  const unpaidChargesCount = charges.filter((c) => !c.void_at && c.amount > c.paid_amount).length
  const unpaidBookletCount = studentOrders.filter((o) => o.remaining_amount > 0).length

  return (
    <div className="space-y-4 pb-12">
      <Button variant="ghost" size="sm" asChild className="no-print -mr-2">
        <Link to="/students"><ArrowRight className="size-4" /> كل الطلاب</Link>
      </Button>

      {/* ============ ترويسة الطالب ============ */}
      <Card className="p-4">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar name={student.full_name} size={64} />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-extrabold text-ink">{student.full_name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {student.is_enrolled ? (
                <Badge variant="default" className="bg-emerald-600 text-[11px]">مشترك بالدروس</Badge>
              ) : (
                <Badge variant="secondary" className="text-[11px]">طالب مدرسة فقط</Badge>
              )}
              {student.specialization && <Badge variant="outline" className="text-[11px]">{student.specialization}</Badge>}
              {student.year_id && <Badge variant="secondary" className="text-[11px]">{yearName.get(student.year_id)}</Badge>}
              {student.group_id && <Badge variant="secondary" className="text-[11px]">{groupName.get(student.group_id)}</Badge>}
            </div>
          </div>

          <div className="no-print flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEnrollOpen(true)}>
              <BookOpen className="size-4" /> حجز وتسجيل المواد
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" /> تعديل البيانات
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link to={`/reports/student/${student.id}`}><FileText className="size-4" /> كشف حساب</Link>
            </Button>
            <Button size="sm" onClick={() => setPayOpen(true)}>
              <Plus className="size-4" /> تسجيل دفعة درس
            </Button>
          </div>
        </div>

        {/* ============ كشف الحساب والمستحقات الشاملة (دروس + مذكرات) ============ */}
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          {totalDebt === 0 ? (
            <div className="flex items-center gap-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-3.5 text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
              <div>
                <p className="text-xs font-bold">حساب الطالب خالص بالكامل (لا توجد أي مستحقات متأخرة) ✓</p>
                <p className="text-[11px] text-muted mt-0.5">
                  تم تسديد جميع مستحقات الدروس والمذكرات بالكامل بإجمالي {fmtMoney(totalPaidAll)}.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-500/20 pb-3">
                <div>
                  <span className="text-xs font-bold text-muted">إجمالي المستحقات والديون المطلوبة من الطالب:</span>
                  <p className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono mt-0.5">
                    {fmtMoney(totalDebt)}
                  </p>
                </div>
                <Badge variant="danger" className="text-xs px-3 py-1 font-bold">
                  عليه مديونية معلقة ({fmtMoney(totalDebt)})
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* ديون الدروس والشهور */}
                <div className={`rounded-xl p-3 border ${lessonDebt > 0 ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300' : 'bg-surface-2 border-[var(--border)] text-muted'}`}>
                  <p className="text-[11.5px] font-bold">مستحقات الدروس والشهور</p>
                  <p className="mt-1 text-lg font-black font-mono">
                    {fmtMoney(lessonDebt)}
                  </p>
                  <p className="text-[10px] opacity-80 mt-0.5">
                    {unpaidChargesCount > 0 ? `${unpaidChargesCount} بند شهري مستحق` : 'مسدد بالكامل ✓'}
                  </p>
                </div>

                {/* ديون المذكرات والكتب */}
                <div className={`rounded-xl p-3 border ${bookletDebt > 0 ? 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-300' : 'bg-surface-2 border-[var(--border)] text-muted'}`}>
                  <p className="text-[11.5px] font-bold">مستحقات المذكرات والكتب</p>
                  <p className="mt-1 text-lg font-black font-mono">
                    {fmtMoney(bookletDebt)}
                  </p>
                  <p className="text-[10px] opacity-80 mt-0.5">
                    {unpaidBookletCount > 0 ? `${unpaidBookletCount} مذكرة عليها متبقي` : 'مسدد بالكامل ✓'}
                  </p>
                </div>

                {/* إجمالي ما دفعه الطالب */}
                <div className="rounded-xl p-3 border bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                  <p className="text-[11.5px] font-bold">إجمالي ما دفعه الطالب</p>
                  <p className="mt-1 text-lg font-black font-mono">
                    {fmtMoney(totalPaidAll)}
                  </p>
                  <p className="text-[10px] opacity-80 mt-0.5">
                    دروس ({fmtMoney(fin.paid)}) + مذكرات ({fmtMoney(bookletPaid)})
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* ============ التبويبات ============ */}
      <TabsPrimitive.Root value={tab} onValueChange={setTab}>
        <TabsPrimitive.List className="no-scrollbar mb-4 flex gap-1 overflow-x-auto rounded-xl border border-[var(--border)] bg-surface p-1">
          {TABS.map((t) => (
            <TabsPrimitive.Trigger
              key={t.v}
              value={t.v}
              className="tap flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-ink-2 transition data-[state=active]:bg-[var(--brand)] data-[state=active]:text-white"
            >
              <t.icon className="size-4" /> {t.label}
            </TabsPrimitive.Trigger>
          ))}
        </TabsPrimitive.List>

        {/* ---------------- نظرة عامة ---------------- */}
        <TabsPrimitive.Content value="overview" className="space-y-4 outline-none">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <CardHeader><CardTitle>بيانات الطالب</CardTitle></CardHeader>
              <CardContent className="divide-y divide-[var(--border)] text-xs">
                <KeyValue label="الاسم الكامل">{student.full_name}</KeyValue>
                <KeyValue label="التخصص">{student.specialization || 'عام'}</KeyValue>
                <KeyValue label="الصف الدراسي">{student.year_id ? yearName.get(student.year_id) : '—'}</KeyValue>
                <KeyValue label="المجموعة">{student.group_id ? groupName.get(student.group_id) : '—'}</KeyValue>
                <KeyValue label="تاريخ التسجيل">{fmtDate(student.enrolled_at)}</KeyValue>
                {student.notes && <KeyValue label="ملاحظات">{student.notes}</KeyValue>}
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="p-4">
                <CardHeader><CardTitle>ملخص الحضور</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="rounded-xl bg-emerald-500/10 p-3 text-center">
                      <p className="text-xl font-extrabold text-emerald-600">{attendanceStats.present}</p>
                      <p className="text-[11.5px] text-emerald-600">حاضر</p>
                    </div>
                    <div className="rounded-xl bg-rose-500/10 p-3 text-center">
                      <p className="text-xl font-extrabold text-rose-600">{attendanceStats.absent}</p>
                      <p className="text-[11.5px] text-rose-600">غائب</p>
                    </div>
                    <div className="rounded-xl bg-amber-500/10 p-3 text-center">
                      <p className="text-xl font-extrabold text-amber-600">{attendanceStats.late}</p>
                      <p className="text-[11.5px] text-amber-600">متأخر</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="p-4">
                <CardHeader><CardTitle>إجراءات سريعة</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" onClick={() => setPayOpen(true)}><Wallet className="size-4" /> تسجيل دفعة</Button>
                  <Button variant="secondary" onClick={() => setChargeOpen(true)}><ReceiptText className="size-4" /> إضافة مستحق</Button>
                  <Button variant="secondary" onClick={() => setEditOpen(true)}><BookOpen className="size-4" /> تعديل المواد</Button>
                  <Button variant="secondary" asChild><Link to={`/booklets?student=${id}`}><BookText className="size-4" /> حجز مذكرة</Link></Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsPrimitive.Content>

        {/* ---------------- المواد ---------------- */}
        <TabsPrimitive.Content value="subjects" className="outline-none space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink flex items-center gap-2">
              <BookOpen className="size-4 text-[var(--brand)]" />
              المواد والدروس المسجلة للطالب ({ss.length})
            </h3>
            <Button size="sm" onClick={() => setEnrollOpen(true)}>
              <Plus className="size-4" /> حجز وتعديل المواد
            </Button>
          </div>

          {ss.length === 0 ? (
            <Card>
              <EmptyState
                icon={BookOpen}
                title="غير مسجّل في أي مادة حالياً"
                description="اضغط على حجز مواد لتحديد المواد التي يدرسها الطالب معك وتطبيق سعر الباقة."
                action={<Button size="sm" onClick={() => setEnrollOpen(true)}>حجز وتسجيل المواد</Button>}
              />
            </Card>
          ) : (
            <div className="grid gap-2.5 md:grid-cols-2">
              {ss.map((row) => {
                const subj = subjectById.get(row.subject_id)
                const price = row.price_override ?? subj?.price ?? 0
                return (
                  <Card key={row.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-base font-bold text-ink">{subj?.name ?? 'مادة'}</p>
                        <p className="mt-1 text-xs text-muted">
                          {fmtMoney(price)} / شهر
                          {row.price_override != null ? ' (سعر باقة مخصص)' : ''}
                        </p>
                      </div>
                      <Badge variant={row.is_active ? 'default' : 'secondary'}>
                        {row.is_active ? 'مفعّل' : 'موقوف'}
                      </Badge>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsPrimitive.Content>

        {/* ---------------- المذكرات والكتب ---------------- */}
        <TabsPrimitive.Content value="booklets" className="outline-none space-y-3">
          {studentOrders.length === 0 ? (
            <Card>
              <EmptyState
                icon={BookText}
                title="لم يحجز الطالب أي مذكرات بعد"
                description="يمكنك حجز المذكرات وتسجيل المدفوعات كاش أو محفظة أو انستاباي."
                action={<Button size="sm" asChild><Link to={`/booklets?student=${id}`}>حجز مذكرة لهذا الطالب</Link></Button>}
              />
            </Card>
          ) : (
            <div className="grid gap-3">
              {studentOrders.map((order) => {
                const b = bookletMap.get(order.booklet_id)
                return (
                  <Card key={order.id} className="p-3.5">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-ink">{b?.title || 'مذكرة'}</h4>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted">
                          <span>السعر: <strong className="text-ink">{fmtMoney(order.price)}</strong></span>
                          <span>• مدفوع: <strong className="text-emerald-600">{fmtMoney(order.paid_amount)}</strong></span>
                          {order.remaining_amount > 0 && (
                            <span>• متبقي: <strong className="text-amber-600">{fmtMoney(order.remaining_amount)}</strong></span>
                          )}
                          <span>• وسيلة الدفع: {order.payment_method === 'cash' ? 'كاش' : order.payment_method === 'wallet' ? 'محفظة' : 'انستاباي'}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {order.remaining_amount > 0 && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setPayBookletTarget(order)}
                            className="text-amber-700 bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-xs"
                          >
                            <Wallet className="size-3.5" /> سداد المتبقي ({fmtMoney(order.remaining_amount)})
                          </Button>
                        )}
                        <button
                          onClick={() => toggleDelivery.mutate(order.id)}
                          className={`tap flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                            order.is_delivered
                              ? 'bg-emerald-500/10 text-emerald-600'
                              : 'bg-blue-600 text-white'
                          }`}
                        >
                          {order.is_delivered ? <CheckCircle2 className="size-3.5" /> : <Clock className="size-3.5" />}
                          {order.is_delivered ? 'تم التسليم' : 'تسليم الآن'}
                        </button>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsPrimitive.Content>

        {/* ---------------- الحضور ---------------- */}
        <TabsPrimitive.Content value="attendance" className="outline-none">
          {attendance.length === 0 ? (
            <Card><EmptyState icon={CalendarCheck} title="لا يوجد سجل حضور بعد" /></Card>
          ) : (
            <Card className="divide-y divide-[var(--border)]">
              {attendance.map((a) => {
                const info = sessionsMap.get(a.session_id)
                return (
                  <div key={a.id} className="flex items-center gap-3 p-3.5 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-ink">{info?.subject ? subjectName.get(info.subject) ?? 'حصة' : 'حصة'}</p>
                      <p className="text-muted">{info ? fmtDate(info.date) : '—'}</p>
                    </div>
                    <AttendanceBadge status={a.status} />
                  </div>
                )
              })}
            </Card>
          )}
        </TabsPrimitive.Content>

        {/* ---------------- المستحقات والديون ---------------- */}
        <TabsPrimitive.Content value="finance" className="space-y-4 outline-none">
          {/* كشف ملخص المستحقات */}
          <div className="rounded-2xl border border-[var(--border)] bg-surface-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
              <div>
                <p className="text-xs font-bold text-muted">إجمالي جميع المديونيات المطلوبة من الطالب:</p>
                <p className="text-xl font-black text-rose-600 dark:text-rose-400 font-mono mt-0.5">
                  {fmtMoney(totalDebt)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setChargeOpen(true)}>
                  <Plus className="size-4" /> إضافة بند مالي
                </Button>
                <Button size="sm" onClick={() => setPayOpen(true)}>
                  <Wallet className="size-4" /> تسجيل دفعة (دروس ومذكرات)
                </Button>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-surface p-2.5 border border-[var(--border)]">
                <span className="text-muted">مستحقات الدروس:</span>
                <p className="text-base font-extrabold text-amber-600 font-mono mt-0.5">
                  {fmtMoney(lessonDebt)}
                </p>
              </div>
              <div className="rounded-xl bg-surface p-2.5 border border-[var(--border)]">
                <span className="text-muted">مستحقات المذكرات والكتب:</span>
                <p className="text-base font-extrabold text-blue-600 font-mono mt-0.5">
                  {fmtMoney(bookletDebt)}
                </p>
              </div>
            </div>
          </div>

          {/* مستحقات المذكرات والكتب */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                <BookText className="size-4 text-blue-600" />
                مستحقات المذكرات والكتب الدراسية ({studentOrders.length})
              </h3>
              {bookletDebt > 0 && (
                <Badge variant="warning" className="text-xs">
                  متبقي للمذكرات: {fmtMoney(bookletDebt)}
                </Badge>
              )}
            </div>

            {studentOrders.length === 0 ? (
              <Card>
                <EmptyState
                  icon={BookText}
                  title="لا توجد مذكرات محجوزة للطالب"
                  description="يمكنك حجز المذكرات من قسم المذكرات أو تسليمها للطالب."
                />
              </Card>
            ) : (
              <div className="grid gap-2">
                {studentOrders.map((o) => {
                  const b = bookletMap.get(o.booklet_id)
                  const hasDebt = o.remaining_amount > 0
                  return (
                    <Card key={o.id} className="p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-ink text-sm">{b?.title || 'مذكرة'}</span>
                            <Badge
                              variant={o.is_delivered ? 'default' : 'secondary'}
                              className={o.is_delivered ? 'bg-emerald-600 text-[10px]' : 'text-[10px]'}
                            >
                              {o.is_delivered ? 'تم التسليم' : 'لم يستلم بعد'}
                            </Badge>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2 text-muted">
                            <span>السعر: <strong>{fmtMoney(o.price)}</strong></span>
                            <span>• مدفوع: <strong className="text-emerald-600">{fmtMoney(o.paid_amount)}</strong></span>
                            {hasDebt ? (
                              <span>• دين متبقي: <strong className="text-rose-600">{fmtMoney(o.remaining_amount)}</strong></span>
                            ) : (
                              <span className="text-emerald-600 font-bold">• مسدد بالكامل ✓</span>
                            )}
                          </div>
                        </div>

                        {hasDebt && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setPayBookletTarget(o)}
                            className="bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 border-amber-500/30 text-xs shrink-0"
                          >
                            <Wallet className="size-3.5" /> سداد المتبقي ({fmtMoney(o.remaining_amount)})
                          </Button>
                        )}
                      </div>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>

          {/* مستحقات الدروس والحصص */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                <ReceiptText className="size-4 text-amber-600" />
                مستحقات الدروس والشهور ({charges.length})
              </h3>
              {lessonDebt > 0 && (
                <Badge variant="danger" className="text-xs">
                  متبقي للدروس: {fmtMoney(lessonDebt)}
                </Badge>
              )}
            </div>

            {charges.length === 0 ? (
              <Card><EmptyState icon={ReceiptText} title="لا توجد مستحقات دروس مسجلة" /></Card>
            ) : (
              <Card className="divide-y divide-[var(--border)]">
                {charges.map((c) => {
                  const rem = c.void_at ? 0 : Math.max(0, c.amount - c.paid_amount)
                  return (
                    <div key={c.id} className={`flex items-center justify-between gap-3 p-3 text-xs ${c.void_at ? 'opacity-50 line-through' : ''}`}>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-ink">{c.title}</p>
                        <p className="text-muted">{fmtDate(c.due_date)}</p>
                      </div>
                      <div className="text-left font-mono">
                        <p className="font-bold text-ink">{fmtMoney(c.amount)}</p>
                        {rem > 0 ? (
                          <p className="text-amber-600 font-bold">متبقي: {fmtMoney(rem)}</p>
                        ) : (
                          <p className="text-emerald-600">مسدد بالكامل ✓</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </Card>
            )}
          </div>
        </TabsPrimitive.Content>

        {/* ---------------- المدفوعات ---------------- */}
        <TabsPrimitive.Content value="payments" className="outline-none">
          {payments.length === 0 ? (
            <Card><EmptyState icon={ReceiptText} title="لم تسجّل أي مدفوعات بعد" /></Card>
          ) : (
            <Card className="divide-y divide-[var(--border)]">
              {payments.map((p) => (
                <div key={p.id} className={`flex items-center justify-between p-3.5 text-xs ${p.void_at ? 'opacity-50' : ''}`}>
                  <div>
                    <p className={`font-mono text-sm font-bold ${Number(p.amount) < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {Number(p.amount) >= 0 ? '+' : ''}{fmtMoney(p.amount)}
                      {p.void_at && <span className="mr-2 text-[11px] text-muted">(ملغاة)</span>}
                    </p>
                    <p className="text-muted">
                      #{String(p.receipt_no ?? 0).padStart(5, '0')} • {fmtDate(p.paid_at)} • {PAYMENT_METHOD_LABEL[p.method] || 'كاش'}
                      {p.notes ? ` • ${p.notes}` : ''}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/receipt/${p.id}`}><ReceiptText className="size-3.5" /> الإيصال</Link>
                  </Button>
                </div>
              ))}
            </Card>
          )}
        </TabsPrimitive.Content>
      </TabsPrimitive.Root>

      {/* نوافذ التعديل والدفع وحجز المواد */}
      <EnrollSubjectsModal
        open={enrollOpen}
        onOpenChange={setEnrollOpen}
        studentId={student.id}
        initialYearId={student.year_id || undefined}
      />
      <StudentForm open={editOpen} onOpenChange={setEditOpen} student={student} />
      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} studentId={student.id} />
      <ChargeDialog open={chargeOpen} onOpenChange={setChargeOpen} studentId={student.id} />

      {/* مودال سداد متبقي المذكرة */}
      <BookletPaymentModal
        order={payBookletTarget}
        bookletTitle={bookletMap.get(payBookletTarget?.booklet_id || '')?.title}
        open={!!payBookletTarget}
        onOpenChange={(open) => !open && setPayBookletTarget(null)}
      />
    </div>
  )
}

/* ========================================================================== */
/*                       مودال سداد متبقي مذكرة من البروفايل                  */
/* ========================================================================== */

function BookletPaymentModal({
  order,
  bookletTitle,
  open,
  onOpenChange,
}: {
  order: BookletOrder | null
  bookletTitle?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [payAmount, setPayAmount] = useState('0')
  const [method, setMethod] = useState<'cash' | 'wallet' | 'instapay'>('cash')

  useEffect(() => {
    if (order) {
      setPayAmount(String(order.remaining_amount))
      setMethod('cash')
    }
  }, [order, open])

  const payAction = useAction(
    async () => {
      if (!order) return
      const amt = Number(payAmount || 0)
      if (amt <= 0) throw new Error('أدخل مبلغاً صحيحاً')
      await api.payBookletOrder(order.id, amt, method)
    },
    {
      success: 'تم تسجيل سداد المذكرة وتحديث حساب الطالب بنجاح ✓',
      invalidate: [['booklet_orders'], ['dashboard'], ['payments'], ['payments']],
      onDone: () => onOpenChange(false),
    },
  )

  if (!order) return null

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="سداد متبقي المذكرة"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault()
          payAction.mutate(undefined as never)
        }}
        className="space-y-4"
      >
        <div className="rounded-xl border border-[var(--border)] bg-surface-2 p-3 text-xs space-y-1">
          <p className="font-bold text-ink">مذكرة: {bookletTitle || 'مذكرة دراسية'}</p>
          <div className="flex justify-between text-muted">
            <span>سعر المذكرة: {fmtMoney(order.price)}</span>
            <span>مدفوع سابقاً: {fmtMoney(order.paid_amount)}</span>
          </div>
          <div className="flex justify-between font-bold text-amber-700 dark:text-amber-300 pt-1 border-t border-[var(--border)]">
            <span>المبلغ المتبقي المطلوب:</span>
            <span>{fmtMoney(order.remaining_amount)}</span>
          </div>
        </div>

        <Field label="المبلغ المراد سداده الآن (ج.م)" required>
          <Input
            type="number"
            min="1"
            max={order.remaining_amount}
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            autoFocus
          />
        </Field>

        <Field label="طريقة السداد" required>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setMethod('cash')}
              className={`tap flex flex-col items-center justify-center rounded-xl border p-2 text-xs font-bold transition-all ${
                method === 'cash'
                  ? 'border-[var(--brand)] bg-brand-soft text-[var(--brand)]'
                  : 'border-[var(--border)] bg-surface text-ink-2'
              }`}
            >
              كاش
            </button>
            <button
              type="button"
              onClick={() => setMethod('wallet')}
              className={`tap flex flex-col items-center justify-center rounded-xl border p-2 text-xs font-bold transition-all ${
                method === 'wallet'
                  ? 'border-amber-500 bg-amber-500/10 text-amber-600'
                  : 'border-[var(--border)] bg-surface text-ink-2'
              }`}
            >
              محفظة
            </button>
            <button
              type="button"
              onClick={() => setMethod('instapay')}
              className={`tap flex flex-col items-center justify-center rounded-xl border p-2 text-xs font-bold transition-all ${
                method === 'instapay'
                  ? 'border-blue-500 bg-blue-500/10 text-blue-600'
                  : 'border-[var(--border)] bg-surface text-ink-2'
              }`}
            >
              إنستاباي
            </button>
          </div>
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button type="submit" loading={payAction.isPending}>
            تأكيد السداد ({fmtMoney(Number(payAmount || 0))})
          </Button>
        </div>
      </form>
    </Modal>
  )
}
