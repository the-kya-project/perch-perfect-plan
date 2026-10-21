import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye, X } from "lucide-react";
import { getSitterPreviewToken } from "@/lib/sitterPreview.functions";
import { track } from "@/lib/analytics";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { friendlyError } from "@/lib/errorMessage";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PreviewNotice } from "@/components/PreviewNotice";

// "View as sitter" — opens the REAL token-based sitter read-only view in an
// iframe (the exact same renderer a sitter gets), with a preview token that is
// not a sit (sitterPreview.functions.ts). A banner makes the mode obvious with
// an exit back to the record.
export const Route = createFileRoute("/_authenticated/birds/$birdId/view-as-sitter")({
  head: () => ({ meta: [{ title: i18next.t("viewAsSitter.metaTitle", "View as sitter — Kya & Co.") }] }),
  component: ViewAsSitter,
});

function ViewAsSitter() {
  const { t } = useTranslation();
  const { birdId } = Route.useParams();
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    track("view_as_sitter_opened", {});
    let cancelled = false;
    (async () => {
      try {
        const { token: tok } = await getSitterPreviewToken({ data: { birdId } });
        if (!cancelled) setToken(tok);
      } catch (e: any) {
        if (!cancelled) setError(friendlyError(e, t("viewAsSitter.buildFailed", "Couldn't build the sitter preview.")));
      }
    })();
    return () => { cancelled = true; };
  }, [birdId]);

  const src = token ? `/sitter/${token}?birdId=${birdId}&preview=1` : null;
  // The bird's name for "Back to Mango" on the error card; only fetched then.
  const { data: birdName } = useQuery({
    queryKey: ["view-as-sitter-bird-name", birdId],
    enabled: !!error,
    queryFn: async () => {
      const { data } = await supabase.from("birds").select("name").eq("id", birdId).maybeSingle();
      return ((data as { name: string | null } | null)?.name ?? "").trim() || null;
    },
  });

  if (error) {
    return (
      <PreviewNotice
        closeLabel={t("viewAsSitter.closePreview", "Close preview")}
        onClose={() => navigate({ to: "/dashboard" })}
        mode={t("viewAsSitter.mode", "Viewing as your sitter")}
        title={t("viewAsSitter.errorTitle", "The preview didn't load")}
        body={error}
        action={{
          label: birdName
            ? t("viewAsSitter.backToBird", "Back to {{name}}", { name: birdName })
            : t("viewAsSitter.backToRecord", "Back to the record"),
          onClick: () => navigate({ to: "/birds/$birdId", params: { birdId } }),
        }}
      />
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-[#f1f5f0]">
      {/* Read-only mode banner: 44px Close top left, then the mode line. */}
      <div className="setup-frame flex items-center gap-3 bg-[#12291f] px-4 py-2 pt-[max(env(safe-area-inset-top),0.5rem)] text-white">
        <Link
          to="/dashboard"
          aria-label={t("viewAsSitter.closePreview", "Close preview")}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-white/15 text-white active:scale-95"
        >
          <X className="size-5" aria-hidden="true" />
        </Link>
        <span className="flex min-w-0 items-center gap-2 text-[13.5px] font-[500] text-white">
          <Eye className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{t("viewAsSitter.bannerReadOnly", "Viewing as your sitter · read only")}</span>
        </span>
      </div>

      {src ? (
        <iframe src={src} title={t("viewAsSitter.iframeTitle", "Sitter view")} className="w-full flex-1 border-0 bg-[#f1f5f0]" />
      ) : (
        <div className="flex-1 animate-pulse bg-[#e3ebe2]" />
      )}
    </div>
  );
}
