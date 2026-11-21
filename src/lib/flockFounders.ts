// The founding members page (payments plan build H). Flock code only.
//
// The database decides who's listed (20261121120000_flock_founders_page.sql):
// founders who chose "Show me on the founding members page", in spot order,
// minus anyone blocked either way, and only four fields each.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

function must<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}

/** Exactly what the page gets for each founder. */
export type FoundingMember = { display_name: string; photo_path: string | null; chapter_name: string | null; spot_number: number };

export const founderKeys = {
  list: ["flock", "founders", "list"] as const,
  mine: ["flock", "founders", "mine"] as const,
};

export function useFoundingMembers() {
  return useQuery({
    queryKey: founderKeys.list,
    staleTime: 60_000,
    queryFn: async (): Promise<FoundingMember[]> => {
      const rows = must(await sb.rpc("flock_founders"));
      return Array.isArray(rows) ? (rows as FoundingMember[]) : [];
    },
  });
}

/** Your own choice, or null when you have no founding spot. */
export function useMyFoundersChoice(enabled: boolean) {
  return useQuery({
    queryKey: founderKeys.mine,
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<boolean | null> => {
      // Filtered to you: admins can read every claim.
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return null;
      const row = must(await sb.from("founding_claims").select("show_on_founders_page").eq("user_id", auth.user.id).maybeSingle()) as { show_on_founders_page: boolean } | null;
      return row ? row.show_on_founders_page === true : null;
    },
  });
}

export async function setFoundersChoice(show: boolean): Promise<boolean> {
  return must(await sb.rpc("founding_set_show", { p_show: show })) as boolean;
}

export function useInvalidateFounders() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["flock", "founders"] });
}

/** A spot number as members see it: "#7". */
export function spotLabel(n: number): string {
  return `#${Math.trunc(n)}`;
}
