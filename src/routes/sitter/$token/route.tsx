import { createFileRoute, Outlet, useNavigate, useSearch, useLocation, retainSearchParams } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Suspense, useEffect, useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { getSitterContext } from "@/lib/sitter.functions";
import { EmergencyBar } from "@/components/EmergencyBar";
import { SitterOnboarding } from "@/components/SitterOnboarding";
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
      <div className="grid min-h-screen place-items-center bg-[#f4f1e8] p-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-lg font-medium">{copy.title}</h1>
          <p className="mt-2 text-sm text-[#5f5e5a]">{copy.body}</p>
          <p className="mt-4 text-xs text-[#5f5e5a]">Ask the owner to send you a new link.</p>
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

  // Header adapts: multi-bird with no bird picked on the index route = the
  // all-birds dashboard (no switcher); inside a bird = "All birds" return
  // control + the per-bird switcher; single-bird = neither.
  const { birdId } = Route.useSearch();
  const pathname = useLocation({ select: (l) => l.pathname });
  const isIndex = pathname.replace(/\/$/, "") === `/sitter/${token}`;
  const isMulti = ctx.birds.length > 1;
  const onDashboard = isMulti && !birdId && isIndex;

  return (
    <div className="min-h-screen bg-[#f4f1e8] pb-32">
      <div className="sticky top-0 z-30 border-b border-[#e3ded0] bg-[#f4f1e8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-2.5">
          {onDashboard ? (
            <span className="text-sm font-medium text-[#1a3d2e]">All birds</span>
          ) : isMulti ? (
            <>
              <button
                onClick={() => navigate({ to: "/sitter/$token", params: { token }, search: { birdId: undefined } })}
                className="flex shrink-0 items-center gap-1 rounded-full bg-[#e8f0ec] px-3 py-1.5 text-xs font-medium text-[#1a3d2e]"
              >
                <ArrowLeft className="size-3.5" /> All birds
              </button>
              <div data-coach="bird-switcher" className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
                {ctx.birds.map((b: any) => {
                  const active = b.id === ctx.activeBirdId;
                  return (
                    <button
                      key={b.id}
                      onClick={() => navigate({ to: ".", search: { birdId: b.id } })}
                      aria-pressed={active}
                      className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                        active
                          ? "bg-[#1a3d2e] text-white"
                          : "bg-[#e8f0ec] text-[#1a3d2e]"
                      }`}
                    >
                      {b.name}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
          <span className="ml-auto shrink-0 rounded-full bg-[#d6e8dc] px-2.5 py-1 text-[11px] font-medium text-[#1a5e3f]">
            Sit active
          </span>
        </div>
      </div>
      <Suspense fallback={<TabSkeleton />}>
        <Outlet />
      </Suspense>
      <EmergencyBar token={token} />
      <SitterOnboarding birds={ctx.birds} bird={ctx.bird} token={token} />
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
      <div className="space-y-3 rounded-2xl bg-[#efe9da] p-4">
        <SkeletonLine className="h-4 w-1/2" />
        <SkeletonLine className="h-3 w-3/4" />
        <SkeletonLine className="h-3 w-2/3" />
      </div>
      <div className="space-y-3 rounded-2xl bg-[#efe9da] p-4">
        <SkeletonLine className="h-4 w-2/5" />
        <SkeletonLine className="h-10 w-full" />
        <SkeletonLine className="h-10 w-full" />
        <SkeletonLine className="h-10 w-5/6" />
      </div>
      <div className="space-y-3 rounded-2xl bg-[#efe9da] p-4">
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
      className="min-h-screen bg-[#f4f1e8] pb-32"
      role="status"
      aria-live="polite"
      aria-label="Loading sitter view"
    >
      <span className="sr-only">Loading sitter view…</span>
      <div className="border-b border-[#e3ded0] bg-[#f4f1e8]">
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
