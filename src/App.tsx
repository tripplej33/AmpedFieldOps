import { Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { Toaster } from "./components/ui/sonner";
import DashboardLayout from "./components/layout/DashboardLayout";
import Dashboard from "./components/pages/Dashboard";
import Projects from "./components/pages/Projects";
import Clients from "./components/pages/Clients";
import Timesheets from "./components/pages/Timesheets";
import Reports from "./components/pages/Reports";
import Settings from "./components/pages/Settings";
import Login from "./components/pages/Login";
import Financials from "./components/pages/Financials";
import Users from "./components/pages/Users";
import ActivityTypes from "./components/pages/ActivityTypes";
import CostCenters from "./components/pages/CostCenters";

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
          <Route path="cost-centers" element={
            <ProtectedRoute permission="can_manage_cost_centers">
              <CostCenters />
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
  return (
    <AuthProvider>
      <AppRoutes />
      <Toaster position="bottom-right" />
    </AuthProvider>
  );
}

export default App;
