import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Banknote, Download, Printer, Smartphone, Wallet, Receipt } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Input, ListSkeleton } from '@/components/ui'
import { Money } from '@/components/common/Money'
import { PAYMENT_METHOD_LABEL } from '@/components/common/Status'
import { useCollection, useLookups } from '@/lib/hooks'
import { localISO } from '@/lib/api'
import { exportCsv } from '@/lib/utils'
import { fmtDate, fmtTime } from '@/lib/format'

const shift = (days: number) => localISO(new Date(Date.now() + days * 86400000))

/** تقرير التحصيل اليومي (أو لأي فترة) مقسّم حسب طريقة الدفع ونوع البند */
export function DailyCollectionReport({ year }: { year: string }) {
  const [from, setFrom] = useState(shift(0))
  const [to, setTo] = useState(shift(0))
  const { data, isLoading } = useCollection(from, to)
  const { yearName } = useLookups()

  const rows = (data?.rows ?? []).filter((r) => !year || r.yearId === year)
  const total = rows.reduce((a, r) => a + Number(r.payment.amount), 0)
  const byMethod: Record<string, number> = {}
  for (const r of rows) byMethod[r.payment.method] = (byMethod[r.payment.method] || 0) + Number(r.payment.amount)
  let lessons = 0
  let booklets = 0
  for (const r of rows) {
    const allocs = r.payment.allocations || []
    const amt = Number(r.payment.amount)
    if (!allocs.length) (r.payment.source === 'booklet' ? (booklets += amt) : (lessons += amt))
    else {
      for (const a of allocs) a.kind === 'booklet' ? (booklets += a.amount) : (lessons += a.amount)
      const rest = amt - allocs.reduce((x, a) => x + a.amount, 0)
      if (rest > 0.001) lessons += rest
    }
  }

  const presets: [string, string, string][] = [
    ['اليوم', shift(0), shift(0)],
    ['أمس', shift(-1), shift(-1)],
    ['آخر 7 أيام', shift(-6), shift(0)],
    ['هذا الشهر', localISO(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), shift(0)],
  ]
  const title = from === to ? `تحصيل يوم ${fmtDate(from)}` : `التحصيل من ${fmtDate(from)} إلى ${fmtDate(to)}`

  return (
    <div className="space-y-4">
      <Card className="no-print p-3">
        <div className="flex flex-wrap items-end gap-2">
          {presets.map(([label, f, t]) => (
            <Button
              key={label}
              size="sm"
              variant={from === f && to === t ? 'primary' : 'secondary'}
              onClick={() => { setFrom(f); setTo(t) }}
            >
              {label}
            </Button>
          ))}
          <div className="flex items-center gap-1.5 text-[12px] text-ink-2">
            من <Input type="date" dir="ltr" className="h-9 w-36" value={from} onChange={(e) => setFrom(e.target.value)} />
            إلى <Input type="date" dir="ltr" className="h-9 w-36" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="mr-auto flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={rows.length === 0}
              onClick={() =>
                exportCsv(
                  rows.map((r) => ({
                    'رقم الإيصال': r.payment.receipt_no || '',
                    التاريخ: fmtDate(r.payment.paid_at),
                    الوقت: fmtTime(r.payment.paid_at),
                    الطالب: r.studentName,
                    الكود: r.studentCode,
                    الصف: r.yearId ? yearName.get(r.yearId) || '' : '',
                    المبلغ: Number(r.payment.amount),
                    الطريقة: PAYMENT_METHOD_LABEL[r.payment.method] ?? r.payment.method,
                    ملاحظات: r.payment.notes || '',
                  })),
                  `تحصيل-${from}${from !== to ? '_' + to : ''}`,
                )
              }
            >
              <Download className="size-4" /> تصدير
            </Button>
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              <Printer className="size-4" /> طباعة
            </Button>
          </div>
        </div>
      </Card>

      <div className="print-area space-y-4">
        <h2 className="text-[16px] font-extrabold text-ink">{title}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="إجمالي التحصيل" value={total} strong icon={Receipt} />
          <Stat label="كاش" value={byMethod.cash || 0} icon={Banknote} />
          <Stat label="محفظة" value={byMethod.wallet || 0} icon={Smartphone} />
          <Stat label="انستاباي وأخرى" value={(byMethod.instapay || 0) + (byMethod.bank || 0) + (byMethod.other || 0)} icon={Wallet} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="منها دروس" value={lessons} />
          <Stat label="منها مذكرات" value={booklets} />
        </div>

        <Card className="print-card">
          <CardHeader><CardTitle>الإيصالات ({rows.length})</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <ListSkeleton rows={3} />
            ) : rows.length === 0 ? (
              <EmptyState title="لا توجد مدفوعات في هذه الفترة" className="py-8" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-[12.5px]">
                  <thead>
                    <tr className="border-b border-line text-[11.5px] text-ink-2">
                      <th className="px-2 py-2 font-semibold">إيصال</th>
                      <th className="px-2 py-2 font-semibold">الوقت</th>
                      <th className="px-2 py-2 font-semibold">الطالب</th>
                      <th className="px-2 py-2 font-semibold">الطريقة</th>
                      <th className="px-2 py-2 font-semibold">المبلغ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.payment.id} className="border-b border-line last:border-0">
                        <td className="num px-2 py-2">
                          <Link to={`/receipt/${r.payment.id}`} className="text-[var(--brand)] hover:underline">
                            #{String(r.payment.receipt_no || 0).padStart(5, '0')}
                          </Link>
                        </td>
                        <td className="num whitespace-nowrap px-2 py-2 text-ink-2">
                          {from !== to ? `${fmtDate(r.payment.paid_at)} ` : ''}{fmtTime(r.payment.paid_at)}
                        </td>
                        <td className="px-2 py-2 font-semibold text-ink">{r.studentName}</td>
                        <td className="px-2 py-2 text-ink-2">{PAYMENT_METHOD_LABEL[r.payment.method] ?? r.payment.method}</td>
                        <td className={`num whitespace-nowrap px-2 py-2 font-bold ${Number(r.payment.amount) < 0 ? 'text-danger' : 'text-success'}`}>
                          <Money value={Number(r.payment.amount)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Stat({ label, value, strong, icon: Icon }: { label: string; value: number; strong?: boolean; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <Card className={`print-card p-4 ${strong ? 'border-[var(--brand)]/40 bg-[color-mix(in_oklab,var(--brand)_7%,transparent)]' : ''}`}>
      <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-2">
        {Icon && <Icon className="size-3.5" />} {label}
      </p>
      <p className={`mt-1.5 text-[19px] font-extrabold ${strong ? 'text-[var(--brand)]' : 'text-ink'}`}>
        <Money value={value} />
      </p>
    </Card>
  )
}
