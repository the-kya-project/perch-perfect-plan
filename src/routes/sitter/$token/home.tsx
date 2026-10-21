import { createFileRoute, Navigate } from "@tanstack/react-router";
import { SitterDashboard } from "@/components/SitterDashboard";
import { useSitterShell } from "@/components/sitter/sitterShared";

// Home tab — the all-birds home base for sits with 2+ birds. Lives under the
// shared sitter layout, so it keeps the bottom bar and the Emergency pill.
// One-bird sits have no Home tab (the one-bird rule): send them to Today.
export const Route = createFileRoute("/sitter/$token/home")({
  component: HomePage,
});

function HomePage() {
  const { token } = Route.useParams();
  const { multi } = useSitterShell();
  if (!multi) return <Navigate to="/sitter/$token" params={{ token }} replace />;
  return <SitterDashboard token={token} />;
}
