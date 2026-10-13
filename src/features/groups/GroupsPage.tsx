import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeftRight, GraduationCap, Layers, MoreVertical, Pencil, Plus, Trash2, Users,
} from 'lucide-react'
import { PageHeader } from '@/components/common/PageHeader'
import {
  Avatar, Badge, Button, Card, CardContent, CardHeader, CardTitle, Dropdown, DropdownContent,
  DropdownItem, DropdownTrigger, EmptyState, Field, Input, ListSkeleton, Modal, Select,
  Switch, Textarea, useConfirm,
} from '@/components/ui'
import { useAction, useLookups, useStudents } from '@/lib/hooks'
import * as api from '@/lib/api'
import type { AcademicYear, Group } from '@/lib/database.types'

export default function GroupsPage() {
  const { years, groups, isLoading, yearName } = useLookups()
  const { data: students = [] } = useStudents()
  const confirm = useConfirm()

  const [yearOpen, setYearOpen] = useState(false)
  const [groupOpen, setGroupOpen] = useState(false)
  const [editYear, setEditYear] = useState<AcademicYear | null>(null)
  const [editGroup, setEditGroup] = useState<Group | null>(null)
  const [moveFor, setMoveFor] = useState<Group | null>(null)

  const counts = useMemo(() => {
    const g = new Map<string, number>()
    const y = new Map<string, number>()
    for (const s of students) {
      if (s.group_id) g.set(s.group_id, (g.get(s.group_id) ?? 0) + 1)
      if (s.year_id) y.set(s.year_id, (y.get(s.year_id) ?? 0) + 1)
    }
    return { g, y }
  }, [students])

  const delYear = useAction(api.deleteYear, { success: 'تم حذف السنة', invalidate: [['years'], ['groups'], ['subjects'], ['students']] })
  const delGroup = useAction(api.deleteGroup, { success: 'تم حذف المجموعة', invalidate: [['groups'], ['students']] })

  return (
    <div>
      <PageHeader
        title="السنوات والمجموعات"
        icon={Layers}
        subtitle="نظّم طلابك في سنوات دراسية ومجموعات"
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => { setEditYear(null); setYearOpen(true) }}>
              <Plus className="size-4" /> سنة دراسية
            </Button>
            <Button size="sm" onClick={() => { setEditGroup(null); setGroupOpen(true) }} disabled={!years.length}>
              <Plus className="size-4" /> مجموعة
            </Button>
          </>
        }
      />

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : years.length === 0 ? (
        <Card>
          <EmptyState
            icon={GraduationCap}
            title="لسه مفيش سنوات دراسية"
            description="ابدأ بإضافة السنوات (الصف الأول، الثاني، الثالث…) ثم المجموعات والمواد."
            action={<Button onClick={() => { setEditYear(null); setYearOpen(true) }}><Plus className="size-4" /> إضافة سنة دراسية</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {years.map((y) => {
            const yGroups = groups.filter((g) => g.year_id === y.id)
            return (
              <Card key={y.id} className="animate-fade-up">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--brand)_12%,transparent)] text-[var(--brand)]">
                      <GraduationCap className="size-5" />
                    </span>
                    <div>
                      <CardTitle>{y.name}</CardTitle>
                      <p className="num text-[12px] text-muted">
                        {counts.y.get(y.id) ?? 0} طالب · {yGroups.length} مجموعة
                      </p>
                    </div>
                    {!y.is_active && <Badge tone="warning">غير مفعّلة</Badge>}
                  </div>
                  <Dropdown>
                    <DropdownTrigger asChild>
                      <Button variant="ghost" size="iconSm" aria-label="خيارات"><MoreVertical className="size-4" /></Button>
                    </DropdownTrigger>
                    <DropdownContent>
                      <DropdownItem onSelect={() => { setEditYear(y); setYearOpen(true) }}><Pencil className="size-4" /> تعديل</DropdownItem>
                      <DropdownItem onSelect={() => { setEditGroup({ year_id: y.id } as Group); setGroupOpen(true) }}>
                        <Plus className="size-4" /> إضافة مجموعة
                      </DropdownItem>
                      <DropdownItem
                        danger
                        onSelect={() =>
                          confirm({
                            title: 'حذف السنة الدراسية',
                            message: `سيتم حذف «${y.name}» وكل مجموعاتها وموادها. الطلاب لن يُحذفوا لكن سيفقدون ارتباطهم بها.`,
                            onConfirm: () => delYear.mutateAsync(y.id),
                          })
                        }
                      >
                        <Trash2 className="size-4" /> حذف السنة
                      </DropdownItem>
                    </DropdownContent>
                  </Dropdown>
                </CardHeader>
                <CardContent>
                  {yGroups.length === 0 ? (
                    <button
                      onClick={() => { setEditGroup({ year_id: y.id } as Group); setGroupOpen(true) }}
                      className="tap w-full rounded-xl border border-dashed border-line-strong py-5 text-[13px] font-semibold text-muted transition hover:border-[var(--brand)] hover:text-[var(--brand)]"
                    >
                      <Plus className="ml-1 inline size-4" /> إضافة أول مجموعة لهذه السنة
                    </button>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {yGroups.map((g) => (
                        <div key={g.id} className="rounded-xl border border-line p-3">
                          <div className="flex items-start gap-2">
                            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2">
                              <Users className="size-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13.5px] font-bold text-ink">{g.name}</p>
                              <p className="num text-[11.5px] text-muted">{counts.g.get(g.id) ?? 0} طالب</p>
                            </div>
                            <Dropdown>
                              <DropdownTrigger asChild>
                                <Button variant="ghost" size="iconSm" aria-label="خيارات"><MoreVertical className="size-3.5" /></Button>
                              </DropdownTrigger>
                              <DropdownContent>
                                <DropdownItem asChild>
                                  <Link to={`/students?group=${g.id}`}>عرض الطلاب</Link>
                                </DropdownItem>
                                <DropdownItem onSelect={() => { setEditGroup(g); setGroupOpen(true) }}>
                                  <Pencil className="size-4" /> تعديل
                                </DropdownItem>
                                <DropdownItem onSelect={() => setMoveFor(g)}>
                                  <ArrowLeftRight className="size-4" /> نقل طلاب
                                </DropdownItem>
                                <DropdownItem
                                  danger
                                  onSelect={() =>
                                    confirm({
                                      title: 'حذف المجموعة',
                                      message: `سيتم حذف «${g.name}». الطلاب سيبقون لكن بدون مجموعة.`,
                                      onConfirm: () => delGroup.mutateAsync(g.id),
                                    })
                                  }
                                >
                                  <Trash2 className="size-4" /> حذف
                                </DropdownItem>
                              </DropdownContent>
                            </Dropdown>
                          </div>
                          <div className="mt-2 flex -space-x-2 space-x-reverse">
                            {students.filter((s) => s.group_id === g.id).slice(0, 6).map((s) => (
                              <Avatar key={s.id} name={s.full_name} size={26} className="ring-2 ring-[var(--surface)]" />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <YearForm open={yearOpen} onOpenChange={setYearOpen} year={editYear} count={years.length} />
      <GroupForm open={groupOpen} onOpenChange={setGroupOpen} group={editGroup} />
      <MoveStudents group={moveFor} onClose={() => setMoveFor(null)} />
    </div>
  )
}

/* ------------------------------- نموذج السنة ------------------------------- */
function YearForm({ open, onOpenChange, year, count }: { open: boolean; onOpenChange: (v: boolean) => void; year: AcademicYear | null; count: number }) {
  const [name, setName] = useState('')
  const [active, setActive] = useState(true)

  useEffect(() => {
    if (!open) return
    setName(year?.name ?? '')
    setActive(year?.is_active ?? true)
  }, [open, year])

  const save = useAction(
    async () => {
      if (!name.trim()) throw new Error('اسم السنة مطلوب')
      return api.saveYear({
        ...(year?.id ? { id: year.id } : {}),
        name: name.trim(),
        is_active: active,
        sort_order: year?.sort_order ?? count + 1,
      })
    },
    { success: 'تم الحفظ ✓', invalidate: [['years']], onDone: () => onOpenChange(false) },
  )

  return (
    <Modal
      open={open} onOpenChange={onOpenChange} size="sm"
      title={year?.id ? 'تعديل السنة الدراسية' : 'سنة دراسية جديدة'}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={() => save.mutate(undefined as never)} loading={save.isPending}>حفظ</Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="اسم السنة" required hint="مثال: الصف الثالث">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="الصف الثالث" />
        </Field>
        <label className="flex items-center justify-between rounded-xl bg-surface-2 p-3">
          <span className="text-[13px] font-semibold text-ink">السنة مفعّلة</span>
          <Switch checked={active} onCheckedChange={setActive} />
        </label>
      </div>
    </Modal>
  )
}

/* ------------------------------ نموذج المجموعة ------------------------------ */
function GroupForm({ open, onOpenChange, group }: { open: boolean; onOpenChange: (v: boolean) => void; group: Group | null }) {
  const { years } = useLookups()
  const [form, setForm] = useState({ name: '', year_id: '', notes: '' })

  useEffect(() => {
    if (!open) return
    setForm({ name: group?.name ?? '', year_id: group?.year_id ?? years[0]?.id ?? '', notes: group?.notes ?? '' })
  }, [open, group, years])

  const save = useAction(
    async () => {
      if (!form.name.trim()) throw new Error('اسم المجموعة مطلوب')
      if (!form.year_id) throw new Error('اختر السنة الدراسية')
      return api.saveGroup({
        ...(group?.id ? { id: group.id } : {}),
        name: form.name.trim(), year_id: form.year_id, notes: form.notes.trim() || null,
      })
    },
    { success: 'تم الحفظ ✓', invalidate: [['groups']], onDone: () => onOpenChange(false) },
  )

  return (
    <Modal
      open={open} onOpenChange={onOpenChange} size="sm"
      title={group?.id ? 'تعديل المجموعة' : 'مجموعة جديدة'}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button onClick={() => save.mutate(undefined as never)} loading={save.isPending}>حفظ</Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="اسم المجموعة" required hint="مثال: مجموعة 1">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مجموعة 1" />
        </Field>
        <Field label="السنة الدراسية" required>
          <Select value={form.year_id} onChange={(e) => setForm({ ...form, year_id: e.target.value })}>
            <option value="">— اختر —</option>
            {years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
          </Select>
        </Field>
        <Field label="ملاحظات">
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="مواعيد المجموعة مثلًا…" />
        </Field>
      </div>
    </Modal>
  )
}

/* ------------------------------- نقل الطلاب ------------------------------- */
function MoveStudents({ group, onClose }: { group: Group | null; onClose: () => void }) {
  const { data: students = [] } = useStudents()
  const { groups, yearName } = useLookups()
  const [target, setTarget] = useState('')
  const [picked, setPicked] = useState<string[]>([])

  useEffect(() => {
    setPicked([])
    setTarget('')
  }, [group])

  const members = useMemo(() => students.filter((s) => s.group_id === group?.id), [students, group])

  const move = useAction(
    async () => {
      if (!target) throw new Error('اختر المجموعة الهدف')
      if (!picked.length) throw new Error('اختر طالبًا واحدًا على الأقل')
      const g = groups.find((x) => x.id === target)
      for (const id of picked) {
        await api.saveStudent({ id, group_id: target, year_id: g?.year_id } as never)
      }
    },
    { success: 'تم نقل الطلاب ✓', invalidate: [['students']], onDone: onClose },
  )

  return (
    <Modal
      open={!!group} onOpenChange={(v) => !v && onClose()}
      title="نقل طلاب إلى مجموعة أخرى"
      description={group?.name}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>إلغاء</Button>
          <Button onClick={() => move.mutate(undefined as never)} loading={move.isPending}>
            نقل {picked.length} طالب
          </Button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="المجموعة الهدف" required>
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">— اختر —</option>
            {groups.filter((g) => g.id !== group?.id).map((g) => (
              <option key={g.id} value={g.id}>{g.name} — {yearName.get(g.year_id)}</option>
            ))}
          </Select>
        </Field>
        {members.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">لا يوجد طلاب في هذه المجموعة</p>
        ) : (
          <>
            <button
              className="text-[12.5px] font-semibold text-[var(--brand)]"
              onClick={() => setPicked(picked.length === members.length ? [] : members.map((m) => m.id))}
            >
              {picked.length === members.length ? 'إلغاء تحديد الكل' : 'تحديد الكل'}
            </button>
            <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
              {members.map((s) => (
                <label key={s.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg p-2 hover:bg-surface-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--brand)]"
                    checked={picked.includes(s.id)}
                    onChange={() => setPicked(picked.includes(s.id) ? picked.filter((x) => x !== s.id) : [...picked, s.id])}
                  />
                  <span className="text-[13px] font-medium text-ink">{s.full_name}</span>
                  <span className="num mr-auto text-[11px] text-muted">{s.code}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
