import { Badge } from '@/components/ui'
import type { AttendanceStatus, ChargeStatus, QuestionStatus, SessionStatus, StudentStatus } from '@/lib/database.types'
import { CalendarClock, Check, CircleDashed, CircleSlash, Clock, X, AlertCircle, Loader } from 'lucide-react'

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: 'حاضر',
  absent: 'غائب',
  late: 'متأخر',
  excused: 'بعذر',
}

export const SESSION_LABEL: Record<SessionStatus, string> = {
  scheduled: 'مجدولة',
  done: 'تم تنفيذها',
  postponed: 'مؤجّلة',
  cancelled: 'ملغاة',
}

export const CHARGE_LABEL: Record<ChargeStatus, string> = {
  unpaid: 'غير مدفوع',
  partial: 'مدفوع جزئيًا',
  paid: 'مدفوع',
  void: 'ملغى',
}

export const QUESTION_LABEL: Record<QuestionStatus, string> = {
  not_started: 'لم يبدأ',
  in_progress: 'جارٍ التنفيذ',
  completed: 'مكتمل',
  needs_revision: 'يحتاج تعديل',
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: 'نقدي',
  bank: 'تحويل بنكي',
  wallet: 'محفظة إلكترونية',
  instapay: 'انستاباي',
  other: 'أخرى',
}

export function AttendanceBadge({ status }: { status: AttendanceStatus }) {
  const map = {
    present: { tone: 'success' as const, Icon: Check },
    absent: { tone: 'danger' as const, Icon: X },
    late: { tone: 'warning' as const, Icon: Clock },
    excused: { tone: 'info' as const, Icon: AlertCircle },
  }[status]
  return (
    <Badge tone={map.tone}>
      <map.Icon className="size-3" strokeWidth={3} />
      {ATTENDANCE_LABEL[status]}
    </Badge>
  )
}

export function SessionBadge({ status }: { status: SessionStatus }) {
  const map = {
    scheduled: { tone: 'info' as const, Icon: CalendarClock },
    done: { tone: 'success' as const, Icon: Check },
    postponed: { tone: 'warning' as const, Icon: Clock },
    cancelled: { tone: 'danger' as const, Icon: CircleSlash },
  }[status]
  return (
    <Badge tone={map.tone}>
      <map.Icon className="size-3" strokeWidth={2.6} />
      {SESSION_LABEL[status]}
    </Badge>
  )
}

export function ChargeBadge({ status }: { status: ChargeStatus }) {
  const map = {
    unpaid: 'danger' as const,
    partial: 'warning' as const,
    paid: 'success' as const,
    void: 'neutral' as const,
  }[status]
  return <Badge tone={map}>{CHARGE_LABEL[status]}</Badge>
}

export function QuestionBadge({ status }: { status: QuestionStatus }) {
  const map = {
    not_started: { tone: 'neutral' as const, Icon: CircleDashed },
    in_progress: { tone: 'info' as const, Icon: Loader },
    completed: { tone: 'success' as const, Icon: Check },
    needs_revision: { tone: 'warning' as const, Icon: AlertCircle },
  }[status]
  return (
    <Badge tone={map.tone}>
      <map.Icon className="size-3" strokeWidth={2.6} />
      {QUESTION_LABEL[status]}
    </Badge>
  )
}

export function StudentStatusBadge({ status }: { status: StudentStatus }) {
  return status === 'active' ? <Badge tone="success">نشط</Badge> : <Badge tone="neutral">غير نشط</Badge>
}

/** حالة الحساب المالي للطالب */
export function BalanceBadge({ outstanding }: { outstanding: number }) {
  if (outstanding <= 0) return <Badge tone="success">لا مستحقات</Badge>
  return <Badge tone="danger">عليه مستحقات</Badge>
}
