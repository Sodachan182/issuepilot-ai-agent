import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AppShell } from "./components/app/AppShell";
import { TooltipProvider } from "./components/ui/primitives";
import { HistoryPage } from "./features/history/HistoryPage";
import { InboxPage } from "./features/issues/InboxPage";
import { ReportsPage } from "./features/reports/ReportsPage";
import { ReposPage } from "./features/repos/ReposPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { WorkspacePage } from "./features/triage/WorkspacePage";
import { ApiError } from "./lib/api";

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (count, error) =>
          count < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
        refetchOnWindowFocus: false,
      },
    },
  });
}

const queryClient = makeQueryClient();

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/repos" replace />} />
        <Route path="/repos" element={<ReposPage />} />
        <Route path="/repos/:repoId/issues" element={<InboxPage />} />
        <Route path="/repos/:repoId/issues/:number" element={<WorkspacePage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/repos" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
        <Toaster
          position="bottom-right"
          visibleToasts={3}
          duration={4000}
          toastOptions={{
            className: "!bg-surface !text-fg !border-border !text-[13px]",
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
