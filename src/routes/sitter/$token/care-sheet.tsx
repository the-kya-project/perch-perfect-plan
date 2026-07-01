import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { useSitterContext } from "./route";
import { CareSheetView } from "@/components/CareSheetView";
import { track } from "@/lib/analytics";

export const Route = createFileRoute("/sitter/$token/care-sheet")({
  component: CareSheet,
});

function CareSheet() {
  const { token } = Route.useParams();
  const { data: ctx } = useSitterContext(token);
  const bird = ctx.bird as any;

  useEffect(() => { track("care_sheet_viewed", { surface: "sitter" }); }, []);

  return (
    <>
      <header className="bg-[#1a3d2e]" data-coach="cp-header">
        <div className="mx-auto flex max-w-md items-center gap-3 px-5 py-3">
          <Link to="/sitter/$token" params={{ token }} search={{ birdId: ctx.activeBirdId }} className="rounded p-1 text-white/90"><ArrowLeft className="size-5" /></Link>
          <div>
            <h1 className="text-sm font-medium text-white">{bird.name}'s care sheet.</h1>
            <p className="text-[10px] uppercase tracking-wider text-[#cdeab0]">Everything the owner wants you to know.</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-5 py-5">
        <CareSheetView data={{ bird: ctx.bird, plan: ctx.plan, clips: ctx.watchClips ?? [], baselineClipUrl: ctx.baselineClipUrl }} />
        <p className="px-1 text-center text-[11px] text-[#5f5e5a]">Owner-provided reference. For general care guidance, see the <Link to="/sitter/$token/guide" params={{ token }} className="underline">Care guide</Link>.</p>
      </main>
    </>
  );
}
