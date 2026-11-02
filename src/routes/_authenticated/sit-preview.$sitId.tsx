import { createFileRoute, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Eye, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { K } from "@/components/kya";
import { PreviewNotice } from "@/components/PreviewNotice";
import { catchUpBeforePreview, updateIsReady, updateNow } from "@/lib/sw-register";
import { stalledFrameAction } from "@/lib/sitPreviewRecovery";

// Owner "View as sitter" — previews the REAL token-based sitter view for a
// specific sit (the exact renderer + content the sitter gets), in an iframe
// inside the owner's authenticated session. `?preview=1` tells the sitter
// loader not to count it as a sitter visit. A banner makes the mode obvious and
// links back to the Sits page (not the sitter view's own back target).
export const Route = createFileRoute("/_authenticated/sit-preview/$sitId")({
  head: () => ({ meta: [{ title: i18next.t("sitPreview.pageTitle", "Sitter preview — Kya & Co.") }] }),
  component: SitPreview,
});

type PreviewState = { previewToken?: string | null; previewLabel?: string; previewHousehold?: boolean };

function SitPreview() {
  const { t } = useTranslation();
  const { sitId } = Route.useParams();
  const navigate = useNavigate();
  // Fast path: the sit card already holds the sit's token, caregiver label, and
  // household flag, so it hands them over via router *state* (not the URL — the
  // token is a capability we keep out of browser history). That lets the iframe
  // start loading at mount with zero round-trips. On a hard reload state is
  // lost, so we fall back to a one-shot query.
  const state = useLocation({ select: (l) => l.state as PreviewState });
  const hasState = state?.previewToken !== undefined || state?.previewHousehold !== undefined;

  const { data, isLoading } = useQuery({
    queryKey: ["sit-preview", sitId],
    enabled: !hasState,
    queryFn: async () => {
      const { data: sit } = await supabase
        .from("sits")
        .select("id, invite_token, sitter_name, caregiver_user_id")
        .eq("id", sitId)
        .maybeSingle();
      // Household sits have no preview (they redirect below), so only an
      // external sitter's name is ever needed here.
      const label = (sit?.sitter_name ?? "").trim() || i18next.t("sitPreview.yourSitter", "your sitter");
      return { sit: sit as any, label };
    },
  });

  const household = hasState ? !!state.previewHousehold : !!data?.sit?.caregiver_user_id;
  // Opened without the sit card's state (a reload, an old link) and the sit
  // isn't there: it was deleted. Say so, rather than the no-link message.
  const missing = !hasState && !isLoading && !data?.sit;
  const token = (hasState ? state.previewToken : data?.sit?.invite_token) as string | null | undefined;
  const label = (hasState ? state.previewLabel : data?.label) || t("sitPreview.they", "they");
  const src = token ? `/sitter/${token}?preview=1` : null;
  const resolving = !hasState && isLoading;

  // Keep a spinner over the iframe until the sitter SPA inside it finishes
  // booting, so the load reads as progress instead of a frozen blank frame.
  const [frameReady, setFrameReady] = useState(false);

  // The frame loads the live build, so an app left open across a release
  // moves onto the new one first (lib/sitPreviewRecovery.ts). Until that check
  // answers, the frame doesn't load.
  const [caughtUp, setCaughtUp] = useState(false);
  useEffect(() => {
    let live = true;
    catchUpBeforePreview().then((reloading) => { if (live && !reloading) setCaughtUp(true); }, () => { if (live) setCaughtUp(true); });
    return () => { live = false; };
  }, []);

  // If the page in the frame still hasn't started shortly before its own
  // 10-second check gives up, step in: onto a waiting build, or reload the
  // frame once.
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameKey, setFrameKey] = useState(0);
  useEffect(() => {
    if (!caughtUp || !src) return;
    const loadedAt = Date.now();
    const timer = window.setInterval(() => {
      let started = false;
      try { started = !!(frameRef.current?.contentWindow as { __kyaReady?: boolean } | null)?.__kyaReady; } catch { /* not readable: treat as not started */ }
      const action = stalledFrameAction({ started, elapsedMs: Date.now() - loadedAt, updateReady: updateIsReady(), reloadedFrame: frameKey > 0 });
      if (action === "wait") { if (started) window.clearInterval(timer); return; }
      window.clearInterval(timer);
      if (action === "update-app") void updateNow();
      else if (action === "reload-frame") { setFrameReady(false); setFrameKey((k) => k + 1); }
    }, 500);
    return () => window.clearInterval(timer);
  }, [caughtUp, src, frameKey]);

  // Household caregivers use the app itself — there's no sitter view to
  // preview. The sit cards no longer offer it, but an old link or a reload can
  // still land here: send them to the sit's own page instead.
  useEffect(() => {
    if (household && !missing && !resolving) navigate({ to: "/sits/$sitId", params: { sitId }, replace: true });
  }, [household, missing, resolving, navigate, sitId]);
  const closeToSits = () => navigate({ to: "/sits" });
  const closeLabel = t("sitPreview.closePreview", "Close preview");
  if (household && !missing) {
    return <PreviewNotice closeLabel={closeLabel} onClose={closeToSits} loading={t("sitPreview.openingSit", "Opening this sit…")} />;
  }
  // Still looking the sit up (opened without the sit card's state).
  if (resolving) {
    return <PreviewNotice closeLabel={closeLabel} onClose={closeToSits} loading={t("sitPreview.loading", "Loading preview…")} />;
  }
  // Deleted sit, or a sitter sit with no link (household sits redirect
  // above): say so in a card, with one way on so it's never a dead end.
  if (!src) {
    return (
      <PreviewNotice
        closeLabel={closeLabel}
        onClose={closeToSits}
        mode={t("sitPreview.mode", "Sitter preview")}
        title={missing ? t("sitPreview.sitGoneTitle", "This sit was deleted") : t("sitPreview.noLinkTitle", "No sitter link")}
        body={missing
          ? t("sitPreview.sitGoneBody", "Its sitter link stopped working when it was deleted, so there's nothing to preview.")
          : t("sitPreview.noSitterLink", "This sit doesn't have a sitter link, so there's nothing to preview.")}
        action={missing
          ? { label: t("sitPreview.backToSits", "Back to Sits"), onClick: closeToSits }
          : { label: t("sitPreview.seeActivity", "See this sit's activity"), onClick: () => navigate({ to: "/sits/$sitId", params: { sitId } }) }}
      />
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col" style={{ background: K.mist }}>
      {/* Close top left (44px), like a task's Close, then the mode line. */}
      <div className="setup-frame flex items-center gap-3 bg-[#12291f] px-4 py-2 pt-[max(env(safe-area-inset-top),0.5rem)] text-white">
        <Link
          to="/sits"
          aria-label={t("sitPreview.closePreview", "Close preview")}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-white/15 text-white active:scale-95"
        >
          <X className="size-5" aria-hidden="true" />
        </Link>
        <span className="flex min-w-0 items-center gap-2 text-[13.5px] font-[500] text-white">
          <Eye className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{t("sitPreview.sitterBanner", "Sitter preview · how {{label}} will see this sit", { label })}</span>
        </span>
      </div>

      <div className="relative flex-1">
        {caughtUp && <iframe
          key={frameKey}
          ref={frameRef}
          src={src}
          title={t("sitPreview.iframeTitle", "Sitter view preview")}
          onLoad={() => setFrameReady(true)}
          className="absolute inset-0 size-full border-0"
          style={{ background: K.mist }}
        />}
        {!frameReady && (
          <div className="setup-frame pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-[15px]" style={{ background: K.mist, color: K.quiet }}>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t("sitPreview.loading", "Loading preview…")}
          </div>
        )}
      </div>
    </div>
  );
}
