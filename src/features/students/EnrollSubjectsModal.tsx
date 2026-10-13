import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { BookOpen, Sparkles, CheckSquare, Square, Search, User, Check, X } from 'lucide-react'
import { Button, Field, Input, Modal, Select, Badge } from '@/components/ui'
import { useAction, useLookups, useStudentSubjects, useStudents } from '@/lib/hooks'
import * as api from '@/lib/api'
import { fmtMoney } from '@/lib/format'
import { matches } from '@/lib/utils'
import { useSettings } from '@/store/settings'
import type { Student, Subject } from '@/lib/database.types'

export function EnrollSubjectsModal({
  open,
  onOpenChange,
  studentId: initialStudentId,
  initialYearId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  studentId?: string
  initialYearId?: string
}) {
  const { years, yearName, subjects } = useLookups()
  const { data: students = [] } = useStudents()
  const { settings } = useSettings()

  const [selectedYearId, setSelectedYearId] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [studentSearch, setStudentSearch] = useState('')
  const [pickedSubjectIds, setPickedSubjectIds] = useState<Set<string>>(new Set())
  const [customPrices, setCustomPrices] = useState<Record<string, string>>({})

  // الاستعلام عن المواد المسجلة حالياً للطالب المختار
  const { data: enrollmentsData } = useStudentSubjects(selectedStudentId || undefined)

  // تهيئة الحالة عند فتح المودال
  useEffect(() => {
    if (!open) return

    if (initialStudentId) {
      const st = students.find((s) => s.id === initialStudentId)
      setSelectedStudentId(initialStudentId)
      if (st?.year_id) setSelectedYearId(st.year_id)
      else if (initialYearId) setSelectedYearId(initialYearId)
      else setSelectedYearId(years[0]?.id || '')
    } else {
      setSelectedStudentId('')
      setSelectedYearId(initialYearId || years[0]?.id || '')
      setPickedSubjectIds(new Set())
      setCustomPrices({})
      setStudentSearch('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialStudentId, initialYearId, students.length > 0, years.length > 0])

  // عند تغيير الطالب، تحميل مواده المسجلة مسبقاً
  useEffect(() => {
    if (!open || !selectedStudentId || !enrollmentsData) return
    const currentEnrollments = enrollmentsData.filter((e) => e.student_id === selectedStudentId)
    const set = new Set<string>()
    const prices: Record<string, string> = {}
    for (const e of currentEnrollments) {
      if (e.is_active) {
        set.add(e.subject_id)
        if (e.price_override != null) {
          prices[e.subject_id] = String(e.price_override)
        }
      }
    }
    setPickedSubjectIds(set)
    setCustomPrices(prices)
  }, [open, selectedStudentId, enrollmentsData])

  // تحديث الصف عند اختيار طالب لم يكن محدداً
  function handleSelectStudent(st: Student) {
    setSelectedStudentId(st.id)
    if (st.year_id) setSelectedYearId(st.year_id)
    setStudentSearch('')
  }

  // قائمة طلاب الصف المحدد فقط (بحسب الصف الدراسي المختار)
  const gradeStudents = useMemo(() => {
    if (!selectedYearId) return students
    return students.filter((s) => s.year_id === selectedYearId)
  }, [students, selectedYearId])

  // تصفية طلاب الصف بالبحث
  const filteredGradeStudents = useMemo(() => {
    if (!studentSearch.trim()) return gradeStudents.slice(0, 30)
    return gradeStudents
      .filter((s) => matches(s.full_name, studentSearch) || matches(s.specialization || '', studentSearch))
      .slice(0, 30)
  }, [gradeStudents, studentSearch])

  // المواد الخاصة بالصف المحدد
  const yearSubjects = useMemo(() => {
    if (!selectedYearId) return []
    return subjects.filter((s) => s.year_id === selectedYearId && s.is_active)
  }, [subjects, selectedYearId])

  // عدد المواد المختارة
  const selectedCount = pickedSubjectIds.size

  // حزمة الخصم من الإعدادات لهذا الصف
  const bundleConfig = useMemo(() => {
    const bundles = settings.pricing_bundles?.[selectedYearId]
    if (!bundles) return null
    return bundles[selectedCount] || null
  }, [settings.pricing_bundles, selectedYearId, selectedCount])

  // السعر العادي الأصلي
  const originalTotal = useMemo(() => {
    return yearSubjects
      .filter((s) => pickedSubjectIds.has(s.id))
      .reduce((acc, s) => acc + Number(s.price || 0), 0)
  }, [yearSubjects, pickedSubjectIds])

  // السعر الإجمالي الحالي (مع مراعاة الأسعار المخصصة أو الباقة)
  const currentTotal = useMemo(() => {
    if (selectedCount === 0) return 0
    let hasCustom = false
    let sum = 0
    for (const s of yearSubjects) {
      if (pickedSubjectIds.has(s.id)) {
        if (customPrices[s.id] !== undefined && customPrices[s.id] !== '') {
          hasCustom = true
          sum += Number(customPrices[s.id])
        } else {
          sum += Number(s.price || 0)
        }
      }
    }
    if (hasCustom) return sum
    if (bundleConfig != null) return bundleConfig
    return originalTotal
  }, [yearSubjects, pickedSubjectIds, customPrices, bundleConfig, originalTotal, selectedCount])

  // التبديل بين تحديد مادة وإلغائها
  function toggleSubject(id: string) {
    const next = new Set(pickedSubjectIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPickedSubjectIds(next)
  }

  // تحديد كل مواد الصف
  function selectAllSubjects() {
    setPickedSubjectIds(new Set(yearSubjects.map((s) => s.id)))
  }

  // إلغاء تحديد كل المواد
  function deselectAllSubjects() {
    setPickedSubjectIds(new Set())
    setCustomPrices({})
  }

  // تطبيق خصم الباقة تلقائياً بالتساوي على المواد
  function applyBundle() {
    if (!bundleConfig || selectedCount === 0) return
    const perSubject = Math.round(bundleConfig / selectedCount)
    const newPrices: Record<string, string> = {}
    let allocated = 0
    const active = yearSubjects.filter((s) => pickedSubjectIds.has(s.id))

    active.forEach((s, idx) => {
      if (idx === active.length - 1) {
        newPrices[s.id] = String(bundleConfig - allocated)
      } else {
        newPrices[s.id] = String(perSubject)
        allocated += perSubject
      }
    })
    setCustomPrices(newPrices)
    toast.success(`تم تطبيق سعر الباقة: ${fmtMoney(bundleConfig)}`)
  }

  const selectedStudent = students.find((s) => s.id === selectedStudentId)

  // طفرة حفظ الحجز للمواد
  const saveAction = useAction(
    async () => {
      if (!selectedStudentId) throw new Error('يرجى اختيار الطالب أولاً')

      const pricesRecord: Record<string, number | null> = {}
      for (const id of pickedSubjectIds) {
        if (customPrices[id] !== undefined && customPrices[id] !== '') {
          pricesRecord[id] = Number(customPrices[id])
        } else if (bundleConfig != null && selectedCount > 1) {
          pricesRecord[id] = Math.round(bundleConfig / selectedCount)
        } else {
          pricesRecord[id] = null
        }
      }

      return await api.enrollStudentInMultipleSubjects({
        studentId: selectedStudentId,
        subjectIds: Array.from(pickedSubjectIds),
        prices: pricesRecord,
      })
    },
    {
      success: 'تم حفظ تسجيل مواد الطالب وتحديث حالة اشتراكه بنجاح ✓',
      invalidate: [['student_subjects'], ['students'], ['charges'], ['dashboard']],
      onDone: () => onOpenChange(false),
    },
  )

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="حجز وتسجيل المواد والدروس للطالب"
      className="max-w-xl"
    >
      <div className="space-y-4">
        <p className="text-xs text-muted leading-relaxed">
          اختر الصف الدراسي ثم حدد الطالب، وستظهر لك مواد هذا الصف لتختار مادة أو أكثر مع تطبيق خصومات الباقات تلقائياً.
        </p>

        {/* 1. اختيار الصف الدراسي */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="الصف الدراسي" required>
            <Select
              value={selectedYearId}
              onChange={(e) => {
                setSelectedYearId(e.target.value)
                if (!initialStudentId) {
                  setSelectedStudentId('')
                  setPickedSubjectIds(new Set())
                  setCustomPrices({})
                }
              }}
              disabled={!!initialStudentId}
            >
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </Select>
          </Field>

          {/* تنبيه بعدد طلاب الصف */}
          <div className="flex flex-col justify-end">
            <div className="rounded-xl border border-[var(--border)] bg-surface-2 p-2.5 text-xs text-ink-2">
              <span>طلاب هذا الصف: </span>
              <strong className="text-ink font-bold font-mono">{gradeStudents.length} طالب</strong>
              {selectedYearId && (
                <span className="text-muted text-[11px] block mt-0.5">
                  ({yearSubjects.length} مواد مسجلة لهذا الصف)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 2. اختيار الطالب مع بحث مخصص لطلاب هذا الصف فقط */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-ink">
            الطالب المستهدف <span className="text-rose-500">*</span>
          </label>

          {selectedStudent ? (
            <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-surface-2 p-3">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-full bg-[var(--brand)]/10 text-[var(--brand)] font-bold text-xs">
                  <User className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-bold text-ink">{selectedStudent.full_name}</p>
                  <p className="text-xs text-muted">
                    {(selectedStudent.year_id && yearName.get(selectedStudent.year_id)) || 'بدون صف'} • {selectedStudent.specialization || 'عام'}
                    {selectedStudent.is_enrolled && (
                      <span className="text-emerald-600 font-semibold mr-1.5">• مشترك بالدروس</span>
                    )}
                  </p>
                </div>
              </div>

              {!initialStudentId && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedStudentId('')}>
                  تغيير الطالب
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                placeholder={`ابحث بالاسم في طلاب ${yearName.get(selectedYearId) || 'الصف'} (${gradeStudents.length} طالب)…`}
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                autoFocus
              />

              <div className="max-h-40 overflow-y-auto rounded-xl border border-[var(--border)] bg-surface divide-y divide-[var(--border)]">
                {filteredGradeStudents.length === 0 ? (
                  <p className="p-3 text-center text-xs text-muted">
                    {studentSearch ? 'لا يوجد طالب بهذا الاسم في هذا الصف' : 'لا يوجد طلاب مسجلون في هذا الصف'}
                  </p>
                ) : (
                  filteredGradeStudents.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => handleSelectStudent(st)}
                      className="tap flex w-full items-center justify-between p-2.5 text-right hover:bg-surface-2 transition-all"
                    >
                      <div>
                        <p className="text-xs font-bold text-ink">{st.full_name}</p>
                        <p className="text-[11px] text-muted">{st.specialization || 'عام'}</p>
                      </div>
                      <Badge variant={st.is_enrolled ? 'default' : 'secondary'} className="text-[10px]">
                        {st.is_enrolled ? 'مشترك بالدروس' : 'طالب مدرسة'}
                      </Badge>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* 3. اختيار المواد الخاصة بهذا الصف الدراسي (مادة أو أكثر) */}
        <div className="rounded-2xl border border-[var(--border)] bg-surface-2 p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-2.5">
            <div className="flex items-center gap-1.5">
              <BookOpen className="size-4 text-[var(--brand)]" />
              <span className="text-xs font-bold text-ink">
                مواد {yearName.get(selectedYearId) || 'الصف'} (اختر مادة أو أكثر)
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAllSubjects}
                className="tap text-[11px] font-bold text-[var(--brand)] hover:underline"
                disabled={yearSubjects.length === 0}
              >
                تحديد كل المواد ({yearSubjects.length})
              </button>
              <span className="text-muted">•</span>
              <button
                type="button"
                onClick={deselectAllSubjects}
                className="tap text-[11px] font-bold text-muted hover:text-ink"
                disabled={pickedSubjectIds.size === 0}
              >
                إلغاء التحديد
              </button>
            </div>
          </div>

          {/* تنبيه سعر الباقة والخصم */}
          {bundleConfig != null && selectedCount > 1 && (
            <div className="flex items-center justify-between rounded-xl bg-[var(--brand)]/10 p-2.5 text-xs text-[var(--brand)] border border-[var(--brand)]/20">
              <div className="flex items-center gap-1.5 font-bold">
                <Sparkles className="size-4" />
                <span>عرض باقة {selectedCount} مواد: {fmtMoney(bundleConfig)}</span>
                {originalTotal > bundleConfig && (
                  <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold">
                    (توفير {fmtMoney(originalTotal - bundleConfig)})
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={applyBundle}
                className="tap rounded-lg bg-[var(--brand)] px-2.5 py-1 text-[11px] font-bold text-white shadow-sm hover:opacity-90"
              >
                تطبيق الخصم
              </button>
            </div>
          )}

          {yearSubjects.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted">
              لا توجد مواد مضافة لهذا الصف بعد. يمكنك إضافة مواد من صفحة المواد الدراسية.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto">
              {yearSubjects.map((s) => {
                const isSelected = pickedSubjectIds.has(s.id)
                const customP = customPrices[s.id]

                return (
                  <div
                    key={s.id}
                    onClick={() => toggleSubject(s.id)}
                    className={`tap flex flex-col justify-between rounded-xl border p-3 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-[var(--brand)] bg-surface shadow-sm'
                        : 'border-[var(--border)] bg-surface/60 opacity-80 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isSelected ? (
                          <CheckSquare className="size-4 text-[var(--brand)] shrink-0" />
                        ) : (
                          <Square className="size-4 text-muted shrink-0" />
                        )}
                        <span className="size-2 rounded-full" style={{ background: s.color || 'var(--brand)' }} />
                        <span className="text-xs font-bold text-ink">{s.name}</span>
                      </div>

                      <span className="font-mono text-xs font-extrabold text-[var(--brand)]">
                        {fmtMoney(s.price)}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] text-muted pt-1.5 border-t border-[var(--border)]/60">
                      <span>{s.sessions_per_cycle} حصص/دورة</span>
                      {isSelected && (
                        <span className="text-emerald-600 font-bold">محدد للحجز ✓</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ملخص الحسبة الشهرية */}
        {selectedCount > 0 && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs space-y-1.5">
            <div className="flex justify-between font-bold text-ink">
              <span>المواد المختارة للطالب:</span>
              <span className="font-mono text-emerald-700 dark:text-emerald-300">
                {selectedCount} مواد
              </span>
            </div>
            <div className="flex justify-between text-muted">
              <span>المجموع العادي بدون خصم:</span>
              <span className="font-mono line-through">{fmtMoney(originalTotal)}</span>
            </div>
            <div className="flex justify-between font-extrabold text-sm text-emerald-700 dark:text-emerald-300 border-t border-emerald-500/20 pt-1">
              <span>الإجمالي الشهري المطلوب من الطالب:</span>
              <span className="font-mono">{fmtMoney(currentTotal)}</span>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button
            type="button"
            loading={saveAction.isPending}
            disabled={!selectedStudentId || selectedCount === 0}
            onClick={() => saveAction.mutate()}
          >
            حفظ حجز المواد ({selectedCount} مواد)
          </Button>
        </div>
      </div>
    </Modal>
  )
}
