import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { addExistingHouseholdMember } from "@/lib/household.functions";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

// One person from getHouseholdAccount().members, narrowed to what this sheet
// needs. `scope` is DERIVED there (birdIds.length >= totalBirds), not stored —
// so it is only meaningful when the account was fetched BEFORE the new bird was
// inserted. new.tsx snapshots it at that moment and passes it down; don't
// refetch here or everyone with "all" collapses to "scoped" (they'd hold n of
// n+1 birds) and nothing would pre-check.
export type ShareCandidate = {
  userId: string;
  name: string | null;
  email: string | null;
  birdNames: string[];
  scope: "all" | "scoped";
};

function memberLabel(m: ShareCandidate) {
  return m.name?.trim() || m.email || "Household member";
}

// Asked right after a bird is created, before the care-plan walkthrough. The
// bird is ALREADY SAVED by the time this renders — every exit here continues to
// setup, and a failed grant is reported but never blocks the care plan.
export function ShareNewBirdSheet({
  birdName,
  members,
  birdId,
  onContinue,
}: {
  birdName: string;
  members: ShareCandidate[];
  birdId: string;
  onContinue: () => void;
}) {
  // Pre-check anyone who could see every bird that existed before this one —
  // keeping them is the intent-preserving default. People already scoped to
  // specific birds stay unchecked; that scoping was deliberate.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(members.filter((m) => m.scope === "all").map((m) => m.userId)),
  );
  const [sharing, setSharing] = useState(false);
  const addExisting = useServerFn(addExistingHouseholdMember);

  const toggle = (id: string) =>
    setSelected((p) => {
      const n = new Set(p);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  async function onShare() {
    if (sharing) return;
    const picked = members.filter((m) => selected.has(m.userId));
    if (!picked.length) { onContinue(); return; }
    setSharing(true);
    // allSettled, not all: one person's failure must not cancel the rest, and
    // must not strand the owner short of the care plan.
    const results = await Promise.allSettled(
      picked.map((m) => addExisting({ data: { birdId, userId: m.userId } })),
    );
    const failed = picked.filter((_, i) => results[i].status === "rejected");
    const shared = picked.filter((_, i) => results[i].status === "fulfilled");
    if (shared.length) {
      toast.success(
        shared.length === 1
          ? `${memberLabel(shared[0])} can see ${birdName}.`
          : `${shared.length} people can see ${birdName}.`,
      );
    }
    if (failed.length) {
      // Name who failed — "something went wrong" leaves the owner unable to
      // tell who still needs access.
      toast.error(`Couldn't share ${birdName} with ${failed.map(memberLabel).join(", ")}. You can add them from Household.`);
    }
    onContinue();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#f4f1e8]">
      <header className="flex items-center justify-between border-b border-[#e3ded0] px-5 py-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <span className="w-12" />
        <h2 className="text-base font-medium text-[#1a3d2e]">Who else helps?</h2>
        <span className="w-12" />
      </header>

      <div className="mx-auto w-full max-w-md flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <p className="text-sm text-[#5f5e5a]">
          {birdName} is saved. These people help with your other birds — pick anyone who should see {birdName} too.
        </p>

        <div>
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#5f5e5a]">Your household</span>
          <div className="overflow-hidden rounded-[14px] bg-white ring-1 ring-[#e3dcc9]">
            {members.map((m, i) => {
              const label = memberLabel(m);
              return (
                <label
                  key={m.userId}
                  className={`flex min-h-[56px] cursor-pointer items-center gap-3 px-4 py-3 ${i ? "border-t border-[#ece6d6]" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(m.userId)}
                    onChange={() => toggle(m.userId)}
                    className="size-4 shrink-0 accent-[#1a3d2e]"
                  />
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#cfe3dc] text-sm font-medium text-[#1a5e3f]">
                    {(label.slice(0, 1) || "?").toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[#1a3d2e]">{label}</span>
                    <span className="mt-0.5 block truncate text-xs text-[#8a897f]">
                      {m.scope === "all" ? "Helps with all your birds" : `Helps with ${m.birdNames.join(", ")}`}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-[#8a897f]">You can change who sees {birdName} anytime from Household.</p>
        </div>
      </div>

      <footer className="border-t border-[#e3ded0] px-5 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
        <div className="mx-auto flex max-w-md gap-2">
          <button
            type="button"
            disabled={sharing}
            onClick={onContinue}
            className="min-h-[44px] flex-1 rounded-[14px] border border-[#c8bfa6] text-sm font-medium text-[#1a3d2e] disabled:opacity-50"
          >
            Not now
          </button>
          <button
            type="button"
            disabled={sharing}
            onClick={onShare}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-[14px] bg-[#1a3d2e] text-sm font-medium text-white disabled:opacity-50"
          >
            {sharing && <Loader2 className="size-4 animate-spin" />}
            {selected.size ? "Share and continue" : "Continue"}
          </button>
        </div>
      </footer>
    </div>
  );
}
