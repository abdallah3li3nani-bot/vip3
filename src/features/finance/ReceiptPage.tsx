import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, Printer } from 'lucide-react'
import { Button, EmptyState, PageLoader } from '@/components/ui'
import { PAYMENT_METHOD_LABEL } from '@/components/common/Status'
import { useBalances, useBooklets, useBookletOrders, useCharges, useLookups, usePayment, useStudent } from '@/lib/hooks'
import { useSettings } from '@/store/settings'
import { fmtDateTime, fmtMoney } from '@/lib/format'

/** إيصال استلام نقدية قابل للطباعة */
export default function ReceiptPage() {
  const { id } = useParams()
  const { settings } = useSettings()
  const { data: payment, isLoading } = usePayment(id)
  const { data: student } = useStudent(payment?.student_id)
  const { data: charges = [] } = useCharges(payment?.student_id)
  const { data: orders = [] } = useBookletOrders(payment?.student_id ? { studentId: payment.student_id } : undefined)
  const { data: booklets = [] } = useBooklets()
  const { yearName } = useLookups()
  const { balances } = useBalances()
  const sym = settings.currency_symbol

  const lines = useMemo(() => {
    if (!payment) return []
    const chargeMap = new Map(charges.map((c) => [c.id, c]))
    const orderMap = new Map(orders.map((o) => [o.id, o]))
    const bookletMap = new Map(booklets.map((b) => [b.id, b]))
    return (payment.allocations || []).map((a) => {
      if (a.kind === 'charge') return { label: chargeMap.get(a.id)?.title || 'مستحق دروس', amount: a.amount }
      const o = orderMap.get(a.id)
      return { label: `مذكرة: ${(o && bookletMap.get(o.booklet_id)?.title) || '—'}`, amount: a.amount }
    })
  }, [payment, charges, orders, booklets])

  if (isLoading) return <PageLoader />
  if (!payment) return <EmptyState title="الإيصال غير موجود" />

  const allocated = lines.reduce((a, l) => a + l.amount, 0)
  const unallocated = Number(payment.amount) - allocated
  const balance = balances.get(payment.student_id)
  const isVoid = !!payment.void_at

  return (
    <div className="mx-auto max-w-md space-y-3">
      <div className="no-print flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild className="-mr-2">
          <Link to={student ? `/students/${student.id}` : '/finance'}>
            <ArrowRight className="size-4" /> رجوع
          </Link>
        </Button>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="size-4" /> طباعة الإيصال
        </Button>
      </div>

      <div className="print-area receipt relative overflow-hidden rounded-2xl border border-line bg-white p-5 text-[13px] text-neutral-900 shadow-[var(--shadow-2)]">
        {isVoid && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="-rotate-12 rounded-xl border-4 border-red-600 px-6 py-2 text-3xl font-black text-red-600 opacity-70">
              ملغى
            </span>
          </div>
        )}

        <div className="border-b-2 border-dashed border-neutral-300 pb-3 text-center">
          <p className="text-[17px] font-extrabold">{settings.app_name}</p>
          {settings.teacher_name && <p className="text-[12.5px] text-neutral-600">{settings.teacher_name}</p>}
          {settings.report_header && <p className="mt-0.5 text-[11.5px] text-neutral-500">{settings.report_header}</p>}
          <p className="mt-2 inline-block rounded-full bg-neutral-100 px-3 py-1 text-[12px] font-bold">إيصال استلام نقدية</p>
        </div>

        <div className="grid grid-cols-2 gap-y-1.5 border-b border-neutral-200 py-3">
          <span className="text-neutral-500">رقم الإيصال</span>
          <span className="num text-left font-bold">#{String(payment.receipt_no || 0).padStart(5, '0')}</span>
          <span className="text-neutral-500">التاريخ</span>
          <span className="num text-left">{fmtDateTime(payment.paid_at)}</span>
          <span className="text-neutral-500">الطالب</span>
          <span className="text-left font-bold">{student?.full_name || '—'}</span>
          <span className="text-neutral-500">الكود / الصف</span>
          <span className="num text-left">
            {student?.code || '—'}
            {student?.year_id ? ` · ${yearName.get(student.year_id) || ''}` : ''}
          </span>
          <span className="text-neutral-500">طريقة الدفع</span>
          <span className="text-left">{PAYMENT_METHOD_LABEL[payment.method] ?? payment.method}</span>
          {payment.reference && (
            <>
              <span className="text-neutral-500">رقم مرجعي</span>
              <span className="num text-left">{payment.reference}</span>
            </>
          )}
        </div>

        {lines.length > 0 && (
          <table className="my-3 w-full">
            <thead>
              <tr className="border-b border-neutral-200 text-[11.5px] text-neutral-500">
                <th className="py-1 text-right font-semibold">البيان</th>
                <th className="py-1 text-left font-semibold">المبلغ</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-b border-neutral-100 last:border-0">
                  <td className="py-1.5">{l.label}</td>
                  <td className="num py-1.5 text-left">{fmtMoney(l.amount, sym)}</td>
                </tr>
              ))}
              {unallocated > 0.001 && (
                <tr>
                  <td className="py-1.5 text-neutral-500">رصيد مقدم (لم يُخصم من بند)</td>
                  <td className="num py-1.5 text-left">{fmtMoney(unallocated, sym)}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        <div className="flex items-center justify-between rounded-xl bg-neutral-900 px-4 py-3 text-white">
          <span className="font-bold">الإجمالي المدفوع</span>
          <span className="num text-[18px] font-extrabold">{fmtMoney(Number(payment.amount), sym)}</span>
        </div>

        {balance && !isVoid && (
          <p className="mt-2 text-center text-[12px] text-neutral-600">
            {balance.outstanding > 0.001
              ? `المتبقي على الطالب حالياً: ${fmtMoney(balance.outstanding, sym)}`
              : 'الحساب خالص حالياً ✓'}
          </p>
        )}
        {payment.notes && <p className="mt-2 text-center text-[11.5px] text-neutral-500">{payment.notes}</p>}

        <div className="mt-6 flex items-end justify-between text-[11.5px] text-neutral-500">
          <span>التوقيع: ................</span>
          <span>{settings.report_footer || 'شكراً لكم'}</span>
        </div>
      </div>
    </div>
  )
}
