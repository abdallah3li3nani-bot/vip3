import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/store/auth'
import { AdminShell } from '@/components/layout/AdminShell'
import { PageLoader } from '@/components/ui'
import LoginPage from '@/features/auth/LoginPage'

const Dashboard      = lazy(() => import('@/features/dashboard/DashboardPage'))
const StudentsPage   = lazy(() => import('@/features/students/StudentsPage'))
const StudentProfile = lazy(() => import('@/features/students/StudentProfilePage'))
const BookletsPage   = lazy(() => import('@/features/booklets/BookletsPage'))
const SubjectsPage   = lazy(() => import('@/features/subjects/SubjectsPage'))
const GroupsPage     = lazy(() => import('@/features/groups/GroupsPage'))
const SchedulePage   = lazy(() => import('@/features/schedule/SchedulePage'))
const AttendancePage = lazy(() => import('@/features/attendance/AttendancePage'))
const FinancePage    = lazy(() => import('@/features/finance/FinancePage'))
const ReportsPage    = lazy(() => import('@/features/reports/ReportsPage'))
const StudentReport  = lazy(() => import('@/features/reports/StudentReportPage'))
const SettingsPage   = lazy(() => import('@/features/settings/SettingsPage'))
const ReceiptPage    = lazy(() => import('@/features/finance/ReceiptPage'))

export default function App() {
  const { isAuthenticated, loading } = useAuth()

  if (loading) return <PageLoader label="جارٍ تشغيل النظام المحلي…" />
  if (!isAuthenticated) return <LoginPage />

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<AdminShell />}>
          <Route index element={<Dashboard />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="students/:id" element={<StudentProfile />} />
          <Route path="booklets" element={<BookletsPage />} />
          <Route path="subjects" element={<SubjectsPage />} />
          <Route path="groups" element={<GroupsPage />} />
          <Route path="schedule" element={<SchedulePage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="finance" element={<FinancePage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="reports/student/:id" element={<StudentReport />} />
          <Route path="receipt/:id" element={<ReceiptPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="settings/:tab" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
