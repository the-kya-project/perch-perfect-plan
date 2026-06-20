import { createFileRoute, Outlet, useNavigate, useSearch, useLocation, retainSearchParams } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Suspense, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { getSitterContext } from "@/lib/sitter.functions";
import { HelpCircle } from "lucide-react";
import { EmergencyBar } from "@/components/EmergencyBar";
import { SitterOnboarding, replaySitterOnboarding } from "@/components/SitterOnboarding";
import { presentCareSections } from "@/lib/sitterCareSections";
import { track } from "@/lib/analytics";
import { PullToRefresh } from "@/components/PullToRefresh";

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

  // Dashboard access is the Home nav tab now (no top "All birds" affordance).
  // The per-bird switcher stays inside a bird so the sitter can change birds
  // without returning Home; it's hidden on Home itself.
  const pathname = useLocation({ select: (l) => l.pathname });
  const onHome = pathname.replace(/\/$/, "") === `/sitter/${token}/home`;
  const showSwitcher = ctx.birds.length > 1 && !onHome;

  // Subtle edge fades on the switcher when the pills overflow (the carousel
  // dots are the primary "there's more — swipe" cue; no arrows).
  const switcherRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);
  function updateSwitcherFades() {
    const el = switcherRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }
  useEffect(() => {
    const raf = requestAnimationFrame(updateSwitcherFades);
    window.addEventListener("resize", updateSwitcherFades);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", updateSwitcherFades); };
  }, [showSwitcher, ctx.birds.length, pathname]);

  return (
    <PullToRefresh>
    <div className="min-h-screen bg-[#f4f1e8] pb-32">
      <div className="sticky top-0 z-30 border-b border-[#e3ded0] bg-[#f4f1e8]/95 backdrop-blur">
        <div className="mx-auto max-w-md px-5 py-2.5">
          {/* Top line: who you're caring for (left) · status + help (right) */}
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              {!onHome && (ctx.birds.length > 1 ? (
                <span className="text-xs font-medium text-[#5f5e5a]">Caring for {ctx.birds.length} birds</span>
              ) : (
                <span className="block truncate text-sm font-medium text-[#1a3d2e]">{ctx.bird?.name}</span>
              ))}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="shrink-0 rounded-full bg-[#d6e8dc] px-2.5 py-1 text-[11px] font-medium text-[#1a5e3f]">
                Sit active
              </span>
              {/* Persistent walkthrough replay — the question mark in the upper
                  right on every screen except Home, where the labeled
                  "Walkthrough" chip serves this role. */}
              {!onHome && (
                <button
                  onClick={replaySitterOnboarding}
                  aria-label="Replay walkthrough"
                  className="grid size-7 shrink-0 place-items-center rounded-full bg-[#e8f0ec] text-[#2d6a4f] active:scale-95"
                >
                  <HelpCircle className="size-4" />
                </button>
              )}
            </div>
          </div>

          {/* Switcher row (pills only) + carousel dots — multiple birds only */}
          {showSwitcher && (
            <div className="mt-2">
              <div className="relative">
                <div
                  ref={switcherRef}
                  onScroll={updateSwitcherFades}
                  data-coach="bird-switcher"
                  className="flex items-center gap-2 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {ctx.birds.map((b: any) => {
                    const active = b.id === ctx.activeBirdId;
                    return (
                      <button
                        key={b.id}
                        onClick={() => navigate({ to: ".", search: { birdId: b.id } })}
                        aria-pressed={active}
                        className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition ${
                          active ? "bg-[#1a3d2e] text-white" : "bg-[#e8f0ec] text-[#1a3d2e]"
                        }`}
                      >
                        {b.name}
                      </button>
                    );
                  })}
                </div>
                {/* Subtle edge fades when the pills overflow (no arrows) */}
                {!atStart && <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-[#f4f1e8] to-transparent" />}
                {!atEnd && <div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-[#f4f1e8] to-transparent" />}
              </div>

              {/* Carousel dots — count + current position (full set, any scroll) */}
              <div className="mt-2 flex items-center justify-center gap-1.5">
                {ctx.birds.map((b: any) => {
                  const active = b.id === ctx.activeBirdId;
                  return (
                    <span
                      key={b.id}
                      aria-hidden
                      className={`h-1.5 rounded-full transition-all ${active ? "w-4 bg-[#1a3d2e]" : "w-1.5 bg-[#1a3d2e]/25"}`}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      <Suspense fallback={<TabSkeleton />}>
        <Outlet />
      </Suspense>
      <EmergencyBar token={token} activeBirdId={ctx.activeBirdId} />
      <SitterOnboarding birds={ctx.birds} bird={ctx.bird} careSections={presentCareSections(ctx)} hasClips={(ctx.watchClips?.length ?? 0) > 0} token={token} />
    </div>
    </PullToRefresh>
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
      className="mx-auto max-w-md space-y-4 px-5 py-5"
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
        <div className="mx-auto flex max-w-md items-center gap-2 px-5 py-3">
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
