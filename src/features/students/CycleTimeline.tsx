import { useMemo } from 'react'
import { CalendarRange, CheckCircle2, CircleDot } from 'lucide-react'
import { Badge, Card, EmptyState } from '@/components/ui'
import { Money } from '@/components/common/Money'
import { buildCycleSummaries } from '@/lib/cycles'
import { fmtDate, fmtDateShort } from '@/lib/format'
import type { Attendance, Charge, ClassSession, Cycle, Subject } from '@/lib/database.types'

/** ملخص كل شهر (دورة حصص) للطالب: بدأ امتى، انتهى امتى، الحصص اللي اتحسبت، والدفع */
export function CycleTimeline(props: {
  cycles: Cycle[]
  attendance: Attendance[]
  sessions: ClassSession[]
  charges: Charge[]
  subjects: Subject[]
  absenceCounts: boolean
}) {
  const rows = useMemo(() => buildCycleSummaries(props), [props])
  const bySubject = useMemo(() => {
    const m = new Map<string, typeof rows>()
    for (const r of rows) {
      const k = r.subject?.name || 'مادة'
      m.set(k, [...(m.get(k) || []), r])
    }
    return [...m.entries()]
  }, [rows])

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState icon={CalendarRange} title="لسه مفيش شهور" description="أول ما الطالب يتسجل في مادة ويحضر حصص، هيظهر هنا ملخص كل شهر." />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {bySubject.map(([name, list]) => (
        <div key={name} className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
            <span className="size-2.5 rounded-full" style={{ background: list[0].subject?.color || 'var(--brand)' }} />
            {name}
            <span className="text-[11.5px] font-normal text-muted">({list.length} شهر)</span>
          </h3>
          <div className="space-y-2">
            {list.map((r) => {
              const done = r.cycle.status === 'completed'
              const pct = Math.round((Math.min(r.cycle.sessions_done, r.cycle.sessions_target) / r.cycle.sessions_target) * 100)
              return (
                <Card key={r.cycle.id} className={`p-3.5 ${done ? '' : 'border-[var(--brand)]/40'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {done ? <CheckCircle2 className="size-4 text-success" /> : <CircleDot className="size-4 text-[var(--brand)]" />}
                      <span className="text-[14px] font-extrabold text-ink">الشهر {r.cycle.cycle_index}</span>
                      <Badge tone={done ? 'success' : 'brand'} className="text-[10.5px]">
                        {done ? 'انتهى' : 'جاري'} • {r.cycle.sessions_done}/{r.cycle.sessions_target} حصص
                      </Badge>
                    </div>
                    {r.charge ? (
                      r.remaining > 0 ? (
                        <Badge tone="danger" className="text-[10.5px]">
                          متبقي <Money value={r.remaining} />
                        </Badge>
                      ) : (
                        <Badge tone="success" className="text-[10.5px]">مدفوع <Money value={r.paid} /></Badge>
                      )
                    ) : (
                      <Badge tone="neutral" className="text-[10.5px]">الرسوم تتسجل عند انتهاء الشهر</Badge>
                    )}
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
                    <div className="rounded-lg bg-surface-2 p-2">
                      <p className="text-muted">بدأ</p>
                      <p className="num font-bold text-ink">{r.startedAt ? fmtDate(r.startedAt) : 'لسه ما حضرش حصص'}</p>
                    </div>
                    <div className="rounded-lg bg-surface-2 p-2">
                      <p className="text-muted">انتهى</p>
                      <p className="num font-bold text-ink">{r.endedAt ? fmtDate(r.endedAt) : done ? '—' : 'لسه مستمر'}</p>
                    </div>
                  </div>

                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className={`h-full rounded-full ${done ? 'bg-success' : 'bg-[var(--brand)]'}`} style={{ width: `${pct}%` }} />
                  </div>

                  {r.sessions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {r.sessions.map((s, i) => (
                        <span key={i} className="num rounded-md bg-surface-2 px-1.5 py-0.5 text-[10.5px] text-ink-2">
                          {i + 1}: {fmtDateShort(s.date)}{s.status === 'late' ? ' (متأخر)' : s.status === 'absent' ? ' (غائب)' : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </Card>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
