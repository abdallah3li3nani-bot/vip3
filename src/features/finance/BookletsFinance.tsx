import { useState } from 'react'
import { BookText, Plus, Trash2, TrendingUp, Printer, Receipt } from 'lucide-react'
import { Button, Card, Field, Input, Modal, Select, useConfirm } from '@/components/ui'
import { Money } from '@/components/common/Money'
import { useAction, useGradeStats, useLookups } from '@/lib/hooks'
import { sumGrades, type GradeStats } from '@/lib/gradeStats'
import * as api from '@/lib/api'
import { fmtDate, todayISO } from '@/lib/format'

/** حسابات المذكرات لوحدها: مبيعات، محصّل، متبقي، تكلفة عليك، وصافي الربح لكل صف */
export function BookletsFinance() {
  const { stats } = useGradeStats()
  const t = sumGrades(stats)
  const [costFor, setCostFor] = useState<string | null>(null)
  const confirm = useConfirm()

  const removeCost = useAction(api.deleteBookletCost, {
    success: 'تم حذف بند التكلفة',
    invalidate: [['booklet_costs'], ['app_settings']],
  })

  const grades = stats.filter((g) => g.booklets.students.length > 0 || g.booklets.costs.length > 0 || g.studentsTotal > 0)

  return (
    <div className="space-y-4">
      {/* إجمالي كل الصفوف */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="مبيعات المذكرات" value={t.booklets.sales} />
        <Kpi label="المحصّل فعلاً" value={t.booklets.collected} cls="text-success" />
        <Kpi label="متبقي على الطلاب" value={t.booklets.remaining} cls="text-danger" />
        <Kpi label="التكلفة عليك" value={t.booklets.cost} cls="text-warning" />
        <Kpi
          label="صافي الربح الحالي"
          value={t.booklets.netProfit}
          cls={t.booklets.netProfit >= 0 ? 'text-success' : 'text-danger'}
          highlight
          hint={`المتوقع بعد تحصيل الكل: `}
          hintValue={t.booklets.expectedProfit}
        />
      </div>

      <p className="rounded-xl bg-surface-2 p-3 text-[12.5px] leading-relaxed text-ink-2">
        <b className="text-ink">صافي الربح الحالي</b> = اللي اتحصّل فعلاً من الطلاب − تكلفة المذكرات عليك.
        {' '}و<b className="text-ink">الربح المتوقع</b> = كل المبيعات − التكلفة (لو كل الطلاب دفعوا الباقي).
        فلوس الدروس محسوبة لوحدها في تبويب «حسابات الدروس».
      </p>

      {/* لكل صف */}
      <div className="grid gap-3 lg:grid-cols-2">
        {grades.map((g) => (
          <GradeBookletCard
            key={g.year.id}
            g={g}
            onAddCost={() => setCostFor(g.year.id)}
            onDeleteCost={async (id, title) => {
              const ok = await confirm({
                requirePassword: true,
                title: 'حذف بند تكلفة',
                message: `حذف «${title}» من تكاليف ${g.year.name}؟`,
                confirmText: 'حذف',
                tone: 'danger',
              })
              if (ok) removeCost.mutate(id)
            }}
          />
        ))}
      </div>

      <AddCostDialog yearId={costFor} onClose={() => setCostFor(null)} />
    </div>
  )
}

function Kpi({
  label, value, cls = 'text-ink', highlight, hint, hintValue,
}: { label: string; value: number; cls?: string; highlight?: boolean; hint?: string; hintValue?: number }) {
  return (
    <Card className={`p-3.5 ${highlight ? 'col-span-2 border-[var(--brand)]/40 bg-[color-mix(in_oklab,var(--brand)_6%,var(--surface))] lg:col-span-1' : ''}`}>
      <p className="text-[12px] font-semibold text-ink-2">{label}</p>
      <p className={`mt-1 text-[19px] font-extrabold ${cls}`}><Money value={value} /></p>
      {hint && hintValue !== undefined && (
        <p className="mt-0.5 text-[11px] text-muted">{hint}<Money value={hintValue} /></p>
      )}
    </Card>
  )
}

function GradeBookletCard({
  g, onAddCost, onDeleteCost,
}: { g: GradeStats; onAddCost: () => void; onDeleteCost: (id: string, title: string) => void }) {
  const b = g.booklets
  const margin = b.sales > 0 ? Math.round(((b.sales - b.cost) / b.sales) * 100) : 0
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-line p-4">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-info-bg text-info"><BookText className="size-[18px]" /></span>
          <div>
            <p className="text-[15px] font-extrabold text-ink">{g.year.name}</p>
            <p className="text-[11.5px] text-muted">
              {b.students.length} طالب حاجز • {b.paidStudents.length} دفعوا بالكامل • {b.unpaidStudents.length} عليهم فلوس
            </p>
          </div>
        </div>
        <Button size="sm" onClick={onAddCost}>
          <Plus className="size-4" /> تكلفة
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-px bg-line text-[12.5px]">
        <Cell label="المبيعات" value={b.sales} />
        <Cell label="المحصّل" value={b.collected} cls="text-success" />
        <Cell label="المتبقي على الطلاب" value={b.remaining} cls="text-danger" />
        <Cell label="التكلفة عليك" value={b.cost} cls="text-warning" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 bg-[color-mix(in_oklab,var(--brand)_5%,var(--surface))] p-4">
        <div className="flex items-center gap-2">
          <TrendingUp className={`size-5 ${b.netProfit >= 0 ? 'text-success' : 'text-danger'}`} />
          <div>
            <p className="text-[12px] text-ink-2">صافي الربح الحالي</p>
            <p className={`text-[20px] font-black ${b.netProfit >= 0 ? 'text-success' : 'text-danger'}`}><Money value={b.netProfit} /></p>
          </div>
        </div>
        <div className="text-left text-[11.5px] text-ink-2">
          <p>المتوقع بعد تحصيل الكل: <Money value={b.expectedProfit} className="font-bold text-ink" /></p>
          {b.sales > 0 && b.cost > 0 && <p>هامش الربح: <span className="num font-bold text-ink">{margin}%</span></p>}
          {b.pendingCopies > 0 && (
            <p className="flex items-center justify-end gap-1 text-info"><Printer className="size-3" /> {b.pendingCopies} نسخة لسه ما اتسلمتش</p>
          )}
        </div>
      </div>

      {/* بنود التكلفة */}
      <div className="p-4 pt-3">
        <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-bold text-ink">
          <Receipt className="size-3.5" /> بنود التكلفة ({b.costs.length})
        </p>
        {b.costs.length === 0 ? (
          <button
            type="button"
            onClick={onAddCost}
            className="tap w-full rounded-xl border border-dashed border-line p-3 text-[12.5px] text-muted hover:border-[var(--brand)] hover:text-[var(--brand)]"
          >
            لسه ما سجلتش تكلفة المذكرات للصف ده — اضغط لإضافتها (طباعة، تصوير، تغليف…)
          </button>
        ) : (
          <div className="divide-y divide-[var(--border)] rounded-xl border border-line">
            {b.costs.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 p-2.5 text-[12.5px]">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{c.title}</p>
                  <p className="num text-[11px] text-muted">{fmtDate(c.date)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Money value={c.amount} className="font-bold text-warning" />
                  <Button variant="ghost" size="iconSm" onClick={() => onDeleteCost(c.id, c.title)} aria-label="حذف">
                    <Trash2 className="size-3.5 text-danger" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  )
}

function Cell({ label, value, cls = 'text-ink' }: { label: string; value: number; cls?: string }) {
  return (
    <div className="bg-surface p-3">
      <p className="text-[11.5px] text-ink-2">{label}</p>
      <p className={`mt-0.5 text-[15px] font-extrabold ${cls}`}><Money value={value} /></p>
    </div>
  )
}

function AddCostDialog({ yearId, onClose }: { yearId: string | null; onClose: () => void }) {
  const { years } = useLookups()
  const [year, setYear] = useState('')
  const [title, setTitle] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const open = yearId !== null

  const [lastOpen, setLastOpen] = useState<string | null>(null)
  if (open && lastOpen !== yearId) {
    setLastOpen(yearId)
    setYear(yearId || years[0]?.id || '')
    setTitle('')
    setAmount('')
    setDate(todayISO())
  }
  if (!open && lastOpen !== null) setLastOpen(null)

  const save = useAction(
    () => api.addBookletCost({ year_id: year, title, amount: Number(amount), date }),
    {
      success: 'تم تسجيل تكلفة المذكرات ✓',
      invalidate: [['booklet_costs'], ['app_settings']],
      onDone: onClose,
    },
  )

  return (
    <Modal
      open={open}
      onOpenChange={(v) => !v && onClose()}
      title="إضافة تكلفة مذكرات"
      description="اللي دفعته انت (طباعة، تصوير، تغليف…). بيتخصم من محصّل المذكرات عشان يطلع لك المكسب الحقيقي."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button onClick={() => save.mutate(undefined as never)} loading={save.isPending}>حفظ</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="الصف" required>
          <Select value={year} onChange={(e) => setYear(e.target.value)}>
            {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
          </Select>
        </Field>
        <Field label="البيان">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="مثال: طباعة 120 نسخة مذكرة الكهرباء" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="المبلغ الإجمالي" required>
            <Input dir="ltr" inputMode="decimal" className="num text-right text-base font-bold" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
          </Field>
          <Field label="التاريخ">
            <Input type="date" dir="ltr" className="num text-right" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}
