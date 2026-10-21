import { createFileRoute, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Eye, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import i18next from "i18next";

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

  // Household caregivers use the app itself — there's no sitter view to
  // preview. The sit cards no longer offer it, but an old link or a reload can
  // still land here: send them to the sit's own page instead.
  useEffect(() => {
    if (household && !missing && !resolving) navigate({ to: "/sits/$sitId", params: { sitId }, replace: true });
  }, [household, missing, resolving, navigate, sitId]);
  if (household && !missing) {
    return (
      <div className="flex h-[100dvh] items-center justify-center gap-2 bg-[#f1f5f0] text-[14px] text-[var(--mute)]">
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-[#f1f5f0]">
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
          {/* Blank until we know it's a sitter sit (a household sit redirects). */}
          <span className="truncate">{!resolving && t("sitPreview.sitterBanner", "Sitter preview · how {{label}} will see this sit", { label })}</span>
        </span>
      </div>

      {resolving ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-[14px] text-[var(--mute)]">
          <Loader2 className="size-4 animate-spin" /> {t("sitPreview.loading", "Loading preview…")}
        </div>
      ) : src ? (
        <div className="relative flex-1">
          <iframe
            src={src}
            title={t("sitPreview.iframeTitle", "Sitter view preview")}
            onLoad={() => setFrameReady(true)}
            className="absolute inset-0 size-full border-0 bg-[#f1f5f0]"
          />
          {!frameReady && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-[#f1f5f0] text-[14px] text-[var(--mute)]">
              <Loader2 className="size-4 animate-spin" /> {t("sitPreview.loading", "Loading preview…")}
            </div>
          )}
        </div>
      ) : missing ? (
        <div className="grid flex-1 place-items-center p-6 text-center">
          <div className="max-w-[34ch]">
            <p className="t-body text-[var(--ink2)]">
              {t("sitPreview.sitGone", "This sit was deleted, so there's nothing to preview.")}
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: "/sits" })}
              className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-[12px] bg-[var(--ink)] px-[18px] text-[15px] font-[500] text-white"
            >
              {t("sitPreview.backToSits", "Back to Sits")}
            </button>
          </div>
        </div>
      ) : (
        // A sitter sit with no link (household sits redirect above). Point the
        // owner to the sit's activity so the screen is never a dead end.
        <div className="grid flex-1 place-items-center p-6 text-center">
          <div className="max-w-[34ch]">
            <p className="t-body text-[var(--ink2)]">
              {t("sitPreview.noSitterLink", "This sit doesn't have a sitter link, so there's nothing to preview.")}
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: "/sits/$sitId", params: { sitId } })}
              className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-[12px] bg-[var(--ink)] px-[18px] text-[15px] font-[500] text-white"
            >
              {t("sitPreview.seeActivity", "See this sit's activity")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
