import { createFileRoute, Outlet, useNavigate, useSearch, retainSearchParams } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Suspense } from "react";
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
  component: SitterRoot,
});

function SitterRoot() {
  return (
    <Suspense fallback={<FullPageSkeleton />}>
      <SitterLayout />
    </Suspense>
  );
}

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
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition ${b.id === ctx.activeBirdId ? "bg-sage-900 text-white" : "bg-sage-100 text-sage-700"}`}
              >
                {b.name}
              </button>
            ))}
          </div>

        </div>
      )}
      <Suspense fallback={<TabSkeleton />}>
        <Outlet />
      </Suspense>
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


function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-sage-200/70 ${className}`} />;
}

function TabSkeleton() {
  return (
    <div
      className="mx-auto max-w-md space-y-4 px-4 py-5"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <span className="sr-only">Loading…</span>
      <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-sage-100">
        <SkeletonLine className="h-4 w-1/2" />
        <SkeletonLine className="h-3 w-3/4" />
        <SkeletonLine className="h-3 w-2/3" />
      </div>
      <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-sage-100">
        <SkeletonLine className="h-4 w-2/5" />
        <SkeletonLine className="h-10 w-full" />
        <SkeletonLine className="h-10 w-full" />
        <SkeletonLine className="h-10 w-5/6" />
      </div>
      <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-sage-100">
        <SkeletonLine className="h-4 w-1/3" />
        <SkeletonLine className="h-10 w-full" />
        <SkeletonLine className="h-10 w-full" />
      </div>
    </div>
  );
}

function FullPageSkeleton() {
  return (
    <div
      className="min-h-screen bg-sage-50 pb-32"
      role="status"
      aria-live="polite"
      aria-label="Loading sitter view"
    >
      <span className="sr-only">Loading sitter view…</span>
      <div className="border-b border-sage-100 bg-white">
        <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-3">
          <SkeletonLine className="size-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <SkeletonLine className="h-3 w-1/3" />
            <SkeletonLine className="h-2 w-1/4" />
          </div>
        </div>
      </div>
      <TabSkeleton />
    </div>
  );
}
