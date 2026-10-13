import { useEffect, useMemo, useState } from 'react'
import { Button, Field, Input, Modal, Select, Textarea, Badge, Checkbox } from '@/components/ui'
import { useAction, useBookletOrders, useBooklets, useCharges, useLookups, useStudents } from '@/lib/hooks'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import * as api from '@/lib/api'
import { fmtMoney, todayISO } from '@/lib/format'
import { useSettings } from '@/store/settings'
import { PAYMENT_METHOD_LABEL } from '@/components/common/Status'
import { matches } from '@/lib/utils'
import { SearchInput } from '@/components/common/SearchInput'

const INVALIDATE = [['charges'], ['payments'], ['dashboard'], ['students'], ['booklet_orders']]

/* ======================= تسجيل دفعة ======================= */
export function PaymentDialog({
  open,
  onOpenChange,
  studentId,
  presetChargeId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  studentId?: string
  presetChargeId?: string | null
}) {
  const { settings } = useSettings()
  const { data: students = [] } = useStudents()
  const [sid, setSid] = useState(studentId ?? '')
  const { data: charges = [] } = useCharges(sid || undefined)
  const { data: orders = [] } = useBookletOrders(sid ? { studentId: sid } : { studentId: '__none__' })
  const { data: booklets = [] } = useBooklets()
  const { yearName } = useLookups()
  const navigate = useNavigate()
  const [studentQ, setStudentQ] = useState('')
  const [includeBooklets, setIncludeBooklets] = useState(true)

  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [paidAt, setPaidAt] = useState(todayISO())
  const [chargeId, setChargeId] = useState(presetChargeId ?? '')
  const [notes, setNotes] = useState('')
  const [reference, setReference] = useState('')

  useEffect(() => {
    if (!open) return
    setSid(studentId ?? '')
    setChargeId(presetChargeId ?? '')
    setAmount('')
    setNotes('')
    setReference('')
    setMethod('cash')
    setPaidAt(todayISO())
    setStudentQ('')
    setIncludeBooklets(true)
  }, [open, studentId, presetChargeId])

  const unpaid = useMemo(
    () => (sid ? charges.filter((c) => !c.void_at && Number(c.amount) - Number(c.paid_amount) > 0.001) : []),
    [charges, sid],
  )
  const lessonsOut = useMemo(() => unpaid.reduce((a, c) => a + Number(c.amount) - Number(c.paid_amount), 0), [unpaid])
  const bookletOrdersDue = useMemo(() => (sid ? orders.filter((o) => o.remaining_amount > 0.001) : []), [orders, sid])
  const bookletsOut = useMemo(() => bookletOrdersDue.reduce((a, o) => a + o.remaining_amount, 0), [bookletOrdersDue])
  const outstanding = lessonsOut + (includeBooklets ? bookletsOut : 0)
  const bookletTitle = useMemo(() => new Map(booklets.map((b) => [b.id, b.title])), [booklets])

  const studentMatches = useMemo(() => {
    const q = studentQ.trim()
    if (!q) return []
    return students.filter((s) => matches(`${s.full_name} ${s.code ?? ''}`, q)).slice(0, 8)
  }, [students, studentQ])
  const chosen = students.find((s) => s.id === sid)

  useEffect(() => {
    if (open && chargeId) {
      const c = charges.find((x) => x.id === chargeId)
      if (c) setAmount(String(Number(c.amount) - Number(c.paid_amount)))
    }
  }, [chargeId, charges, open])

  const save = useAction(
    async () => {
      if (!sid) throw new Error('اختر الطالب أولًا')
      const v = Number(amount)
      if (!v || v <= 0) throw new Error('أدخل مبلغًا صحيحًا')
      return api.recordPayment({
        studentId: sid, amount: v, method, paidAt,
        notes: notes.trim() || null, chargeId: chargeId || null, reference: reference.trim() || null,
        includeBooklets,
      })
    },
    {
      invalidate: INVALIDATE,
      onDone: (p) => {
        onOpenChange(false)
        toast.success(`تم تسجيل الدفعة ✓ إيصال رقم #${String(p.receipt_no ?? 0).padStart(5, '0')}`, {
          action: { label: 'طباعة الإيصال', onClick: () => navigate(`/receipt/${p.id}`) },
          duration: 8000,
        })
      },
    },
  )

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="تسجيل دفعة"
      description="يُخصم المبلغ تلقائياً من أقدم مستحقات الدروس ثم المذكرات، ويُطبع له إيصال"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={() => save.mutate(undefined as never)} loading={save.isPending}>حفظ الدفعة</Button>
        </>
      }
    >
      <div className="space-y-3.5">
        {!studentId && (
          <Field label="الطالب" required>
            {chosen ? (
              <div className="flex items-center justify-between rounded-xl border border-line bg-surface-2 p-2.5">
                <div>
                  <p className="text-[13.5px] font-bold text-ink">{chosen.full_name}</p>
                  <p className="num text-[11.5px] text-muted">
                    {chosen.code}{chosen.year_id ? ` · ${yearName.get(chosen.year_id) ?? ''}` : ''}
                  </p>
                </div>
                <Button type="button" size="sm" variant="ghost" onClick={() => { setSid(''); setChargeId('') }}>تغيير</Button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <SearchInput value={studentQ} onChange={setStudentQ} placeholder="اكتب اسم الطالب أو الكود…" />
                {studentMatches.length > 0 && (
                  <div className="max-h-52 divide-y divide-[var(--border)] overflow-y-auto rounded-xl border border-line">
                    {studentMatches.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => { setSid(s.id); setChargeId(''); setStudentQ('') }}
                        className="tap flex w-full items-center justify-between p-2.5 text-right hover:bg-surface-2"
                      >
                        <span className="text-[13px] font-semibold text-ink">{s.full_name}</span>
                        <span className="num text-[11px] text-muted">
                          {s.code}{s.year_id ? ` · ${yearName.get(s.year_id) ?? ''}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Field>
        )}

        {sid && (
          <div className="space-y-1.5 rounded-xl bg-surface-2 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-ink-2">إجمالي المستحق حاليًا</span>
              <span className="num text-[15px] font-extrabold text-danger">{fmtMoney(outstanding, settings.currency_symbol)}</span>
            </div>
            <div className="flex justify-between text-[12px] text-ink-2">
              <span>دروس</span>
              <span className="num">{fmtMoney(lessonsOut, settings.currency_symbol)}</span>
            </div>
            {bookletsOut > 0 && (
              <label className="flex cursor-pointer items-center justify-between gap-2 text-[12px] text-ink-2">
                <span className="flex items-center gap-2">
                  <Checkbox checked={includeBooklets} onCheckedChange={(v) => setIncludeBooklets(v === true)} />
                  مذكرات ({bookletOrdersDue.map((o) => bookletTitle.get(o.booklet_id)).filter(Boolean).join('، ')})
                </span>
                <span className="num">{fmtMoney(bookletsOut, settings.currency_symbol)}</span>
              </label>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="المبلغ" required>
            <Input dir="ltr" inputMode="decimal" className="num text-right text-base font-bold" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </Field>
          <Field label="تاريخ الدفع">
            <Input type="date" dir="ltr" className="num text-right" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </Field>
          <Field label="طريقة الدفع">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {Object.entries(PAYMENT_METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="رقم مرجعي" hint="اختياري — رقم التحويل مثلًا">
            <Input dir="ltr" className="num text-right" value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
        </div>

        {unpaid.length > 0 && (
          <Field label="خصم من بند محدد" hint="اتركه فارغًا ليتم الخصم من الأقدم فالأحدث">
            <Select value={chargeId} onChange={(e) => setChargeId(e.target.value)}>
              <option value="">— تلقائي (الأقدم أولًا) —</option>
              {unpaid.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} — متبقٍ {fmtMoney(Number(c.amount) - Number(c.paid_amount), settings.currency_symbol)}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {sid && outstanding > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="subtle" size="sm" onClick={() => setAmount(String(outstanding))}>
              سداد كامل المستحق
            </Button>
            {unpaid[0] && (
              <Button type="button" variant="secondary" size="sm" onClick={() => setChargeId(unpaid[unpaid.length - 1].id)}>
                أقدم بند
              </Button>
            )}
          </div>
        )}

        <Field label="ملاحظات">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="اختياري…" />
        </Field>
      </div>
    </Modal>
  )
}

/* ======================= إضافة بند مالي ======================= */
type Scope = 'student' | 'group' | 'year' | 'all' | 'project'

export function ChargeDialog({
  open,
  onOpenChange,
  studentId,
  projectId,
  projectTitle,
  projectStudentIds,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  studentId?: string
  /** عند فتحه من صفحة مشروع: يقيّد الاختيار بطلاب المشروع ويُدرج اسمه في تفاصيل البند */
  projectId?: string
  projectTitle?: string
  projectStudentIds?: string[]
}) {
  const { settings } = useSettings()
  const { years, groups, yearName } = useLookups()
  const { data: students = [] } = useStudents()

  const inProject = Boolean(projectId)
  const enrolledSet = useMemo(() => new Set(projectStudentIds ?? []), [projectStudentIds])
  const defaultScope: Scope = studentId ? 'student' : inProject ? 'project' : 'group'

  const [scope, setScope] = useState<Scope>(defaultScope)
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [due, setDue] = useState(todayISO())
  const [notes, setNotes] = useState('')
  const [studentIds, setStudentIds] = useState<string[]>(studentId ? [studentId] : [])
  const [groupIds, setGroupIds] = useState<string[]>([])
  const [yearIds, setYearIds] = useState<string[]>([])
  const [q, setQ] = useState('')

  useEffect(() => {
    if (!open) return
    setScope(defaultScope)
    setTitle(''); setAmount(''); setDue(todayISO()); setNotes(''); setQ('')
    setStudentIds(studentId ? [studentId] : []); setGroupIds([]); setYearIds([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, studentId, projectId])

  /** داخل مشروع: كل الاختيارات محصورة في الطلاب المسجّلين فيه */
  const pool = useMemo(
    () => (inProject ? students.filter((s) => enrolledSet.has(s.id)) : students),
    [students, inProject, enrolledSet],
  )

  /** داخل مشروع نحسب الطلاب المستهدفين هنا حتى لا يخرج البند عن المسجّلين فيه */
  const projectTargetIds = useMemo(() => {
    if (!inProject) return []
    const active = pool.filter((s) => s.status === 'active')
    if (scope === 'project' || scope === 'all') return active.map((s) => s.id)
    if (scope === 'student') return studentIds.filter((id) => enrolledSet.has(id))
    if (scope === 'group') return active.filter((s) => s.group_id && groupIds.includes(s.group_id)).map((s) => s.id)
    return active.filter((s) => s.year_id && yearIds.includes(s.year_id)).map((s) => s.id)
  }, [inProject, pool, scope, studentIds, groupIds, yearIds, enrolledSet])

  const targetCount = useMemo(() => {
    if (inProject) return projectTargetIds.length
    const active = students.filter((s) => s.status === 'active')
    if (scope === 'all') return active.length
    if (scope === 'student') return studentIds.length
    if (scope === 'group') return active.filter((s) => s.group_id && groupIds.includes(s.group_id)).length
    return active.filter((s) => s.year_id && yearIds.includes(s.year_id)).length
  }, [inProject, projectTargetIds, scope, students, studentIds, groupIds, yearIds])

  /** تفاصيل تُحفظ مع البند ويراها الطالب في «المستحقات» */
  const detail = useMemo(() => {
    const parts: string[] = []
    if (projectTitle) parts.push(`مشروع: ${projectTitle}`)
    const v = Number(amount || 0)
    if (v > 0) parts.push(`${fmtMoney(v, settings.currency_symbol)} لكل طالب`)
    if (notes.trim()) parts.push(notes.trim())
    return parts.join(' · ')
  }, [projectTitle, amount, notes, settings.currency_symbol])

  const save = useAction(
    async () => {
      if (!title.trim()) throw new Error('اسم البند مطلوب')
      const v = Number(amount)
      if (!v || v <= 0) throw new Error('أدخل مبلغًا صحيحًا')
      if (targetCount === 0) throw new Error('اختر جهة واحدة على الأقل')
      // داخل مشروع: نرسل قائمة طلاب صريحة (محصورة في المسجّلين بالمشروع)
      if (inProject) {
        return api.addBulkCharge({
          title: title.trim(), amount: v, due, notes: detail || null,
          studentIds: projectTargetIds,
        })
      }
      return api.addBulkCharge({
        title: title.trim(), amount: v, due, notes: detail || null,
        studentIds: scope === 'student' ? studentIds : [],
        groupIds: scope === 'group' ? groupIds : [],
        yearIds: scope === 'year' ? yearIds : [],
        all: scope === 'all',
      })
    },
    {
      invalidate: INVALIDATE,
      onDone: () => onOpenChange(false),
      success: (n: number) => `تم إضافة البند لـ ${n} طالب ✓`,
    },
  )

  const list = useMemo(
    () => pool.filter((s) => s.status === 'active' && (!q || matches(s.full_name, q) || matches(s.code ?? '', q))),
    [pool, q],
  )

  /** المجموعات المتاحة داخل مشروع = مجموعات طلابه فقط */
  const groupList = useMemo(() => {
    if (!inProject) return groups
    const ids = new Set(pool.filter((s) => s.status === 'active' && s.group_id).map((s) => s.group_id as string))
    return groups.filter((g) => ids.has(g.id))
  }, [groups, inProject, pool])

  const toggle = (arr: string[], set: (v: string[]) => void, id: string) =>
    set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id])

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={inProject ? `بند مالي — ${projectTitle ?? 'المشروع'}` : 'إضافة بند مالي'}
      description={
        inProject
          ? 'يُضاف المبلغ إلى رصيد كل طالب مستهدف مع تفاصيله، ويظهر له في «المستحقات»'
          : 'أدوات، مذكرات، طباعة، خامات مشروع… يمكن تطبيقه على مجموعة كاملة'
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={() => save.mutate(undefined as never)} loading={save.isPending}>
            إضافة لـ {targetCount} طالب
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="اسم البند" required className="sm:col-span-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={inProject ? `مثال: خامات ${projectTitle ?? 'المشروع'}` : 'مثال: أدوات مشروع التخرج'}
            />
          </Field>
          <Field label="المبلغ لكل طالب" required>
            <Input dir="ltr" inputMode="decimal" className="num text-right text-base font-bold" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </Field>
          <Field label="تاريخ الاستحقاق">
            <Input type="date" dir="ltr" className="num text-right" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>

        <Field label="تطبيق على">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {((inProject
              ? [
                  ['project', 'كل طلاب المشروع'],
                  ['group', 'مجموعات'],
                  ['student', 'طلاب محددين'],
                ]
              : [
                  ['student', 'طلاب محددين'],
                  ['group', 'مجموعات'],
                  ['year', 'سنوات دراسية'],
                  ['all', 'كل الطلاب'],
                ]) as [Scope, string][]).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setScope(v)}
                className={`tap rounded-xl border p-2.5 text-[13px] font-semibold transition ${
                  scope === v
                    ? 'border-[var(--brand)] bg-[color-mix(in_oklab,var(--brand)_10%,transparent)] text-[var(--brand)]'
                    : 'border-line text-ink-2 hover:bg-surface-2'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>

        {scope === 'group' && (
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
            {groupList.map((g) => (
              <label key={g.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg p-2 hover:bg-surface-2">
                <Checkbox checked={groupIds.includes(g.id)} onCheckedChange={() => toggle(groupIds, setGroupIds, g.id)} />
                <span className="text-[13px] font-medium text-ink">{g.name}</span>
                <Badge tone="neutral" className="mr-auto">{yearName.get(g.year_id)}</Badge>
              </label>
            ))}
          </div>
        )}

        {scope === 'year' && (
          <div className="space-y-1 rounded-xl border border-line p-2">
            {years.map((y) => (
              <label key={y.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg p-2 hover:bg-surface-2">
                <Checkbox checked={yearIds.includes(y.id)} onCheckedChange={() => toggle(yearIds, setYearIds, y.id)} />
                <span className="text-[13px] font-medium text-ink">{y.name}</span>
              </label>
            ))}
          </div>
        )}

        {scope === 'student' && (
          <div className="space-y-2">
            <SearchInput value={q} onChange={setQ} placeholder="ابحث عن طالب…" />
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
              {list.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg p-2 hover:bg-surface-2">
                  <Checkbox checked={studentIds.includes(s.id)} onCheckedChange={() => toggle(studentIds, setStudentIds, s.id)} />
                  <span className="text-[13px] font-medium text-ink">{s.full_name}</span>
                  <span className="num mr-auto text-[11px] text-muted">{s.code}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {scope === 'project' && (
          <p className="rounded-xl bg-[color-mix(in_oklab,var(--brand)_10%,transparent)] p-3 text-[13px] text-[var(--brand)]">
            سيُضاف البند لكل طلاب المشروع النشطين ({targetCount} طالب).
          </p>
        )}

        {scope === 'all' && (
          <p className="rounded-xl bg-warning-bg p-3 text-[13px] text-warning">
            سيتم إنشاء هذا البند لكل الطلاب النشطين ({targetCount} طالب).
          </p>
        )}

        <Field label="ملاحظات">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="اختياري…" />
        </Field>

        {detail && (
          <div className="rounded-xl border border-line bg-surface-2 p-3">
            <p className="text-[12px] font-semibold text-ink-2">تفاصيل تظهر للطالب مع البند</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink">{detail}</p>
          </div>
        )}

        <div className="flex items-center justify-between rounded-xl bg-surface-2 p-3">
          <span className="text-[13px] text-ink-2">الإجمالي المتوقع</span>
          <span className="num text-[15px] font-extrabold text-ink">
            {fmtMoney(Number(amount || 0) * targetCount, settings.currency_symbol)}
          </span>
        </div>
      </div>
    </Modal>
  )
}
