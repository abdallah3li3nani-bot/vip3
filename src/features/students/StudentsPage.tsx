import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Download, Filter, GraduationCap, MoreVertical, Pencil, Plus, Trash2,
  FileSpreadsheet, Users, UserCheck, UserX, BookOpen, UploadCloud, CheckCircle2,
} from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { SearchInput } from '@/components/common/SearchInput'
import { Money } from '@/components/common/Money'
import {
  Badge, Button, Card, Dropdown, DropdownContent, DropdownItem, DropdownSeparator,
  DropdownTrigger, EmptyState, ListSkeleton, Select, Modal, Field, Input, useConfirm,
} from '@/components/ui'
import { StudentForm } from './StudentForm'
import { EnrollSubjectsModal } from './EnrollSubjectsModal'
import { useAction, useBalances, useLookups, useStudents, useStudentSubjects } from '@/lib/hooks'
import * as api from '@/lib/api'
import { exportCsv, matches } from '@/lib/utils'
import { fmtDate, fmtMoney } from '@/lib/format'
import { parseStudentsExcel, downloadExcelTemplate, type ParsedStudentRow } from '@/lib/excel'
import type { Student } from '@/lib/database.types'

type TabType = 'all' | 'enrolled' | 'school_only' | 'debt'

export default function StudentsPage() {
  const [params, setParams] = useSearchParams()
  const { data: students = [], isLoading } = useStudents()
  const { years, yearName, groups, groupName, subjects } = useLookups()
  const { balances } = useBalances()
  const { data: allEnrollments = [] } = useStudentSubjects()
  const confirm = useConfirm()

  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [q, setQ] = useState('')
  const [selectedYear, setSelectedYear] = useState('')
  const [selectedSpec, setSelectedSpec] = useState('')

  // نوافذ المودال
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Student | null>(null)
  const [excelModalOpen, setExcelModalOpen] = useState(false)
  const [enrollModalOpen, setEnrollModalOpen] = useState(false)
  const [enrollStudentId, setEnrollStudentId] = useState<string | undefined>()

  const subjectMap = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])

  // خريطة المواد المسجلة لكل طالب
  const studentSubjectsMap = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const e of allEnrollments) {
      if (e.is_active) {
        const cur = m.get(e.student_id) || []
        const subName = subjectMap.get(e.subject_id)?.name || ''
        if (subName) cur.push(subName)
        m.set(e.student_id, cur)
      }
    }
    return m
  }, [allEnrollments, subjectMap])

  // عدد الطلاب في كل صف (والطلاب بدون صف تحت المفتاح '')
  const yearCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of students) {
      const k = s.year_id && yearName.has(s.year_id) ? s.year_id : ''
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }, [students, yearName])

  // التخصصات الموجودة فعلاً في الكشف
  const specOptions = useMemo(
    () => [...new Set(students.map((s) => s.specialization || 'عام'))].sort((a, b) => a.localeCompare(b, 'ar')),
    [students],
  )

  // تصنيف الطلاب
  const enrolledCount = useMemo(() => students.filter((s) => s.is_enrolled).length, [students])
  const schoolOnlyCount = useMemo(() => students.filter((s) => !s.is_enrolled).length, [students])

  // تصفية الطلاب
  const filtered = useMemo(() => {
    return students.filter((s) => {
      if (selectedYear === '__none__') {
        if (s.year_id && yearName.has(s.year_id)) return false
      } else if (selectedYear && s.year_id !== selectedYear) return false
      if (selectedSpec && s.specialization !== selectedSpec) return false

      if (activeTab === 'enrolled' && !s.is_enrolled) return false
      if (activeTab === 'school_only' && s.is_enrolled) return false

      const out = balances.get(s.id)?.outstanding ?? 0
      if (activeTab === 'debt' && out <= 0) return false

      if (q && !(matches(s.full_name, q) || matches(s.specialization || '', q) || matches(s.code ?? '', q) || matches(s.year_id ? yearName.get(s.year_id) ?? '' : '', q))) {
        return false
      }

      return true
    })
  }, [students, selectedYear, selectedSpec, activeTab, q, balances, yearName])

  const remove = useAction(api.deleteStudent, {
    success: 'تم حذف الطالب بنجاح',
    invalidate: [['students'], ['student_subjects'], ['charges'], ['dashboard']],
  })

  function doExport() {
    exportCsv(
      filtered.map((s) => ({
        الاسم: s.full_name,
        التخصص: s.specialization || 'عام',
        'الصف الدراسي': s.year_id ? yearName.get(s.year_id) ?? '' : '',
        'مشترك بالدروس': s.is_enrolled ? 'نعم' : 'لا (طالب مدرسة)',
        'المواد المسجلة': (studentSubjectsMap.get(s.id) || []).join(' + ') || 'بدون مواد',
        الحالة: s.status === 'active' ? 'نشط' : 'غير نشط',
        المستحق: balances.get(s.id)?.due ?? 0,
        المدفوع: balances.get(s.id)?.paid ?? 0,
        المتبقي: balances.get(s.id)?.outstanding ?? 0,
        'تاريخ التسجيل': s.enrolled_at,
      })),
      `الطلاب-${new Date().toISOString().slice(0, 10)}`,
    )
  }

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="الطلاب ودليل المدرسة"
        icon={GraduationCap}
        subtitle={`${filtered.length} من أصل ${students.length} طالب مسجل`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => { setEnrollStudentId(undefined); setEnrollModalOpen(true) }}>
              <BookOpen className="size-4" /> حجز مواد لطالب
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setExcelModalOpen(true)}>
              <FileSpreadsheet className="size-4" /> استيراد شيت إكسيل
            </Button>
            <Button variant="secondary" size="sm" onClick={doExport} disabled={filtered.length === 0}>
              <Download className="size-4" /> تصدير الكشف
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus className="size-4" /> طالب جديد
            </Button>
          </div>
        }
      />

      {/* بطاقات الحصر السريعة (مشتركون vs غير مشتركين) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-muted">
            <Users className="size-4" />
            <span className="text-[12px] font-semibold">إجمالي الطلاب</span>
          </div>
          <p className="mt-1 text-2xl font-extrabold text-ink">{students.length}</p>
          <p className="mt-0.5 text-[11px] text-muted">قاعدة طلاب المدرسة</p>
        </Card>

        <Card className="p-4 border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <UserCheck className="size-4" />
            <span className="text-[12px] font-semibold">المشتركون بالدروس</span>
          </div>
          <p className="mt-1 text-2xl font-extrabold text-emerald-700 dark:text-emerald-300">{enrolledCount}</p>
          <p className="mt-0.5 text-[11px] text-emerald-600/80">مسجلون في مواد خاصة</p>
        </Card>

        <Card className="p-4 border-slate-500/20 bg-slate-500/5">
          <div className="flex items-center gap-2 text-muted">
            <UserX className="size-4" />
            <span className="text-[12px] font-semibold">غير المشتركين</span>
          </div>
          <p className="mt-1 text-2xl font-extrabold text-ink-2">{schoolOnlyCount}</p>
          <p className="mt-0.5 text-[11px] text-muted">طلاب مدرسة فقط</p>
        </Card>

        <Card className="p-4 border-amber-500/20 bg-amber-500/5">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <span className="text-[12px] font-semibold">عليهم مستحقات</span>
          </div>
          <p className="mt-1 text-2xl font-extrabold text-amber-700 dark:text-amber-300">
            {students.filter((s) => (balances.get(s.id)?.outstanding ?? 0) > 0).length}
          </p>
          <p className="mt-0.5 text-[11px] text-amber-600/80">متبقي عليهم دفعات</p>
        </Card>
      </div>

      {/* البحث وفلاتر الصفوف */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchInput
            value={q}
            onChange={setQ}
            className="flex-1"
            placeholder="ابحث بالاسم أو الكود أو التخصص أو الصف…"
          />
          <Select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="w-full sm:w-44 shrink-0"
          >
            <option value="">كل الصفوف الدراسية</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>{y.name}</option>
            ))}
          </Select>
          <Select
            value={selectedSpec}
            onChange={(e) => setSelectedSpec(e.target.value)}
            className="w-full sm:w-40 shrink-0"
          >
            <option value="">كل التخصصات</option>
            {specOptions.map((sp) => (
              <option key={sp} value={sp}>{sp}</option>
            ))}
          </Select>
        </div>

        {/* اختيار سريع للصف */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedYear('')}
            className={`tap rounded-full border px-3 py-1.5 text-xs font-bold transition ${
              !selectedYear ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[var(--border)] bg-surface text-ink-2'
            }`}
          >
            كل الصفوف ({students.length})
          </button>
          {years.map((y) => (
            <button
              key={y.id}
              type="button"
              onClick={() => setSelectedYear(selectedYear === y.id ? '' : y.id)}
              className={`tap rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                selectedYear === y.id ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-[var(--border)] bg-surface text-ink-2'
              }`}
            >
              {y.name} ({yearCounts.get(y.id) ?? 0})
            </button>
          ))}
          {(yearCounts.get('') ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => setSelectedYear(selectedYear === '__none__' ? '' : '__none__')}
              className={`tap rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                selectedYear === '__none__' ? 'border-rose-600 bg-rose-600 text-white' : 'border-rose-500/40 bg-rose-500/10 text-rose-600'
              }`}
            >
              بدون صف ({yearCounts.get('')})
            </button>
          )}
        </div>

        {/* ألسنة التبويب الاحترافية */}
        <div className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-2">
          <button
            onClick={() => setActiveTab('all')}
            className={`tap rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'all'
                ? 'bg-[var(--brand)] text-white shadow-sm'
                : 'bg-surface text-ink-2 hover:bg-surface-2'
            }`}
          >
            الكل ({students.length})
          </button>
          <button
            onClick={() => setActiveTab('enrolled')}
            className={`tap rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'enrolled'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-surface text-ink-2 hover:bg-surface-2'
            }`}
          >
            المشتركون بالدروس ({enrolledCount})
          </button>
          <button
            onClick={() => setActiveTab('school_only')}
            className={`tap rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'school_only'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'bg-surface text-ink-2 hover:bg-surface-2'
            }`}
          >
            غير المشتركين (المدرسة فقط) ({schoolOnlyCount})
          </button>
          <button
            onClick={() => setActiveTab('debt')}
            className={`tap rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'debt'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-surface text-ink-2 hover:bg-surface-2'
            }`}
          >
            عليهم متبقي
          </button>
        </div>
      </div>

      {/* قائمة الطلاب */}
      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={GraduationCap}
            title={students.length === 0 ? 'لا يوجد طلاب مسجلون بعد' : 'لا توجد نتائج مطابقة'}
            description={
              students.length === 0
                ? 'يمكنك رفع شيت إكسيل بطلاب الفصول دفعة واحدة أو إضافة طالب يدوياً.'
                : 'جرّب تغيير كلمة البحث أو خيارات التصفية.'
            }
            action={
              students.length === 0 ? (
                <div className="flex gap-2">
                  <Button onClick={() => setExcelModalOpen(true)}>
                    <FileSpreadsheet className="size-4" /> رفع شيت إكسيل
                  </Button>
                  <Button variant="secondary" onClick={() => { setEditing(null); setFormOpen(true) }}>
                    <Plus className="size-4" /> إضافة طالب
                  </Button>
                </div>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((s) => {
            const subs = studentSubjectsMap.get(s.id) || []
            const bal = balances.get(s.id)
            const hasDebt = (bal?.outstanding ?? 0) > 0

            return (
              <Card key={s.id} className="p-4 transition-all hover:border-[var(--brand)]/30">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {/* بيانات الطالب */}
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={`/students/${s.id}`}
                        className="text-base font-bold text-ink hover:text-[var(--brand)] hover:underline"
                      >
                        {s.full_name}
                      </Link>

                      {s.is_enrolled ? (
                        <Badge variant="default" className="bg-emerald-600 text-white text-[11px]">
                          مشترك بالدروس
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[11px] text-muted">
                          طالب مدرسة فقط
                        </Badge>
                      )}

                      {s.specialization && (
                        <Badge variant="outline" className="text-[11px]">
                          {s.specialization}
                        </Badge>
                      )}

                      {s.year_id && (
                        <Badge variant="secondary" className="text-[11px]">
                          {yearName.get(s.year_id) || ''}
                        </Badge>
                      )}
                    </div>

                    {/* المواد المسجلة */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <span className="font-semibold text-ink-2">المواد:</span>
                      {subs.length > 0 ? (
                        subs.map((sub, i) => (
                          <span key={i} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-ink">
                            {sub}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted italic">لم يتم تسجيل مواد بعد</span>
                      )}
                    </div>

                    {s.notes && (
                      <p className="text-[11px] text-muted italic">ملاحظات: {s.notes}</p>
                    )}
                  </div>

                  {/* الجزء المالي والإجراءات السريعة */}
                  <div className="flex flex-wrap items-center gap-3">
                    {s.is_enrolled && bal && (
                      <div className="text-left text-xs">
                        <p className="font-semibold text-muted">
                          مطلوب شهرياً:{' '}
                          <span className="font-mono font-bold text-ink">{fmtMoney(bal.due)}</span>
                        </p>
                        {hasDebt ? (
                          <p className="font-mono font-bold text-amber-600 dark:text-amber-400">
                            متبقي دين: {fmtMoney(bal.outstanding)}
                          </p>
                        ) : (
                          <p className="text-[11px] text-emerald-600 font-bold">مسدد بالكامل ✓</p>
                        )}
                      </div>
                    )}

                    {/* زر تسجيل أو تعديل المواد */}
                    <Button
                      size="sm"
                      variant={s.is_enrolled ? 'secondary' : 'primary'}
                      onClick={() => {
                        setEnrollStudentId(s.id)
                        setEnrollModalOpen(true)
                      }}
                    >
                      <BookOpen className="size-3.5" />
                      {s.is_enrolled ? 'المواد المسجلة' : 'حجز وتسجيل المواد'}
                    </Button>

                    {/* قائمة خيارات إضافية */}
                    <Dropdown>
                      <DropdownTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownTrigger>
                      <DropdownContent align="end">
                        <DropdownItem asChild>
                          <Link to={`/students/${s.id}`}>
                            <GraduationCap className="size-4" /> الملف الشامل
                          </Link>
                        </DropdownItem>
                        <DropdownItem onClick={() => { setEnrollStudentId(s.id); setEnrollModalOpen(true) }}>
                          <BookOpen className="size-4" /> حجز وتسجيل المواد
                        </DropdownItem>
                        <DropdownItem onClick={() => { setEditing(s); setFormOpen(true) }}>
                          <Pencil className="size-4" /> تعديل البيانات
                        </DropdownItem>
                        <DropdownSeparator />
                        <DropdownItem
                          danger
                          onClick={async () => {
                            const ok = await confirm({
                              title: 'حذف الطالب',
                              message: `هل أنت متأكد من حذف الطالب «${s.full_name}» نهائياً؟`,
                              confirmText: 'نعم، احذف',
                              destructive: true,
                            })
                            if (ok) remove.mutate(s.id)
                          }}
                        >
                          <Trash2 className="size-4" /> حذف الطالب
                        </DropdownItem>
                      </DropdownContent>
                    </Dropdown>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* مودال الطالب */}
      <StudentForm
        open={formOpen}
        onOpenChange={setFormOpen}
        student={editing}
        defaultYearId={selectedYear === '__none__' ? '' : selectedYear}
      />

      {/* مودال حجز وتسجيل المواد والدروس */}
      <EnrollSubjectsModal
        open={enrollModalOpen}
        onOpenChange={setEnrollModalOpen}
        studentId={enrollStudentId}
        initialYearId={selectedYear === '__none__' ? undefined : selectedYear}
      />

      {/* مودال استيراد شيت إكسيل */}
      <ExcelImportDialog
        open={excelModalOpen}
        onOpenChange={setExcelModalOpen}
        years={years}
      />
    </div>
  )
}

/* ========================================================================== */
/*                      مودال استيراد شيت إكسيل لطلاب المدرسة                     */
/* ========================================================================== */

function ExcelImportDialog({
  open,
  onOpenChange,
  years,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  years: any[]
}) {
  const [fallbackYearId, setFallbackYearId] = useState('')
  const [parsedRows, setParsedRows] = useState<ParsedStudentRow[]>([])
  const [gradeSource, setGradeSource] = useState<string>('none')
  const [loadingFile, setLoadingFile] = useState(false)
  const [fileName, setFileName] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [previewFilter, setPreviewFilter] = useState<'all' | 1 | 2 | 3 | 'unknown'>('all')

  useEffect(() => {
    if (open) {
      setFallbackYearId('')
      setParsedRows([])
      setFileName('')
      setErrorMsg('')
      setGradeSource('none')
      setPreviewFilter('all')
    }
  }, [open])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setFileName(file.name)
    setErrorMsg('')
    setLoadingFile(true)

    try {
      const res = await parseStudentsExcel(file)
      setParsedRows(res.rows)
      setGradeSource(res.gradeSource)
      setPreviewFilter('all')
    } catch (err) {
      setErrorMsg((err as Error).message || 'تعذر قراءة ملف الإكسيل')
      setParsedRows([])
    } finally {
      setLoadingFile(false)
    }
  }

  const counts = useMemo(() => {
    const c = { 1: 0, 2: 0, 3: 0, unknown: 0 }
    for (const r of parsedRows) {
      if (r.grade_level) c[r.grade_level]++
      else c.unknown++
    }
    return c
  }, [parsedRows])

  const preview = useMemo(
    () =>
      parsedRows.filter((r) =>
        previewFilter === 'all' ? true : previewFilter === 'unknown' ? !r.grade_level : r.grade_level === previewFilter,
      ),
    [parsedRows, previewFilter],
  )

  const importAction = useAction(
    async () => {
      if (parsedRows.length === 0) throw new Error('لا توجد بيانات للاستيراد')
      return await api.bulkImportStudents(parsedRows, fallbackYearId || null)
    },
    {
      success: (r) =>
        [
          r.added ? `تمت إضافة ${r.added} طالب` : '',
          r.updated ? `تم تحديث صف/تخصص ${r.updated} طالب موجود` : '',
          r.skipped ? `${r.skipped} طالب موجود بالفعل بنفس البيانات` : '',
        ]
          .filter(Boolean)
          .join(' • ') + ' ✓',
      invalidate: [['students'], ['dashboard'], ['years']],
      onDone: () => onOpenChange(false),
    },
  )

  const GRADE_CHIP: { v: 1 | 2 | 3; label: string; cls: string }[] = [
    { v: 1, label: 'الصف الأول', cls: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30' },
    { v: 2, label: 'الصف الثاني', cls: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30' },
    { v: 3, label: 'الصف الثالث', cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30' },
  ]
  const chipFor = (lvl?: number | null) => GRADE_CHIP.find((g) => g.v === lvl)

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="استيراد كشف طلاب من إكسيل" size="lg">
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-muted">
          ارفع شيت فيه <strong className="text-ink">اسم الطالب</strong> و<strong className="text-ink">الصف الدراسي</strong>
          {' '}(والتخصص اختياري). الصف يتعرف عليه بأي صيغة: «الأول / الثاني / الثالث»، «أولى / تانية / تالتة»،
          «1 / 2 / 3»، أو «one / two / three». ولو الكشف مقسوم أوراق باسم كل صف، هيتعرف عليه من اسم الورقة.
        </p>

        <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-surface-2 p-3">
          <div>
            <p className="text-xs font-bold text-ink">نموذج شيت جاهز</p>
            <p className="text-[11px] text-muted">اسم الطالب • الصف الدراسي • التخصص</p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={downloadExcelTemplate}>
            <Download className="size-3.5" /> تحميل النموذج
          </Button>
        </div>

        {/* خانة رفع الملف */}
        <div className="rounded-2xl border-2 border-dashed border-[var(--border)] p-5 text-center transition-all hover:border-[var(--brand)]">
          <UploadCloud className="mx-auto size-8 text-[var(--brand)]" />
          <p className="mt-2 text-xs font-bold text-ink">اختر ملف الإكسيل من هاتفك أو جهازك</p>
          <p className="mt-0.5 text-[11px] text-muted">يدعم صيغ .xlsx و .xls و .csv</p>
          <label className="tap mt-3 inline-block cursor-pointer rounded-xl bg-[var(--brand)] px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90">
            {fileName ? 'اختيار ملف آخر' : 'اختيار الملف'}
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
          </label>
          {fileName && <p className="mt-2 text-xs font-semibold text-emerald-600">الملف: {fileName}</p>}
        </div>

        {errorMsg && (
          <div className="rounded-xl bg-rose-500/10 p-3 text-xs font-bold text-rose-600">{errorMsg}</div>
        )}

        {parsedRows.length > 0 && (
          <>
            {/* ملخص الصفوف المكتشفة */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {GRADE_CHIP.map((g) => (
                <button
                  key={g.v}
                  type="button"
                  onClick={() => setPreviewFilter(previewFilter === g.v ? 'all' : g.v)}
                  className={`tap rounded-xl border p-2.5 text-center transition ${g.cls} ${previewFilter === g.v ? 'ring-2 ring-[var(--brand)]' : ''}`}
                >
                  <p className="text-[11px] font-bold">{g.label}</p>
                  <p className="num text-lg font-extrabold">{counts[g.v]}</p>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPreviewFilter(previewFilter === 'unknown' ? 'all' : 'unknown')}
                className={`tap rounded-xl border p-2.5 text-center transition ${
                  counts.unknown ? 'border-rose-500/40 bg-rose-500/10 text-rose-600' : 'border-[var(--border)] bg-surface-2 text-muted'
                } ${previewFilter === 'unknown' ? 'ring-2 ring-[var(--brand)]' : ''}`}
              >
                <p className="text-[11px] font-bold">صف غير واضح</p>
                <p className="num text-lg font-extrabold">{counts.unknown}</p>
              </button>
            </div>

            {gradeSource === 'none' && (
              <div className="rounded-xl border border-warning/40 bg-warning-bg p-3 text-[12px] font-semibold text-warning">
                مالقيتش عمود للصف الدراسي في الشيت. اختار الصف اللي يتحط فيه الطلاب دول من تحت، أو ضيف عمود «الصف الدراسي» للشيت.
              </div>
            )}

            {counts.unknown > 0 && (
              <Field
                label={`الطلاب اللي صفهم مش واضح (${counts.unknown}) يتحطوا في`}
                hint="لو سبتها فاضية هيتضافوا من غير صف وتقدر تحدده بعدين من ملف الطالب"
              >
                <Select value={fallbackYearId} onChange={(e) => setFallbackYearId(e.target.value)}>
                  <option value="">— بدون صف —</option>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>{y.name}</option>
                  ))}
                </Select>
              </Field>
            )}

            {/* معاينة */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-ink">
                  معاينة ({preview.length} من {parsedRows.length} طالب)
                </span>
                {previewFilter !== 'all' && (
                  <button type="button" className="tap text-[11px] font-bold text-[var(--brand)]" onClick={() => setPreviewFilter('all')}>
                    عرض الكل
                  </button>
                )}
              </div>
              <div className="max-h-60 divide-y divide-[var(--border)] overflow-y-auto rounded-xl border border-[var(--border)] bg-surface">
                {preview.slice(0, 120).map((row, idx) => {
                  const chip = chipFor(row.grade_level)
                  return (
                    <div key={idx} className="flex items-center justify-between gap-2 p-2 text-xs">
                      <span className="min-w-0 truncate font-semibold text-ink">{row.full_name}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {row.specialization && row.specialization !== 'عام' && (
                          <Badge variant="outline" className="text-[10px]">{row.specialization}</Badge>
                        )}
                        {chip ? (
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${chip.cls}`}>{chip.label}</span>
                        ) : (
                          <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                            {row.grade_raw ? `«${row.grade_raw}» غير واضح` : 'بدون صف'}
                          </span>
                        )}
                      </span>
                    </div>
                  )
                })}
                {preview.length > 120 && (
                  <p className="p-2 text-center text-[11px] text-muted">+ {preview.length - 120} طالب آخر…</p>
                )}
              </div>
              <p className="text-[11px] text-muted">
                الطالب الموجود قبل كده بنفس الاسم هيتحدّث صفه وتخصصه بدل ما يتكرر.
              </p>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button
            type="button"
            loading={importAction.isPending || loadingFile}
            disabled={parsedRows.length === 0}
            onClick={() => importAction.mutate(undefined as never)}
          >
            استيراد {parsedRows.length > 0 ? `${parsedRows.length} طالب` : ''}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
