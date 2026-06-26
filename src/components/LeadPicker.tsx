import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type LeadOption = { userId: string; name: string; isOwner: boolean };

// The owner + every household member who has access to ALL the given birds —
// i.e. everyone eligible to be "in charge" of a sit covering those birds. The
// owner is always first and is a valid choice (the default).
export function useSitLeadOptions(birdIds: string[], ownerId: string | null | undefined) {
  const key = [...birdIds].sort().join(",");
  return useQuery({
    queryKey: ["sit-lead-options", ownerId ?? null, key],
    enabled: !!ownerId && birdIds.length > 0,
    queryFn: async (): Promise<LeadOption[]> => {
      // Household members on EVERY selected bird (mirrors sit-eligible-household).
      const { data: rows } = await supabase
        .from("bird_members").select("user_id, bird_id")
        .in("bird_id", birdIds).eq("role", "household");
      const byUser = new Map<string, Set<string>>();
      for (const r of (rows ?? []) as any[]) {
        (byUser.get(r.user_id) ?? byUser.set(r.user_id, new Set()).get(r.user_id)!).add(r.bird_id);
      }
      const memberIds = [...byUser.entries()]
        .filter(([, s]) => s.size === birdIds.length)
        .map(([id]) => id)
        .filter((id) => id !== ownerId);

      const ids = [ownerId as string, ...memberIds];
      const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ids);
      const nameById = new Map((profs ?? []).map((p: any) => [p.id, (p.display_name ?? "").toString().trim()]));
      const members = memberIds
        .map((id) => ({ userId: id, name: nameById.get(id) || "Household member", isOwner: false }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return [{ userId: ownerId as string, name: nameById.get(ownerId as string) || "You", isOwner: true }, ...members];
    },
  });
}

export function firstName(name: string): string {
  return (name ?? "").trim().split(/\s+/)[0] || name;
}

// "Who's in charge of this sit?" selector — styled to match SitForm's
// CaregiverPicker. Renders nothing when there's only one eligible person (just
// the owner): no choice to make, the caller auto-assigns the owner.
export function LeadPicker({
  birdIds, ownerId, value, onChange,
}: {
  birdIds: string[];
  ownerId: string | null | undefined;
  value: string | null;
  onChange: (userId: string) => void;
}) {
  const { data: options = [] } = useSitLeadOptions(birdIds, ownerId);
  if (options.length < 2) return null;
  return (
    <div className="space-y-3 rounded-[14px] border border-[#e0d8c4] bg-white p-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-[#5f5e5a]">Who's in charge of this sit?</p>
      <div className="space-y-2">
        {options.map((o) => {
          const on = value === o.userId;
          const initial = (o.name?.slice(0, 1) ?? "?").toUpperCase();
          return (
            <button
              key={o.userId}
              type="button"
              onClick={() => onChange(o.userId)}
              aria-pressed={on}
              className={`flex w-full items-center gap-3 rounded-[12px] border p-3 text-left active:scale-[0.99] ${
                on ? "border-[#2d6a4f] bg-[#e8f0ec] ring-1 ring-[#2d6a4f]" : "border-[#e0d8c4] bg-white"
              }`}
            >
              <span className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-medium ${on ? "bg-[#1a3d2e] text-white" : "bg-[#cfe3dc] text-[#1a5e3f]"}`}>{initial}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-[14px] font-medium text-[#1a3d2e]">{o.name}</span>
                  {o.isOwner && <span className="shrink-0 rounded-full bg-[#cfe3dc] px-2 py-0.5 text-[10px] font-medium text-[#1a5e3f]">You</span>}
                </span>
              </span>
              {on && <Check className="size-4 shrink-0 text-[#2d6a4f]" aria-hidden />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
