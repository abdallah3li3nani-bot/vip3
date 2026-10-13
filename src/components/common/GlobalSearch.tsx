import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GraduationCap, Phone, Hash } from 'lucide-react'
import { Modal, Avatar, Badge } from '@/components/ui'
import { SearchInput } from './SearchInput'
import { useStudents, useLookups, useBalances } from '@/lib/hooks'
import { matches } from '@/lib/utils'
import { Money } from './Money'

export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [q, setQ] = useState('')
  const { data: students = [] } = useStudents()
  const { yearName, groupName } = useLookups()
  const { balances } = useBalances()
  const nav = useNavigate()

  const results = useMemo(() => {
    if (!q.trim()) return students.slice(0, 8)
    return students
      .filter((s) => matches(s.full_name, q) || matches(s.code, q) || matches(s.phone, q) || matches(s.guardian_phone, q))
      .slice(0, 30)
  }, [students, q])

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="بحث سريع" description="بالاسم أو كود الطالب أو رقم الهاتف" size="md">
      <SearchInput value={q} onChange={setQ} autoFocus placeholder="اكتب اسم الطالب أو كوده…" />
      <div className="mt-3 space-y-1.5">
        {results.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-muted">لا توجد نتائج مطابقة</p>
        ) : (
          results.map((s) => {
            const bal = balances.get(s.id)
            return (
              <button
                key={s.id}
                onClick={() => {
                  onOpenChange(false)
                  setQ('')
                  nav(`/students/${s.id}`)
                }}
                className="tap flex w-full items-center gap-3 rounded-xl p-2.5 text-right transition hover:bg-surface-2"
              >
                <Avatar name={s.full_name} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold text-ink">{s.full_name}</p>
                  <p className="flex items-center gap-2 truncate text-[11.5px] text-muted">
                    <span className="num inline-flex items-center gap-1"><Hash className="size-3" />{s.code}</span>
                    {s.year_id && <span className="inline-flex items-center gap-1"><GraduationCap className="size-3" />{yearName.get(s.year_id)}</span>}
                    {s.group_id && <span>{groupName.get(s.group_id)}</span>}
                    {s.phone && <span className="num inline-flex items-center gap-1"><Phone className="size-3" />{s.phone}</span>}
                  </p>
                </div>
                {bal && bal.outstanding > 0 ? (
                  <Badge tone="danger"><Money value={bal.outstanding} /></Badge>
                ) : (
                  <Badge tone="success">خالص</Badge>
                )}
              </button>
            )
          })
        )}
      </div>
    </Modal>
  )
}
