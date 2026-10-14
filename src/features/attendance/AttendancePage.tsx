import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { addDays } from 'date-fns'
import {
  Check, CheckCheck, ClipboardCheck, Clock, Save, Users, X, AlertCircle, CalendarDays, CalendarX, RotateCcw,
} from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import {
  Avatar, Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState,
  ListSkeleton, Segmented, Select, Textarea, Modal, Field, useConfirm,
} from '@/components/ui'
import { SessionBadge } from '@/components/common/Status'
import { useAction, useLookups, useSessionAttendance, useSessions, useStudents, useStudentSubjects } from '@/lib/hooks'
import * as api from '@/lib/api'
import type { AttendanceStatus, ClassSession } from '@/lib/database.types'
import { fmtDate, fmtDayName, fmtTime, isoOf, todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'

/** حصة لم يحن موعدها بعد (تاريخها بعد اليوم) — لا يجوز تسجيل حضورها */
const isFutureSession = (d: string) => d > todayISO()

export default function AttendancePage() {
  const [params, setParams] = useSearchParams()
  const [sessionId, setSessionId] = useState(params.get('session') ?? '')
  const [range, setRange] = useState<'today' | 'week' | 'all'>('today')

  const from = range === 'all' ? undefined : todayISO()
  const to = range === 'today' ? todayISO() : range === 'week' ? isoOf(addDays(new Date(), 7)) : undefined
  const { data: sessions = [], isLoading } = useSessions(range === 'all' ? undefined : from, to)
  const { subjectName, groupName } = useLookups()

  // لو اتفتحت حصة تانية من رابط وانت في نفس الصفحة، نتنقل لها
  const urlSession = params.get('session') ?? ''
  useEffect(() => {
    if (urlSession && urlSession !== sessionId) setSessionId(urlSession)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlSession])

  useEffect(() => {
    if (sessionId) {
      params.set('session', sessionId)
      setParams(params, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const selected = useMemo(() => sessions.find((s) => s.id === sessionId), [sessions, sessionId])

  const { data: fetched } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.getSession(sessionId),
    enabled: !!sessionId && !selected,
  })
  const resolved = selected ?? fetched

  return (
    <div>
      <PageHeader
        title="تسجيل الحضور"
        icon={ClipboardCheck}
        subtitle="اختر الحصة، ثم حدّد الجميع حاضر وعدّل الغائبين فقط"
      />

      {!resolved ? (
        <>
          <div className="mb-4">
            <Segmented
              value={range}
              onChange={setRange}
              options={[
                { value: 'today', label: 'اليوم' },
                { value: 'week', label: 'هذا الأسبوع' },
                { value: 'all', label: 'كل الحصص' },
              ]}
            />
          </div>

          {isLoading ? (
            <ListSkeleton rows={5} />
          ) : sessions.length === 0 ? (
            <Card>
              <EmptyState
                icon={CalendarDays}
                title="لا توجد حصص في هذه الفترة"
                description="أضف حصصًا من صفحة جدول الحصص لتتمكن من تسجيل الحضور."
                action={<Button asChild><Link to="/schedule">جدول الحصص</Link></Button>}
              />
            </Card>
          ) : (
            <div className="grid gap-2.5 md:grid-cols-2">
              {sessions.map((s) => {
                const future = isFutureSession(s.session_date)
                return (
                <button
                  key={s.id}
                  onClick={() => setSessionId(s.id)}
                  className={cn(
                    'tap animate-fade-up flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 text-right transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)]',
                    future && 'opacity-65',
                  )}
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--brand)_12%,transparent)] text-[var(--brand)]">
                    <ClipboardCheck className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold text-ink">{subjectName.get(s.subject_id)}</p>
                    <p className="truncate text-[11.5px] text-muted">
                      {s.group_id ? groupName.get(s.group_id) : 'كل الطلاب'} · {fmtDayName(s.session_date)} {fmtDate(s.session_date)}
                      {s.start_time ? ` · ${fmtTime(s.start_time)}` : ''}
                    </p>
                  </div>
                  {future ? <Badge tone="warning">لم تبدأ بعد</Badge> : <SessionBadge status={s.status} />}
                </button>
                )
              })}
            </div>
          )}
        </>
      ) : (
        <AttendanceSheet key={resolved.id} session={resolved} onBack={() => { setSessionId(''); params.delete('session'); setParams(params, { replace: true }) }} />
      )}
    </div>
  )
}

/* ============================ ورقة الحضور ============================ */
function AttendanceSheet({ session, onBack }: { session: ClassSession; onBack: () => void }) {
  const { subjectName, groupName } = useLookups()
  const { data: students = [] } = useStudents()
  const { data: enrollments = [] } = useStudentSubjects()
  const { data: existing = [], isLoading } = useSessionAttendance(session.id)

  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [noteFor, setNoteFor] = useState<string | null>(null)

  const cancelled = session.status === 'cancelled'
  /** الحصة لم يحن موعدها بعد أو ملغاة: العرض مسموح والتسجيل ممنوع */
  const locked = isFutureSession(session.session_date) || cancelled
  const confirm = useConfirm()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  const SESSION_KEYS = [['attendance'], ['sessions'], ['session'], ['cycles'], ['charges'], ['dashboard'], ['attendance-student'], ['attendance-all']]
  const cancelAction = useAction(
    async (status: 'cancelled' | 'scheduled') =>
      api.cancelSession({ id: session.id, status, reason: status === 'cancelled' ? cancelReason.trim() || 'ظرف طارئ' : null }),
    {
      success: (r) =>
        r.reverted > 0
          ? `تم إلغاء الحصة ✓ ومش هتتحسب على ${r.reverted} طالب كانوا متسجلين حضور`
          : 'تم تحديث الحصة ✓ — مش هتتحسب على أي طالب',
      invalidate: SESSION_KEYS,
      onDone: () => setCancelOpen(false),
    },
  )

  const roster = useMemo(() => {
    const inSubject = new Set(enrollments.filter((e) => e.subject_id === session.subject_id && e.is_active).map((e) => e.student_id))
    return students
      .filter((s) => s.status === 'active' && inSubject.has(s.id) && (!session.group_id || s.group_id === session.group_id))
      .sort((a, b) => a.full_name.localeCompare(b.full_name, 'ar'))
  }, [students, enrollments, session])

  useEffect(() => {
    const m: Record<string, AttendanceStatus> = {}
    const n: Record<string, string> = {}
    for (const a of existing) {
      m[a.student_id] = a.status
      if (a.note) n[a.student_id] = a.note
    }
    setMarks(m)
    setNotes(n)
  }, [existing])

  const stats = useMemo(() => {
    const v = Object.values(marks)
    return {
      present: v.filter((x) => x === 'present').length,
      absent: v.filter((x) => x === 'absent').length,
      late: v.filter((x) => x === 'late').length,
      excused: v.filter((x) => x === 'excused').length,
      unset: roster.length - v.length,
    }
  }, [marks, roster])

  const save = useAction(
    async () => {
      if (locked) throw new Error('لا يمكن تسجيل الحضور قبل موعد الحصة')
      if (!roster.length) throw new Error('لا يوجد طلاب في هذه الحصة')
      const records = roster.map((s) => ({
        student_id: s.id,
        status: marks[s.id] ?? 'present',
        note: notes[s.id] || null,
      }))
      return api.saveSessionAttendance(session.id, records)
    },
    {
      success: (r) =>
        r.chargesCreated > 0
          ? `تم حفظ حضور ${r.saved} طالب ✓ وبدأت دورة جديدة لـ ${r.chargesCreated} طالب وسُجّلت رسومها`
          : `تم حفظ حضور ${r.saved} طالب وتحديث الدورات ✓`,
      invalidate: [['attendance'], ['sessions'], ['session'], ['cycles'], ['charges'], ['dashboard'], ['attendance-student'], ['attendance-all']],
    },
  )

  const setAll = (status: AttendanceStatus) => {
    const m: Record<string, AttendanceStatus> = {}
    for (const s of roster) m[s.id] = status
    setMarks(m)
  }

  const STATUS_BTN: { v: AttendanceStatus; label: string; Icon: typeof Check; cls: string }[] = [
    { v: 'present', label: 'حاضر', Icon: Check, cls: 'data-[on=true]:bg-success data-[on=true]:text-white data-[on=true]:border-success' },
    { v: 'absent', label: 'غائب', Icon: X, cls: 'data-[on=true]:bg-danger data-[on=true]:text-white data-[on=true]:border-danger' },
    { v: 'late', label: 'متأخر', Icon: Clock, cls: 'data-[on=true]:bg-warning data-[on=true]:text-white data-[on=true]:border-warning' },
    { v: 'excused', label: 'بعذر', Icon: AlertCircle, cls: 'data-[on=true]:bg-info data-[on=true]:text-white data-[on=true]:border-info' },
  ]

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="-mr-2">→ كل الحصص</Button>

      {cancelled && (
        <Card className="flex flex-wrap items-center gap-3 border-danger/40 bg-danger-bg p-3.5">
          <CalendarX className="size-5 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-bold text-danger">الحصة دي ملغاة ومش محسوبة على الطلاب</p>
            {session.reason && <p className="mt-0.5 text-[12px] text-danger">السبب: {session.reason}</p>}
          </div>
          <Button
            size="sm"
            variant="secondary"
            loading={cancelAction.isPending}
            onClick={() => cancelAction.mutate('scheduled')}
          >
            <RotateCcw className="size-4" /> إعادة تفعيل الحصة
          </Button>
        </Card>
      )}

      {locked && !cancelled && (
        <Card className="flex items-start gap-3 border-warning/40 bg-warning-bg p-3.5">
          <CalendarDays className="mt-0.5 size-5 shrink-0 text-warning" />
          <div>
            <p className="text-[13.5px] font-bold text-warning">لم يحن موعد هذه الحصة بعد</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-warning">
              موعدها {fmtDayName(session.session_date)} {fmtDate(session.session_date)} — تسجيل الحضور يفتح في يوم الحصة.
            </p>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>{subjectName.get(session.subject_id)}</CardTitle>
            <p className="mt-0.5 text-[12px] text-ink-2">
              {session.group_id ? groupName.get(session.group_id) : 'كل الطلاب'} · {fmtDayName(session.session_date)} {fmtDate(session.session_date)}
              {session.start_time ? ` · ${fmtTime(session.start_time)}` : ''}
            </p>
          </div>
          <SessionBadge status={session.status} />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-xl bg-success-bg p-2.5 text-center">
              <p className="num text-lg font-extrabold text-success">{stats.present}</p>
              <p className="text-[11px] text-success">حاضر</p>
            </div>
            <div className="rounded-xl bg-danger-bg p-2.5 text-center">
              <p className="num text-lg font-extrabold text-danger">{stats.absent}</p>
              <p className="text-[11px] text-danger">غائب</p>
            </div>
            <div className="rounded-xl bg-warning-bg p-2.5 text-center">
              <p className="num text-lg font-extrabold text-warning">{stats.late}</p>
              <p className="text-[11px] text-warning">متأخر</p>
            </div>
            <div className="rounded-xl bg-surface-2 p-2.5 text-center">
              <p className="num text-lg font-extrabold text-ink-2">{stats.unset}</p>
              <p className="text-[11px] text-ink-2">لم يُحدَّد</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="subtle" size="sm" disabled={locked} onClick={() => setAll('present')}>
              <CheckCheck className="size-4" /> الجميع حاضر
            </Button>
            <Button variant="secondary" size="sm" disabled={locked} onClick={() => setAll('absent')}>
              <X className="size-4" /> الجميع غائب
            </Button>
            <Button variant="ghost" size="sm" disabled={locked} onClick={() => setMarks({})}>مسح التحديد</Button>
            {!cancelled && (
              <Button
                variant="ghost"
                size="sm"
                className="mr-auto text-danger"
                onClick={() => {
                  setCancelReason('')
                  setCancelOpen(true)
                }}
              >
                <CalendarX className="size-4" /> إلغاء الحصة (ظرف طارئ)
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : roster.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="لا يوجد طلاب مطابقون"
            description="تأكد من تسجيل الطلاب في هذه المادة، ومن أن مجموعة الحصة صحيحة."
          />
        </Card>
      ) : (
        <>
          <div className="space-y-2 pb-24 lg:pb-4">
            {roster.map((s) => {
              const cur = marks[s.id]
              return (
                <Card key={s.id} className="flex flex-wrap items-center gap-3 p-3">
                  <Avatar name={s.full_name} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-bold text-ink">{s.full_name}</p>
                    <p className="num truncate text-[11px] text-muted">
                      {s.code}
                      {notes[s.id] ? ` · ${notes[s.id]}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {STATUS_BTN.map(({ v, label, Icon, cls }) => (
                      <button
                        key={v}
                        data-on={cur === v}
                        disabled={locked}
                        onClick={() => setMarks({ ...marks, [s.id]: v })}
                        title={locked ? 'لم يحن موعد الحصة بعد' : label}
                        aria-label={label}
                        className={cn(
                          'tap grid size-10 place-items-center rounded-xl border border-line bg-surface text-ink-2 transition active:scale-95',
                          'disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100',
                          cls,
                        )}
                      >
                        <Icon className="size-[18px]" strokeWidth={2.6} />
                      </button>
                    ))}
                    <button
                      disabled={locked}
                      onClick={() => setNoteFor(s.id)}
                      className="tap grid size-10 place-items-center rounded-xl border border-line bg-surface text-muted transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-45"
                      aria-label="ملاحظة"
                    >
                      …
                    </button>
                  </div>
                </Card>
              )
            })}
          </div>

          {/* شريط الحفظ الثابت */}
          <div className="safe-b fixed inset-x-0 bottom-14 z-20 border-t border-line glass p-3 lg:bottom-0 lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            <div className="mx-auto flex max-w-[1400px] items-center gap-3">
              <p className="num flex-1 text-[12.5px] text-ink-2">
                {cancelled
                  ? 'الحصة ملغاة'
                  : locked
                  ? 'تسجيل الحضور يفتح في يوم الحصة'
                  : `${stats.present + stats.absent + stats.late + stats.excused} / ${roster.length} تم تحديدهم`}
              </p>
              <Button
                onClick={() => save.mutate(undefined as never)}
                loading={save.isPending}
                disabled={locked}
                size="lg"
                className="min-w-40"
              >
                <Save className="size-4" /> حفظ الحضور
              </Button>
            </div>
          </div>
        </>
      )}

      <Modal
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="إلغاء الحصة"
        description="الحصة الملغاة مش بتتحسب على أي طالب من الأربع حصص بتوع الشهر. ولو كنت سجلت حضور فيها، احتسابه بيتلغي."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>رجوع</Button>
            <Button variant="danger" loading={cancelAction.isPending} onClick={() => cancelAction.mutate('cancelled')}>
              <CalendarX className="size-4" /> تأكيد الإلغاء
            </Button>
          </>
        }
      >
        <Field label="السبب">
          <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="مثال: ظرف طارئ / إجازة / انقطاع الكهرباء…" />
        </Field>
      </Modal>

      <Modal
        open={!!noteFor}
        onOpenChange={(v) => !v && setNoteFor(null)}
        title="ملاحظة على الطالب"
        size="sm"
        footer={<Button onClick={() => setNoteFor(null)} block>تم</Button>}
      >
        <Field label="الملاحظة">
          <Textarea
            value={noteFor ? notes[noteFor] ?? '' : ''}
            onChange={(e) => noteFor && setNotes({ ...notes, [noteFor]: e.target.value })}
            placeholder="مثال: خرج مبكرًا…"
          />
        </Field>
      </Modal>
    </div>
  )
}
