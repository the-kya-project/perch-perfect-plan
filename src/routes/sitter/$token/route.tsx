import { createFileRoute, Outlet, useNavigate, useSearch, retainSearchParams } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Suspense, useEffect, useRef } from "react";
import { z } from "zod";
import { getSitterContext } from "@/lib/sitter.functions";
import { EmergencyBar } from "@/components/EmergencyBar";
import { track } from "@/lib/analytics";

const searchSchema = z.object({ birdId: z.string().uuid().optional() });

export const Route = createFileRoute("/sitter/$token")({
  ssr: false,
  validateSearch: searchSchema,
  search: { middlewares: [retainSearchParams(["birdId"])] },
  head: () => ({ meta: [
    { title: "Sitter access — Parrot Care Co-Pilot" },
    { name: "robots", content: "noindex,nofollow" },
  ]}),
  errorComponent: ({ error }) => {
    const code = error.message;
    const copy =
      code === "SITTER_LINK_EXPIRED"
        ? { title: "This sitter link has expired", body: "The sit it was created for has ended, so it no longer opens the care plan." }
        : code === "SITTER_LINK_REVOKED"
        ? { title: "This sitter link was turned off", body: "The owner revoked access to this link." }
        : code === "SITTER_LINK_INVALID"
        ? { title: "This sitter link isn't valid", body: "Double-check the link, or ask the owner to resend it." }
        : { title: "This sitter link can't be opened", body: error.message };
    return (
      <div className="grid min-h-screen place-items-center bg-sage-50 p-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-lg font-bold">{copy.title}</h1>
          <p className="mt-2 text-sm text-sage-600">{copy.body}</p>
          <p className="mt-4 text-xs text-sage-600">Ask the owner to send you a new link.</p>
        </div>
      </div>
    );
  },
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
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    track("sitter_link_opened", { bird_count: ctx.birds?.length ?? 0 });
  }, [ctx]);

  return (
    <div className="min-h-screen bg-sage-50 pb-32">
      <div className="sticky top-0 z-30 border-b border-sage-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-2.5">
          {ctx.birds.length > 1 && (
            <>
              <span className="shrink-0 text-xs font-semibold text-sage-500">Caring for</span>
              <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
                {ctx.birds.map((b: any) => {
                  const active = b.id === ctx.activeBirdId;
                  return (
                    <button
                      key={b.id}
                      onClick={() => navigate({ to: ".", search: { birdId: b.id } })}
                      aria-pressed={active}
                      className={`shrink-0 rounded-full px-4 py-1.5 text-sm transition ${
                        active
                          ? "bg-[#1a3d2e] font-bold text-white shadow-sm ring-1 ring-[#1a3d2e]"
                          : "bg-white font-medium text-sage-500 ring-1 ring-sage-200"
                      }`}
                    >
                      {b.name}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <span className="ml-auto shrink-0 rounded bg-sage-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-sage-700">
            Sit active
          </span>
        </div>
      </div>
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
