import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AppProvider } from './contexts/AppContext'
import ProtectedRoute from './components/auth/ProtectedRoute'
import AdminRoute from './components/auth/AdminRoute'
import AppShell from './components/layout/AppShell'
import AdminShell from './components/admin/AdminShell'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RoleSelectionPage from './pages/RoleSelectionPage'
import DashboardPage from './pages/DashboardPage'
import DoctorDashboardPage from './pages/DoctorDashboardPage'
import MessagingPage from './pages/MessagingPage'
import CheckupPage from './pages/CheckupPage'
import CheckupResultsPage from './pages/CheckupResultsPage'
import AppointmentsPage from './pages/AppointmentsPage'
import PatientsPage from './pages/PatientsPage'
import SignupPage from './pages/SignupPage'
import SettingsPage from './pages/SettingsPage'
import RoleGate from './components/auth/RoleGate'
import AdminUsersPage from './pages/admin/AdminUsersPage'
import AdminUserDetailPage from './pages/admin/AdminUserDetailPage'
import AdminActionsPage from './pages/admin/AdminActionsPage'
import AdminAuditPage from './pages/admin/AdminAuditPage'

// Route dashboard based on role
function DashboardRouter() {
  const { role } = useAuth()
  return role === 'doctor' ? <DoctorDashboardPage /> : <DashboardPage />
}

export default function App() {
  return (
    <AuthProvider>
      <AppProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/select-role" element={<RoleSelectionPage />} />
              <Route element={<RoleGate />}>
                <Route element={<AppShell />}>
                  <Route path="/dashboard" element={<DashboardRouter />} />
                  <Route path="/messaging" element={<MessagingPage />} />
                  <Route path="/checkup" element={<CheckupPage />} />
                  <Route path="/checkup/results" element={<CheckupResultsPage />} />
                  <Route path="/appointments" element={<AppointmentsPage />} />
                  <Route path="/patients" element={<PatientsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>
              </Route>
              <Route element={<AdminRoute />}>
                <Route element={<AdminShell />}>
                  <Route path="/admin/users" element={<AdminUsersPage />} />
                  <Route path="/admin/users/:userId" element={<AdminUserDetailPage />} />
                  <Route path="/admin/actions" element={<AdminActionsPage />} />
                  <Route path="/admin/audit" element={<AdminAuditPage />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </AuthProvider>
  )
}
