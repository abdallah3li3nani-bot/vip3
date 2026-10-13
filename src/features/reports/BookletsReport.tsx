import { useMemo } from 'react'
import { Download, Printer } from 'lucide-react'
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components/ui'
import { Money } from '@/components/common/Money'
import { useBooklets, useBookletOrders, useLookups, useStudents } from '@/lib/hooks'
import { exportCsv } from '@/lib/utils'
import { fmtNumber } from '@/lib/format'

/** تقرير المذكرات لكل صف: كام نسخة محجوزة، اتسلّم كام، فاضل كام، والفلوس */
export function BookletsReport({ year }: { year: string }) {
  const { data: booklets = [] } = useBooklets()
  const { data: orders = [] } = useBookletOrders()
  const { data: students = [] } = useStudents()
  const { years } = useLookups()

  const groups = useMemo(() => {
    return years
      .filter((y) => !year || y.id === year)
      .map((y) => {
        const gradeStudents = students.filter((s) => s.year_id === y.id && s.status === 'active').length
        const rows = booklets
          .filter((b) => b.year_id === y.id)
          .map((b) => {
            const os = orders.filter((o) => o.booklet_id === b.id)
            const delivered = os.filter((o) => o.is_delivered).length
            return {
              id: b.id,
              title: b.title,
              term: b.term,
              price: b.price,
              booked: os.length,
              delivered,
              pending: os.length - delivered,
              notBooked: Math.max(0, gradeStudents - os.length),
              sales: os.reduce((a, o) => a + o.price, 0),
              paid: os.reduce((a, o) => a + o.paid_amount, 0),
              remaining: os.reduce((a, o) => a + o.remaining_amount, 0),
              debtors: os.filter((o) => o.remaining_amount > 0).length,
            }
          })
        return { year: y, gradeStudents, rows }
      })
      .filter((g) => g.rows.length > 0)
  }, [years, year, booklets, orders, students])

  function doExport() {
    exportCsv(
      groups.flatMap((g) =>
        g.rows.map((r) => ({
          الصف: g.year.name,
          المذكرة: r.title,
          الترم: r.term,
          السعر: r.price,
          'محجوز': r.booked,
          'اتسلّم': r.delivered,
          'لسه ما استلمش': r.pending,
          'لم يحجز من الصف': r.notBooked,
          'إجمالي المبيعات': r.sales,
          'المحصّل': r.paid,
          'المتبقي': r.remaining,
        })),
      ),
      `تقرير-المذكرات-${new Date().toISOString().slice(0, 10)}`,
    )
  }

  if (groups.length === 0) {
    return (
      <Card>
        <EmptyState title="لا توجد مذكرات مسجّلة" description="أضف المذكرات من صفحة المذكرات لتظهر هنا." />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="no-print flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={doExport}><Download className="size-4" /> تصدير</Button>
        <Button size="sm" variant="secondary" onClick={() => window.print()}><Printer className="size-4" /> طباعة</Button>
      </div>
      <div className="print-area space-y-4">
        {groups.map((g) => {
          const t = g.rows.reduce(
            (a, r) => ({ pending: a.pending + r.pending, paid: a.paid + r.paid, remaining: a.remaining + r.remaining }),
            { pending: 0, paid: 0, remaining: 0 },
          )
          return (
            <Card key={g.year.id} className="print-card">
              <CardHeader>
                <CardTitle>
                  {g.year.name} <span className="text-[12px] font-medium text-muted">({fmtNumber(g.gradeStudents)} طالب نشط)</span>
                </CardTitle>
                <div className="flex flex-wrap gap-3 text-[12px]">
                  <span className="font-bold text-info">نسخ مطلوب تسليمها: {fmtNumber(t.pending)}</span>
                  <span className="font-bold text-success">محصّل: <Money value={t.paid} /></span>
                  <span className="font-bold text-danger">متبقي: <Money value={t.remaining} /></span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-[12.5px]">
                    <thead>
                      <tr className="border-b border-line text-[11.5px] text-ink-2">
                        <th className="px-2 py-2 font-semibold">المذكرة</th>
                        <th className="px-2 py-2 font-semibold">السعر</th>
                        <th className="px-2 py-2 font-semibold">محجوز</th>
                        <th className="px-2 py-2 font-semibold">اتسلّم</th>
                        <th className="px-2 py-2 font-semibold">لسه</th>
                        <th className="px-2 py-2 font-semibold">ما حجزش</th>
                        <th className="px-2 py-2 font-semibold">محصّل</th>
                        <th className="px-2 py-2 font-semibold">متبقي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((r) => (
                        <tr key={r.id} className="border-b border-line last:border-0">
                          <td className="px-2 py-2.5">
                            <p className="font-bold text-ink">{r.title}</p>
                            <p className="text-[11px] text-muted">{r.term}</p>
                          </td>
                          <td className="num px-2 py-2.5"><Money value={r.price} /></td>
                          <td className="num px-2 py-2.5 font-bold">{r.booked}</td>
                          <td className="num px-2 py-2.5 text-success">{r.delivered}</td>
                          <td className={`num px-2 py-2.5 ${r.pending > 0 ? 'font-bold text-info' : 'text-muted'}`}>{r.pending}</td>
                          <td className="num px-2 py-2.5 text-muted">{r.notBooked}</td>
                          <td className="num px-2 py-2.5 text-success"><Money value={r.paid} /></td>
                          <td className={`num px-2 py-2.5 ${r.remaining > 0 ? 'font-bold text-danger' : 'text-muted'}`}>
                            <Money value={r.remaining} />
                            {r.debtors > 0 && <span className="block text-[10.5px] font-normal text-muted">{r.debtors} طالب</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
