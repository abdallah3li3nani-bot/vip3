import {
  LayoutDashboard, GraduationCap, BookOpen, Users, CalendarDays, ClipboardCheck,
  Wallet, FolderKanban, Bell, FolderOpen, BarChart3, Settings, School, Home,
  MessageSquare, ReceiptText, CalendarCheck, BookText,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  primary?: boolean
}

export const ADMIN_NAV: NavItem[] = [
  { to: '/', label: 'الرئيسية', icon: LayoutDashboard, primary: true },
  { to: '/students', label: 'الطلاب', icon: GraduationCap, primary: true },
  { to: '/booklets', label: 'المذكرات', icon: BookText, primary: true },
  { to: '/attendance', label: 'الحضور', icon: ClipboardCheck, primary: true },
  { to: '/finance', label: 'الحسابات', icon: Wallet, primary: true },
  { to: '/schedule', label: 'جدول الحصص', icon: CalendarDays },
  { to: '/subjects', label: 'المواد والأسعار', icon: BookOpen },
  { to: '/groups', label: 'المجموعات والسنوات', icon: Users },
  { to: '/reports', label: 'التقارير', icon: BarChart3 },
  { to: '/settings', label: 'الإعدادات والنسخ', icon: Settings },
]

export const STUDENT_NAV: NavItem[] = []

export { School, Bell, Settings }
