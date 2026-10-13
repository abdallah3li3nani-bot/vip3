/* أنواع مبسّطة تعكس مخطط قاعدة البيانات المحلية (IndexedDB) */

export type AppRole = 'admin'
export type StudentStatus = 'active' | 'inactive'
export type SessionStatus = 'scheduled' | 'done' | 'postponed' | 'cancelled'
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'
export type ChargeKind = 'cycle' | 'extra'
export type ChargeStatus = 'unpaid' | 'partial' | 'paid' | 'void'
export type PaymentMethod = 'cash' | 'bank' | 'wallet' | 'instapay' | 'other'
export type QuestionStatus = 'not_started' | 'in_progress' | 'completed' | 'needs_revision'
export type AudienceType = 'student' | 'group' | 'year' | 'all'

export interface AppSettings {
  id: string
  app_name: string
  short_name: string
  tagline: string | null
  teacher_name: string | null
  teacher_phone: string | null
  teacher_email: string | null
  teacher_address: string | null
  logo_url: string | null
  icon_url: string | null
  avatar_url: string | null
  primary_color: string
  accent_color: string
  theme_mode: string
  currency: string
  currency_symbol: string
  default_sessions_per_cycle: number
  absence_counts_in_cycle: boolean
  charge_on_cycle_start: boolean
  pricing_bundles?: Record<string, Record<number, number>>
  password?: string
  require_auth?: boolean
  report_header: string | null
  report_footer: string | null
  /** آخر تاريخ تم فيه حفظ نسخة احتياطية كملف على الجهاز */
  last_file_backup_at?: string | null
  /** إصدار ترحيل البيانات الداخلي */
  data_version?: number
  updated_at: string
}

export interface AcademicYear {
  id: string
  name: string
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface Group {
  id: string
  year_id: string
  name: string
  notes: string | null
  created_at: string
}

export interface Subject {
  id: string
  year_id: string
  name: string
  price: number
  sessions_per_cycle: number
  color: string | null
  is_active: boolean
  notes: string | null
  created_at: string
}

export interface Student {
  id: string
  code?: string
  full_name: string
  phone?: string | null
  guardian_phone?: string | null
  year_id: string | null
  group_id: string | null
  specialization?: string // التخصص (عام، علمي، أدبي...)
  is_enrolled?: boolean // مشترك بالدروس الخاصة أم طالب مدرسة فقط
  status: StudentStatus
  enrolled_at: string
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Profile {
  id: string
  role: AppRole
  full_name: string | null
  student_id: string | null
  created_at: string
}

export interface StudentSubject {
  id: string
  student_id: string
  subject_id: string
  price_override: number | null
  is_active: boolean
  started_at: string
  created_at: string
}

export interface ClassSession {
  id: string
  subject_id: string
  group_id: string | null
  session_date: string
  start_time: string | null
  end_time: string | null
  location: string | null
  status: SessionStatus
  rescheduled_to?: string | null
  reason?: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Attendance {
  id: string
  session_id: string
  student_id: string
  status: AttendanceStatus
  note: string | null
  recorded_at: string
}

export interface Cycle {
  id: string
  student_id: string
  subject_id: string
  cycle_index: number
  sessions_target: number
  sessions_done: number
  status: 'open' | 'completed'
  opened_at: string
  completed_at: string | null
}

export interface Charge {
  id: string
  student_id: string
  kind: ChargeKind
  title: string
  amount: number
  paid_amount: number
  subject_id: string | null
  cycle_id: string | null
  batch_id?: string | null
  due_date: string
  status: ChargeStatus
  notes: string | null
  created_by?: string | null
  created_at: string
  void_at: string | null
  void_reason?: string | null
}

/** توزيع مبلغ دفعة على مستحق دروس أو حجز مذكرة */
export interface PaymentSplit {
  kind: 'charge' | 'booklet'
  id: string
  amount: number
}

export interface Payment {
  id: string
  student_id: string
  /** رقم الإيصال المسلسل */
  receipt_no?: number
  /** توزيع الدفعة على البنود (لإمكانية الإلغاء الدقيق) */
  allocations?: PaymentSplit[]
  /** مصدر الدفعة: سداد عام، أو من شاشة المذكرات */
  source?: 'general' | 'booklet'
  amount: number
  method: PaymentMethod
  paid_at: string
  reference: string | null
  notes: string | null
  created_by?: string | null
  created_at: string
  void_at?: string | null
  void_reason?: string | null
}

export interface PaymentAllocation {
  id: string
  payment_id: string
  charge_id: string
  amount: number
  created_at: string
}

/* قسم المذكرات */
export interface Booklet {
  id: string
  year_id: string
  title: string
  price: number
  term: string
  notes: string | null
  created_at: string
}

export interface BookletOrder {
  id: string
  booklet_id: string
  student_id: string
  price: number
  paid_amount: number
  remaining_amount: number
  payment_method: 'cash' | 'wallet' | 'instapay'
  is_delivered: boolean
  delivered_at: string | null
  notes: string | null
  created_at: string
}

export interface BackupSnapshot {
  id: string
  date: string
  timestamp: number
  label: string
  students_count: number
  orders_count: number
  dump_json: string
}

export interface Project {
  id: string
  year_id: string | null
  title: string
  description: string | null
  is_active: boolean
  created_at: string
}

export interface ProjectQuestion {
  id: string
  project_id: string
  idx: number
  title: string
  description: string | null
  created_at: string
}

export interface ProjectEnrollment {
  id: string
  project_id: string
  student_id: string
  created_at: string
}

export interface StudentProjectProgress {
  id: string
  student_id: string
  question_id: string
  status: QuestionStatus
  completed_at: string | null
  grade: number | null
  notes: string | null
  updated_at: string
}

export interface FileRow {
  id: string
  name: string
  path: string
  mime: string | null
  size: number
  uploaded_by: string | null
  created_at: string
}

export interface Message {
  id: string
  title: string
  body: string | null
  audience_type: AudienceType
  created_by: string | null
  created_at: string
}

export interface Notification {
  id: string
  student_id: string | null
  for_admin: boolean
  type: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

export interface AuditLog {
  id: number
  actor_id: string | null
  actor_name: string | null
  action: string
  entity: string
  entity_id: string | null
  meta: Record<string, unknown> | null
  created_at: string
}

export interface DashboardStats {
  students_total: number
  students_active: number
  students_enrolled: number
  students_school_only: number
  students_debt: number
  students_clear: number
  total_due: number
  total_paid: number
  outstanding: number
  paid_this_month: number
  paid_this_year: number
  sessions_today: number
  sessions_week: number
  booklets_total_orders: number
  booklets_delivered: number
  booklets_pending_delivery: number
  booklets_debt: number
  by_year: { id: string; name: string; paid: number; outstanding: number; students: number }[]
}

export type Database = any
