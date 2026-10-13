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

  const remove = useAction(api.deleteSession, { success: 'تم حذف الحصة', invalidate: [['sessions'], ['dashboard']] })

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
                  title: 'حذف الحصة',
                  message: 'سيتم حذف الحصة وسجل الحضور المرتبط بها، وسيُعاد حساب دورات الطلاب.',
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
          <Button size="sm" onClick={() => { setEditing(null); setOpen(true) }}>
            <CalendarPlus className="size-4" /> حصة جديدة
          </Button>
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
      return api.saveSession({
        id: session.id,
        status,
        rescheduled_to: status === 'postponed' ? to || null : null,
        reason: reason.trim() || null,
        ...(status === 'postponed' && to ? { session_date: to } : {}),
      })
    },
    {
      success: 'تم تحديث حالة الحصة ✓',
      invalidate: [['sessions'], ['cycles'], ['charges'], ['dashboard']],
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
