import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle, Download, Plus, ReceiptText, Trash2, TrendingUp, Wallet, CheckCircle2, Printer,
} from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import { SearchInput } from '@/components/common/SearchInput'
import { StatCard } from '@/components/common/StatCard'
import { Money } from '@/components/common/Money'
import { ChargeBadge, PAYMENT_METHOD_LABEL } from '@/components/common/Status'
import {
  Avatar, Badge, Button, Card, EmptyState, ListSkeleton, Segmented, Select, useConfirm,
} from '@/components/ui'
import { PaymentDialog, ChargeDialog } from './dialogs'
import { useAction, useBalances, useCharges, useDashboard, useLookups, usePayments, useStudents } from '@/lib/hooks'
import * as api from '@/lib/api'
import { exportCsv, matches } from '@/lib/utils'
import { fmtDate, fmtTime } from '@/lib/format'

type Tab = 'debtors' | 'charges' | 'payments'

export default function FinancePage() {
  const [tab, setTab] = useState<Tab>('debtors')
  const [q, setQ] = useState('')
  const [year, setYear] = useState('')
  const [payOpen, setPayOpen] = useState(false)
  const [chargeOpen, setChargeOpen] = useState(false)

  const { data: students = [], isLoading: sLoading } = useStudents()
  const { data: charges = [], isLoading: cLoading } = useCharges()
  const { data: payments = [], isLoading: pLoading } = usePayments()
  const { balances } = useBalances()
  const { data: dash } = useDashboard()
  const { years, yearName, groupName } = useLookups()
  const confirm = useConfirm()

  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students])

  const totals = useMemo(() => {
    let outstanding = 0
    let debtorCount = 0
    for (const b of balances.values()) {
      outstanding += b.outstanding
      if (b.outstanding > 0.001) debtorCount++
    }
    const paid = payments.filter((p) => !p.void_at).reduce((a, p) => a + Number(p.amount), 0)
    return { outstanding, paid, debtorCount }
  }, [payments, balances])

  const debtors = useMemo(
    () =>
      students
        .filter((s) => (!year || s.year_id === year) && matches(`${s.full_name} ${s.code ?? ''}`, q))
        .map((s) => ({ s, b: balances.get(s.id) }))
        .filter((x) => (x.b?.outstanding ?? 0) > 0)
        .sort((a, b) => (b.b?.outstanding ?? 0) - (a.b?.outstanding ?? 0)),
    [students, balances, year, q],
  )

  const filteredCharges = useMemo(
    () =>
      charges.filter((c) => {
        const s = studentById.get(c.student_id)
        if (year && s?.year_id !== year) return false
        return matches(`${c.title} ${s?.full_name ?? ''} ${s?.code ?? ''}`, q)
      }),
    [charges, studentById, year, q],
  )

  const filteredPayments = useMemo(
    () =>
      payments.filter((p) => {
        const s = studentById.get(p.student_id)
        if (year && s?.year_id !== year) return false
        return matches(`${s?.full_name ?? ''} ${s?.code ?? ''} ${p.notes ?? ''}`, q)
      }),
    [payments, studentById, year, q],
  )

  const voidCharge = useAction(({ id, reason }: { id: string; reason: string }) => api.voidCharge(id, reason), {
    success: 'تم إلغاء البند', invalidate: [['charges'], ['dashboard']],
  })
  const voidPayment = useAction(({ id, reason }: { id: string; reason: string }) => api.voidPayment(id, reason), {
    success: 'تم إلغاء الدفعة وإرجاع المبالغ للبنود', invalidate: [['payments'], ['charges'], ['booklet_orders'], ['dashboard']],
  })

  function doExport() {
    if (tab === 'payments') {
      exportCsv(
        filteredPayments.map((p) => ({
          'رقم الإيصال': p.receipt_no ?? '',
          التاريخ: fmtDate(p.paid_at),
          الحالة: p.void_at ? 'ملغاة' : 'سارية',
          الطالب: studentById.get(p.student_id)?.full_name ?? '',
          الكود: studentById.get(p.student_id)?.code ?? '',
          المبلغ: Number(p.amount),
          الطريقة: PAYMENT_METHOD_LABEL[p.method] ?? p.method,
          مرجع: p.reference ?? '',
          ملاحظات: p.notes ?? '',
        })),
        `المدفوعات-${new Date().toISOString().slice(0, 10)}`,
      )
    } else if (tab === 'charges') {
      exportCsv(
        filteredCharges.map((c) => ({
          التاريخ: c.due_date,
          الطالب: studentById.get(c.student_id)?.full_name ?? '',
          الكود: studentById.get(c.student_id)?.code ?? '',
          البند: c.title,
          النوع: c.kind === 'cycle' ? 'رسوم دورة' : 'بند إضافي',
          المبلغ: Number(c.amount),
          المدفوع: Number(c.paid_amount),
          المتبقي: Number(c.amount) - Number(c.paid_amount),
        })),
        `المستحقات-${new Date().toISOString().slice(0, 10)}`,
      )
    } else {
      exportCsv(
        debtors.map(({ s, b }) => ({
          الكود: s.code ?? '',
          الطالب: s.full_name,
          'متبقي دروس': b?.lessonsOutstanding ?? 0,
          'متبقي مذكرات': b?.bookletsOutstanding ?? 0,
          السنة: s.year_id ? yearName.get(s.year_id) ?? '' : '',
          المجموعة: s.group_id ? groupName.get(s.group_id) ?? '' : '',
          المستحق: b?.outstanding ?? 0,
        })),
        `المتأخرات-${new Date().toISOString().slice(0, 10)}`,
      )
    }
  }

  const loading = sLoading || cLoading || pLoading

  return (
    <div>
      <PageHeader
        title="الحسابات"
        icon={Wallet}
        subtitle="المستحقات، المدفوعات، والمتأخرات"
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={doExport}><Download className="size-4" /> تصدير</Button>
            <Button variant="secondary" size="sm" onClick={() => setChargeOpen(true)}><ReceiptText className="size-4" /> بند مالي</Button>
            <Button size="sm" onClick={() => setPayOpen(true)}><Plus className="size-4" /> دفعة</Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="المستحق حاليًا (دروس ومذكرات)" value={<Money value={totals.outstanding} className="text-danger" />} icon={AlertTriangle} tone="danger" />
        <StatCard label="إجمالي المحصّل" value={<Money value={totals.paid} className="text-success" />} icon={CheckCircle2} tone="success" />
        <StatCard label="تحصيل هذا الشهر" value={<Money value={dash?.paid_this_month ?? 0} />} icon={TrendingUp} tone="brand" />
        <StatCard label="طلاب عليهم مستحقات" value={<span className="num">{totals.debtorCount}</span>} icon={Wallet} tone="warning" />
      </div>

      <div className="mb-4 space-y-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'debtors', label: 'المتأخرات' },
            { value: 'charges', label: 'المستحقات' },
            { value: 'payments', label: 'المدفوعات' },
          ]}
        />
        <div className="flex gap-2">
          <SearchInput value={q} onChange={setQ} className="flex-1" placeholder="ابحث بالاسم أو الكود…" />
          <Select value={year} onChange={(e) => setYear(e.target.value)} className="w-44 shrink-0">
            <option value="">كل السنوات</option>
            {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
          </Select>
        </div>
      </div>

      {loading ? (
        <ListSkeleton rows={6} />
      ) : tab === 'debtors' ? (
        debtors.length === 0 ? (
          <Card><EmptyState icon={CheckCircle2} title="لا توجد متأخرات 🎉" description="كل الطلاب خالصون حاليًا." /></Card>
        ) : (
          <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
            {debtors.map(({ s, b }) => (
              <Link key={s.id} to={`/students/${s.id}`}>
                <Card className="animate-fade-up flex items-center gap-3 p-3.5 transition hover:shadow-[var(--shadow-2)]">
                  <Avatar name={s.full_name} size={42} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-bold text-ink">{s.full_name}</p>
                    <p className="num truncate text-[11.5px] text-muted">
                      {s.code}{s.year_id ? ` · ${yearName.get(s.year_id) ?? ''}` : ''}{s.group_id ? ` · ${groupName.get(s.group_id)}` : ''}
                    </p>
                    <p className="num truncate text-[11px] text-ink-2">
                      {(b?.lessonsOutstanding ?? 0) > 0 && <>دروس <Money value={b!.lessonsOutstanding} /> </>}
                      {(b?.bookletsOutstanding ?? 0) > 0 && <>· مذكرات <Money value={b!.bookletsOutstanding} /></>}
                    </p>
                  </div>
                  <span className="text-[14px] font-extrabold text-danger"><Money value={b?.outstanding ?? 0} /></span>
                </Card>
              </Link>
            ))}
          </div>
        )
      ) : tab === 'charges' ? (
        filteredCharges.length === 0 ? (
          <Card><EmptyState icon={ReceiptText} title="لا توجد مستحقات" description="تُنشأ تلقائيًا مع كل دورة، أو أضف بندًا يدويًا." /></Card>
        ) : (
          <Card className="divide-y divide-[var(--border)]">
            {filteredCharges.slice(0, 300).map((c) => {
              const s = studentById.get(c.student_id)
              return (
                <div key={c.id} className="flex items-center gap-3 p-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-ink">{c.title}</p>
                    <Link to={`/students/${c.student_id}`} className="truncate text-[11.5px] text-muted hover:text-[var(--brand)]">
                      {s?.full_name} · <span className="num">{s?.code}</span> · {fmtDate(c.due_date)}
                    </Link>
                  </div>
                  <div className="text-left">
                    <p className="num text-[13.5px] font-bold text-ink"><Money value={Number(c.amount)} /></p>
                  </div>
                  <ChargeBadge status={c.status} />
                  {c.void_at ? <span className="size-8" /> : <Button
                    variant="ghost" size="iconSm" aria-label="إلغاء"
                    onClick={() =>
                      confirm({
                        title: 'إلغاء البند المالي',
                        message: `«${c.title}» لـ ${s?.full_name}. السجل يبقى محفوظًا للمراجعة.`,
                        confirmText: 'إلغاء البند',
                        onConfirm: () => voidCharge.mutateAsync({ id: c.id, reason: 'إلغاء من صفحة الحسابات' }),
                      })
                    }
                  >
                    <Trash2 className="size-3.5 text-danger" />
                  </Button>}
                </div>
              )
            })}
          </Card>
        )
      ) : filteredPayments.length === 0 ? (
        <Card><EmptyState icon={Wallet} title="لا توجد مدفوعات" description="سجّل أول دفعة من زر «دفعة» بالأعلى." /></Card>
      ) : (
        <Card className="divide-y divide-[var(--border)]">
          {filteredPayments.slice(0, 300).map((p) => {
            const s = studentById.get(p.student_id)
            return (
              <div key={p.id} className={`flex items-center gap-3 p-3.5 ${p.void_at ? 'opacity-55' : ''}`}>
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-success-bg text-success">
                  <Wallet className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <Link to={`/students/${p.student_id}`} className="truncate text-[13.5px] font-semibold text-ink hover:text-[var(--brand)]">
                    {s?.full_name}
                  </Link>
                  <p className="num truncate text-[11.5px] text-muted">
                    #{String(p.receipt_no ?? 0).padStart(5, '0')} · {fmtDate(p.paid_at)} {fmtTime(p.paid_at)} · {PAYMENT_METHOD_LABEL[p.method] ?? p.method}
                    {p.source === 'booklet' ? ' · مذكرات' : ''}
                  </p>
                </div>
                {p.void_at ? <Badge tone="neutral">ملغاة</Badge> : null}
                <Badge tone={Number(p.amount) < 0 ? 'danger' : 'success'}><Money value={Number(p.amount)} /></Badge>
                <Button variant="ghost" size="iconSm" asChild aria-label="طباعة الإيصال">
                  <Link to={`/receipt/${p.id}`}><Printer className="size-3.5 text-ink-2" /></Link>
                </Button>
                {!p.void_at && <Button
                  variant="ghost" size="iconSm" aria-label="إلغاء"
                  onClick={() =>
                    confirm({
                      title: 'إلغاء الدفعة',
                      message: 'سيتم إرجاع المبالغ إلى المستحقات. السجل يبقى محفوظًا.',
                      confirmText: 'إلغاء الدفعة',
                      onConfirm: () => voidPayment.mutateAsync({ id: p.id, reason: 'إلغاء من صفحة الحسابات' }),
                    })
                  }
                >
                  <Trash2 className="size-3.5 text-danger" />
                </Button>}
              </div>
            )
          })}
        </Card>
      )}

      <PaymentDialog open={payOpen} onOpenChange={setPayOpen} />
      <ChargeDialog open={chargeOpen} onOpenChange={setChargeOpen} />
    </div>
  )
}
