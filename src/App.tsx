import { Suspense, lazy, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import { Toaster } from "./components/ui/sonner";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/layout/DashboardLayout";
import { loadFaviconFromSettings } from "./lib/favicon";
import { api } from "./lib/api";

// Lazy load page components for code splitting
const Dashboard = lazy(() => import("./components/pages/Dashboard"));
const Projects = lazy(() => import("./components/pages/Projects"));
const Clients = lazy(() => import("./components/pages/Clients"));
const Timesheets = lazy(() => import("./components/pages/Timesheets"));
const Reports = lazy(() => import("./components/pages/Reports"));
const Settings = lazy(() => import("./components/pages/Settings"));
const Login = lazy(() => import("./components/pages/Login"));
const ForgotPassword = lazy(() => import("./components/pages/ForgotPassword"));
const UserSettings = lazy(() => import("./components/pages/UserSettings"));
const Financials = lazy(() => import("./components/pages/Financials"));
const Users = lazy(() => import("./components/pages/Users"));
const ActivityTypes = lazy(() => import("./components/pages/ActivityTypes"));
const Troubleshooter = lazy(() => import("./components/pages/Troubleshooter"));
const Files = lazy(() => import("./components/pages/Files"));
const SafetyDocuments = lazy(() => import("./components/pages/SafetyDocuments"));
const Backups = lazy(() => import("./components/pages/Backups"));

// Protected route wrapper
function ProtectedRoute({ children, permission }: { children: React.ReactNode; permission?: string }) {
  const { isAuthenticated, isLoading, hasPermission } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="font-mono text-electric">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (permission && !hasPermission(permission)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen bg-background">
        <p className="font-mono text-electric">Loading AmpedFieldOps...</p>
      </div>
    }>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        {/* Protected routes */}
        <Route path="/" element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="projects" element={<Projects />} />
          <Route path="clients" element={<Clients />} />
          <Route path="timesheets" element={<Timesheets />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="user-settings" element={<UserSettings />} />
          <Route path="financials" element={
            <ProtectedRoute permission="can_view_financials">
              <Financials />
            </ProtectedRoute>
          } />
          <Route path="users" element={
            <ProtectedRoute permission="can_manage_users">
              <Users />
            </ProtectedRoute>
          } />
          <Route path="activity-types" element={
            <ProtectedRoute permission="can_edit_activity_types">
              <ActivityTypes />
            </ProtectedRoute>
          } />
          <Route path="troubleshooter" element={
            <ProtectedRoute permission="can_manage_users">
              <Troubleshooter />
            </ProtectedRoute>
          } />
          <Route path="files" element={
            <ProtectedRoute permission="can_view_financials">
              <Files />
            </ProtectedRoute>
          } />
          <Route path="safety-documents" element={
            <ProtectedRoute permission="can_view_financials">
              <SafetyDocuments />
            </ProtectedRoute>
          } />
          <Route path="backups" element={
            <ProtectedRoute permission="can_manage_users">
              <Backups />
            </ProtectedRoute>
          } />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

function App() {
  // Load favicon on app startup if user is authenticated
  useEffect(() => {
    const token = api.getToken();
    if (token) {
      // User is authenticated, try to load favicon
      loadFaviconFromSettings(api);
    }
  }, []);

  return (
    <ErrorBoundary>
      <AuthProvider>
        <NotificationProvider>
          <AppRoutes />
          <Toaster position="bottom-right" />
        </NotificationProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
