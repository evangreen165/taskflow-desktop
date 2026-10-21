import { createHashRouter, Navigate } from "react-router-dom";

import NoAccess from "@/components/auth/NoAccess";
import RequireAuth from "@/components/auth/RequireAuth";
import RequirePerm from "@/components/auth/RequirePerm";
import BootGate from "@/components/boot/BootGate";
import Onboarding from "@/components/onboarding/Onboarding";
import AdminPage from "@/pages/admin/AdminPage";
import LoginScreen from "@/pages/auth/LoginScreen";
import CalendarPage from "@/pages/calendar/CalendarPage";
import DashboardPage from "@/pages/dashboard/DashboardPage";
import KbArticlePage from "@/pages/kb/KbArticlePage";
import KbPage from "@/pages/kb/KbPage";
import WorkspaceLayout from "@/pages/layout/WorkspaceLayout";
import ProfilePage from "@/pages/profile/ProfilePage";
import SettingsPage from "@/pages/settings/SettingsPage";
import TasksPage from "@/pages/tasks/TasksPage";

/**
 * Hash router (Tauri serves from a custom protocol; BrowserRouter breaks on
 * reload). Exported so the global error handler can navigate via the router
 * instance.
 */
export const router = createHashRouter([
  { path: "/", element: <BootGate /> },
  { path: "/onboarding", element: <Onboarding /> },
  { path: "/login", element: <LoginScreen /> },
  {
    path: "/app",
    element: (
      <RequireAuth>
        <WorkspaceLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/app/dashboard" replace /> },
      { path: "dashboard", element: <DashboardPage /> },
      { path: "calendar", element: <CalendarPage /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "kb", element: <KbPage /> },
      { path: "kb/:id", element: <KbArticlePage /> },
      {
        path: "admin",
        element: (
          <RequirePerm perm="users.manage" fallback={<NoAccess />}>
            <AdminPage />
          </RequirePerm>
        ),
      },
      { path: "profile", element: <ProfilePage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
