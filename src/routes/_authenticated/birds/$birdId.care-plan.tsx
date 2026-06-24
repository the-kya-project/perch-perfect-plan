import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getHouseholdCarePlanView } from "@/lib/household.functions";
import { CareSheetView } from "@/components/CareSheetView";
import { ArrowLeft, Loader2 } from "lucide-react";

// Read-only care-plan view for household members (and any member). Reuses the
// same CareSheetView the sitter care-sheet renders, then adds the daily routine
// and emergency contacts. No edit affordances — editing is owner-only.
export const Route = createFileRoute("/_authenticated/birds/$birdId/care-plan")({
  head: () => ({ meta: [{ title: "Care plan — Parrot Care Co-Pilot" }] }),
  component: HouseholdCarePlan,
});

const TIME_LABEL: Record<string, string> = {
  morning: "Morning", midday: "Midday", afternoon: "Afternoon", evening: "Evening", night: "Night", anytime: "Anytime",
};
const TIME_ORDER = ["morning", "midday", "afternoon", "evening", "night", "anytime"];

const CONTACT_ROWS: { key: string; label: string }[] = [
  { key: "owner_phone", label: "Owner" },
  { key: "backup_name", label: "Backup contact" },
  { key: "backup_phone", label: "Backup phone" },
  { key: "avian_vet_name", label: "Avian vet" },
  { key: "avian_vet_phone", label: "Avian vet phone" },
  { key: "avian_vet_address", label: "Avian vet address" },
  { key: "emergency_vet_name", label: "Emergency vet" },
  { key: "emergency_vet_phone", label: "Emergency vet phone" },
  { key: "emergency_vet_address", label: "Emergency vet address" },
  { key: "poison_control", label: "Poison control" },
  { key: "carrier_location", label: "Carrier location" },
  { key: "first_aid_kit_location", label: "First-aid kit" },
];

function HouseholdCarePlan() {
  const { birdId } = Route.useParams();
  const getView = useServerFn(getHouseholdCarePlanView);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["household-care-plan", birdId],
    queryFn: () => getView({ data: { birdId } }),
    retry: false,
  });

  const name = (data?.bird as any)?.name ?? "this bird";
  const tasks = (data?.tasks ?? []) as any[];
  const contacts = (data?.contacts ?? {}) as Record<string, string | null>;

  // Group routine tasks by time of day.
  const groups = TIME_ORDER
    .map((t) => ({ t, items: tasks.filter((x) => (x.time_of_day || "anytime") === t) }))
    .filter((g) => g.items.length > 0);
  const ungrouped = tasks.filter((x) => !TIME_ORDER.includes(x.time_of_day || "anytime"));
  if (ungrouped.length) groups.push({ t: "anytime", items: ungrouped });

  const contactRows = CONTACT_ROWS.filter((r) => (contacts[r.key] ?? "").toString().trim());

  return (
    <div className="min-h-screen bg-[#f4f1e8] pb-nav">
      <header className="sticky top-0 z-10 border-b border-[#e3ded0] bg-[#f4f1e8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 px-5 py-3">
          <Link to="/birds/$birdId/plan" params={{ birdId }} aria-label="Back to care plan" className="-ml-1 rounded p-1 text-[#1a3d2e]">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="truncate text-base font-medium text-[#1a3d2e]">{name}'s care plan</h1>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-5 py-5">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-[#5f5e5a]">
            <Loader2 className="size-4 animate-spin" /> Loading the care plan…
          </div>
        ) : isError || !data ? (
          <div className="rounded-2xl bg-white p-6 text-center text-sm text-[#5f5e5a] ring-1 ring-[#e3dcc9]">
            Couldn't load this care plan.
          </div>
        ) : (
          <>
            <CareSheetView data={{ bird: data.bird, plan: data.plan, clips: data.watchClips ?? [], baselineClipUrl: data.baselineClipUrl }} />

            {/* Daily routine */}
            {groups.length > 0 && (
              <section className="rounded-2xl bg-[#efe9da] p-4 shadow-sm">
                <h2 className="text-[11px] font-medium uppercase tracking-widest text-[#5f5e5a]">Daily rhythm</h2>
                <div className="mt-3 space-y-3">
                  {groups.map((g) => (
                    <div key={g.t}>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-[#5f5e5a]">{TIME_LABEL[g.t] ?? g.t}</p>
                      <ul className="mt-1 space-y-1.5">
                        {g.items.map((it) => (
                          <li key={it.id} className="text-sm text-[#1a3d2e]">
                            {it.title}
                            {it.instructions && <span className="block text-xs text-[#5f5e5a] whitespace-pre-line">{it.instructions}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Emergency contacts (household can view) */}
            {contactRows.length > 0 && (
              <section className="rounded-2xl bg-warn-red/5 p-4 ring-1 ring-warn-red/30">
                <h2 className="text-[11px] font-medium uppercase tracking-widest text-warn-red">Emergency contacts</h2>
                <div className="mt-3 space-y-3">
                  {contactRows.map((r) => {
                    const v = (contacts[r.key] ?? "").toString();
                    const isPhone = /phone|control|owner/.test(r.key) && /[0-9]/.test(v);
                    return (
                      <div key={r.key}>
                        <p className="text-[10px] font-medium uppercase tracking-wider text-[#5f5e5a]">{r.label}</p>
                        {isPhone ? (
                          <a href={`tel:${v.replace(/[^0-9+]/g, "")}`} className="mt-0.5 block text-sm font-medium text-[#1a3d2e] underline">{v}</a>
                        ) : (
                          <p className="mt-0.5 text-sm text-[#1a3d2e] whitespace-pre-line">{v}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <p className="px-1 text-center text-[11px] text-[#5f5e5a]">
              Read-only. Only {name}'s owner can edit the care plan.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
