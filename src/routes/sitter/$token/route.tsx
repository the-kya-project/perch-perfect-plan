import { createFileRoute, Outlet, useSearch, useLocation, retainSearchParams } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import { getSitterContext } from "@/lib/sitter.functions";
import { EmergencyBar } from "@/components/EmergencyBar";
import { SitterOnboarding } from "@/components/SitterOnboarding";
import { SitterShellContext, type SitterShell } from "@/components/sitter/sitterShared";
import { K, SERIF } from "@/components/kya";
import { presentCareSections } from "@/lib/sitterCareSections";
import { track } from "@/lib/analytics";
import { reportError } from "@/lib/errorReporting";
import { SUPPORT_EMAIL } from "@/lib/support";
import { PullToRefresh } from "@/components/PullToRefresh";
import { I18nextProvider, useTranslation } from "react-i18next";
import { sitterI18n, ensureSitterI18n, resolveSitterLocale } from "@/lib/i18n";
import { localDateISO } from "@/lib/localDay";
import { isOwnerPreview } from "@/lib/sitterPreviewMode";

// `saved`: set by the daily health check after a save (Today shows the
// "Saved. Next: …" confirmation once, then clears it). Never retained.
const searchSchema = z.object({
  birdId: z.string().uuid().optional(),
  saved: z.coerce.number().optional().catch(undefined),
});

export const Route = createFileRoute("/sitter/$token")({
  ssr: false,
  validateSearch: searchSchema,
  search: { middlewares: [retainSearchParams(["birdId"])] },
  head: () => ({ meta: [
    { title: "Sitter access — Kya & Co." },
    { name: "robots", content: "noindex,nofollow" },
  ]}),
  errorComponent: ({ error }) => <SitterLinkError error={error as Error} />,
  component: SitterRoot,
});

/**
 * Terminal state for a sitter link that can't be opened.
 *
 * Used in two places, and it has to be: TanStack Router's `errorComponent`
 * catches errors from the route itself, but `useSuspenseQuery` throws from
 * INSIDE the <Suspense> below, and that throw was escaping the router boundary
 * — leaving the sitter staring at the loading skeleton forever on a revoked,
 * expired, or deleted link. React Query requires an error boundary paired with
 * the Suspense boundary, so SitterErrorBoundary (below) renders this too.
 */
/** The sit has no birds yet. Carries the owner's first name (null when the
 *  server had none) so the screen can say who to ask. */
class SitterNoBirdsError extends Error {
  ownerFirstName: string | null;
  constructor(ownerFirstName: string | null) {
    super("SITTER_SIT_NO_BIRDS");
    this.name = "SitterNoBirdsError";
    this.ownerFirstName = ownerFirstName;
  }
}

function SitterLinkError({ error }: { error: Error }) {
  const code = error.message;
  const noBirdsOwner = error instanceof SitterNoBirdsError ? error.ownerFirstName : null;
  // Rendered outside the sitter <I18nextProvider> in the router case, so read
  // the sitter instance directly. Resolve the locale from the browser (no token
  // here) and translate — errors are rare, so the per-token override isn't
  // worth threading in.
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
      : code === "SITTER_SIT_NO_BIRDS"
      ? {
          title: t("sitter.error.noBirds.title", "This sit doesn't have any birds yet"),
          body: noBirdsOwner
            ? t("sitter.error.noBirds.bodyName", "Ask {{name}} to add one.", { name: noBirdsOwner })
            : t("sitter.error.noBirds.body", "Ask the owner to add one."),
        }
      : code === "SITTER_LINK_UNAVAILABLE"
      ? { title: t("sitter.error.unavailable.title", "This sitter link can't be opened"), body: t("sitter.error.unavailable.body", "It may have expired or been turned off. Check your connection and try again.") }
      : null;
  // Anything else is a real failure, not a link state: report it, and show the
  // friendly screen instead of the raw message.
  const unexpected = copy === null;
  useEffect(() => {
    if (unexpected) reportError(error, { mechanism: "react_error_boundary", boundary: "sitter" });
  }, [error, unexpected]);
  if (unexpected) {
    return (
      <div className="setup-frame grid min-h-screen place-items-center bg-[#f1f5f0] p-6 text-center text-[#1a3d2e]">
        <div className="max-w-sm rounded-[20px] bg-white p-6">
          <h1 className="m-0 text-[22px] font-[700] leading-[1.2]" style={{ fontFamily: SERIF }}>{t("sitter.error.crash.title", "Something went wrong")}</h1>
          <p className="mt-2 text-sm text-[#5f5e5a]">
            {t("sitter.error.crash.body", "Sorry, that page didn't load properly. Try refreshing, and if it keeps happening, email us at {{email}}.", { email: SUPPORT_EMAIL })}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex min-h-[48px] items-center rounded-full border-2 border-[#1a3d2e] bg-[#f2b33d] px-6 text-[15px] font-[700] text-[#1a3d2e]"
          >
            {t("sitter.error.refresh", "Refresh")}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="setup-frame grid min-h-screen place-items-center bg-[#f1f5f0] p-6 text-center text-[#1a3d2e]">
      <div className="max-w-sm rounded-[20px] bg-white p-6">
        <h1 className="m-0 text-[22px] font-[700] leading-[1.2]" style={{ fontFamily: SERIF }}>{copy.title}</h1>
        <p className="mt-2 text-sm text-[#5f5e5a]">{copy.body}</p>
        {code !== "SITTER_SIT_PAUSED" && code !== "SITTER_SIT_NO_BIRDS" && (
          <p className="mt-4 text-xs text-[#5f5e5a]">{t("sitter.error.askNew", "Ask the owner to send you a new link.")}</p>
        )}
      </div>
    </div>
  );
}

/** Catches the useSuspenseQuery throw that the router boundary does not see. */
class SitterErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    return this.state.error ? <SitterLinkError error={this.state.error} /> : this.props.children;
  }
}

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
      <SitterErrorBoundary>
        <Suspense fallback={<FullPageSkeleton />}>
          <SitterLayout />
        </Suspense>
      </SitterErrorBoundary>
    </I18nextProvider>
  );
}

function SitterLayout() {
  const { token } = Route.useParams();
  const { data: ctx } = useSitterContext(token);
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    // An owner preview must NOT count as a sitter visit — skip the analytics.
    if (isOwnerPreview()) return;
    firedRef.current = true;
    track("sitter_link_opened", { bird_count: ctx.birds?.length ?? 0 });
  }, [ctx]);

  // ONE-BIRD RULE, decided once per app open from the first context load and
  // held until the link is opened again: one bird → no Home tab, the app opens
  // on Today; 2+ birds → Home tab, the app opens on Home. A bird the owner adds
  // mid-sit (a refetch now lists it) only changes the tab set on the next open.
  const [shell] = useState<SitterShell>(() => ({
    multi: (ctx.birds?.length ?? 0) > 1,
    pinnedBirdId: (ctx.birds?.length ?? 0) > 1 ? undefined : ctx.activeBirdId,
  }));

  // Each screen renders its own header now (tab, page or task header), so the
  // shell is just the mist page, the bottom bar and the walkthrough. Tasks
  // (the daily health check) take the whole screen: no bottom bar.
  const pathname = useLocation({ select: (l) => l.pathname });
  const onTask = /\/scan\/?$/.test(pathname);
  // Emergency is a full dark-forest page that owns its background and its
  // room for the bar, so the shell adds neither there.
  const ownsBackground = /\/emergency\/?$/.test(pathname);

  return (
    <SitterShellContext.Provider value={shell}>
      <PullToRefresh>
        <div
          className={`setup-frame min-h-screen ${onTask || ownsBackground ? "" : "pb-[calc(env(safe-area-inset-bottom)+96px)]"}`}
          style={ownsBackground ? undefined : { background: K.mist, color: K.forest }}
        >
          <Suspense fallback={<TabSkeleton />}>
            <Outlet />
          </Suspense>
          {!onTask && <EmergencyBar token={token} activeBirdId={ctx.activeBirdId} />}
          <SitterOnboarding birds={ctx.birds} bird={ctx.bird} careSections={presentCareSections(ctx)} hasClips={(ctx.watchClips?.length ?? 0) > 0} token={token} />
        </div>
      </PullToRefresh>
    </SitterShellContext.Provider>
  );
}

/**
 * How long to wait for the sitter context before giving up.
 *
 * Not arbitrary. When the server function rejects a token it answers HTTP 200
 * with a `$TSR/Error` envelope carrying the sentinel (SITTER_LINK_INVALID and
 * friends) — but deserializing that envelope throws outside the promise React
 * Query is awaiting, so the query NEVER SETTLES. The sitter sat on the loading
 * skeleton forever: no error, no message, nothing in the UI. Verified against a
 * deleted owner's token in production and locally.
 *
 * Until that framework behaviour is fixed upstream, this guard guarantees the
 * query settles so the error boundary can render a real message.
 */
const SITTER_CTX_TIMEOUT_MS = 8_000;

/** Verdicts about the link itself — retrying one cannot change the answer. */
const TERMINAL_SITTER_ERRORS = new Set([
  "SITTER_LINK_INVALID",
  "SITTER_LINK_REVOKED",
  "SITTER_LINK_EXPIRED",
  "SITTER_SIT_PAUSED",
  "SITTER_SIT_NO_BIRDS",
]);

function isTerminalSitterError(error: unknown): boolean {
  return error instanceof Error && TERMINAL_SITTER_ERRORS.has(error.message);
}

function withSettleGuard<T>(work: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("SITTER_LINK_UNAVAILABLE")), SITTER_CTX_TIMEOUT_MS);
    work.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

export function useSitterContext(token: string) {
  const search = useSearch({ from: "/sitter/$token" });
  const birdId = search.birdId;
  const fn = useServerFn(getSitterContext);
  return useSuspenseQuery({
    queryKey: ["sitter-ctx", token, birdId ?? null],
    queryFn: () => withSettleGuard(fn({ data: { token, birdId, today: localDateISO() } })).then((ctx) => {
      // A sit with no birds comes back as a code (with the owner's first name)
      // instead of a context: raise it as a link state for the error boundary.
      if ("code" in ctx) throw new SitterNoBirdsError(ctx.ownerFirstName ?? null);
      return ctx;
    }),
    // Retry a transient blip, but never a verdict. A token that is invalid,
    // revoked, expired, or whose sit is paused will not become valid on a
    // second attempt — retrying it only doubles how long the sitter waits for
    // a message that was already decided.
    retry: (failureCount, error) => failureCount < 1 && !isTerminalSitterError(error),
  });
}


function SkeletonLine({ className = "", dark = false }: { className?: string; dark?: boolean }) {
  return <div className={`animate-pulse rounded-md ${dark ? "bg-white/15" : "bg-[#e3ebe2]"} ${className}`} />;
}

function TabSkeleton() {
  return (
    <div
      className="mx-auto max-w-md space-y-4 px-4 py-5"
      role="status"
      aria-busy="true"
    >
      {/* Shapes only — NO text. This renders on the server (ssr:false) before
          the client has resolved the locale; any word here would flash in the
          wrong language for a Dutch sitter on every load. */}
      <div className="space-y-3 rounded-[20px] bg-white p-4">
        <SkeletonLine className="h-4 w-1/2" />
        <SkeletonLine className="h-3 w-3/4" />
        <SkeletonLine className="h-3 w-2/3" />
      </div>
      <div className="space-y-3 rounded-[20px] bg-white p-4">
        <SkeletonLine className="h-4 w-2/5" />
        <SkeletonLine className="h-10 w-full" />
        <SkeletonLine className="h-10 w-full" />
        <SkeletonLine className="h-10 w-5/6" />
      </div>
      <div className="space-y-3 rounded-[20px] bg-white p-4">
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
      className="min-h-screen pb-32"
      style={{ background: K.mist }}
      role="status"
      aria-busy="true"
    >
      {/* Shapes only — NO text (see TabSkeleton). Server-rendered before the
          client resolves the locale, so any word would flash wrong-language. */}
      <div style={{ background: K.forest }}>
        <div className="mx-auto max-w-md space-y-3 px-5 pb-[46px] pt-[calc(env(safe-area-inset-top)+20px)]">
          <div className="flex items-center gap-2">
            <SkeletonLine dark className="h-7 w-28" />
            <div className="flex-1" />
            <SkeletonLine dark className="size-11 rounded-full" />
          </div>
          <SkeletonLine dark className="mt-6 h-7 w-2/3" />
          <SkeletonLine dark className="h-3 w-3/4" />
        </div>
      </div>
      <div className="relative -mt-[26px] rounded-t-[26px]" style={{ background: K.mist }}>
        <TabSkeleton />
      </div>
    </div>
  );
}
