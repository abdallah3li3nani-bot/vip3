import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MultiBookletOrderDialog } from './MultiBookletOrderDialog'
import {
  BookText, Plus, CheckCircle2, Clock, Wallet, Banknote, Smartphone,
  Filter, Download, Trash2, Edit3, Search, AlertCircle, Check, X,
  Users, CheckSquare, Square,
} from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/common/PageHeader'
import { SearchInput } from '@/components/common/SearchInput'
import { Money } from '@/components/common/Money'
import {
  Button, Card, Badge, Modal, Field, Input, Select, Textarea,
  EmptyState, ListSkeleton, useConfirm,
} from '@/components/ui'
import {
  useBooklets, useBookletOrders, useStudents, useLookups, useAction,
} from '@/lib/hooks'
import * as api from '@/lib/api'
import { matches, exportCsv } from '@/lib/utils'
import { fmtDate, fmtMoney } from '@/lib/format'
import type { Booklet, BookletOrder } from '@/lib/database.types'

type FilterTab = 'all' | 'not_delivered' | 'delivered_with_debt' | 'has_debt' | 'completed'

export default function BookletsPage() {
  const { data: booklets = [], isLoading: loadingBooklets } = useBooklets()
  const { data: orders = [], isLoading: loadingOrders } = useBookletOrders()
  const { data: students = [] } = useStudents()
  const { years, yearName } = useLookups()
  const confirm = useConfirm()

  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedYear, setSelectedYear] = useState('')
  const [selectedBookletFilter, setSelectedBookletFilter] = useState('')

  // التحديد المتعدد للحجوزات
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set())

  // نوافذ المودال
  const [orderModalOpen, setOrderModalOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState<BookletOrder | null>(null)
  const [catalogModalOpen, setCatalogModalOpen] = useState(false)
  const [editingBooklet, setEditingBooklet] = useState<Booklet | null>(null)
  const [bulkDistributeOpen, setBulkDistributeOpen] = useState(false)
  const [newOrderOpen, setNewOrderOpen] = useState(false)
  const [prefillStudentId, setPrefillStudentId] = useState<string | undefined>()

  // فتح الحجز مباشرة من صفحة الطالب: #/booklets?student=ID
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const sid = searchParams.get('student')
    if (sid && students.length > 0) {
      setPrefillStudentId(sid)
      setNewOrderOpen(true)
      searchParams.delete('student')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, students.length, setSearchParams])

  function openNewOrder() {
    setPrefillStudentId(undefined)
    setNewOrderOpen(true)
  }

  // قواميس سريعة للأسماء
  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students])
  const bookletMap = useMemo(() => new Map(booklets.map((b) => [b.id, b])), [booklets])

  // طفرات الحفظ والحذف
  const toggleDelivery = useAction(api.toggleBookletDelivery, {
    success: 'تم تحديث حالة التسليم بنجاح',
    invalidate: [['booklet_orders'], ['dashboard'], ['payments']],
  })

  const deleteOrder = useAction(api.deleteBookletOrder, {
    success: 'تم حذف طلب المذكرة',
    invalidate: [['booklet_orders'], ['dashboard'], ['payments']],
  })

  const deleteBooklet = useAction(api.deleteBooklet, {
    success: 'تم حذف المذكرة من الكتالوج',
    invalidate: [['booklets'], ['booklet_orders'], ['payments']],
  })

  // تصفية الطلبات
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const student = studentMap.get(o.student_id)
      const booklet = bookletMap.get(o.booklet_id)

      if (selectedYear && booklet?.year_id !== selectedYear && student?.year_id !== selectedYear) {
        return false
      }
      if (selectedBookletFilter && o.booklet_id !== selectedBookletFilter) {
        return false
      }

      if (activeTab === 'not_delivered' && o.is_delivered) return false
      if (activeTab === 'delivered_with_debt' && (!o.is_delivered || o.remaining_amount <= 0)) return false
      if (activeTab === 'has_debt' && o.remaining_amount <= 0) return false
      if (activeTab === 'completed' && (!o.is_delivered || o.remaining_amount > 0)) return false

      if (searchQuery) {
        const studentName = student?.full_name || ''
        const bookletTitle = booklet?.title || ''
        if (!matches(studentName, searchQuery) && !matches(bookletTitle, searchQuery)) {
          return false
        }
      }

      return true
    })
  }, [orders, studentMap, bookletMap, selectedYear, selectedBookletFilter, activeTab, searchQuery])

  // الحسابات المالية والإحصائيات
  const stats = useMemo(() => {
    let totalSales = 0
    let totalCollected = 0
    let totalRemaining = 0
    let pendingDeliveryCount = 0
    let deliveredWithDebtCount = 0

    let cashTotal = 0
    let walletTotal = 0
    let instapayTotal = 0

    for (const o of orders) {
      totalSales += o.price
      totalCollected += o.paid_amount
      totalRemaining += o.remaining_amount

      if (!o.is_delivered) pendingDeliveryCount++
      if (o.is_delivered && o.remaining_amount > 0) deliveredWithDebtCount++

      if (o.payment_method === 'cash') cashTotal += o.paid_amount
      else if (o.payment_method === 'wallet') walletTotal += o.paid_amount
      else if (o.payment_method === 'instapay') instapayTotal += o.paid_amount
    }

    return {
      totalSales,
      totalCollected,
      totalRemaining,
      pendingDeliveryCount,
      deliveredWithDebtCount,
      cashTotal,
      walletTotal,
      instapayTotal,
    }
  }, [orders])

  function doExport() {
    exportCsv(
      filteredOrders.map((o) => {
        const s = studentMap.get(o.student_id)
        const b = bookletMap.get(o.booklet_id)
        return {
          'اسم الطالب': s?.full_name || 'غير معروف',
          'التخصص': s?.specialization || 'عام',
          'الصف الدراسي': s?.year_id ? yearName.get(s.year_id) || '' : '',
          'اسم المذكرة': b?.title || '',
          'السعر': o.price,
          'المدفوع': o.paid_amount,
          'المتبقي': o.remaining_amount,
          'طريقة الدفع': o.payment_method === 'cash' ? 'كاش' : o.payment_method === 'wallet' ? 'محفظة' : 'انستاباي',
          'حالة التسليم': o.is_delivered ? 'تم التسليم' : 'لم يستلم بعد',
          'تاريخ التسليم': o.delivered_at ? fmtDate(o.delivered_at) : '—',
          'تاريخ الحجز': fmtDate(o.created_at),
        }
      }),
      `حجوزات-المذكرات-${new Date().toISOString().slice(0, 10)}`,
    )
  }

  // تسليم المحدد
  const bulkDeliverSelected = useAction(
    async (deliver: boolean) => {
      const ids = Array.from(selectedOrderIds)
      const count = await api.bulkDeliverBookletOrders(ids, deliver)
      setSelectedOrderIds(new Set())
      return { count, deliver }
    },
    {
      success: (data) =>
        data.deliver
          ? `تم تسليم ${data.count} مذكرة بنجاح وتسجيل المديونيات الحالية ✓`
          : `تم إلغاء تسليم ${data.count} مذكرة بنجاح`,
      invalidate: [['booklet_orders'], ['dashboard'], ['payments']],
    },
  )

  // تسليم الفلتر الحالي بالكامل (مذكرة معينة أو صف معين)
  const bulkDeliverCurrentFilter = useAction(
    async (params: { bookletId?: string; yearId?: string }) => {
      const count = await api.bulkDeliverByFilter(params)
      setSelectedOrderIds(new Set())
      return count
    },
    {
      success: (count) => `تم تسليم المذكرات لـ ${count} طالب بنجاح مع تسجيل المديونيات ✓`,
      invalidate: [['booklet_orders'], ['dashboard'], ['payments']],
    },
  )

  // دوال التحديد
  const toggleSelectOrder = (id: string) => {
    setSelectedOrderIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedOrderIds.size === filteredOrders.length && filteredOrders.length > 0) {
      setSelectedOrderIds(new Set())
    } else {
      setSelectedOrderIds(new Set(filteredOrders.map((o) => o.id)))
    }
  }

  const isAllSelected = filteredOrders.length > 0 && selectedOrderIds.size === filteredOrders.length

  // عدد غير المستلمين في الفلتر الحالي
  const undeliveredInFilter = useMemo(() => {
    return filteredOrders.filter((o) => !o.is_delivered).length
  }, [filteredOrders])

  const isLoading = loadingBooklets || loadingOrders

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="المذكرات والملازم"
        icon={BookText}
        subtitle="حجز المذكرات، تسليم لصف بالكامل، متابعة المدفوعات والديون كاش/محفظة/انستاباي"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setBulkDistributeOpen(true)}
              disabled={booklets.length === 0 || students.length === 0}
            >
              <Users className="size-4" /> توزيع مذكرة لصف كامل
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setCatalogModalOpen(true)}>
              <BookText className="size-4" /> إدارة المذكرات ({booklets.length})
            </Button>
            <Button variant="secondary" size="sm" onClick={doExport} disabled={filteredOrders.length === 0}>
              <Download className="size-4" /> تصدير
            </Button>
            <Button
              size="sm"
              onClick={openNewOrder}
              disabled={booklets.length === 0 || students.length === 0}
            >
              <Plus className="size-4" /> حجز مذكرة لطالب
            </Button>
          </div>
        }
      />

      {/* بطاقات الإحصائيات السريعة */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-[12px] font-semibold text-muted">إجمالي المبيعات</p>
          <p className="mt-1 text-xl font-extrabold text-ink">{fmtMoney(stats.totalSales)}</p>
          <p className="mt-1 text-[11px] text-muted">{orders.length} حجز مسجل</p>
        </Card>

        <Card className="p-4 border-emerald-500/20 bg-emerald-500/5">
          <p className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">إجمالي المحصّل</p>
          <p className="mt-1 text-xl font-extrabold text-emerald-700 dark:text-emerald-300">
            {fmtMoney(stats.totalCollected)}
          </p>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-muted">
            <span>كاش: {fmtMoney(stats.cashTotal)}</span>
            <span>• محفظة: {fmtMoney(stats.walletTotal)}</span>
            <span>• انستا: {fmtMoney(stats.instapayTotal)}</span>
          </div>
        </Card>

        <Card className="p-4 border-amber-500/20 bg-amber-500/5">
          <p className="text-[12px] font-semibold text-amber-600 dark:text-amber-400">متبقي (ديون الطلاب)</p>
          <p className="mt-1 text-xl font-extrabold text-amber-700 dark:text-amber-300">
            {fmtMoney(stats.totalRemaining)}
          </p>
          <p className="mt-1 text-[11px] text-amber-600/80">
            {stats.deliveredWithDebtCount} استلموا وعليهم متبقي
          </p>
        </Card>

        <Card className="p-4 border-blue-500/20 bg-blue-500/5">
          <p className="text-[12px] font-semibold text-blue-600 dark:text-blue-400">لم يستلموا بعد</p>
          <p className="mt-1 text-xl font-extrabold text-blue-700 dark:text-blue-300">
            {stats.pendingDeliveryCount} طالب
          </p>
          <p className="mt-1 text-[11px] text-blue-600/80">عدد النسخ المطلوب تجهيزها</p>
        </Card>
      </div>

      {/* شريط البحث والفلاتر */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            className="flex-1"
            placeholder="ابحث باسم الطالب أو اسم المذكرة…"
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
            value={selectedBookletFilter}
            onChange={(e) => setSelectedBookletFilter(e.target.value)}
            className="w-full sm:w-48 shrink-0"
          >
            <option value="">كل المذكرات</option>
            {booklets.map((b) => (
              <option key={b.id} value={b.id}>{b.title}</option>
            ))}
          </Select>
        </div>

        {/* تنبيه وأزرار التسليم السريع للمذكرة المحددة أو الصف المحدد */}
        {selectedBookletFilter && undeliveredInFilter > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-blue-500/30 bg-blue-500/10 p-3.5">
            <div className="flex items-center gap-2.5">
              <BookText className="size-5 text-blue-600 dark:text-blue-400 shrink-0" />
              <div>
                <p className="text-sm font-bold text-ink">
                  تسليم جماعي: يوجد {undeliveredInFilter} طالب لم يستلموا مذكرة «{bookletMap.get(selectedBookletFilter)?.title}» بعد
                </p>
                <p className="text-xs text-muted">
                  يمكنك تسليمهم جميعاً الآن، وسيظل على كل طالب دينه المتبقي مسجلاً بحسابه للدفع لاحقاً.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              loading={bulkDeliverCurrentFilter.isPending}
              onClick={() => bulkDeliverCurrentFilter.mutate({ bookletId: selectedBookletFilter })}
            >
              <CheckCircle2 className="size-4" /> تسليم الكل لهذه المذكرة ({undeliveredInFilter})
            </Button>
          </div>
        )}

        {selectedYear && !selectedBookletFilter && undeliveredInFilter > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 p-3.5">
            <div className="flex items-center gap-2.5">
              <Users className="size-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <div>
                <p className="text-sm font-bold text-ink">
                  تسليم صف كامل: يوجد {undeliveredInFilter} حجز غير مستلم في «{yearName.get(selectedYear)}»
                </p>
                <p className="text-xs text-muted">
                  تسليم جميع مذكرات طلاب هذا الصف بضغطة واحدة مع حفظ ديونهم.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              loading={bulkDeliverCurrentFilter.isPending}
              onClick={() => bulkDeliverCurrentFilter.mutate({ yearId: selectedYear })}
            >
              <CheckCircle2 className="size-4" /> تسليم كل مذكرات هذا الصف ({undeliveredInFilter})
            </Button>
          </div>
        )}

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
            الكل ({orders.length})
          </button>
          <button
            onClick={() => setActiveTab('not_delivered')}
            className={`tap rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'not_delivered'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-surface text-ink-2 hover:bg-surface-2'
            }`}
          >
            لم يستلم بعد ({stats.pendingDeliveryCount})
          </button>
          <button
            onClick={() => setActiveTab('delivered_with_debt')}
            className={`tap rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'delivered_with_debt'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-surface text-ink-2 hover:bg-surface-2'
            }`}
          >
            استلم وعليه متبقي ({stats.deliveredWithDebtCount})
          </button>
          <button
            onClick={() => setActiveTab('has_debt')}
            className={`tap rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'has_debt'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-surface text-ink-2 hover:bg-surface-2'
            }`}
          >
            عليه متبقي فلوس
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`tap rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              activeTab === 'completed'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-surface text-ink-2 hover:bg-surface-2'
            }`}
          >
            مسدد ومستلم بالكامل
          </button>
        </div>
      </div>

      {/* شريط الإجراءات المجمعة العائم عند تحديد طلبات */}
      {selectedOrderIds.size > 0 && (
        <div className="sticky top-2 z-30 flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-[var(--brand)] bg-surface p-3.5 shadow-xl animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckSquare className="size-5 text-[var(--brand)]" />
            <span className="text-sm font-extrabold text-ink">
              تم تحديد {selectedOrderIds.size} من أصل {filteredOrders.length} حجز
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              loading={bulkDeliverSelected.isPending}
              onClick={() => bulkDeliverSelected.mutate(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CheckCircle2 className="size-4" /> تسليم المحدد بالكامل ({selectedOrderIds.size})
            </Button>
            <Button
              size="sm"
              variant="secondary"
              loading={bulkDeliverSelected.isPending}
              onClick={() => bulkDeliverSelected.mutate(false)}
            >
              <Clock className="size-4" /> إلغاء التسليم للمحدد
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelectedOrderIds(new Set())}
            >
              إلغاء التحديد
            </Button>
          </div>
        </div>
      )}

      {/* شريط اختيار الكل */}
      {filteredOrders.length > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-xs">
          <label className="flex items-center gap-2 cursor-pointer select-none font-bold text-ink-2">
            <input
              type="checkbox"
              checked={isAllSelected}
              onChange={toggleSelectAll}
              className="size-4 rounded border-gray-300 text-[var(--brand)] focus:ring-[var(--brand)]"
            />
            <span>تحديد الكل ({filteredOrders.length} طلب معروض)</span>
          </label>
          <span className="text-muted">
            {selectedOrderIds.size > 0 ? `${selectedOrderIds.size} محدد` : 'اضغط المربع لتحديد طلبات معاً'}
          </span>
        </div>
      )}

      {/* قائمة حجوزات المذكرات */}
      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : booklets.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookText}
            title="أضف المذكرات الدراسية أولاً"
            description="قم بإضافة المذكرات والكتب الخاصة بكل صف دراسي مع تحديد أسعارها."
            action={
              <Button onClick={() => setCatalogModalOpen(true)}>
                <Plus className="size-4" /> إضافة مذكرة للكتالوج
              </Button>
            }
          />
        </Card>
      ) : filteredOrders.length === 0 ? (
        <Card>
          <EmptyState
            icon={BookText}
            title="لا توجد حجوزات مطابقة"
            description={orders.length === 0 ? 'لم يتم تسجيل أي حجز مذكرة بعد.' : 'جرّب تغيير خيارات البحث أو التبويب.'}
            action={
              orders.length === 0 ? (
                <Button onClick={openNewOrder}>
                  <Plus className="size-4" /> حجز أول مذكرة
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredOrders.map((order) => {
            const student = studentMap.get(order.student_id)
            const booklet = bookletMap.get(order.booklet_id)
            const isDelivered = order.is_delivered
            const hasDebt = order.remaining_amount > 0

            const isSelected = selectedOrderIds.has(order.id)

            return (
              <Card
                key={order.id}
                className={`p-4 transition-all hover:border-[var(--brand)]/40 ${
                  isSelected ? 'border-[var(--brand)] bg-[var(--brand)]/5 shadow-sm' : ''
                }`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {/* مربع التحديد ومعلومات الطالب والمذكرة */}
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleSelectOrder(order.id)}
                      className="mt-1 tap text-[var(--brand)] shrink-0"
                      title={isSelected ? 'إلغاء التحديد' : 'تحديد'}
                    >
                      {isSelected ? (
                        <CheckSquare className="size-5 text-[var(--brand)] fill-[var(--brand)]/20" />
                      ) : (
                        <Square className="size-5 text-muted hover:text-ink" />
                      )}
                    </button>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-bold text-ink">
                          {student?.full_name || 'طالب غير معروف'}
                        </span>
                      {student?.specialization && (
                        <Badge variant="secondary" className="text-[11px]">
                          {student.specialization}
                        </Badge>
                      )}
                      {student?.year_id && (
                        <Badge variant="outline" className="text-[11px]">
                          {yearName.get(student.year_id) || ''}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <span className="font-semibold text-ink-2">{booklet?.title}</span>
                      <span>•</span>
                      <span>سعر المذكرة: <span className="font-mono font-bold text-ink">{fmtMoney(order.price)}</span></span>
                      <span>•</span>
                      <span>تاريخ الحجز: {fmtDate(order.created_at)}</span>
                    </div>

                    {order.notes && (
                      <p className="text-[11px] text-muted italic">ملاحظات: {order.notes}</p>
                    )}
                  </div>
                </div>

                  {/* الجزء المالي وطريقة الدفع وحالة التسليم */}
                  <div className="flex flex-wrap items-center gap-3">
                    {/* وسيلة الدفع والمبالغ */}
                    <div className="text-left">
                      <div className="flex items-center justify-end gap-1.5">
                        <Badge
                          variant={
                            order.payment_method === 'cash'
                              ? 'default'
                              : order.payment_method === 'wallet'
                              ? 'warning'
                              : 'info'
                          }
                          className="text-[11px]"
                        >
                          {order.payment_method === 'cash' && <Banknote className="mr-1 size-3 inline" />}
                          {order.payment_method === 'wallet' && <Smartphone className="mr-1 size-3 inline" />}
                          {order.payment_method === 'instapay' && <Wallet className="mr-1 size-3 inline" />}
                          {order.payment_method === 'cash'
                            ? 'كاش'
                            : order.payment_method === 'wallet'
                            ? 'محفظة'
                            : 'انستاباي'}
                        </Badge>
                        <span className="text-xs font-semibold text-ink-2">
                          مدفوع: <span className="font-mono font-bold text-emerald-600">{fmtMoney(order.paid_amount)}</span>
                        </span>
                      </div>

                      {hasDebt ? (
                        <p className="mt-0.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                          متبقي دين: {fmtMoney(order.remaining_amount)}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-[11px] text-emerald-600">مسدد بالكامل ✓</p>
                      )}
                    </div>

                    {/* زر التسليم التفاعلي بنقرة واحدة */}
                    <button
                      onClick={() => toggleDelivery.mutate(order.id)}
                      disabled={toggleDelivery.isPending}
                      className={`tap flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
                        isDelivered
                          ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400'
                          : 'bg-blue-600 text-white shadow-sm hover:bg-blue-700'
                      }`}
                      title={isDelivered ? 'اضغط لإلغاء التسليم' : 'اضغط لإتمام التسليم'}
                    >
                      {isDelivered ? (
                        <>
                          <CheckCircle2 className="size-4" /> تم التسليم
                        </>
                      ) : (
                        <>
                          <Clock className="size-4" /> تسليم المذكرة
                        </>
                      )}
                    </button>

                    {/* أزرار التعديل والحذف */}
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingOrder(order)
                          setOrderModalOpen(true)
                        }}
                      >
                        <Edit3 className="size-4 text-muted" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={async () => {
                          const ok = await confirm({
                            title: 'حذف طلب المذكرة',
                            message: `هل أنت متأكد من حذف حجز المذكرة للطالب «${student?.full_name}»؟`,
                            confirmText: 'نعم، احذف',
                            tone: 'danger',
                          })
                          if (ok) deleteOrder.mutate(order.id)
                        }}
                      >
                        <Trash2 className="size-4 text-rose-500" />
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* مودال حجز مذكرة أو أكثر لطالب */}
      <MultiBookletOrderDialog
        open={newOrderOpen}
        onOpenChange={setNewOrderOpen}
        students={students}
        booklets={booklets}
        years={years}
        orders={orders}
        initialYearId={selectedYear || bookletMap.get(selectedBookletFilter)?.year_id || undefined}
        initialStudentId={prefillStudentId}
      />

      {/* مودال تعديل حجز */}
      <BookletOrderDialog
        open={orderModalOpen}
        onOpenChange={setOrderModalOpen}
        order={editingOrder}
        students={students}
        booklets={booklets}
        years={years}
      />

      {/* مودال إدارة كتالوج المذكرات */}
      <BookletsCatalogDialog
        open={catalogModalOpen}
        onOpenChange={setCatalogModalOpen}
        booklets={booklets}
        years={years}
        onDelete={(id) => deleteBooklet.mutate(id)}
      />

      {/* مودال توزيع وتسليم مذكرة لصف بالكامل */}
      <BulkDistributeModal
        open={bulkDistributeOpen}
        onOpenChange={setBulkDistributeOpen}
        booklets={booklets}
        years={years}
        students={students}
        orders={orders}
        initialYearId={selectedYear || undefined}
        initialBookletId={selectedBookletFilter || undefined}
      />
    </div>
  )
}

/* ========================================================================== */
/*                           مودال حجز مذكرة لطالب                           */
/* ========================================================================== */

function BookletOrderDialog({
  open,
  onOpenChange,
  order,
  students,
  booklets,
  years,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: BookletOrder | null
  students: any[]
  booklets: Booklet[]
  years: any[]
}) {
  const [studentId, setStudentId] = useState('')
  const [bookletId, setBookletId] = useState('')
  const [price, setPrice] = useState('0')
  const [paidAmount, setPaidAmount] = useState('0')
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'wallet' | 'instapay'>('cash')
  const [isDelivered, setIsDelivered] = useState(false)
  const [notes, setNotes] = useState('')
  const [studentSearch, setStudentSearch] = useState('')

  const [showAllYears, setShowAllYears] = useState(false)

  // عند فتح المودال، ملء البيانات
  useEffect(() => {
    if (!open) return
    if (order) {
      setStudentId(order.student_id)
      setBookletId(order.booklet_id)
      setPrice(String(order.price))
      setPaidAmount(String(order.paid_amount))
      setPaymentMethod(order.payment_method)
      setIsDelivered(order.is_delivered)
      setNotes(order.notes || '')
      setShowAllYears(false)
    } else {
      setStudentId('')
      setBookletId(booklets[0]?.id || '')
      setPrice(String(booklets[0]?.price || 0))
      setPaidAmount(String(booklets[0]?.price || 0))
      setPaymentMethod('cash')
      setIsDelivered(false)
      setNotes('')
      setStudentSearch('')
      setShowAllYears(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, open])

  // تحديث السعر تلقائياً عند تغيير المذكرة
  function handleBookletChange(id: string) {
    setBookletId(id)
    const b = booklets.find((item) => item.id === id)
    if (b) {
      setPrice(String(b.price))
      setPaidAmount(String(b.price)) // افتراضياً دفع كامل
    }
  }

  const selectedBooklet = booklets.find((b) => b.id === bookletId)
  const targetYearId = selectedBooklet?.year_id || ''

  // قائمة الطلاب لصف المذكرة المحدد فقط
  const gradeStudents = useMemo(() => {
    if (showAllYears || !targetYearId) return students
    return students.filter((s) => s.year_id === targetYearId)
  }, [students, targetYearId, showAllYears])

  // فلترة قائمة الطلاب للبحث السريع داخل طلاب هذا الصف
  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return gradeStudents.slice(0, 50)
    return gradeStudents
      .filter((s) => matches(s.full_name, studentSearch) || matches(s.specialization, studentSearch))
      .slice(0, 50)
  }, [gradeStudents, studentSearch])

  const remaining = Math.max(0, Number(price || 0) - Number(paidAmount || 0))

  const saveAction = useAction(api.saveBookletOrder, {
    success: order ? 'تم تعديل الحجز بنجاح' : 'تم تسجيل حجز المذكرة بنجاح',
    invalidate: [['booklet_orders'], ['dashboard'], ['payments']],
    onDone: () => onOpenChange(false),
  })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!studentId) {
      alert('يرجى اختيار الطالب')
      return
    }
    if (!bookletId) {
      alert('يرجى اختيار المذكرة')
      return
    }

    await saveAction.mutateAsync({
      ...(order ? { id: order.id } : {}),
      student_id: studentId,
      booklet_id: bookletId,
      price: Number(price || 0),
      paid_amount: Number(paidAmount || 0),
      payment_method: paymentMethod,
      is_delivered: isDelivered,
      notes: notes.trim() || null,
    })
  }

  const selectedStudent = students.find((s) => s.id === studentId)
  const targetYearName = years.find((y) => y.id === targetYearId)?.name || ''

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={order ? 'تعديل حجز مذكرة' : 'حجز مذكرة جديدة للطالب'}>
      <form onSubmit={submit} className="space-y-4">
        {/* اختيار المذكرة أولاً لتحديد الصف تلقائياً */}
        <Field label="المذكرة المراد حجزها" required>
          <Select value={bookletId} onChange={(e) => handleBookletChange(e.target.value)}>
            {booklets.map((b) => {
              const yName = years.find((y) => y.id === b.year_id)?.name
              return (
                <option key={b.id} value={b.id}>
                  {b.title} — {fmtMoney(b.price)} {yName ? `(${yName})` : ''} — {b.term}
                </option>
              )
            })}
          </Select>
        </Field>

        {/* اختيار الطالب مع بحث مخصص لصف المذكرة */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-ink">الطالب</label>
            {targetYearId && (
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className="font-semibold text-[var(--brand)]">
                  {showAllYears ? 'كل الصفوف' : `طلاب ${targetYearName}`} ({gradeStudents.length} طالب)
                </span>
                <button
                  type="button"
                  onClick={() => setShowAllYears(!showAllYears)}
                  className="tap text-muted underline hover:text-ink mr-1 text-[10px]"
                >
                  {showAllYears ? 'تصفية لصف المذكرة فقط' : 'عرض كل الصفوف'}
                </button>
              </div>
            )}
          </div>

          {selectedStudent ? (
            <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-surface-2 p-2.5">
              <div>
                <p className="text-sm font-bold text-ink">{selectedStudent.full_name}</p>
                <p className="text-xs text-muted">
                  {years.find((y) => y.id === selectedStudent.year_id)?.name || 'الصف'} • {selectedStudent.specialization || 'عام'}
                </p>
              </div>
              <Button type="button" size="sm" variant="ghost" onClick={() => setStudentId('')}>
                تغيير الطالب
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                placeholder={`ابحث بالاسم في طلاب ${!showAllYears && targetYearName ? targetYearName : 'الصف'} (${gradeStudents.length} طالب)…`}
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                autoFocus
              />
              <div className="max-h-40 overflow-y-auto rounded-xl border border-[var(--border)] bg-surface divide-y divide-[var(--border)]">
                {filteredStudents.length === 0 ? (
                  <p className="p-3 text-center text-xs text-muted">
                    {studentSearch ? 'لا يوجد طالب بهذا الاسم في هذا الصف' : 'لا يوجد طلاب مسجلون في هذا الصف'}
                  </p>
                ) : (
                  filteredStudents.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setStudentId(s.id)
                        setStudentSearch('')
                      }}
                      className="tap flex w-full items-center justify-between p-2.5 text-right hover:bg-surface-2"
                    >
                      <div>
                        <span className="text-xs font-bold text-ink block">{s.full_name}</span>
                        <span className="text-[11px] text-muted">{s.specialization || 'عام'}</span>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {years.find((y) => y.id === s.year_id)?.name || 'الصف'}
                      </Badge>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* السعر والمبلغ المدفوع والمتبقي */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="السعر الإجمالي (ج.م)" required>
            <Input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>

          <Field label="المبلغ المدفوع (ج.م)" required>
            <Input type="number" min="0" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} />
          </Field>
        </div>

        {/* أزرار سريعة لتحديد المدفوع */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPaidAmount(price)}
            className="tap rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-600 hover:bg-emerald-500/20"
          >
            دفع كامل ({fmtMoney(Number(price || 0))})
          </button>
          <button
            type="button"
            onClick={() => setPaidAmount(String(Math.round(Number(price || 0) / 2)))}
            className="tap rounded-lg bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-600 hover:bg-amber-500/20"
          >
            نصف المبلغ ({fmtMoney(Math.round(Number(price || 0) / 2))})
          </button>
          <button
            type="button"
            onClick={() => setPaidAmount('0')}
            className="tap rounded-lg bg-surface-2 px-2.5 py-1 text-xs font-bold text-muted hover:text-ink"
          >
            لم يدفع بعد (0)
          </button>
          <button
            type="button"
            onClick={() => {
              setPaidAmount('0')
              setIsDelivered(true)
            }}
            className="tap rounded-lg bg-blue-500/10 px-2.5 py-1 text-xs font-bold text-blue-600 hover:bg-blue-500/20"
          >
            استلام فوري وتأجيل الدفع (دين كامل)
          </button>
        </div>

        {/* إشعار بالمتبقي */}
        <div className="rounded-xl border border-[var(--border)] bg-surface-2 p-3 text-xs">
          <div className="flex justify-between font-semibold">
            <span>المبلغ المتبقي (دين على الطالب):</span>
            <span className={remaining > 0 ? 'font-mono font-bold text-amber-600' : 'text-emerald-600 font-bold'}>
              {fmtMoney(remaining)}
            </span>
          </div>
        </div>

        {/* وسيلة الدفع بدقة */}
        <Field label="طريقة الدفع" required>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setPaymentMethod('cash')}
              className={`tap flex flex-col items-center justify-center rounded-xl border p-2.5 text-xs font-bold transition-all ${
                paymentMethod === 'cash'
                  ? 'border-[var(--brand)] bg-brand-soft text-[var(--brand)] shadow-sm'
                  : 'border-[var(--border)] bg-surface text-ink-2 hover:bg-surface-2'
              }`}
            >
              <Banknote className="mb-1 size-5" />
              كاش نقدي
            </button>

            <button
              type="button"
              onClick={() => setPaymentMethod('wallet')}
              className={`tap flex flex-col items-center justify-center rounded-xl border p-2.5 text-xs font-bold transition-all ${
                paymentMethod === 'wallet'
                  ? 'border-amber-500 bg-amber-500/10 text-amber-600 shadow-sm'
                  : 'border-[var(--border)] bg-surface text-ink-2 hover:bg-surface-2'
              }`}
            >
              <Smartphone className="mb-1 size-5" />
              محفظة (فودافون إلخ)
            </button>

            <button
              type="button"
              onClick={() => setPaymentMethod('instapay')}
              className={`tap flex flex-col items-center justify-center rounded-xl border p-2.5 text-xs font-bold transition-all ${
                paymentMethod === 'instapay'
                  ? 'border-blue-500 bg-blue-500/10 text-blue-600 shadow-sm'
                  : 'border-[var(--border)] bg-surface text-ink-2 hover:bg-surface-2'
              }`}
            >
              <Wallet className="mb-1 size-5" />
              انستاباي (InstaPay)
            </button>
          </div>
        </Field>

        {/* حالة التسليم */}
        <label className="tap flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-surface p-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isDelivered}
            onChange={(e) => setIsDelivered(e.target.checked)}
            className="size-4 rounded accent-[var(--brand)]"
          />
          <span className="text-xs font-bold text-ink">تم تسليم المذكرة للطالب الآن</span>
        </label>

        {/* ملاحظات */}
        <Field label="ملاحظات إضافية">
          <Input placeholder="أي ملاحظات حول الحجز أو التسليم…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button type="submit" loading={saveAction.isPending}>
            {order ? 'تحديث الحجز' : 'حفظ الحجز'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/* ========================================================================== */
/*                           مودال كتالوج المذكرات                           */
/* ========================================================================== */

function BookletsCatalogDialog({
  open,
  onOpenChange,
  booklets,
  years,
  onDelete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  booklets: Booklet[]
  years: any[]
  onDelete: (id: string) => void
}) {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Booklet | null>(null)

  const [title, setTitle] = useState('')
  const [yearId, setYearId] = useState('')
  const [price, setPrice] = useState('50')
  const [term, setTerm] = useState('الترم الأول')
  const [notes, setNotes] = useState('')

  const saveBooklet = useAction(api.saveBooklet, {
    success: 'تم حفظ المذكرة بنجاح',
    invalidate: [['booklets'], ['booklet_orders'], ['payments']],
    onDone: () => setFormOpen(false),
  })

  function startCreate() {
    setEditing(null)
    setTitle('')
    setYearId(years[0]?.id || '')
    setPrice('50')
    setTerm('الترم الأول')
    setNotes('')
    setFormOpen(true)
  }

  function startEdit(b: Booklet) {
    setEditing(b)
    setTitle(b.title)
    setYearId(b.year_id)
    setPrice(String(b.price))
    setTerm(b.term)
    setNotes(b.notes || '')
    setFormOpen(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) {
      alert('اسم المذكرة مطلوب')
      return
    }
    await saveBooklet.mutateAsync({
      ...(editing ? { id: editing.id } : {}),
      title: title.trim(),
      year_id: yearId,
      price: Number(price || 0),
      term,
      notes: notes.trim() || null,
    })
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="كتالوج المذكرات والكتب">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted">إدارة المذكرات المتاحة للحجز لكل صف دراسي مع تحديد سعرها</p>
          <Button size="sm" onClick={startCreate}>
            <Plus className="size-4" /> إضافة مذكرة
          </Button>
        </div>

        {formOpen && (
          <form onSubmit={submit} className="rounded-2xl border border-[var(--brand)]/30 bg-surface-2 p-4 space-y-3">
            <h4 className="text-xs font-bold text-ink">{editing ? 'تعديل بيانات مذكرة' : 'إضافة مذكرة جديدة'}</h4>
            <Field label="اسم المذكرة" required>
              <Input placeholder="مثال: مذكرة شرح الباب الأول، ملزمة المراجعة النهائية..." value={title} onChange={(e) => setTitle(e.target.value)} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="الصف الدراسي" required>
                <Select value={yearId} onChange={(e) => setYearId(e.target.value)}>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>{y.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="سعر البيع (ج.م)" required>
                <Input type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required />
              </Field>
            </div>
            <Field label="الفصل الدراسي">
              <Select value={term} onChange={(e) => setTerm(e.target.value)}>
                <option value="الترم الأول">الترم الأول</option>
                <option value="الترم الثاني">الترم الثاني</option>
                <option value="مراجعة نهائية">مراجعة نهائية</option>
              </Select>
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="secondary" size="sm" onClick={() => setFormOpen(false)}>
                إلغاء
              </Button>
              <Button type="submit" size="sm" loading={saveBooklet.isPending}>
                حفظ
              </Button>
            </div>
          </form>
        )}

        <div className="max-h-72 overflow-y-auto space-y-2">
          {booklets.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted">لا توجد مذكرات في الكتالوج حتى الآن</p>
          ) : (
            booklets.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-surface p-3">
                <div>
                  <p className="text-xs font-bold text-ink">{b.title}</p>
                  <p className="text-[11px] text-muted">
                    {years.find((y) => y.id === b.year_id)?.name || 'عام'} • {b.term} •{' '}
                    <span className="font-mono font-bold text-[var(--brand)]">{fmtMoney(b.price)}</span>
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => startEdit(b)}>
                    <Edit3 className="size-3.5 text-muted" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onDelete(b.id)}>
                    <Trash2 className="size-3.5 text-rose-500" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  )
}

/* ========================================================================== */
/*                      مودال توزيع وتسليم مذكرة لصف بالكامل                  */
/* ========================================================================== */

function BulkDistributeModal({
  open,
  onOpenChange,
  booklets,
  years,
  students,
  orders = [],
  initialYearId,
  initialBookletId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  booklets: Booklet[]
  years: any[]
  students: any[]
  orders?: BookletOrder[]
  initialYearId?: string
  initialBookletId?: string
}) {
  const [bookletId, setBookletId] = useState(booklets[0]?.id || '')
  const [yearId, setYearId] = useState(years[0]?.id || '')
  const [onlyEnrolled, setOnlyEnrolled] = useState(false)
  const [isDelivered, setIsDelivered] = useState(true)
  const [defaultPaid, setDefaultPaid] = useState('0')
  const [studentSearch, setStudentSearch] = useState('')
  const [filterTab, setFilterTab] = useState<'all' | 'selected' | 'has_order' | 'no_order'>('all')

  // تحديد الطلاب عبر مربعات الاختيار (Checkboxes)
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set())

  // عند فتح المودال، تحديد المذكرة والصف تلقائياً
  useEffect(() => {
    if (open) {
      const preBooklet = booklets.find((b) => b.id === initialBookletId)
      const y = preBooklet?.year_id || initialYearId || booklets[0]?.year_id || years[0]?.id || ''
      setYearId(y)
      setBookletId(preBooklet?.id || booklets.find((b) => b.year_id === y)?.id || '')
      setStudentSearch('')
      setFilterTab('all')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // مذكرات الصف المختار فقط
  const yearBooklets = useMemo(() => booklets.filter((b) => b.year_id === yearId), [booklets, yearId])

  function handleYearChange(id: string) {
    setYearId(id)
    setBookletId(booklets.find((b) => b.year_id === id)?.id || '')
  }

  function handleBookletChange(id: string) {
    setBookletId(id)
  }

  const selectedBooklet = booklets.find((b) => b.id === bookletId)
  const targetYearName = years.find((y) => y.id === yearId)?.name || 'الصف'

  // خريطة الحجوزات السابقة لهذه المذكرة بالذات
  const bookletOrdersMap = useMemo(() => {
    const m = new Map<string, BookletOrder>()
    for (const o of orders) {
      if (o.booklet_id === bookletId) {
        m.set(o.student_id, o)
      }
    }
    return m
  }, [orders, bookletId])

  // قائمة جميع طلاب هذا الصف المستهدفين
  const targetStudents = useMemo(() => {
    return students.filter((s) => {
      if (s.year_id !== yearId) return false
      if (onlyEnrolled && !s.is_enrolled) return false
      return true
    })
  }, [students, yearId, onlyEnrolled])

  // عند تغيير الصف أو المذكرة، تحديد كل طلاب الصف افتراضياً
  useEffect(() => {
    setSelectedStudentIds(new Set(targetStudents.map((s) => s.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId, bookletId, onlyEnrolled, open])

  // حساب أعداد الطلاب بحسب حالة الحجز
  const stats = useMemo(() => {
    let hasOrder = 0
    let fullyPaid = 0
    let withDebt = 0
    let noOrder = 0
    let delivered = 0

    for (const s of targetStudents) {
      const ord = bookletOrdersMap.get(s.id)
      if (ord) {
        hasOrder++
        if (ord.is_delivered) delivered++
        if (ord.remaining_amount === 0) fullyPaid++
        else withDebt++
      } else {
        noOrder++
      }
    }
    return { hasOrder, fullyPaid, withDebt, noOrder, delivered }
  }, [targetStudents, bookletOrdersMap])

  // تصفية الطلاب للعرض داخل القائمة
  const displayedStudents = useMemo(() => {
    return targetStudents.filter((s) => {
      if (filterTab === 'selected' && !selectedStudentIds.has(s.id)) return false
      if (filterTab === 'has_order' && !bookletOrdersMap.has(s.id)) return false
      if (filterTab === 'no_order' && bookletOrdersMap.has(s.id)) return false

      if (studentSearch.trim()) {
        if (!matches(s.full_name, studentSearch) && !matches(s.specialization || '', studentSearch)) {
          return false
        }
      }
      return true
    })
  }, [targetStudents, filterTab, selectedStudentIds, bookletOrdersMap, studentSearch])

  // تبديل اختيار طالب محدد
  function toggleStudent(id: string) {
    const next = new Set(selectedStudentIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedStudentIds(next)
  }

  // تحديد الكل
  function selectAll() {
    setSelectedStudentIds(new Set(targetStudents.map((s) => s.id)))
  }

  // تحديد المعروضين فقط (حسب البحث/الفلتر) مع الإبقاء على المحددين
  function selectDisplayed() {
    const next = new Set(selectedStudentIds)
    for (const s of displayedStudents) next.add(s.id)
    setSelectedStudentIds(next)
  }

  // إلغاء تحديد الكل
  function deselectAll() {
    setSelectedStudentIds(new Set())
  }

  const bulkAction = useAction(api.bulkIssueBookletToYear, {
    success: (res) =>
      `تمت العملية بنجاح! تم إنشاء ${res.created} حجز جديد (دين مسجل)، وتأكيد تسليم ${res.updated} حجز قائم بنجاح ✓`,
    invalidate: [['booklet_orders'], ['dashboard'], ['payments'], ['charges']],
    onDone: () => onOpenChange(false),
  })

  // إرسال التسليم: إما للجميع أو للمحددين فقط
  async function handleDistribute(mode: 'all' | 'selected') {
    if (!bookletId || !yearId || !selectedBooklet) {
      toast.error('يرجى اختيار المذكرة والصف الدراسي')
      return
    }

    if (mode === 'selected' && selectedStudentIds.size === 0) {
      toast.error('يرجى تحديد طالب واحد على الأقل عبر مربعات الاختيار')
      return
    }

    if (targetStudents.length === 0) {
      toast.error('لا يوجد طلاب مسجلون في هذا الصف')
      return
    }

    const targetIds = mode === 'selected' ? Array.from(selectedStudentIds) : undefined

    await bulkAction.mutateAsync({
      bookletId,
      yearId,
      targetStudentIds: targetIds,
      onlyEnrolled,
      isDelivered,
      defaultPaid: Number(defaultPaid || 0),
    })
  }

  const price = selectedBooklet?.price || 0
  const paid = Number(defaultPaid || 0)
  const remainingPerStudent = Math.max(0, price - paid)

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="توزيع وتسليم مذكرة لطلاب الصف الدراسي"
      size="lg"
    >
      <div className="space-y-4">
        <p className="text-xs text-muted leading-relaxed">
          يمكنك تسليم المذكرة لجميع طلاب الصف بنقرة واحدة، أو تحديد طلاب معينين عبر التشيك بوكس:
          <strong className="text-ink block mt-0.5">
            • اللي حاجز ودفع: يتم تأكيد استلامه للمذكرة ويبقى حسابه خالصاً.
            <br />
            • اللي عليه متبقي: يتم تأكيد استلامه ويبقى المتبقي ديناً مسجلاً.
            <br />
            • اللي ما حجز: يتم إنشاء حجز جديد له فوراً وتسجيل كامل السعر كدين بحسابه.
          </strong>
        </p>

        {/* 1. اختيار المذكرة والصف */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="الصف الدراسي المستهدف" required>
            <Select value={yearId} onChange={(e) => handleYearChange(e.target.value)}>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="المذكرة المراد تسليمها" required>
            <Select value={bookletId} onChange={(e) => handleBookletChange(e.target.value)}>
              {yearBooklets.length === 0 && <option value="">لا توجد مذكرات لهذا الصف</option>}
              {yearBooklets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} — {fmtMoney(b.price)} — {b.term}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {/* 2. شريط إحصائيات سريعة للطلاب */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="rounded-xl border border-[var(--border)] bg-surface p-2 text-center">
            <span className="text-muted block text-[11px]">إجمالي طلاب الصف</span>
            <span className="font-mono font-bold text-ink text-sm">{targetStudents.length} طالب</span>
          </div>
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2 text-center">
            <span className="text-emerald-600 block text-[11px]">حاجز ومسدد كامل</span>
            <span className="font-mono font-bold text-emerald-600 text-sm">{stats.fullyPaid} طالب</span>
          </div>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-2 text-center">
            <span className="text-amber-600 block text-[11px]">حاجز وعليه متبقي</span>
            <span className="font-mono font-bold text-amber-600 text-sm">{stats.withDebt} طالب</span>
          </div>
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-2 text-center">
            <span className="text-blue-600 block text-[11px]">لم يحجز بعد (دين جديد)</span>
            <span className="font-mono font-bold text-blue-600 text-sm">{stats.noOrder} طالب</span>
          </div>
        </div>

        {/* 3. قائمة طلاب الصف مع مربعات الاختيار وفلاتر سريعة */}
        <div className="rounded-2xl border border-[var(--border)] bg-surface-2 p-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-ink">
                قائمة طلاب {targetYearName} ({targetStudents.length})
              </span>
              <Badge variant="outline" className="text-[11px] font-mono">
                محدد: {selectedStudentIds.size}
              </Badge>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={selectAll}
                className="tap font-bold text-[var(--brand)] hover:underline text-[11px]"
              >
                تحديد الكل ({targetStudents.length})
              </button>
              {displayedStudents.length !== targetStudents.length && (
                <>
                  <span className="text-muted">•</span>
                  <button
                    type="button"
                    onClick={selectDisplayed}
                    className="tap font-bold text-[var(--brand)] hover:underline text-[11px]"
                  >
                    تحديد المعروضين ({displayedStudents.length})
                  </button>
                </>
              )}
              <span className="text-muted">•</span>
              <button
                type="button"
                onClick={deselectAll}
                className="tap font-bold text-muted hover:text-ink text-[11px]"
              >
                إلغاء التحديد
              </button>
            </div>
          </div>

          {/* تبويبات الفلترة والبحث السريع */}
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder={`ابحث بالاسم في طلاب ${targetYearName}…`}
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              className="text-xs h-8 flex-1"
            />

            <div className="flex flex-wrap gap-1 text-[11px]">
              <button
                type="button"
                onClick={() => setFilterTab('all')}
                className={`tap rounded-lg px-2 py-1 font-semibold ${
                  filterTab === 'all' ? 'bg-[var(--brand)] text-white' : 'bg-surface text-ink-2'
                }`}
              >
                الكل ({targetStudents.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('selected')}
                className={`tap rounded-lg px-2 py-1 font-semibold ${
                  filterTab === 'selected' ? 'bg-[var(--brand)] text-white' : 'bg-surface text-ink-2'
                }`}
              >
                المحددون ({selectedStudentIds.size})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('no_order')}
                className={`tap rounded-lg px-2 py-1 font-semibold ${
                  filterTab === 'no_order' ? 'bg-[var(--brand)] text-white' : 'bg-surface text-ink-2'
                }`}
              >
                لم يحجزوا ({stats.noOrder})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('has_order')}
                className={`tap rounded-lg px-2 py-1 font-semibold ${
                  filterTab === 'has_order' ? 'bg-[var(--brand)] text-white' : 'bg-surface text-ink-2'
                }`}
              >
                حاجزين ({stats.hasOrder})
              </button>
            </div>
          </div>

          {/* قائمة الطلاب القابلة للتمرير */}
          <div className="max-h-56 overflow-y-auto rounded-xl border border-[var(--border)] bg-surface divide-y divide-[var(--border)]">
            {displayedStudents.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted">لا يوجد طلاب مطابقين للبحث أو الفلتر</p>
            ) : (
              displayedStudents.map((s) => {
                const isChecked = selectedStudentIds.has(s.id)
                const ord = bookletOrdersMap.get(s.id)

                return (
                  <div
                    key={s.id}
                    onClick={() => toggleStudent(s.id)}
                    className={`tap flex items-center justify-between p-2.5 text-xs cursor-pointer hover:bg-surface-2 transition-all ${
                      isChecked ? 'bg-[var(--brand)]/5' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {isChecked ? (
                        <CheckSquare className="size-4 text-[var(--brand)] shrink-0" />
                      ) : (
                        <Square className="size-4 text-muted shrink-0" />
                      )}

                      <div className="min-w-0">
                        <p className="font-bold text-ink truncate">{s.full_name}</p>
                        <p className="text-[10px] text-muted">{s.specialization || 'عام'}</p>
                      </div>
                    </div>

                    <div className="shrink-0 text-left flex flex-col items-end gap-1">
                      {ord?.is_delivered && (
                        <span className="text-[10px] font-bold text-emerald-600">مستلم ✓</span>
                      )}
                      {ord ? (
                        ord.remaining_amount === 0 ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                            <Check className="size-3" /> مسدد كامل ({fmtMoney(ord.paid_amount)})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full">
                            دفع {fmtMoney(ord.paid_amount)} • متبقي {fmtMoney(ord.remaining_amount)}
                          </span>
                        )
                      ) : (
                        <span className="text-[10px] font-semibold text-blue-600 bg-blue-500/10 px-2 py-0.5 rounded-full">
                          لم يحجز (سيُسجّل دين {fmtMoney(price)})
                        </span>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* 4. خيارات التسليم والدفع */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* حالة التسليم الفوري */}
          <label className="tap flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-surface p-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isDelivered}
              onChange={(e) => setIsDelivered(e.target.checked)}
              className="size-4 rounded accent-[var(--brand)]"
            />
            <div>
              <span className="text-xs font-bold text-ink">تعليم "تم التسليم" فوراً</span>
              <p className="text-[11px] text-muted">
                استلموا المذكرات وتُسجل كمديونية بحسابهم.
              </p>
            </div>
          </label>

          {/* المبلغ المسدد مقدماً للطلاب الجدد */}
          <div className="space-y-1">
            <Field label="المبلغ المدفوع كاش الآن (ج.م)">
              <Input
                type="number"
                min="0"
                value={defaultPaid}
                onChange={(e) => setDefaultPaid(e.target.value)}
              />
            </Field>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => setDefaultPaid('0')}
                className="tap rounded-lg bg-surface-2 px-2 py-0.5 text-[10px] font-bold text-ink-2 hover:bg-[var(--border)]"
              >
                0 (تأجيل الدفع كدين كامل)
              </button>
              <button
                type="button"
                onClick={() => setDefaultPaid(String(price))}
                className="tap rounded-lg bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 hover:bg-emerald-500/20"
              >
                دفع كامل ({fmtMoney(price)})
              </button>
            </div>
          </div>
        </div>

        {/* 5. زرا التأكيد: تسليم الكل vs تسليم المحددين */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>

          <div className="flex flex-wrap gap-2">
            {/* زر تسليم المحددين فقط */}
            <Button
              type="button"
              variant="secondary"
              loading={bulkAction.isPending}
              disabled={selectedStudentIds.size === 0}
              onClick={() => handleDistribute('selected')}
              className="text-xs font-bold"
            >
              تسليم المحددين فقط ({selectedStudentIds.size} طالب)
            </Button>

            {/* زر تسليم الكل للصف كاملاً */}
            <Button
              type="button"
              loading={bulkAction.isPending}
              disabled={targetStudents.length === 0}
              onClick={() => handleDistribute('all')}
              className="text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white"
            >
              تسليم الكل لجميع طلاب الصف ({targetStudents.length} طالب)
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
