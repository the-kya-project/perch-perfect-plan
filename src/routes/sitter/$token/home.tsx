import { createFileRoute, Navigate } from "@tanstack/react-router";
import { SitterDashboard } from "@/components/SitterDashboard";
import { useSitterShell } from "@/components/sitter/sitterShared";
import { useDuoMode } from "@/lib/duo";
import { SitterTodayDuo } from "@/components/duo/sitter/SitterTodayDuo";

// Home tab — the all-birds home base for sits with 2+ birds. Lives under the
// shared sitter layout, so it keeps the bottom bar and the Emergency pill.
// One-bird sits have no Home tab (the one-bird rule): send them to Today.
export const Route = createFileRoute("/sitter/$token/home")({
  component: HomePage,
});

function HomePage() {
  const { token } = Route.useParams();
  const { multi } = useSitterShell();
  // iPhone Duo, two panes: Home and Today are one screen there (every bird's
  // checklist beside the picked task).
  const duo = useDuoMode() === "sideways";
  if (!multi) return <Navigate to="/sitter/$token" params={{ token }} replace />;
  if (duo) return <SitterTodayDuo token={token} />;
  return <SitterDashboard token={token} />;
}
