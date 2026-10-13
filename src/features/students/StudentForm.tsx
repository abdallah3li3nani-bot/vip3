import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { BookOpen, Sparkles } from 'lucide-react'
import { Button, Field, Input, Modal, Select, Textarea, Badge } from '@/components/ui'
import { useAction, useLookups, useStudentSubjects } from '@/lib/hooks'
import * as api from '@/lib/api'
import type { Student } from '@/lib/database.types'
import { fmtMoney, todayISO } from '@/lib/format'
import { useSettings } from '@/store/settings'

export function StudentForm({
  open,
  onOpenChange,
  student,
  defaultYearId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  student?: Student | null
  defaultYearId?: string
}) {
  const { years, groups, subjects } = useLookups()
  const { settings } = useSettings()
  const { data: existing = [] } = useStudentSubjects(student?.id)

  const [form, setForm] = useState({
    full_name: '',
    year_id: defaultYearId || years[0]?.id || '',
    group_id: '',
    specialization: 'عام',
    status: 'active' as 'active' | 'inactive',
    enrolled_at: todayISO(),
    notes: '',
  })

  const [picked, setPicked] = useState<Record<string, { on: boolean; price: string }>>({})

  useEffect(() => {
    if (!open) return
    if (student) {
      setForm({
        full_name: student.full_name,
        year_id: student.year_id || defaultYearId || years[0]?.id || '',
        group_id: student.group_id || '',
        specialization: student.specialization || 'عام',
        status: student.status,
        enrolled_at: student.enrolled_at,
        notes: student.notes || '',
      })
    } else {
      setForm({
        full_name: '',
        year_id: defaultYearId || years[0]?.id || '',
        group_id: '',
        specialization: 'عام',
        status: 'active',
        enrolled_at: todayISO(),
        notes: '',
      })
      setPicked({})
    }
  }, [open, student, years, defaultYearId])

  useEffect(() => {
    if (!open || !student) return
    const m: Record<string, { on: boolean; price: string }> = {}
    for (const ss of existing) {
      m[ss.subject_id] = {
        on: ss.is_active,
        price: ss.price_override != null ? String(ss.price_override) : '',
      }
    }
    setPicked(m)
  }, [open, student, existing])

  const yearGroups = useMemo(() => groups.filter((g) => g.year_id === form.year_id), [groups, form.year_id])
  const yearSubjects = useMemo(() => subjects.filter((s) => s.year_id === form.year_id && s.is_active), [subjects, form.year_id])

  // عدد المواد المختارة
  const selectedSubjectsCount = useMemo(() => {
    return yearSubjects.filter((s) => picked[s.id]?.on).length
  }, [yearSubjects, picked])

  // استخراج سعر الباقة من الإعدادات إن وجد
  const bundleConfig = useMemo(() => {
    const bundles = settings.pricing_bundles?.[form.year_id]
    if (!bundles) return null
    return bundles[selectedSubjectsCount] || null
  }, [settings.pricing_bundles, form.year_id, selectedSubjectsCount])

  // حساب المجموع العادي للمواد
  const originalTotal = useMemo(() => {
    return yearSubjects.reduce((acc, s) => {
      const p = picked[s.id]
      if (!p?.on) return acc
      return acc + Number(s.price)
    }, 0)
  }, [yearSubjects, picked])

  // حساب المجموع النهائي مع التعديلات
  const currentTotal = useMemo(() => {
    if (selectedSubjectsCount === 0) return 0
    // لو المعلم مدخل أسعار مخصصة
    let hasCustomPrice = false
    let sum = 0
    for (const s of yearSubjects) {
      const p = picked[s.id]
      if (p?.on) {
        if (p.price !== '') {
          hasCustomPrice = true
          sum += Number(p.price)
        } else {
          sum += Number(s.price)
        }
      }
    }
    if (hasCustomPrice) return sum
    if (bundleConfig != null) return bundleConfig
    return originalTotal
  }, [yearSubjects, picked, selectedSubjectsCount, bundleConfig, originalTotal])

  // تطبيق سعر الباقة تلقائياً
  function applyBundleDiscount() {
    if (!bundleConfig || selectedSubjectsCount === 0) return
    const perSubject = Math.round(bundleConfig / selectedSubjectsCount)
    const updated: Record<string, { on: boolean; price: string }> = { ...picked }
    let allocated = 0
    const activeSubs = yearSubjects.filter((s) => picked[s.id]?.on)

    activeSubs.forEach((s, idx) => {
      if (idx === activeSubs.length - 1) {
        // آخر مادة تأخذ الفرق لضبط الإجمالي تماماً
        updated[s.id] = { on: true, price: String(bundleConfig - allocated) }
      } else {
        updated[s.id] = { on: true, price: String(perSubject) }
        allocated += perSubject
      }
    })
    setPicked(updated)
    toast.success(`تم تطبيق سعر الباقة: ${fmtMoney(bundleConfig)}`)
  }

  const save = useAction(
    async () => {
      if (!form.full_name.trim()) throw new Error('اسم الطالب مطلوب')
      const isEnrolledNow = selectedSubjectsCount > 0

      const saved = await api.saveStudent({
        ...(student ? { id: student.id } : {}),
        full_name: form.full_name.trim(),
        year_id: form.year_id || null,
        group_id: form.group_id || null,
        specialization: form.specialization.trim() || 'عام',
        is_enrolled: isEnrolledNow,
        status: form.status,
        enrolled_at: form.enrolled_at,
        notes: form.notes.trim() || null,
      } as Partial<Student>)

      // مزامنة المواد
      const currentMap = new Map(existing.map((e) => [e.subject_id, e]))
      for (const s of yearSubjects) {
        const p = picked[s.id]
        const cur = currentMap.get(s.id)
        if (p?.on) {
          // حساب السعر النهائي المحفوظ
          let finalPriceOverride: number | null = null
          if (p.price !== '') {
            finalPriceOverride = Number(p.price)
          } else if (bundleConfig != null && selectedSubjectsCount > 1) {
            finalPriceOverride = Math.round(bundleConfig / selectedSubjectsCount)
          }

          await api.saveStudentSubject({
            ...(cur ? { id: cur.id } : {}),
            student_id: saved.id,
            subject_id: s.id,
            is_active: true,
            price_override: finalPriceOverride,
          })
        } else if (cur) {
          await api.removeStudentSubject(cur.id)
        }
      }
      return saved
    },
    {
      success: student ? 'تم تحديث بيانات الطالب' : 'تم إضافة الطالب بنجاح',
      invalidate: [['students'], ['student_subjects'], ['charges'], ['dashboard']],
      onDone: () => onOpenChange(false),
    },
  )

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={student ? 'تعديل بيانات الطالب والمواد' : 'إضافة طالب جديد'}
      className="max-w-lg"
    >
      <form onSubmit={(e) => { e.preventDefault(); save.mutate() }} className="space-y-4">
        <Field label="اسم الطالب الرباعي" required>
          <Input
            placeholder="مثال: أحمد محمد علي حسن"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            required
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="الصف الدراسي" required>
            <Select value={form.year_id} onChange={(e) => setForm({ ...form, year_id: e.target.value })}>
              {years.map((y) => (
                <option key={y.id} value={y.id}>{y.name}</option>
              ))}
            </Select>
          </Field>

          <Field label="التخصص">
            <Select value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })}>
              <option value="عام">عام</option>
              <option value="علمي">علمي</option>
              <option value="أدبي">أدبي</option>
              <option value="علمي علوم">علمي علوم</option>
              <option value="علمي رياضة">علمي رياضة</option>
              <option value="فندقي">فندقي</option>
              <option value="تجاري">تجاري</option>
              <option value="صناعي">صناعي</option>
              <option value="زراعي">زراعي</option>
            </Select>
          </Field>
        </div>

        {yearGroups.length > 0 && (
          <Field label="المجموعة (اختياري)">
            <Select value={form.group_id} onChange={(e) => setForm({ ...form, group_id: e.target.value })}>
              <option value="">بدون مجموعة محددة</option>
              {yearGroups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </Select>
          </Field>
        )}

        {/* ================= تسجيل المواد وحساب الباقة ================= */}
        <div className="rounded-2xl border border-[var(--border)] bg-surface-2 p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <BookOpen className="size-4 text-[var(--brand)]" />
              <span className="text-xs font-bold text-ink">تسجيل المواد الدراسية للطالب</span>
            </div>
            <span className="text-[11px] text-muted">
              محدد: <span className="font-bold text-ink">{selectedSubjectsCount}</span> من {yearSubjects.length} مواد
            </span>
          </div>

          {/* تنبيه سعر الباقة والخصم التلقائي */}
          {bundleConfig != null && selectedSubjectsCount > 1 && (
            <div className="flex items-center justify-between rounded-xl bg-[var(--brand)]/10 p-2.5 text-xs text-[var(--brand)]">
              <div className="flex items-center gap-1.5 font-bold">
                <Sparkles className="size-4" />
                <span>عرض باقة {selectedSubjectsCount} مواد: {fmtMoney(bundleConfig)}</span>
                {originalTotal > bundleConfig && (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                    (توفير {fmtMoney(originalTotal - bundleConfig)})
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={applyBundleDiscount}
                className="tap rounded-lg bg-[var(--brand)] px-2 py-1 text-[11px] font-bold text-white hover:opacity-90"
              >
                تطبيق الخصم
              </button>
            </div>
          )}

          {yearSubjects.length === 0 ? (
            <p className="text-center text-xs text-muted py-2">لا توجد مواد مسجلة لهذا الصف بعد</p>
          ) : (
            <div className="space-y-2">
              {yearSubjects.map((s) => {
                const currentPick = picked[s.id] || { on: false, price: '' }
                return (
                  <div
                    key={s.id}
                    className={`flex items-center justify-between rounded-xl border p-2.5 transition-all ${
                      currentPick.on
                        ? 'border-[var(--brand)]/50 bg-surface'
                        : 'border-[var(--border)] bg-surface/50 opacity-75'
                    }`}
                  >
                    <label className="flex items-center gap-2.5 cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        checked={currentPick.on}
                        onChange={(e) => {
                          setPicked({
                            ...picked,
                            [s.id]: { on: e.target.checked, price: currentPick.price },
                          })
                        }}
                        className="size-4 rounded accent-[var(--brand)]"
                      />
                      <span className="text-xs font-bold text-ink">{s.name}</span>
                      <span className="text-[11px] text-muted">({fmtMoney(s.price)}/شهر)</span>
                    </label>

                    {currentPick.on && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-muted">السعر:</span>
                        <input
                          type="number"
                          placeholder={String(s.price)}
                          value={currentPick.price}
                          onChange={(e) => {
                            setPicked({
                              ...picked,
                              [s.id]: { on: true, price: e.target.value },
                            })
                          }}
                          className="h-7 w-20 rounded-lg border border-[var(--border)] bg-surface px-2 text-center text-xs font-mono font-bold text-ink"
                        />
                        <span className="text-[10px] text-muted">ج.م</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {selectedSubjectsCount > 0 && (
            <div className="flex items-center justify-between border-t border-[var(--border)] pt-2.5 text-xs font-bold">
              <span className="text-ink">إجمالي الاشتراك الشهري:</span>
              <span className="font-mono text-sm text-[var(--brand)]">
                {fmtMoney(currentTotal)} / شهر
              </span>
            </div>
          )}
        </div>

        <Field label="ملاحظات">
          <Textarea
            rows={2}
            placeholder="أي ملاحظات حول الطالب…"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button type="submit" loading={save.isPending}>
            {student ? 'حفظ التعديلات' : 'إضافة الطالب'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
