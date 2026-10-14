import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  BookOpen, BookText, CheckCircle2, AlertCircle, UserX, TrendingUp, ChevronLeft, Printer, Users,
} from 'lucide-react'
import { Badge, Card, Modal } from '@/components/ui'
import { Money } from '@/components/common/Money'
import { SearchInput } from '@/components/common/SearchInput'
import { matches } from '@/lib/utils'
import type { GradeStats } from '@/lib/gradeStats'
import { sumGrades } from '@/lib/gradeStats'
import type { Student } from '@/lib/database.types'

/* ====================================================================== */
/*                ملخص مالي: الدروس لوحدها والمذكرات لوحدها               */
/* ====================================================================== */
export function FinanceSplit({ stats }: { stats: GradeStats[] }) {
  const t = useMemo(() => sumGrades(stats), [stats])
  const realProfit = t.lessons.collected + t.booklets.netProfit

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {/* الدروس */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--brand)_14%,transparent)] text-[var(--brand)]">
            <BookOpen className="size-[18px]" />
          </span>
          <div>
            <p className="text-[14px] font-bold text-ink">حسابات الدروس</p>
            <p className="text-[11px] text-muted">{t.lessons.students} طالب مشترك</p>
          </div>
        </div>
        <Row label="المستحق" value={t.lessons.due} />
        <Row label="المحصّل" value={t.lessons.collected} cls="text-success" />
        <Row label="المتبقي على الطلاب" value={t.lessons.remaining} cls="text-danger" last />
      </Card>

      {/* المذكرات */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-info-bg text-info">
            <BookText className="size-[18px]" />
          </span>
          <div>
            <p className="text-[14px] font-bold text-ink">حسابات المذكرات</p>
            <p className="text-[11px] text-muted">{t.booklets.students} طالب حاجز</p>
          </div>
        </div>
        <Row label="إجمالي المبيعات" value={t.booklets.sales} />
        <Row label="المحصّل" value={t.booklets.collected} cls="text-success" />
        <Row label="المتبقي على الطلاب" value={t.booklets.remaining} cls="text-danger" />
        <Row label="تكلفة المذكرات عليك" value={-t.booklets.cost} cls="text-warning" />
        <Row label="صافي ربح المذكرات" value={t.booklets.netProfit} cls={t.booklets.netProfit >= 0 ? 'text-success' : 'text-danger'} strong last />
      </Card>

      {/* المكسب الحقيقي */}
      <Card className="flex flex-col justify-between border-[var(--brand)]/40 bg-[color-mix(in_oklab,var(--brand)_6%,var(--surface))] p-4">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-success-bg text-success">
              <TrendingUp className="size-[18px]" />
            </span>
            <p className="text-[14px] font-bold text-ink">المكسب الحقيقي</p>
          </div>
          <p className="text-[28px] font-black leading-none">
            <Money value={realProfit} className={realProfit >= 0 ? 'text-success' : 'text-danger'} />
          </p>
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-2">
            محصّل الدروس + محصّل المذكرات − تكلفة المذكرات
          </p>
        </div>
        <div className="mt-3 space-y-1 rounded-xl bg-surface p-2.5 text-[12px]">
          <div className="flex justify-between"><span className="text-ink-2">من الدروس</span><Money value={t.lessons.collected} /></div>
          <div className="flex justify-between"><span className="text-ink-2">من المذكرات (صافي)</span><Money value={t.booklets.netProfit} /></div>
          <div className="flex justify-between border-t border-line pt-1">
            <span className="text-ink-2">الربح المتوقع بعد تحصيل كل المتبقي</span>
            <Money value={t.lessons.due + t.booklets.expectedProfit} />
          </div>
        </div>
        <Link to="/finance?tab=booklets" className="mt-3 inline-flex items-center gap-1 text-[12px] font-bold text-[var(--brand)] hover:underline">
          إدخال تكاليف المذكرات لكل صف <ChevronLeft className="size-3.5" />
        </Link>
      </Card>
    </div>
  )
}

function Row({ label, value, cls = 'text-ink', strong, last }: { label: string; value: number; cls?: string; strong?: boolean; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 text-[13px] ${last ? '' : 'border-b border-line/60'}`}>
      <span className="text-ink-2">{label}</span>
      <span className={`${strong ? 'text-[15px] font-extrabold' : 'font-bold'} ${cls}`}><Money value={value} /></span>
    </div>
  )
}

/* ====================================================================== */
/*                        تفاصيل كل صف + قوائم الأسماء                    */
/* ====================================================================== */
type ListKind = 'lessons' | 'paid' | 'unpaid' | 'notBooked'

const GRADE_TONES = [
  'from-sky-500/12 border-sky-500/30',
  'from-violet-500/12 border-violet-500/30',
  'from-amber-500/12 border-amber-500/30',
  'from-emerald-500/12 border-emerald-500/30',
]

export function GradeCards({ stats }: { stats: GradeStats[] }) {
  const [open, setOpen] = useState<{ grade: GradeStats; kind: ListKind } | null>(null)
  const visible = stats.filter((g) => g.studentsTotal > 0 || g.booklets.students.length > 0)

  if (visible.length === 0) return null

  return (
    <>
      <div className="grid gap-3 lg:grid-cols-3">
        {visible.map((g, i) => (
          <Card key={g.year.id} className={`overflow-hidden border bg-gradient-to-b to-transparent ${GRADE_TONES[i % GRADE_TONES.length]}`}>
            <div className="flex items-center justify-between p-4 pb-2">
              <div>
                <p className="text-[16px] font-extrabold text-ink">{g.year.name}</p>
                <p className="text-[11.5px] text-muted">{g.studentsTotal} طالب في الصف</p>
              </div>
              <Link to={`/students`} className="text-[11px] font-bold text-[var(--brand)] hover:underline">الطلاب</Link>
            </div>

            {/* الدروس */}
            <div className="px-4">
              <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-ink-2">
                <BookOpen className="size-3.5" /> الدروس
              </p>
              <Tile
                icon={Users}
                label="مشتركين في الدروس"
                count={g.lessons.students.length}
                tone="brand"
                onClick={() => setOpen({ grade: g, kind: 'lessons' })}
              />
              {g.lessons.bySubject.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {g.lessons.bySubject.map(({ subject, count }) => (
                    <span key={subject.id} className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-ink-2">
                      {subject.name}: <b className="num text-ink">{count}</b>
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-2 flex justify-between text-[12px]">
                <span className="text-ink-2">محصّل الدروس</span>
                <Money value={g.lessons.collected} className="font-bold text-success" />
              </div>
              <div className="flex justify-between text-[12px]">
                <span className="text-ink-2">متبقي الدروس</span>
                <Money value={g.lessons.remaining} className="font-bold text-danger" />
              </div>
            </div>

            {/* المذكرات */}
            <div className="mt-3 border-t border-line/70 px-4 pt-3">
              <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-ink-2">
                <BookText className="size-3.5" /> المذكرات
                <span className="font-normal text-muted">({g.booklets.students.length} طالب حاجز)</span>
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                <Tile icon={CheckCircle2} label="دفعوا بالكامل" count={g.booklets.paidStudents.length} tone="success" compact onClick={() => setOpen({ grade: g, kind: 'paid' })} />
                <Tile icon={AlertCircle} label="عليهم فلوس" count={g.booklets.unpaidStudents.length} tone="danger" compact onClick={() => setOpen({ grade: g, kind: 'unpaid' })} />
                <Tile icon={UserX} label="ما حجزوش" count={g.booklets.notBooked.length} tone="neutral" compact onClick={() => setOpen({ grade: g, kind: 'notBooked' })} />
              </div>
              {g.booklets.pendingCopies > 0 && (
                <p className="mt-2 flex items-center gap-1.5 text-[11.5px] font-semibold text-info">
                  <Printer className="size-3.5" /> {g.booklets.pendingCopies} نسخة لسه ما اتسلمتش
                </p>
              )}
            </div>

            {/* حساب الصف */}
            <div className="m-4 mt-3 space-y-1 rounded-xl bg-surface p-2.5 text-[12px]">
              <div className="flex justify-between"><span className="text-ink-2">محصّل المذكرات</span><Money value={g.booklets.collected} className="font-bold" /></div>
              <div className="flex justify-between"><span className="text-ink-2">تكلفة المذكرات</span><Money value={-g.booklets.cost} className="font-bold text-warning" /></div>
              <div className="flex justify-between border-t border-line pt-1">
                <span className="font-bold text-ink">صافي الصف (دروس + مذكرات)</span>
                <Money value={g.lessons.collected + g.booklets.netProfit} className="font-extrabold text-success" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <GradeListModal state={open} onClose={() => setOpen(null)} />
    </>
  )
}

function Tile({
  icon: Icon, label, count, tone, onClick, compact,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  count: number
  tone: 'brand' | 'success' | 'danger' | 'neutral'
  onClick: () => void
  compact?: boolean
}) {
  const cls = {
    brand: 'text-[var(--brand)] bg-[color-mix(in_oklab,var(--brand)_10%,var(--surface))]',
    success: 'text-success bg-success-bg',
    danger: 'text-danger bg-danger-bg',
    neutral: 'text-ink-2 bg-surface-2',
  }[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tap w-full rounded-xl border border-line/60 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-2)] ${cls} ${
        compact ? 'p-2 text-center' : 'flex items-center justify-between p-3'
      }`}
    >
      {compact ? (
        <>
          <p className="num text-[20px] font-black leading-tight">{count}</p>
          <p className="text-[10.5px] font-bold leading-tight">{label}</p>
        </>
      ) : (
        <>
          <span className="flex items-center gap-2 text-[13px] font-bold"><Icon className="size-4" /> {label}</span>
          <span className="flex items-center gap-1">
            <span className="num text-[22px] font-black">{count}</span>
            <ChevronLeft className="size-4 opacity-60" />
          </span>
        </>
      )}
    </button>
  )
}

/* ---------------------------- نافذة الأسماء ---------------------------- */
function GradeListModal({ state, onClose }: { state: { grade: GradeStats; kind: ListKind } | null; onClose: () => void }) {
  const [q, setQ] = useState('')
  if (!state) return null
  const { grade, kind } = state
  const title = {
    lessons: `المشتركين في الدروس — ${grade.year.name}`,
    paid: `دفعوا المذكرات بالكامل — ${grade.year.name}`,
    unpaid: `عليهم فلوس مذكرات — ${grade.year.name}`,
    notBooked: `ما حجزوش مذكرات — ${grade.year.name}`,
  }[kind]

  const f = (s: Student) => !q || matches(s.full_name, q) || matches(s.code ?? '', q)

  return (
    <Modal open onOpenChange={(v) => { if (!v) { setQ(''); onClose() } }} title={title} size="lg">
      <div className="space-y-3">
        <SearchInput value={q} onChange={setQ} placeholder="ابحث بالاسم أو الكود…" />

        {kind === 'lessons' && (
          <>
            <Summary text={`${grade.lessons.students.length} طالب • المحصّل`} money={grade.lessons.collected} extra="المتبقي" extraMoney={grade.lessons.remaining} />
            <List empty="مفيش طلاب مشتركين في الدروس في الصف ده">
              {grade.lessons.students.filter((r) => f(r.student)).map((r) => (
                <Item key={r.student.id} student={r.student}>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge tone="brand" className="text-[10.5px]">{r.subjects.length} {r.subjects.length === 1 ? 'مادة' : 'مواد'}</Badge>
                    {r.subjects.map((s) => (
                      <Badge key={s.id} tone="neutral" className="text-[10.5px]">{s.name}</Badge>
                    ))}
                  </div>
                  {r.outstanding > 0 && (
                    <p className="mt-1 text-[11.5px] font-bold text-danger">متبقي عليه: <Money value={r.outstanding} /></p>
                  )}
                </Item>
              ))}
            </List>
          </>
        )}

        {(kind === 'paid' || kind === 'unpaid') && (() => {
          const rows = kind === 'paid' ? grade.booklets.paidStudents : grade.booklets.unpaidStudents
          const total = rows.reduce((a, r) => a + (kind === 'paid' ? r.paid : r.remaining), 0)
          return (
            <>
              <Summary text={`${rows.length} طالب • ${kind === 'paid' ? 'إجمالي المدفوع' : 'إجمالي المتبقي'}`} money={total} />
              <List empty={kind === 'paid' ? 'مفيش طالب دفع بالكامل لسه' : 'كل الطلاب دفعوا المذكرات ✓'}>
                {rows.filter((r) => f(r.student)).map((r) => (
                  <Item key={r.student.id} student={r.student}>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.titles.map((t, i) => (
                        <Badge key={i} tone="neutral" className="text-[10.5px]">{t}</Badge>
                      ))}
                    </div>
                    <p className="mt-1 text-[11.5px] text-ink-2">
                      {r.orders.length} {r.orders.length === 1 ? 'مذكرة' : 'مذكرات'} • الإجمالي <Money value={r.price} /> • دفع{' '}
                      <span className="font-bold text-success"><Money value={r.paid} /></span>
                      {r.remaining > 0 && (
                        <> • <span className="font-bold text-danger">متبقي <Money value={r.remaining} /></span></>
                      )}
                      {r.undelivered > 0 && <span className="text-info"> • {r.undelivered} لسه ما استلمش</span>}
                    </p>
                  </Item>
                ))}
              </List>
            </>
          )
        })()}

        {kind === 'notBooked' && (
          <>
            <Summary text={`${grade.booklets.notBooked.length} طالب ما حجزش أي مذكرة`} />
            <List empty="كل طلاب الصف حاجزين مذكرات ✓">
              {grade.booklets.notBooked.filter(f).map((s) => (
                <Item key={s.id} student={s} />
              ))}
            </List>
            <Link to="/booklets" className="block text-center text-[12.5px] font-bold text-[var(--brand)] hover:underline">
              روح صفحة المذكرات لتوزيع مذكرة على الصف كله
            </Link>
          </>
        )}
      </div>
    </Modal>
  )
}

function Summary({ text, money, extra, extraMoney }: { text: string; money?: number; extra?: string; extraMoney?: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-surface-2 p-2.5 text-[12.5px] font-semibold text-ink-2">
      <span>
        {text} {money !== undefined && <Money value={money} className="font-extrabold text-ink" />}
      </span>
      {extra && extraMoney !== undefined && (
        <span>{extra} <Money value={extraMoney} className="font-extrabold text-danger" /></span>
      )}
    </div>
  )
}

function List({ children, empty }: { children: React.ReactNode; empty: string }) {
  const arr = Array.isArray(children) ? children : [children]
  const has = arr.flat().filter(Boolean).length > 0
  return (
    <div className="max-h-[55vh] divide-y divide-[var(--border)] overflow-y-auto rounded-xl border border-line">
      {has ? children : <p className="p-6 text-center text-[13px] text-muted">{empty}</p>}
    </div>
  )
}

function Item({ student, children }: { student: Student; children?: React.ReactNode }) {
  return (
    <Link to={`/students/${student.id}`} className="tap block p-3 transition hover:bg-surface-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13.5px] font-bold text-ink">{student.full_name}</p>
        <span className="num shrink-0 text-[11px] text-muted">
          {student.code}{student.specialization && student.specialization !== 'عام' ? ` • ${student.specialization}` : ''}
        </span>
      </div>
      {children}
    </Link>
  )
}

