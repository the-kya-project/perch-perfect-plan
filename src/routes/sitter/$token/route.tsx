import { createFileRoute, Outlet, useNavigate, useSearch, retainSearchParams } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSitterContext } from "@/lib/sitter.functions";
import { EmergencyBar } from "@/components/EmergencyBar";

const searchSchema = z.object({ birdId: z.string().uuid().optional() });

export const Route = createFileRoute("/sitter/$token")({
  ssr: false,
  validateSearch: searchSchema,
  search: { middlewares: [retainSearchParams(["birdId"])] },
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
  const navigate = useNavigate();
  const { data: ctx } = useSitterContext(token);

  return (
    <div className="min-h-screen bg-sage-50 pb-32">
      {ctx.birds.length > 1 && (
        <div className="border-b border-sage-100 bg-white">
          <div className="mx-auto flex max-w-md items-center gap-2 overflow-x-auto px-4 py-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-sage-600">Bird:</span>
            {ctx.birds.map((b: any) => (
              <button
                key={b.id}
                onClick={() => navigate({ to: ".", search: { birdId: b.id } })}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${b.id === ctx.activeBirdId ? "bg-sage-900 text-white" : "bg-sage-100 text-sage-700"}`}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <Outlet />
      <EmergencyBar token={token} />
    </div>
  );
}

export function useSitterContext(token: string) {
  const search = useSearch({ from: "/sitter/$token" });
  const birdId = search.birdId;
  const fn = useServerFn(getSitterContext);
  return useSuspenseQuery({
    queryKey: ["sitter-ctx", token, birdId ?? null],
    queryFn: () => fn({ data: { token, birdId } }),
  });
}
