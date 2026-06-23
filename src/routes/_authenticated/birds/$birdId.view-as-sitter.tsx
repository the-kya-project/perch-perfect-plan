import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Eye, X } from "lucide-react";
import { ensureSitterPreviewToken } from "@/lib/sitterPreview";

// "View as sitter" — opens the REAL token-based sitter read-only view in an
// iframe (the exact same renderer a sitter gets), provisioned via a disposable
// preview sit. A banner makes the mode obvious with an exit back to the record.
export const Route = createFileRoute("/_authenticated/birds/$birdId/view-as-sitter")({
  head: () => ({ meta: [{ title: "View as sitter — Parrot Care Co-Pilot" }] }),
  component: ViewAsSitter,
});

function ViewAsSitter() {
  const { birdId } = Route.useParams();
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: bird, error: bErr } = await supabase.from("birds").select("owner_id").eq("id", birdId).maybeSingle();
      if (cancelled) return;
      if (bErr || !bird?.owner_id) { setError("Couldn't load this bird."); return; }
      try {
        const t = await ensureSitterPreviewToken(birdId, bird.owner_id);
        if (!cancelled) setToken(t);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Couldn't build the sitter preview.");
      }
    })();
    return () => { cancelled = true; };
  }, [birdId]);

  const src = token ? `/sitter/${token}?birdId=${birdId}&preview=1` : null;

  return (
    <div className="flex h-[100dvh] flex-col bg-[#f4f1e8]">
      {/* Read-only mode banner + exit */}
      <div className="flex items-center justify-between gap-3 bg-[#1a3d2e] px-4 py-2.5 pt-[max(env(safe-area-inset-top),0.625rem)] text-white">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Eye className="size-4 shrink-0" /> Viewing as your sitter — read only
        </span>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white"
        >
          <X className="size-3.5" /> Exit
        </Link>
      </div>

      {error ? (
        <div className="grid flex-1 place-items-center p-6 text-center">
          <div>
            <p className="text-sm text-[#854F0B]">{error}</p>
            <button type="button" onClick={() => navigate({ to: "/dashboard" })} className="mt-4 rounded-xl bg-[#1a3d2e] px-4 py-2 text-sm font-medium text-white">
              Back to home
            </button>
          </div>
        </div>
      ) : src ? (
        <iframe src={src} title="Sitter view" className="w-full flex-1 border-0 bg-[#f4f1e8]" />
      ) : (
        <div className="flex-1 animate-pulse bg-[#efe9da]" />
      )}
    </div>
  );
}
