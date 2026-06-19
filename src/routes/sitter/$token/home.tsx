import { createFileRoute } from "@tanstack/react-router";
import { SitterDashboard } from "@/components/SitterDashboard";

// Home tab — the all-birds home base. Lives under the shared sitter layout, so it
// keeps the bottom nav and the Emergency pill.
export const Route = createFileRoute("/sitter/$token/home")({
  component: HomePage,
});

function HomePage() {
  const { token } = Route.useParams();
  return <SitterDashboard token={token} />;
}
