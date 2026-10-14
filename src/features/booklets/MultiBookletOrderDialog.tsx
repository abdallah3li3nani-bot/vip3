import { useEffect, useMemo, useState } from 'react'
import { Banknote, BookText, CheckSquare, Smartphone, Square, User, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, Field, Input, Modal, Select } from '@/components/ui'
import { useAction } from '@/lib/hooks'
import * as api from '@/lib/api'
import { matches } from '@/lib/utils'
import { fmtMoney } from '@/lib/format'
import type { Booklet, BookletOrder, Student } from '@/lib/database.types'

type Line = { checked: boolean; price: string; paid: string }

/**
 * حجز مذكرة أو أكثر لطالب واحد:
 * 1) اختيار الصف ← 2) البحث عن الطالب داخل طلاب هذا الصف ← 3) تظهر مذكرات الصف فنختار واحدة أو أكثر
 */
export function MultiBookletOrderDialog({
  open,
  onOpenChange,
  students,
  booklets,
  years,
  orders,
  initialYearId,
  initialStudentId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  students: Student[]
  booklets: Booklet[]
  years: { id: string; name: string }[]
  orders: BookletOrder[]
  initialYearId?: string
  initialStudentId?: string
}) {
  const [yearId, setYearId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [search, setSearch] = useState('')
  const [lines, setLines] = useState<Record<string, Line>>({})
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'wallet' | 'instapay'>('cash')
  const [isDelivered, setIsDelivered] = useState(false)
  const [notes, setNotes] = useState('')

  // تهيئة عند الفتح فقط
  useEffect(() => {
    if (!open) return
    const st = initialStudentId ? students.find((s) => s.id === initialStudentId) : undefined
    setStudentId(st?.id || '')
    setYearId(st?.year_id || initialYearId || years[0]?.id || '')
    setSearch('')
    setLines({})
    setPaymentMethod('cash')
    setIsDelivered(false)
    setNotes('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const yearName = (id?: string | null) => years.find((y) => y.id === id)?.name || ''

  const gradeStudents = useMemo(
    () => students.filter((s) => s.year_id === yearId && s.status !== 'inactive'),
    [students, yearId],
  )

  // البحث يشمل كل الطلاب، وطلاب الصف المختار يظهروا الأول. اختيار الطالب يحدد صفه تلقائياً
  const filteredStudents = useMemo(() => {
    const q = search.trim()
    const list = q
      ? students
          .filter((s) => s.status !== 'inactive' && (matches(s.full_name, q) || matches(s.specialization || '', q) || matches(s.code ?? '', q)))
          .sort((a, b) => Number(b.year_id === yearId) - Number(a.year_id === yearId))
      : gradeStudents
    return list.slice(0, 60)
  }, [students, gradeStudents, search, yearId])

  const yearBooklets = useMemo(() => booklets.filter((b) => b.year_id === yearId), [booklets, yearId])

  // المذكرات المحجوزة مسبقاً لهذا الطالب
  const bookedMap = useMemo(() => {
    const m = new Map<string, BookletOrder>()
    if (!studentId) return m
    for (const o of orders) if (o.student_id === studentId) m.set(o.booklet_id, o)
    return m
  }, [orders, studentId])

  const selectedStudent = students.find((s) => s.id === studentId)

  function pickStudent(st: Student) {
    if (st.year_id && years.some((y) => y.id === st.year_id)) setYearId(st.year_id)
    setStudentId(st.id)
    setSearch('')
    setLines({})
  }

  function lineOf(b: Booklet): Line {
    return lines[b.id] || { checked: false, price: String(b.price), paid: String(b.price) }
  }

  function setLine(b: Booklet, patch: Partial<Line>) {
    setLines((prev) => ({ ...prev, [b.id]: { ...lineOf(b), ...prev[b.id], ...patch } }))
  }

  const available = yearBooklets.filter((b) => !bookedMap.has(b.id))
  const checked = yearBooklets.filter((b) => lineOf(b).checked && !bookedMap.has(b.id))

  function selectAll() {
    const next = { ...lines }
    for (const b of available) next[b.id] = { ...lineOf(b), checked: true }
    setLines(next)
  }
  function clearAll() {
    const next = { ...lines }
    for (const b of yearBooklets) if (next[b.id]) next[b.id] = { ...next[b.id], checked: false }
    setLines(next)
  }
  function setPaidForAll(mode: 'full' | 'half' | 'none') {
    const next = { ...lines }
    for (const b of checked) {
      const l = lineOf(b)
      const price = Number(l.price || 0)
      next[b.id] = { ...l, paid: String(mode === 'full' ? price : mode === 'half' ? Math.round(price / 2) : 0) }
    }
    setLines(next)
  }

  const totals = checked.reduce(
    (acc, b) => {
      const l = lineOf(b)
      const price = Number(l.price || 0)
      const paid = Math.min(price, Number(l.paid || 0))
      acc.price += price
      acc.paid += paid
      acc.remaining += Math.max(0, price - paid)
      return acc
    },
    { price: 0, paid: 0, remaining: 0 },
  )

  const save = useAction(api.saveMultipleBookletOrders, {
    success: (r) =>
      r.totalRemaining > 0
        ? `تم حجز ${r.created} مذكرة ✓ ومتبقي على الطالب ${fmtMoney(r.totalRemaining)}`
        : `تم حجز ${r.created} مذكرة ✓ ومسددة بالكامل`,
    invalidate: [['booklet_orders'], ['dashboard'], ['payments'], ['students']],
    onDone: () => onOpenChange(false),
  })

  function submit() {
    if (!studentId) return toast.error('يرجى اختيار الطالب أولاً')
    if (checked.length === 0) return toast.error('اختر مذكرة واحدة على الأقل')
    save.mutate({
      studentId,
      items: checked.map((b) => {
        const l = lineOf(b)
        return { bookletId: b.id, price: Number(l.price || 0), paid: Number(l.paid || 0) }
      }),
      paymentMethod,
      isDelivered,
      notes: notes.trim() || null,
    })
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="حجز مذكرة أو أكثر للطالب" size="lg">
      <div className="space-y-4">
        {/* 1. الصف */}
        <Field label="الصف الدراسي" required>
          <Select
            value={yearId}
            onChange={(e) => {
              setYearId(e.target.value)
              setStudentId('')
              setLines({})
            }}
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </Select>
        </Field>

        {/* 2. الطالب من طلاب هذا الصف فقط */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-ink">الطالب</label>
            <span className="text-[11px] font-semibold text-[var(--brand)]">
              طلاب {yearName(yearId)} ({gradeStudents.length} طالب)
            </span>
          </div>

          {selectedStudent ? (
            <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-surface-2 p-2.5">
              <div className="flex items-center gap-2.5">
                <div className="grid size-8 place-items-center rounded-full bg-[var(--brand)]/10 text-[var(--brand)]">
                  <User className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-ink">{selectedStudent.full_name}</p>
                  <p className="text-xs text-muted">
                    {yearName(selectedStudent.year_id)} • {selectedStudent.specialization || 'عام'}
                  </p>
                </div>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setStudentId('')}>
                تغيير الطالب
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                placeholder={`ابحث باسم أي طالب أو كوده (طلاب ${yearName(yearId) || 'الصف'} يظهروا الأول)…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
              />
              <div className="max-h-44 divide-y divide-[var(--border)] overflow-y-auto rounded-xl border border-[var(--border)] bg-surface">
                {filteredStudents.length === 0 ? (
                  <p className="p-3 text-center text-xs text-muted">
                    {search ? 'لا يوجد طالب بهذا الاسم' : 'لا يوجد طلاب مسجلون في هذا الصف'}
                  </p>
                ) : (
                  filteredStudents.map((s) => {
                    const count = orders.filter((o) => o.student_id === s.id).length
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => pickStudent(s)}
                        className="tap flex w-full items-center justify-between p-2.5 text-right hover:bg-surface-2"
                      >
                        <div>
                          <span className="block text-xs font-bold text-ink">{s.full_name}</span>
                          <span className="text-[11px] text-muted">
                            {yearName(s.year_id) || 'بدون صف'} • {s.specialization || 'عام'}
                          </span>
                        </div>
                        {count > 0 && (
                          <Badge tone="info" className="text-[10px]">
                            حاجز {count} مذكرة
                          </Badge>
                        )}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* 3. مذكرات الصف (اختيار واحدة أو أكثر) */}
        {selectedStudent && (
          <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-surface-2 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5">
              <div className="flex items-center gap-1.5">
                <BookText className="size-4 text-[var(--brand)]" />
                <span className="text-xs font-bold text-ink">
                  مذكرات {yearName(yearId)} — اختر مذكرة أو أكثر
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-bold">
                <button type="button" onClick={selectAll} disabled={available.length === 0} className="tap text-[var(--brand)] hover:underline">
                  تحديد الكل ({available.length})
                </button>
                <span className="text-muted">•</span>
                <button type="button" onClick={clearAll} className="tap text-muted hover:text-ink">
                  إلغاء التحديد
                </button>
              </div>
            </div>

            {yearBooklets.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted">
                لا توجد مذكرات لهذا الصف بعد. أضفها من «إدارة المذكرات».
              </p>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {yearBooklets.map((b) => {
                  const booked = bookedMap.get(b.id)
                  const l = lineOf(b)
                  const remaining = Math.max(0, Number(l.price || 0) - Number(l.paid || 0))
                  if (booked) {
                    return (
                      <div key={b.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-surface/60 p-2.5 opacity-70">
                        <div className="flex items-center gap-2">
                          <CheckSquare className="size-4 text-muted" />
                          <span className="text-xs font-bold text-ink">{b.title}</span>
                          <span className="text-[10px] text-muted">{b.term}</span>
                        </div>
                        <Badge tone={booked.remaining_amount > 0 ? 'warning' : 'success'} className="text-[10px]">
                          محجوزة مسبقاً{booked.remaining_amount > 0 ? ` • متبقي ${fmtMoney(booked.remaining_amount)}` : ' • مسددة'}
                        </Badge>
                      </div>
                    )
                  }
                  return (
                    <div
                      key={b.id}
                      className={`rounded-xl border p-2.5 transition-all ${
                        l.checked ? 'border-[var(--brand)] bg-surface shadow-sm' : 'border-[var(--border)] bg-surface/60'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setLine(b, { checked: !l.checked })}
                        className="tap flex w-full items-center justify-between text-right"
                      >
                        <div className="flex items-center gap-2">
                          {l.checked ? (
                            <CheckSquare className="size-4 shrink-0 text-[var(--brand)]" />
                          ) : (
                            <Square className="size-4 shrink-0 text-muted" />
                          )}
                          <span className="text-xs font-bold text-ink">{b.title}</span>
                          <span className="text-[10px] text-muted">{b.term}</span>
                        </div>
                        <span className="font-mono text-xs font-extrabold text-[var(--brand)]">{fmtMoney(b.price)}</span>
                      </button>

                      {l.checked && (
                        <div className="mt-2 grid grid-cols-3 items-end gap-2 border-t border-[var(--border)]/60 pt-2">
                          <label className="text-[10px] text-muted">
                            السعر
                            <Input
                              type="number"
                              min="0"
                              value={l.price}
                              onChange={(e) => setLine(b, { price: e.target.value })}
                              className="mt-0.5 h-8 text-xs"
                            />
                          </label>
                          <label className="text-[10px] text-muted">
                            المدفوع
                            <Input
                              type="number"
                              min="0"
                              value={l.paid}
                              onChange={(e) => setLine(b, { paid: e.target.value })}
                              className="mt-0.5 h-8 text-xs"
                            />
                          </label>
                          <div className="pb-1.5 text-[11px] font-bold">
                            {remaining > 0 ? (
                              <span className="text-amber-600">متبقي {fmtMoney(remaining)}</span>
                            ) : (
                              <span className="text-emerald-600">مسدد ✓</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {checked.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setPaidForAll('full')} className="tap rounded-lg bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-600">
                  دفع كامل للكل
                </button>
                <button type="button" onClick={() => setPaidForAll('half')} className="tap rounded-lg bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold text-amber-600">
                  نصف المبلغ للكل
                </button>
                <button type="button" onClick={() => setPaidForAll('none')} className="tap rounded-lg bg-surface px-2.5 py-1 text-[11px] font-bold text-muted">
                  لم يدفع (الكل دين)
                </button>
              </div>
            )}
          </div>
        )}

        {/* ملخص */}
        {checked.length > 0 && (
          <div className="space-y-1 rounded-xl border border-[var(--border)] bg-surface-2 p-3 text-xs">
            <div className="flex justify-between font-semibold">
              <span>عدد المذكرات: {checked.length}</span>
              <span className="font-mono">الإجمالي {fmtMoney(totals.price)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-emerald-600">المدفوع الآن</span>
              <span className="font-mono font-bold text-emerald-600">{fmtMoney(totals.paid)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-amber-600">المتبقي (دين على الطالب)</span>
              <span className="font-mono font-bold text-amber-600">{fmtMoney(totals.remaining)}</span>
            </div>
          </div>
        )}

        {/* طريقة الدفع */}
        {checked.length > 0 && (
          <Field label="طريقة الدفع">
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['cash', 'كاش', Banknote],
                  ['wallet', 'محفظة', Smartphone],
                  ['instapay', 'انستاباي', Wallet],
                ] as const
              ).map(([v, label, Icon]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPaymentMethod(v)}
                  className={`tap flex flex-col items-center rounded-xl border p-2 text-xs font-bold ${
                    paymentMethod === v
                      ? 'border-[var(--brand)] bg-brand-soft text-[var(--brand)]'
                      : 'border-[var(--border)] bg-surface text-ink-2'
                  }`}
                >
                  <Icon className="mb-1 size-4" />
                  {label}
                </button>
              ))}
            </div>
          </Field>
        )}

        {checked.length > 0 && (
          <label className="tap flex cursor-pointer items-center gap-2.5 rounded-xl border border-[var(--border)] bg-surface p-3">
            <input
              type="checkbox"
              checked={isDelivered}
              onChange={(e) => setIsDelivered(e.target.checked)}
              className="size-4 rounded accent-[var(--brand)]"
            />
            <span className="text-xs font-bold text-ink">تم تسليم المذكرات للطالب الآن</span>
          </label>
        )}

        {checked.length > 0 && (
          <Field label="ملاحظات">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="اختياري…" />
          </Field>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button type="button" loading={save.isPending} disabled={!studentId || checked.length === 0} onClick={submit}>
            حفظ الحجز ({checked.length} مذكرة)
          </Button>
        </div>
      </div>
    </Modal>
  )
}
