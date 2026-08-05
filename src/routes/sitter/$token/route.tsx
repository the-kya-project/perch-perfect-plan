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
import { I18nextProvider, useTranslation } from "react-i18next";
import { sitterI18n, ensureSitterI18n, resolveSitterLocale } from "@/lib/i18n";
import { SitterLanguageToggle } from "@/components/SitterLanguageToggle";

const searchSchema = z.object({ birdId: z.string().uuid().optional() });

export const Route = createFileRoute("/sitter/$token")({
  ssr: false,
  validateSearch: searchSchema,
  search: { middlewares: [retainSearchParams(["birdId"])] },
  head: () => ({ meta: [
    { title: "Sitter access — Kya & Co." },
    { name: "robots", content: "noindex,nofollow" },
  ]}),
  errorComponent: ({ error }) => {
    const code = error.message;
    // The error boundary renders outside the sitter <I18nextProvider>, so read
    // the sitter instance directly. Resolve the locale from the browser (no
    // token here) and translate — errors are rare, so the per-token override
    // isn't worth threading in.
    ensureSitterI18n(resolveSitterLocale());
    const t = sitterI18n.getFixedT(sitterI18n.language);
    const copy =
      code === "SITTER_LINK_EXPIRED"
        ? { title: t("sitter.error.expired.title", "This sitter link has expired"), body: t("sitter.error.expired.body", "The sit it was created for has ended, so it no longer opens the care plan.") }
        : code === "SITTER_LINK_REVOKED"
        ? { title: t("sitter.error.revoked.title", "This sitter link was turned off"), body: t("sitter.error.revoked.body", "The owner revoked access to this link.") }
        : code === "SITTER_LINK_INVALID"
        ? { title: t("sitter.error.invalid.title", "This sitter link isn't valid"), body: t("sitter.error.invalid.body", "Double-check the link, or ask the owner to resend it.") }
        : code === "SITTER_SIT_PAUSED"
        ? { title: t("sitter.error.paused.title", "This sit is paused"), body: t("sitter.error.paused.body", "There's nothing that needs doing right now. The owner will be in touch.") }
        : { title: t("sitter.error.generic.title", "This sitter link can't be opened"), body: error.message };
    return (
      <div className="grid min-h-screen place-items-center bg-[#f4f1e8] p-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-lg font-medium">{copy.title}</h1>
          <p className="mt-2 text-sm text-[#5f5e5a]">{copy.body}</p>
          {code !== "SITTER_SIT_PAUSED" && (
            <p className="mt-4 text-xs text-[#5f5e5a]">{t("sitter.error.askNew", "Ask the owner to send you a new link.")}</p>
          )}
        </div>
      </div>
    );
  },
  component: SitterRoot,
});

function SitterRoot() {
  const { token } = Route.useParams();
  // Resolve the sitter locale (manual toggle → browser → 'en') and bring the
  // sitter i18n instance to it SYNCHRONOUSLY, before any translated content
  // renders. This is why a Dutch sitter's first paint is already Dutch — there
  // is no async detect-then-swap, so no flash of English. See src/lib/i18n.
  ensureSitterI18n(resolveSitterLocale(token));

  // Correct <html lang> on the client only. The shell ships lang="en" from the
  // server (see __root RootShell); mutating documentElement here is OUTSIDE
  // React's render tree, so it can never cause a hydration mismatch (#418).
  // Trade-off: a screen reader gets the "en" hint on the very first paint,
  // before this runs. Acceptable on a token-gated page — but do NOT repeat this
  // pattern on the SSR'd marketing "/" route in Phase 2; set lang at render there.
  useEffect(() => {
    const apply = () => { document.documentElement.lang = sitterI18n.language; };
    apply();
    sitterI18n.on("languageChanged", apply);
    return () => { sitterI18n.off("languageChanged", apply); document.documentElement.lang = "en"; };
  }, []);

  return (
    <I18nextProvider i18n={sitterI18n}>
      <Suspense fallback={<FullPageSkeleton />}>
        <SitterLayout />
      </Suspense>
    </I18nextProvider>
  );
}

function SitterLayout() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: ctx } = useSitterContext(token);
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    // Owner "View as sitter" preview (?preview=1) must NOT count as a sitter
    // visit — skip the analytics entirely.
    const isPreview = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "1";
    if (isPreview) return;
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
                <span className="text-xs font-medium text-[#5f5e5a]">{t("sitter.header.caringForCount", "Caring for {{n}} birds", { n: ctx.birds.length })}</span>
              ) : (
                <span className="block truncate text-sm font-medium text-[#1a3d2e]">{ctx.bird?.name}</span>
              ))}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <SitterLanguageToggle token={token} />
              <span className="shrink-0 rounded-full bg-[#d6e8dc] px-2.5 py-1 text-[11px] font-medium text-[#1a5e3f]">
                {t("sitter.header.sitActive", "Sit active")}
              </span>
              {/* Persistent walkthrough replay — the question mark in the upper
                  right on every screen except Home, where the labeled
                  "Walkthrough" chip serves this role. */}
              {!onHome && (
                <button
                  onClick={replaySitterOnboarding}
                  aria-label={t("sitter.header.replayWalkthrough", "Replay walkthrough")}
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
      aria-busy="true"
    >
      {/* Shapes only — NO text. This renders on the server (ssr:false) before
          the client has resolved the locale; any word here would flash in the
          wrong language for a Dutch sitter on every load. */}
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
      aria-busy="true"
    >
      {/* Shapes only — NO text (see TabSkeleton). Server-rendered before the
          client resolves the locale, so any word would flash wrong-language. */}
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
