import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Eye, ArrowLeft, Loader2 } from "lucide-react";

// Owner "View as sitter" — previews the REAL token-based sitter view for a
// specific sit (the exact renderer + content the sitter gets), in an iframe
// inside the owner's authenticated session. `?preview=1` tells the sitter
// loader not to count it as a sitter visit. A banner makes the mode obvious and
// links back to the Sits page (not the sitter view's own back target).
export const Route = createFileRoute("/_authenticated/sit-preview/$sitId")({
  head: () => ({ meta: [{ title: "Sitter preview — Kya & Co." }] }),
  component: SitPreview,
});

function SitPreview() {
  const { sitId } = Route.useParams();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["sit-preview", sitId],
    queryFn: async () => {
      const { data: sit } = await supabase
        .from("sits")
        .select("id, invite_token, sitter_name, caregiver_user_id")
        .eq("id", sitId)
        .maybeSingle();
      let label = (sit?.sitter_name ?? "").trim() || "your sitter";
      if (sit?.caregiver_user_id) {
        const { data: p } = await supabase.from("profiles").select("display_name").eq("id", sit.caregiver_user_id).maybeSingle();
        label = (p?.display_name ?? "").toString().trim() || "your caregiver";
      }
      return { sit: sit as any, label };
    },
  });

  const household = !!data?.sit?.caregiver_user_id;
  const token = data?.sit?.invite_token as string | undefined;
  const src = token ? `/sitter/${token}?preview=1` : null;

  return (
    <div className="flex h-[100dvh] flex-col bg-[var(--cream)]">
      <div className="flex items-center justify-between gap-3 bg-[var(--ink)] px-4 py-2.5 pt-[max(env(safe-area-inset-top),0.625rem)] text-white">
        <span className="flex min-w-0 items-center gap-2 text-[13.5px] font-[500]">
          <Eye className="size-4 shrink-0 text-[var(--lime)]" />
          <span className="truncate">{household ? "Caregiver" : "Sitter"} preview · how {data?.label ?? "they"} will see this sit</span>
        </span>
        <Link
          to="/sits"
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-[500] text-white"
        >
          <ArrowLeft className="size-3.5" /> Sits
        </Link>
      </div>

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-[14px] text-[var(--mute)]">
          <Loader2 className="size-4 animate-spin" /> Loading preview…
        </div>
      ) : src ? (
        <iframe src={src} title="Sitter view preview" className="w-full flex-1 border-0 bg-[var(--cream)]" />
      ) : (
        // Household caregivers don't use a token view — they see the in-app
        // caregiver Today screen when signed in. Point the owner to the sit's
        // activity so the button is never a dead end.
        <div className="grid flex-1 place-items-center p-6 text-center">
          <div className="max-w-[34ch]">
            <p className="t-body text-[var(--ink2)]">
              Household caregivers use the app's caregiver Today screen — there's no shareable preview link.
            </p>
            <button
              type="button"
              onClick={() => navigate({ to: "/sits/$sitId", params: { sitId } })}
              className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-[12px] bg-[var(--ink)] px-[18px] text-[15px] font-[500] text-white"
            >
              See this sit's activity
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
