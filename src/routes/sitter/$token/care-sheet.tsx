import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useSitterContext } from "./route";
import { CarePlanView, CARE_PLAN_SECTIONS, type CareSection } from "@/components/CarePlanView";
import { saveCareSnapshot } from "@/lib/sitterCareSnapshot";
import { track } from "@/lib/analytics";

// Sitter (external link) care-sheet. Renders the SAME shared CarePlanView as the
// owner / household read view — only the data source (link token) and curation
// differ: no Routine (the sitter's Today tab) and no emergency contacts list
// (the sitter's Emergency tab + EmergencyBar), and never an edit entry.
const SITTER_SECTIONS: CareSection[] = ["food", "behavior", "home", "health", "emergency"];

export const Route = createFileRoute("/sitter/$token/care-sheet")({
  // Deep-link target (?section=…) so a link can open a specific section.
  validateSearch: (search: Record<string, unknown>): { section?: CareSection } => {
    const s = search.section;
    return { section: typeof s === "string" && (CARE_PLAN_SECTIONS as readonly string[]).includes(s) ? (s as CareSection) : undefined };
  },
  component: CareSheet,
});

function CareSheet() {
  const { token } = Route.useParams();
  const { section } = Route.useSearch();
  const { data: ctx } = useSitterContext(token);

  useEffect(() => { track("care_sheet_viewed", { surface: "sitter" }); }, []);

  // Persist a read-only offline snapshot of THIS sit's care sheet (Part B), so a
  // sitter who loses connection can still read it. Care-sheet data only; the
  // helper strips the signed photo URL.
  useEffect(() => {
    if (ctx?.bird || ctx?.plan) saveCareSnapshot(token, { bird: ctx.bird, plan: ctx.plan });
  }, [token, ctx]);

  // The sitter layout has its own sticky top bar; pin the section nav below it.
  const [topbarH, setTopbarH] = useState(0);
  useEffect(() => {
    const measure = () => setTopbarH(document.getElementById("sitter-topbar")?.offsetHeight ?? 0);
    measure();
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", measure); };
  }, [ctx.birds?.length, ctx.activeBirdId]);

  return (
    <CarePlanView
      data={{
        bird: ctx.bird,
        plan: ctx.plan,
        tasks: ctx.tasks ?? [],
        contacts: ctx.contacts ?? {},
        watchClips: ctx.watchClips ?? [],
        baselineClipUrl: ctx.baselineClipUrl,
      }}
      visibleSections={SITTER_SECTIONS}
      showEmergencyContacts={false}
      canEdit={false}
      targetSection={section}
      stickyTopPx={topbarH}
      header={
        <div className="flex items-center gap-3">
          <Link to="/sitter/$token" params={{ token }} search={{ birdId: ctx.activeBirdId }} aria-label="Back" className="-ml-1 rounded p-1 text-[var(--ink)]">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-base font-medium leading-tight text-[var(--ink)]">Care sheet</h1>
            <p className="truncate text-xs text-[var(--mute)]">Owner-entered reference</p>
          </div>
        </div>
      }
      footer={
        <p className="px-1 text-center text-[11px] text-[#5f5e5a]">
          Owner-provided reference. For general care guidance, see the{" "}
          <Link to="/sitter/$token/guide" params={{ token }} className="underline">Care guide</Link>.
        </p>
      }
    />
  );
}
