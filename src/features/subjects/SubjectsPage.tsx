import { useEffect, useMemo, useState } from 'react'
import { BookOpen, MoreVertical, Pencil, Plus, Trash2, Users, Sparkles, Settings2 } from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { SearchInput } from '@/components/common/SearchInput'
import {
  Badge, Button, Card, Dropdown, DropdownContent, DropdownItem, DropdownTrigger,
  EmptyState, Field, Input, ListSkeleton, Modal, Select, Switch, Textarea, useConfirm,
} from '@/components/ui'
import { useAction, useLookups, useStudentSubjects, useSubjects } from '@/lib/hooks'
import * as api from '@/lib/api'
import type { Subject } from '@/lib/database.types'
import { matches } from '@/lib/utils'
import { fmtMoney } from '@/lib/format'
import { useSettings } from '@/store/settings'
import { EnrollSubjectsModal } from '@/features/students/EnrollSubjectsModal'

export default function SubjectsPage() {
  const { data: subjects = [], isLoading } = useSubjects()
  const { years, yearName } = useLookups()
  const { data: allEnroll = [] } = useStudentSubjects()
  const { settings, updateSettings } = useSettings()
  const confirm = useConfirm()

  const [q, setQ] = useState('')
  const [year, setYear] = useState('')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Subject | null>(null)
  const [bundlesModalOpen, setBundlesModalOpen] = useState(false)
  const [enrollModalOpen, setEnrollModalOpen] = useState(false)
  const [enrollYearId, setEnrollYearId] = useState<string | undefined>()

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of allEnroll) if (e.is_active) m.set(e.subject_id, (m.get(e.subject_id) ?? 0) + 1)
    return m
  }, [allEnroll])

  const filtered = useMemo(
    () => subjects.filter((s) => (!year || s.year_id === year) && matches(s.name, q)),
    [subjects, year, q],
  )

  const remove = useAction(api.deleteSubject, {
    success: 'تم حذف المادة',
    invalidate: [['subjects'], ['student_subjects'], ['charges'], ['dashboard']],
  })

  const grouped = useMemo(() => {
    const m = new Map<string, Subject[]>()
    for (const s of filtered) {
      const k = s.year_id
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(s)
    }
    return [...m.entries()]
  }, [filtered])

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="المواد الدراسية وحزم الأسعار"
        icon={BookOpen}
        subtitle={`${subjects.length} مادة — تحديد أسعار المواد وحزم الخصومات الشهرية`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setEnrollYearId(year || undefined); setEnrollModalOpen(true) }}>
              <BookOpen className="size-4" /> حجز مواد لطالب
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setBundlesModalOpen(true)}>
              <Sparkles className="size-4" /> أسعار الحزم والخصومات
            </Button>
            <Button size="sm" onClick={() => { setEditing(null); setOpen(true) }} disabled={years.length === 0}>
              <Plus className="size-4" /> مادة جديدة
            </Button>
          </div>
        }
      />

      {/* بطاقة عرض حزم الأسعار الحالية */}
      <Card className="p-4 border-[var(--brand)]/20 bg-brand-soft/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-[var(--brand)]" />
              <h3 className="text-sm font-bold text-ink">نظام حزم الأسعار الشهرية والخصم</h3>
            </div>
            <p className="mt-1 text-xs text-muted">
              حساب الخصم التلقائي للطالب عند اشتراكه في أكثر من مادة (الصف الأول: مادتان / الصف الثاني: 4 مواد).
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setBundlesModalOpen(true)}>
            <Settings2 className="size-3.5" /> تعديل خطط الأسعار
          </Button>
        </div>

        {/* ملخص الحزم المسجلة */}
        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {years.map((y) => {
            const b = settings.pricing_bundles?.[y.id]
            const ySubs = subjects.filter((s) => s.year_id === y.id)
            return (
              <div key={y.id} className="rounded-xl border border-[var(--border)] bg-surface p-3">
                <p className="text-xs font-bold text-ink">{y.name} ({ySubs.length} مواد مسجلة)</p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  {b ? (
                    Object.entries(b).map(([cnt, prc]) => (
                      <span key={cnt} className="rounded-lg bg-surface-2 px-2 py-1 font-mono text-[11px] text-ink">
                        {cnt} مواد = <strong className="text-[var(--brand)]">{fmtMoney(Number(prc))}</strong>
                      </span>
                    ))
                  ) : (
                    <span className="text-[11px] text-muted">لم يتم تخصيص حزم أسعار بعد</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row">
        <SearchInput value={q} onChange={setQ} className="flex-1" placeholder="ابحث عن مادة…" />
        <Select value={year} onChange={(e) => setYear(e.target.value)} className="w-full sm:w-44 shrink-0">
          <option value="">كل الصفوف الدراسية</option>
          {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
        </Select>
      </div>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : years.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title="أضف سنة دراسية أولًا"
            description="المواد تُربط بسنة دراسية — ابدأ بإنشاء السنوات من صفحة المجموعات والسنوات."
            action={<Button size="sm" asChild><a href="/groups">السنوات والمجموعات</a></Button>}
          />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookOpen}
            title={subjects.length === 0 ? 'لا توجد مواد مسجلة' : 'لا توجد نتائج'}
            description={subjects.length === 0 ? 'أضف المواد التي تدرسها لكل صف دراسي.' : 'جرّب كلمة بحث أخرى.'}
            action={subjects.length === 0 ? <Button onClick={() => { setEditing(null); setOpen(true) }}><Plus className="size-4" /> إضافة مادة</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped.map(([yid, list]) => (
            <div key={yid}>
              <h2 className="mb-2 flex items-center gap-2 text-[13px] font-bold text-ink-2">
                {yearName.get(yid) ?? 'بدون صف'}
                <span className="text-muted font-normal">({list.length} مواد)</span>
              </h2>

              <div className="grid gap-2.5 sm:grid-cols-2">
                {list.map((s) => {
                  const studentCount = counts.get(s.id) ?? 0
                  return (
                    <Card key={s.id} className="p-3.5 transition-all hover:border-[var(--brand)]/40">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="size-3.5 shrink-0 rounded-full" style={{ background: s.color ?? 'var(--brand)' }} />
                          <div>
                            <h3 className="text-sm font-bold text-ink">{s.name}</h3>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                              <span className="font-mono font-bold text-ink">{fmtMoney(s.price)}</span>
                              <span>•</span>
                              <span>الشهر = {s.sessions_per_cycle} حصص</span>
                              <span>•</span>
                              <span className="flex items-center gap-1 font-semibold text-emerald-600">
                                <Users className="size-3" /> {studentCount} مشترك
                              </span>
                            </div>
                          </div>
                        </div>

                        <Dropdown>
                          <DropdownTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="size-4" />
                            </Button>
                          </DropdownTrigger>
                          <DropdownContent align="end">
                            <DropdownItem onClick={() => { setEnrollYearId(s.year_id); setEnrollModalOpen(true) }}>
                              <BookOpen className="size-4" /> حجز طلاب في هذه المادة
                            </DropdownItem>
                            <DropdownItem onClick={() => { setEditing(s); setOpen(true) }}>
                              <Pencil className="size-4" /> تعديل المادة
                            </DropdownItem>
                            <DropdownItem
                              danger
                              onClick={async () => {
                                const ok = await confirm({
                                  requirePassword: true,
                                  title: 'حذف المادة',
                                  message: `حذف «${s.name}»؟`,
                                  confirmText: 'نعم، احذف',
                                  destructive: true,
                                })
                                if (ok) remove.mutate(s.id)
                              }}
                            >
                              <Trash2 className="size-4" /> حذف المادة
                            </DropdownItem>
                          </DropdownContent>
                        </Dropdown>
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* مودال حجز وتسجيل المواد */}
      <EnrollSubjectsModal
        open={enrollModalOpen}
        onOpenChange={setEnrollModalOpen}
        initialYearId={enrollYearId}
      />

      {/* مودال إنشاء أو تعديل مادة */}
      <SubjectFormDialog
        open={open}
        onOpenChange={setOpen}
        subject={editing}
        years={years}
      />

      {/* مودال تخصيص حزم الأسعار والخصومات */}
      <PricingBundlesDialog
        open={bundlesModalOpen}
        onOpenChange={setBundlesModalOpen}
        years={years}
        subjects={subjects}
        settings={settings}
        onSave={async (updated) => {
          await updateSettings({ pricing_bundles: updated })
        }}
      />
    </div>
  )
}

function SubjectFormDialog({
  open,
  onOpenChange,
  subject,
  years,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  subject: Subject | null
  years: any[]
}) {
  const [name, setName] = useState('')
  const [yearId, setYearId] = useState('')
  const [price, setPrice] = useState('150')
  const [sessionsPerCycle, setSessionsPerCycle] = useState('4')
  const [color, setColor] = useState('#2563eb')

  useEffect(() => {
    if (open) {
      if (subject) {
        setName(subject.name)
        setYearId(subject.year_id)
        setPrice(String(subject.price))
        setSessionsPerCycle(String(subject.sessions_per_cycle))
        setColor(subject.color || '#2563eb')
      } else {
        setName('')
        setYearId(years[0]?.id || '')
        setPrice('150')
        setSessionsPerCycle('4')
        setColor('#2563eb')
      }
    }
  }, [open, subject, years])

  const saveAction = useAction(api.saveSubject, {
    success: subject ? 'تم تعديل المادة' : 'تم إضافة المادة',
    invalidate: [['subjects'], ['dashboard']],
    onDone: () => onOpenChange(false),
  })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await saveAction.mutateAsync({
      ...(subject ? { id: subject.id } : {}),
      name: name.trim(),
      year_id: yearId,
      price: Number(price || 0),
      sessions_per_cycle: Number(sessionsPerCycle || 4),
      color,
    })
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={subject ? 'تعديل مادة' : 'إضافة مادة دراسية جديدة'}>
      <form onSubmit={submit} className="space-y-3.5">
        <Field label="اسم المادة" required>
          <Input placeholder="مثال: الرياضيات، الفيزياء، كيمياء..." value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </Field>
        <Field label="الصف الدراسي" required>
          <Select value={yearId} onChange={(e) => setYearId(e.target.value)}>
            {years.map((y) => (
              <option key={y.id} value={y.id}>{y.name}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="السعر الفردي الشهري (ج.م)" required>
            <Input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required />
          </Field>
          <Field label="حصص الدورة الشهرية" required>
            <Input type="number" min="1" value={sessionsPerCycle} onChange={(e) => setSessionsPerCycle(e.target.value)} required />
          </Field>
        </div>
        <Field label="لون التمييز">
          <div className="flex gap-2">
            {['#2563eb', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444'].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`size-7 rounded-full border-2 transition-all ${color === c ? 'border-ink scale-110' : 'border-transparent'}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button type="submit" loading={saveAction.isPending}>حفظ المادة</Button>
        </div>
      </form>
    </Modal>
  )
}

function PricingBundlesDialog({
  open,
  onOpenChange,
  years,
  subjects,
  settings,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  years: any[]
  subjects: Subject[]
  settings: any
  onSave: (updated: Record<string, Record<number, number>>) => Promise<void>
}) {
  const [bundles, setBundles] = useState<Record<string, Record<number, number>>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setBundles(settings.pricing_bundles || {})
    }
  }, [open, settings])

  function handlePriceChange(yearId: string, count: number, value: string) {
    const num = Number(value || 0)
    setBundles((prev) => ({
      ...prev,
      [yearId]: {
        ...(prev[yearId] || {}),
        [count]: num,
      },
    }))
  }

  async function handleSave() {
    setBusy(true)
    try {
      await onSave(bundles)
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="تخصيص حزم الأسعار والخصومات الشهرية" className="max-w-lg">
      <div className="space-y-4">
        <p className="text-xs text-muted leading-relaxed">
          حدد تكلفة الشهر للطلاب حسب عدد المواد التي يدرسونها معك. لو أخذ الطالب أكثر من مادة يُطبق الخصم تلقائياً عند تسجيله.
        </p>

        <div className="space-y-4">
          {years.map((y) => {
            const ySubs = subjects.filter((s) => s.year_id === y.id)
            const maxCount = Math.max(ySubs.length, 2)
            const currentYearBundles = bundles[y.id] || {}

            return (
              <div key={y.id} className="rounded-2xl border border-[var(--border)] bg-surface-2 p-3.5 space-y-3">
                <h4 className="text-xs font-bold text-ink">{y.name} (عدد المواد: {ySubs.length})</h4>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-2">
                  {Array.from({ length: maxCount }, (_, i) => i + 1).map((cnt) => {
                    const val = currentYearBundles[cnt] !== undefined ? currentYearBundles[cnt] : ''
                    return (
                      <div key={cnt} className="rounded-xl border border-[var(--border)] bg-surface p-2.5">
                        <label className="text-[11px] font-bold text-ink block mb-1">
                          سعر {cnt} {cnt === 1 ? 'مادة' : cnt === 2 ? 'مادتين' : 'مواد'}
                        </label>
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            min="0"
                            placeholder="مثال: 150"
                            value={val}
                            onChange={(e) => handlePriceChange(y.id, cnt, e.target.value)}
                            className="h-8 text-center font-mono font-bold text-xs"
                          />
                          <span className="text-[11px] text-muted">ج.م/شهر</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button type="button" loading={busy} onClick={handleSave}>حفظ حزم الأسعار</Button>
        </div>
      </div>
    </Modal>
  )
}
