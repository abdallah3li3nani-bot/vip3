import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday, parseISO } from 'date-fns'
import { ar } from 'date-fns/locale'

export const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
export const AR_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

export function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null
  if (v instanceof Date) return v
  const d = v.length <= 10 ? parseISO(`${v}T00:00:00`) : parseISO(v)
  return isNaN(d.getTime()) ? null : d
}

export function fmtDate(v: string | Date | null | undefined) {
  const d = toDate(v)
  if (!d) return '—'
  return `${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function fmtDateShort(v: string | Date | null | undefined) {
  const d = toDate(v)
  if (!d) return '—'
  return format(d, 'yyyy/MM/dd')
}

export function fmtDayName(v: string | Date | null | undefined) {
  const d = toDate(v)
  return d ? AR_DAYS[d.getDay()] : '—'
}

export function fmtDateTime(v: string | Date | null | undefined) {
  const d = toDate(v)
  if (!d) return '—'
  return `${fmtDate(d)} — ${fmtTime(d)}`
}

export function fmtTime(v: string | Date | null | undefined) {
  if (!v) return '—'
  if (typeof v === 'string' && /^\d{2}:\d{2}/.test(v)) {
    const [h, m] = v.split(':').map(Number)
    const period = h < 12 ? 'ص' : 'م'
    const hh = h % 12 === 0 ? 12 : h % 12
    return `${hh}:${String(m).padStart(2, '0')} ${period}`
  }
  const d = toDate(v)
  return d ? format(d, 'hh:mm a').replace('AM', 'ص').replace('PM', 'م') : '—'
}

export function fmtRelative(v: string | Date | null | undefined) {
  const d = toDate(v)
  if (!d) return '—'
  if (isToday(d)) return 'اليوم'
  if (isTomorrow(d)) return 'غدًا'
  if (isYesterday(d)) return 'أمس'
  return `منذ ${formatDistanceToNowStrict(d, { locale: ar })}`
}

export function fmtNumber(n: number | null | undefined, digits = 0) {
  const v = Number(n ?? 0)
  return v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: 2 })
}

/** تنسيق مبلغ مالي — العملة قابلة للتغيير من الإعدادات */
export function fmtMoney(n: number | null | undefined, symbol = 'ج.م') {
  const v = Number(n ?? 0)
  const s = v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
  return `${s} ${symbol}`.trim()
}

export function todayISO() {
  return format(new Date(), 'yyyy-MM-dd')
}

export function isoOf(d: Date) {
  return format(d, 'yyyy-MM-dd')
}

export function monthLabel(d: Date) {
  return `${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

export function phoneHref(p?: string | null) {
  if (!p) return undefined
  return `tel:${p.replace(/\s/g, '')}`
}

export function waHref(p?: string | null, text?: string) {
  if (!p) return undefined
  const digits = p.replace(/\D/g, '').replace(/^0/, '20')
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

export function fileSize(bytes: number | null | undefined) {
  const b = Number(bytes ?? 0)
  if (b < 1024) return `${b} بايت`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} كيلوبايت`
  return `${(b / 1024 / 1024).toFixed(1)} ميجابايت`
}
