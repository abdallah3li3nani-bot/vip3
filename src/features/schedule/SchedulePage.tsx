import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  addDays, addMonths, endOfMonth, endOfWeek, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths,
} from 'date-fns'
import {
  CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, ClipboardCheck, Clock, MapPin,
  MoreVertical, Pencil, Repeat, Trash2, CalendarX, CalendarClock,
} from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { SessionBadge } from '@/components/common/Status'
import {
  Badge, Button, Card, Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger,
  EmptyState, Field, Input, ListSkeleton, Modal, Segmented, Select, Textarea, useConfirm,
} from '@/components/ui'
import { useAction, useLookups, useSessions } from '@/lib/hooks'
import * as api from '@/lib/api'
import type { ClassSession } from '@/lib/database.types'
import { AR_DAYS, fmtDate, fmtDayName, fmtTime, isoOf, monthLabel, todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'

type View = 'day' | 'week' | 'month'

export default function SchedulePage() {
  const [view, setView] = useState<View>('week')
  const [cursor, setCursor] = useState(new Date())
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ClassSession | null>(null)
  const [statusFor, setStatusFor] = useState<ClassSession | null>(null)
  const [autoOpen, setAutoOpen] = useState(false)
  const { subjectName, groupName, subjectById } = useLookups()
  const confirm = useConfirm()
  const nav = useNavigate()

  const range = useMemo(() => {
    if (view === 'day') return { from: isoOf(cursor), to: isoOf(cursor) }
    if (view === 'week') {
      const s = startOfWeek(cursor, { weekStartsOn: 6 })
      return { from: isoOf(s), to: isoOf(addDays(s, 6)) }
    }
    const s = startOfWeek(startOfMonth(cursor), { weekStartsOn: 6 })
    const e = endOfWeek(endOfMonth(cursor), { weekStartsOn: 6 })
    return { from: isoOf(s), to: isoOf(e) }
  }, [view, cursor])

  const { data: sessions = [], isLoading } = useSessions(range.from, range.to)

  const byDate = useMemo(() => {
    const m = new Map<string, ClassSession[]>()
    for (const s of sessions) {
      if (!m.has(s.session_date)) m.set(s.session_date, [])
      m.get(s.session_date)!.push(s)
    }
    for (const list of m.values()) list.sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''))
    return m
  }, [sessions])

  const remove = useAction(api.deleteSession, {
    success: 'تم حذف الحصة وإلغاء احتسابها من دورات الطلاب',
    invalidate: [['sessions'], ['dashboard'], ['cycles'], ['charges'], ['attendance'], ['attendance-all'], ['attendance-student']],
  })

  function shift(dir: number) {
    if (view === 'day') setCursor(addDays(cursor, dir))
    else if (view === 'week') setCursor(addDays(cursor, dir * 7))
    else setCursor(dir > 0 ? addMonths(cursor, 1) : subMonths(cursor, 1))
  }

  const title =
    view === 'month' ? monthLabel(cursor)
      : view === 'day' ? `${fmtDayName(cursor)} — ${fmtDate(cursor)}`
      : `${fmtDate(startOfWeek(cursor, { weekStartsOn: 6 }))} إلى ${fmtDate(addDays(startOfWeek(cursor, { weekStartsOn: 6 }), 6))}`

  const days = useMemo(() => {
    const out: Date[] = []
    let d = new Date(range.from + 'T00:00:00')
    const end = new Date(range.to + 'T00:00:00')
    while (d <= end) {
      out.push(new Date(d))
      d = addDays(d, 1)
    }
    return out
  }, [range])

  function SessionRow({ s, compact }: { s: ClassSession; compact?: boolean }) {
    const subj = subjectById.get(s.subject_id)
    return (
      <div className={cn('flex items-center gap-3 rounded-xl border border-line p-3 transition hover:bg-surface-2', s.status === 'cancelled' && 'opacity-60')}>
        <span
          className="h-10 w-1.5 shrink-0 rounded-full"
          style={{ background: subj?.color ?? 'var(--brand)' }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-bold text-ink">{subjectName.get(s.subject_id) ?? 'مادة'}</p>
          <p className="flex flex-wrap items-center gap-x-2.5 truncate text-[11.5px] text-muted">
            {s.group_id && <span>{groupName.get(s.group_id)}</span>}
            {s.start_time && <span className="num inline-flex items-center gap-1"><Clock className="size-3" />{fmtTime(s.start_time)}</span>}
            {s.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3" />{s.location}</span>}
            {!compact && s.rescheduled_to && <span className="text-warning">مؤجلة إلى {fmtDate(s.rescheduled_to)}</span>}
          </p>
        </div>
        <SessionBadge status={s.status} />
        <Dropdown>
          <DropdownTrigger asChild>
            <Button variant="ghost" size="iconSm" aria-label="خيارات"><MoreVertical className="size-4" /></Button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownItem onSelect={() => nav(`/attendance?session=${s.id}`)}>
              <ClipboardCheck className="size-4" /> تسجيل الحضور
            </DropdownItem>
            <DropdownItem onSelect={() => { setEditing(s); setOpen(true) }}>
              <Pencil className="size-4" /> تعديل
            </DropdownItem>
            <DropdownItem onSelect={() => setStatusFor(s)}>
              <CalendarClock className="size-4" /> تأجيل / إلغاء
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem
              danger
              onSelect={() =>
                confirm({
                  requirePassword: true,
                  title: 'حذف الحصة',
                  message: 'سيتم حذف الحصة وسجل الحضور المرتبط بها، ولن تُحتسب على أي طالب.',
                  onConfirm: () => remove.mutateAsync(s.id),
                })
              }
            >
              <Trash2 className="size-4" /> حذف
            </DropdownItem>
          </DropdownContent>
        </Dropdown>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="جدول الحصص"
        icon={CalendarDays}
        subtitle={title}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => { setEditing(null); setOpen(true) }}>
              <CalendarPlus className="size-4" /> حصة واحدة
            </Button>
            <Button size="sm" onClick={() => setAutoOpen(true)}>
              <Repeat className="size-4" /> جدولة تلقائية لمجموعة
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'day', label: 'اليوم' },
            { value: 'week', label: 'الأسبوع' },
            { value: 'month', label: 'الشهر' },
          ]}
        />
        <div className="flex items-center gap-1">
          <Button variant="secondary" size="iconSm" onClick={() => shift(-1)} aria-label="السابق"><ChevronRight className="size-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>اليوم</Button>
          <Button variant="secondary" size="iconSm" onClick={() => shift(1)} aria-label="التالي"><ChevronLeft className="size-4" /></Button>
        </div>
      </div>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : view === 'month' ? (
        <Card className="p-2 sm:p-3">
          <div className="mb-1 grid grid-cols-7 gap-1 text-center">
            {['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'].map((d) => (
              <div key={d} className="py-1.5 text-[11px] font-bold text-muted">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((d) => {
              const iso = isoOf(d)
              const list = byDate.get(iso) ?? []
              const today = isSameDay(d, new Date())
              return (
                <button
                  key={iso}
                  onClick={() => { setCursor(d); setView('day') }}
                  className={cn(
                    'tap min-h-[64px] rounded-lg border p-1.5 text-right transition sm:min-h-[86px]',
                    isSameMonth(d, cursor) ? 'border-line bg-surface' : 'border-transparent bg-surface-2/50 opacity-50',
                    today && 'border-[var(--brand)] ring-1 ring-[var(--brand)]',
                  )}
                >
                  <span className={cn('num text-[11.5px] font-bold', today ? 'text-[var(--brand)]' : 'text-ink-2')}>{d.getDate()}</span>
                  <div className="mt-1 space-y-0.5">
                    {list.slice(0, 2).map((s) => (
                      <div
                        key={s.id}
                        className="truncate rounded px-1 py-0.5 text-[9.5px] font-semibold text-white"
                        style={{ background: subjectById.get(s.subject_id)?.color ?? 'var(--brand)' }}
                      >
                        {subjectName.get(s.subject_id)}
                      </div>
                    ))}
                    {list.length > 2 && <p className="num text-[9.5px] text-muted">+{list.length - 2}</p>}
                  </div>
                </button>
              )
            })}
          </div>
        </Card>
      ) : sessions.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title="لا توجد حصص في هذه الفترة"
            description="أضف حصة جديدة أو انتقل لفترة أخرى."
            action={<Button onClick={() => { setEditing(null); setOpen(true) }}><CalendarPlus className="size-4" /> إضافة حصة</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {days.map((d) => {
            const iso = isoOf(d)
            const list = byDate.get(iso) ?? []
            if (view === 'week' && list.length === 0) return null
            return (
              <div key={iso}>
                <h3 className={cn('mb-2 flex items-center gap-2 text-[13px] font-bold', isSameDay(d, new Date()) ? 'text-[var(--brand)]' : 'text-ink-2')}>
                  {AR_DAYS[d.getDay()]} <span className="num text-[12px] font-normal text-muted">{fmtDate(d)}</span>
                  {isSameDay(d, new Date()) && <Badge tone="brand">اليوم</Badge>}
                </h3>
                {list.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line py-4 text-center text-[12.5px] text-muted">لا توجد حصص</p>
                ) : (
                  <div className="space-y-2">{list.map((s) => <SessionRow key={s.id} s={s} />)}</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <SessionForm open={open} onOpenChange={setOpen} session={editing} defaultDate={isoOf(cursor)} />
      <StatusDialog session={statusFor} onClose={() => setStatusFor(null)} />
      <AutoScheduleDialog open={autoOpen} onOpenChange={setAutoOpen} onDone={(from) => { setCursor(new Date(from + 'T00:00:00')); setView('month') }} />
    </div>
  )
}

/* ------------------------------ نموذج الحصة ------------------------------ */
function SessionForm({
  open, onOpenChange, session, defaultDate,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  session: ClassSession | null
  defaultDate: string
}) {
  const { years, groups, subjects } = useLookups()
  const [year, setYear] = useState('')
  const [form, setForm] = useState({
    subject_id: '', group_id: '', session_date: defaultDate,
    start_time: '', end_time: '', location: '', notes: '',
  })
  const [repeat, setRepeat] = useState('1')

  useEffect(() => {
    if (!open) return
    if (session) {
      const subj = subjects.find((s) => s.id === session.subject_id)
      setYear(subj?.year_id ?? '')
      setForm({
        subject_id: session.subject_id, group_id: session.group_id ?? '',
        session_date: session.session_date, start_time: session.start_time?.slice(0, 5) ?? '',
        end_time: session.end_time?.slice(0, 5) ?? '', location: session.location ?? '', notes: session.notes ?? '',
      })
      setRepeat('1')
    } else {
      setYear(years[0]?.id ?? '')
      setForm({ subject_id: '', group_id: '', session_date: defaultDate, start_time: '', end_time: '', location: '', notes: '' })
      setRepeat('1')
    }
  }, [open, session, defaultDate, years, subjects])

  const ySubjects = useMemo(() => subjects.filter((s) => s.year_id === year && s.is_active), [subjects, year])
  const yGroups = useMemo(() => groups.filter((g) => g.year_id === year), [groups, year])

  const save = useAction(
    async () => {
      if (!form.subject_id) throw new Error('اختر المادة')
      if (!form.session_date) throw new Error('اختر التاريخ')
      const base = {
        subject_id: form.subject_id,
        group_id: form.group_id || null,
        start_time: form.start_time || null,
        end_time: form.end_time || null,
        location: form.location.trim() || null,
        notes: form.notes.trim() || null,
      }
      if (session) {
        return api.saveSession({ id: session.id, ...base, session_date: form.session_date })
      }
      const n = Math.max(1, Math.min(24, Number(repeat || 1)))
      const rows = Array.from({ length: n }, (_, i) => ({
        ...base,
        session_date: isoOf(addDays(new Date(form.session_date + 'T00:00:00'), i * 7)),
      }))
      return api.generateSessions(rows)
    },
    {
      success: session ? 'تم تحديث الحصة ✓' : 'تم إنشاء الحصص ✓',
      invalidate: [['sessions'], ['dashboard']],
      onDone: () => onOpenChange(false),
    },
  )

  return (
    <Modal
      open={open} onOpenChange={onOpenChange}
      title={session ? 'تعديل الحصة' : 'حصة جديدة'}
      description={session ? undefined : 'يمكنك إنشاء حصص أسبوعية متكررة دفعة واحدة'}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={() => save.mutate(undefined as never)} loading={save.isPending}>حفظ</Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="السنة الدراسية">
            <Select value={year} onChange={(e) => { setYear(e.target.value); setForm({ ...form, subject_id: '', group_id: '' }) }}>
              <option value="">— اختر —</option>
              {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </Select>
          </Field>
          <Field label="المادة" required>
            <Select value={form.subject_id} onChange={(e) => setForm({ ...form, subject_id: e.target.value })} disabled={!year}>
              <option value="">— اختر —</option>
              {ySubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="المجموعة">
            <Select value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })} disabled={!year}>
              <option value="">— كل الطلاب في المادة —</option>
              {yGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </Field>
          <Field label="التاريخ" required>
            <Input type="date" dir="ltr" className="num text-right" value={form.session_date} onChange={(e) => setForm({ ...form, session_date: e.target.value })} />
          </Field>
          <Field label="من">
            <Input type="time" dir="ltr" className="num text-right" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
          </Field>
          <Field label="إلى">
            <Input type="time" dir="ltr" className="num text-right" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
          </Field>
          <Field label="المكان" className="sm:col-span-2">
            <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="السنتر / أونلاين / المنزل…" />
          </Field>
        </div>

        {!session && (
          <Field label="تكرار أسبوعي" hint="عدد الأسابيع — 4 مثلًا لإنشاء دورة كاملة">
            <div className="flex items-center gap-2">
              <Repeat className="size-4 text-muted" />
              <Input dir="ltr" inputMode="numeric" className="num w-24 text-right" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
              <div className="flex gap-1.5">
                {['1', '4', '8', '12'].map((n) => (
                  <Button key={n} type="button" variant={repeat === n ? 'subtle' : 'secondary'} size="sm" onClick={() => setRepeat(n)}>
                    <span className="num">{n}</span>
                  </Button>
                ))}
              </div>
            </div>
          </Field>
        )}

        <Field label="ملاحظات">
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="اختياري…" />
        </Field>
      </div>
    </Modal>
  )
}

/* --------------------------- تأجيل / إلغاء الحصة --------------------------- */
function StatusDialog({ session, onClose }: { session: ClassSession | null; onClose: () => void }) {
  const [status, setStatus] = useState<'postponed' | 'cancelled' | 'scheduled'>('postponed')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (!session) return
    setStatus(session.status === 'cancelled' ? 'cancelled' : 'postponed')
    setTo(session.rescheduled_to ?? isoOf(addDays(new Date(session.session_date + 'T00:00:00'), 7)))
    setReason(session.reason ?? '')
  }, [session])

  const save = useAction(
    async () => {
      if (!session) return
      return api.cancelSession({
        id: session.id,
        status,
        reason: reason.trim() || null,
        rescheduledTo: status === 'postponed' ? to || null : null,
      })
    },
    {
      success: (r) =>
        r && r.reverted > 0
          ? `تم تحديث الحصة ✓ واتلغى احتسابها لـ ${r.reverted} طالب`
          : 'تم تحديث حالة الحصة ✓',
      invalidate: [['sessions'], ['session'], ['cycles'], ['charges'], ['dashboard'], ['attendance'], ['attendance-all'], ['attendance-student']],
      onDone: onClose,
    },
  )

  return (
    <Modal
      open={!!session}
      onOpenChange={(v) => !v && onClose()}
      title="تأجيل أو إلغاء الحصة"
      description="الحصة المؤجلة أو الملغاة لا تُحتسب على الطالب ضمن دورة الأربع حصص"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button onClick={() => save.mutate(undefined as never)} loading={save.isPending}>حفظ</Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="grid grid-cols-3 gap-2">
          {([
            ['postponed', 'تأجيل', CalendarClock],
            ['cancelled', 'إلغاء', CalendarX],
            ['scheduled', 'إعادة جدولة', CalendarDays],
          ] as const).map(([v, label, Icon]) => (
            <button
              key={v}
              type="button"
              onClick={() => setStatus(v)}
              className={cn(
                'tap flex flex-col items-center gap-1.5 rounded-xl border p-3 text-[12.5px] font-semibold transition',
                status === v ? 'border-[var(--brand)] bg-[color-mix(in_oklab,var(--brand)_10%,transparent)] text-[var(--brand)]' : 'border-line text-ink-2',
              )}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>

        {status === 'postponed' && (
          <Field label="الموعد البديل" hint="سيتم نقل الحصة إلى هذا التاريخ">
            <Input type="date" dir="ltr" className="num text-right" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        )}

        <Field label="السبب">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: ظرف طارئ…" />
        </Field>
      </div>
    </Modal>
  )
}

/* --------------------------- جدولة تلقائية لمجموعة --------------------------- */
// ترتيب الأيام بداية من السبت، والقيمة = Date.getDay()
const WEEK: { d: number; label: string }[] = [
  { d: 6, label: 'السبت' }, { d: 0, label: 'الأحد' }, { d: 1, label: 'الاثنين' }, { d: 2, label: 'الثلاثاء' },
  { d: 3, label: 'الأربعاء' }, { d: 4, label: 'الخميس' }, { d: 5, label: 'الجمعة' },
]

function AutoScheduleDialog({
  open, onOpenChange, onDone,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onDone: (fromDate: string) => void
}) {
  const { years, groups, subjects } = useLookups()
  const [year, setYear] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [groupId, setGroupId] = useState('')
  const [from, setFrom] = useState(todayISO())
  const [weeks, setWeeks] = useState('4')
  const [location, setLocation] = useState('')
  const [slots, setSlots] = useState<Record<number, { on: boolean; start: string; end: string }>>({})

  useEffect(() => {
    if (!open) return
    setYear(years[0]?.id ?? '')
    setSubjectId('')
    setGroupId('')
    setFrom(todayISO())
    setWeeks('4')
    setLocation('')
    setSlots({})
  }, [open, years])

  const ySubjects = useMemo(() => subjects.filter((s) => s.year_id === year && s.is_active), [subjects, year])
  const yGroups = useMemo(() => groups.filter((g) => g.year_id === year), [groups, year])
  const chosen = WEEK.filter((w) => slots[w.d]?.on)
  const w = Math.max(1, Math.min(52, Number(weeks) || 1))
  const subject = ySubjects.find((s) => s.id === subjectId)

  // معاينة أول الحصص
  const preview = useMemo(() => {
    if (!from || chosen.length === 0) return [] as { date: string; label: string; time: string }[]
    const out: { date: string; label: string; time: string }[] = []
    const start = new Date(from + 'T00:00:00')
    for (let i = 0; i < w * 7; i++) {
      const d = addDays(start, i)
      const slot = slots[d.getDay()]
      if (slot?.on) out.push({ date: isoOf(d), label: AR_DAYS[d.getDay()], time: slot.start })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, w, slots])

  const save = useAction(
    async () => {
      if (!subjectId) throw new Error('اختر المادة')
      if (chosen.length === 0) throw new Error('اختر يوم واحد على الأقل')
      if (chosen.some((c) => !slots[c.d].start)) throw new Error('حدد وقت بداية كل يوم')
      return api.autoSchedule({
        subjectId,
        groupId: groupId || null,
        slots: chosen.map((c) => ({ weekday: c.d, start: slots[c.d].start, end: slots[c.d].end || null })),
        fromDate: from,
        weeks: w,
        location: location.trim() || null,
      })
    },
    {
      success: (r) =>
        `تم جدولة ${r.created} حصة على التقويم ✓${r.skipped ? ` (تم تخطي ${r.skipped} حصة موجودة بالفعل)` : ''}`,
      invalidate: [['sessions'], ['dashboard']],
      onDone: () => {
        onOpenChange(false)
        onDone(from)
      },
    },
  )

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="جدولة تلقائية لحصص مجموعة"
      description="اختار أيام الحصص في الأسبوع ووقت كل يوم، والتطبيق يرتبها على التقويم لعدد الأسابيع اللي تحدده"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={() => save.mutate(undefined as never)} loading={save.isPending} disabled={preview.length === 0 || !subjectId}>
            جدولة {preview.length} حصة
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="الصف الدراسي">
            <Select value={year} onChange={(e) => { setYear(e.target.value); setSubjectId(''); setGroupId('') }}>
              {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </Select>
          </Field>
          <Field label="المادة" required>
            <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">— اختر —</option>
              {ySubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="المجموعة">
            <Select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">— كل طلاب المادة —</option>
              {yGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </Field>
        </div>

        <Field label="أيام الحصص في الأسبوع ووقت كل يوم" required>
          <div className="space-y-1.5">
            {WEEK.map(({ d, label }) => {
              const sl = slots[d] || { on: false, start: '', end: '' }
              return (
                <div
                  key={d}
                  className={cn(
                    'flex flex-wrap items-center gap-2 rounded-xl border p-2 transition',
                    sl.on ? 'border-[var(--brand)] bg-[color-mix(in_oklab,var(--brand)_7%,transparent)]' : 'border-line',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSlots({ ...slots, [d]: { ...sl, on: !sl.on, start: sl.start || '16:00' } })}
                    className={cn(
                      'tap w-24 rounded-lg px-2 py-1.5 text-[13px] font-bold transition',
                      sl.on ? 'bg-[var(--brand)] text-white' : 'bg-surface-2 text-ink-2',
                    )}
                  >
                    {label}
                  </button>
                  {sl.on && (
                    <div className="flex items-center gap-1.5 text-[12px] text-ink-2">
                      من
                      <Input type="time" dir="ltr" className="num h-9 w-28" value={sl.start} onChange={(e) => setSlots({ ...slots, [d]: { ...sl, start: e.target.value } })} />
                      إلى
                      <Input type="time" dir="ltr" className="num h-9 w-28" value={sl.end} onChange={(e) => setSlots({ ...slots, [d]: { ...sl, end: e.target.value } })} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Field>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="تبدأ من تاريخ" required>
            <Input type="date" dir="ltr" className="num text-right" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="لمدة (أسابيع)" hint={subject ? `الشهر في «${subject.name}» = ${subject.sessions_per_cycle} حصص` : undefined}>
            <div className="flex gap-1.5">
              <Input dir="ltr" inputMode="numeric" className="num w-20 text-right" value={weeks} onChange={(e) => setWeeks(e.target.value)} />
              {['4', '8', '12'].map((n) => (
                <Button key={n} type="button" size="sm" variant={weeks === n ? 'subtle' : 'secondary'} onClick={() => setWeeks(n)}>{n}</Button>
              ))}
            </div>
          </Field>
          <Field label="المكان">
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="السنتر…" />
          </Field>
        </div>

        {preview.length > 0 && (
          <div className="rounded-xl border border-line bg-surface-2 p-3">
            <p className="mb-2 text-[12.5px] font-bold text-ink">معاينة: {preview.length} حصة</p>
            <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
              {preview.map((p) => (
                <span key={p.date + p.time} className="rounded-lg bg-surface px-2 py-1 text-[11.5px] text-ink-2">
                  {p.label} <span className="num">{fmtDate(p.date)}</span> • <span className="num">{fmtTime(p.time)}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
