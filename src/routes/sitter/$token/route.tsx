import { createFileRoute, Outlet, useRouter } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSitterContext } from "@/lib/sitter.functions";
import { EmergencyBar } from "@/components/EmergencyBar";

export const Route = createFileRoute("/sitter/$token")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Sitter access — Parrot Care Companion" },
    { name: "robots", content: "noindex,nofollow" },
  ]}),
  errorComponent: ({ error }) => (
    <div className="grid min-h-screen place-items-center bg-sage-50 p-6 text-center">
      <div className="max-w-sm">
        <h1 className="text-lg font-bold">This sitter link can't be opened</h1>
        <p className="mt-2 text-sm text-sage-600">{error.message}</p>
        <p className="mt-4 text-xs text-sage-600">Ask the owner to send you a new link.</p>
      </div>
    </div>
  ),
  component: SitterLayout,
});

function SitterLayout() {
  const { token } = Route.useParams();
  return (
    <div className="min-h-screen bg-sage-50 pb-32">
      <Outlet />
      <EmergencyBar token={token} />
    </div>
  );
}

export function useSitterContext(token: string) {
  const fn = useServerFn(getSitterContext);
  return useSuspenseQuery({
    queryKey: ["sitter-ctx", token],
    queryFn: () => fn({ data: { token } }),
  });
}
