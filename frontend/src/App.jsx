import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { OrgProvider } from './context/OrgContext';
import { ThemeProvider } from './context/ThemeContext';
import RequireAuth from './components/layout/RequireAuth';

import LoginPage         from './pages/LoginPage';
import DashboardPage     from './pages/DashboardPage';
import KnowledgeBasePage from './pages/KnowledgeBasePage';
import DraftSubmitPage   from './pages/DraftSubmitPage';
import ReviewPage        from './pages/ReviewPage';
import WorkflowPage      from './pages/WorkflowPage';
import PassportPage      from './pages/PassportPage';
import ForbiddenPage     from './pages/ForbiddenPage';
import './App.css';

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
              <Route path="/forbidden" element={<ForbiddenPage />} />

              <Route
                path="/dashboard"
                element={
                  <RequireAuth allowedRoles={['creator', 'manager', 'owner', 'admin', 'viewer']}>
                    <DashboardPage />
                  </RequireAuth>
                }
              />

              <Route
                path="/knowledge-base"
                element={
                  <RequireAuth allowedRoles={['admin', 'owner', 'manager', 'creator', 'viewer']}>
                    <KnowledgeBasePage />
                  </RequireAuth>
                }
              />

              <Route
                path="/facts"
                element={
                  <RequireAuth allowedRoles={['manager', 'owner', 'admin']}>
                    <KnowledgeBasePage defaultTab="facts" />
                  </RequireAuth>
                }
              />

              <Route
                path="/terms"
                element={
                  <RequireAuth allowedRoles={['manager', 'owner', 'admin']}>
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
                  <RequireAuth allowedRoles={['creator', 'manager', 'admin', 'owner', 'viewer']}>
                    <DashboardPage />
                  </RequireAuth>
                }
              />

              <Route
                path="/drafts/:draftId/review"
                element={
                  <RequireAuth allowedRoles={['creator', 'manager', 'admin', 'owner']}>
                    <ReviewPage />
                  </RequireAuth>
                }
              />

              <Route
                path="/drafts/:draftId/workflow"
                element={
                  <RequireAuth allowedRoles={['creator', 'manager', 'admin', 'owner']}>
                    <WorkflowPage />
                  </RequireAuth>
                }
              />

              <Route
                path="/passports"
                element={
                  <RequireAuth allowedRoles={['creator', 'manager', 'admin', 'owner', 'viewer']}>
                    <PassportPage />
                  </RequireAuth>
                }
              />

              <Route
                path="/passports/:passportId"
                element={
                  <RequireAuth allowedRoles={['creator', 'manager', 'admin', 'owner', 'viewer']}>
                    <PassportPage />
                  </RequireAuth>
                }
              />

              <Route
                path="/audit"
                element={
                  <RequireAuth allowedRoles={['manager', 'admin', 'viewer']}>
                    <DashboardPage auditMode />
                  </RequireAuth>
                }
              />

              <Route
                path="/debug"
                element={
                  <RequireAuth allowedRoles={['manager', 'admin']}>
                    <DashboardPage debugMode />
                  </RequireAuth>
                }
              />

              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </OrgProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
