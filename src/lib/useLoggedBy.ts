// Who logged a weight or ran a check, as a short label: "You", the person's
// name, or "Sitter · [name]". Reads weight_entries.logged_by / daily_logs.run_by,
// the row's source, and for sitter rows the sit's sitter_name.
import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { supabase } from "@/integrations/supabase/client";
import { fetchDisplayNames } from "@/lib/resolveNames";
import { useMyPermissions } from "@/lib/useCapability";

export type LoggedRow = { by: string | null; source: string | null; sitId: string | null };

export function useLoggedBy(rows: LoggedRow[], viewerIsOwner: boolean) {
  const myId = useMyPermissions().data?.myId ?? null;
  const people = [...new Set(rows.map((r) => r.by).filter((id): id is string => !!id && id !== myId))].sort();
  const sitIds = [...new Set(rows.filter((r) => r.source === "sitter" && r.sitId).map((r) => r.sitId as string))].sort();

  const { data: names } = useQuery({
    queryKey: ["logged-by-names", people.join(",")],
    enabled: people.length > 0,
    staleTime: 5 * 60_000,
    // Server-side: profiles RLS is self-only, so a direct read comes back empty.
    queryFn: () => fetchDisplayNames(people),
  });
  const { data: sitters } = useQuery({
    queryKey: ["logged-by-sitters", sitIds.join(",")],
    enabled: sitIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("sits").select("id, sitter_name").in("id", sitIds);
      return Object.fromEntries((data ?? []).map((s: any) => [s.id as string, ((s.sitter_name ?? "") as string).trim()]));
    },
  });

  /** "You", "Daniel", "Sitter · Jamie", "Sitter", or "Household". */
  return (t: TFunction, r: LoggedRow): string => {
    if (r.source === "sitter") {
      const n = (r.sitId && sitters?.[r.sitId]) || "";
      return n ? t("loggedBy.sitterNamed", "Sitter · {{name}}", { name: n }) : t("loggedBy.sitter", "Sitter");
    }
    if (r.by && r.by === myId) return t("loggedBy.you", "You");
    const n = (r.by && names?.[r.by]) || "";
    if (n) return n;
    if (r.source === "household") return t("loggedBy.household", "Household");
    // Older owner rows have no logged_by: they were the owner's own.
    if (r.source === "owner" && !r.by) return viewerIsOwner ? t("loggedBy.you", "You") : t("loggedBy.owner", "Owner");
    return t("loggedBy.someone", "Someone");
  };
}
