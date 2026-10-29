import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { OrgProvider } from './context/OrgContext';
import { ThemeProvider } from './context/ThemeContext';
import { useAuth } from './context/useAuth';
import RequireAuth from './components/layout/RequireAuth';

import LoginPage         from './pages/LoginPage';
import RegisterPage      from './pages/RegisterPage';
import DashboardPage     from './pages/DashboardPage';
import KnowledgeBasePage from './pages/KnowledgeBasePage';
import DraftSubmitPage   from './pages/DraftSubmitPage';
import ReviewPage        from './pages/ReviewPage';
import WorkflowPage      from './pages/WorkflowPage';
import PassportPage      from './pages/PassportPage';
import ForbiddenPage     from './pages/ForbiddenPage';
import './App.css';

function RoleLandingRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'creator') return <Navigate to="/drafts/new" replace />;
  if (user.role === 'knowledge_owner' || user.role === 'owner') return <Navigate to="/knowledge-base" replace />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <OrgProvider>
            {/* Ambient background blobs — decorative, match reference */}
            <div className="app-blob app-blob-a" aria-hidden="true" />
            <div className="app-blob app-blob-b" aria-hidden="true" />

            <Routes>
              <Route path="/login"     element={<LoginPage />} />
              <Route path="/register"  element={<RegisterPage />} />
              <Route path="/forbidden" element={<ForbiddenPage />} />

              <Route
                path="/dashboard"
                element={
                  <RequireAuth allowedRoles={['creator', 'manager', 'brand_manager', 'owner', 'knowledge_owner', 'admin', 'viewer']}>
                    <DashboardPage />
                  </RequireAuth>
                }
              />

              <Route
                path="/knowledge-base"
                element={
                  <RequireAuth allowedRoles={['admin', 'owner', 'knowledge_owner', 'manager', 'brand_manager', 'creator', 'viewer']}>
                    <KnowledgeBasePage />
                  </RequireAuth>
                }
              />

              <Route
                path="/facts"
                element={
                  <RequireAuth allowedRoles={['manager', 'brand_manager', 'owner', 'knowledge_owner', 'admin']}>
                    <KnowledgeBasePage defaultTab="facts" />
                  </RequireAuth>
                }
              />

              <Route
                path="/terms"
                element={
                  <RequireAuth allowedRoles={['manager', 'brand_manager', 'owner', 'knowledge_owner', 'admin']}>
                    <KnowledgeBasePage defaultTab="terms" />
                  </RequireAuth>
                }
              />

              <Route
                path="/drafts/new"
                element={
                  <RequireAuth allowedRoles={['creator', 'admin']}>
                    <DraftSubmitPage />
                  </RequireAuth>
                }
              />

              <Route
                path="/drafts/mine"
                element={
                  <RequireAuth allowedRoles={['creator', 'admin']}>
                    <DashboardPage myDraftsOnly />
                  </RequireAuth>
                }
              />

              <Route
                path="/drafts"
                element={
                  <RequireAuth allowedRoles={['creator', 'manager', 'brand_manager', 'admin', 'owner', 'knowledge_owner', 'viewer']}>
                    <DashboardPage />
                  </RequireAuth>
                }
              />

              <Route
                path="/drafts/:draftId/review"
                element={
                  <RequireAuth allowedRoles={['creator', 'manager', 'brand_manager', 'admin', 'owner', 'knowledge_owner']}>
                    <ReviewPage />
                  </RequireAuth>
                }
              />

              <Route
                path="/drafts/:draftId/workflow"
                element={
                  <RequireAuth allowedRoles={['creator', 'manager', 'brand_manager', 'admin', 'owner', 'knowledge_owner']}>
                    <WorkflowPage />
                  </RequireAuth>
                }
              />

              <Route
                path="/passports"
                element={
                  <RequireAuth allowedRoles={['creator', 'manager', 'brand_manager', 'admin', 'owner', 'knowledge_owner', 'viewer']}>
                    <PassportPage />
                  </RequireAuth>
                }
              />

              <Route
                path="/passports/:passportId"
                element={
                  <RequireAuth allowedRoles={['creator', 'manager', 'brand_manager', 'admin', 'owner', 'knowledge_owner', 'viewer']}>
                    <PassportPage />
                  </RequireAuth>
                }
              />

              <Route
                path="/audit"
                element={
                  <RequireAuth allowedRoles={['manager', 'brand_manager', 'admin', 'viewer', 'knowledge_owner', 'owner']}>
                    <DashboardPage auditMode />
                  </RequireAuth>
                }
              />

              <Route
                path="/debug"
                element={
                  <RequireAuth allowedRoles={['manager', 'brand_manager', 'admin']}>
                    <DashboardPage debugMode />
                  </RequireAuth>
                }
              />

              <Route path="/" element={<RoleLandingRedirect />} />
              <Route path="*" element={<RoleLandingRedirect />} />
            </Routes>
          </OrgProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
