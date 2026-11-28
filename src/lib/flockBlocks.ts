// Member blocking (payments plan build D). Flock code only.
//
// The database does the work (20261121100000_flock_member_blocking.sql): once
// either person has blocked the other, neither sees the other's posts,
// comments, reactions, journeys or profile anywhere in the Flock, and the
// blocked person is never told. Here: the two calls, the list, and the menu
// actions every surface shares.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

function must<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}

export type BlockedMember = { user_id: string; display_name: string | null; photo_path: string | null; blocked_at: string };

export const blockKeys = { mine: ["flock", "blocks", "mine"] as const };

export async function blockMember(userId: string): Promise<void> {
  must(await sb.rpc("flock_block", { p_user_id: userId, p_on: true }));
}

export async function unblockMember(userId: string): Promise<void> {
  must(await sb.rpc("flock_block", { p_user_id: userId, p_on: false }));
}

export function useMyBlocks() {
  return useQuery({
    queryKey: blockKeys.mine,
    staleTime: 30_000,
    queryFn: async (): Promise<BlockedMember[]> => {
      const rows = must(await sb.rpc("flock_my_blocks"));
      return Array.isArray(rows) ? (rows as BlockedMember[]) : [];
    },
  });
}

/** After a block or unblock, everything in the Flock reloads: feeds, threads,
 *  counts, journeys, rosters and notifications all change. */
export function useInvalidateAfterBlock() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["flock"] });
}

/** A name for the menu and the confirmation, never blank. */
export function blockName(t: TFunction, name: string | null | undefined): string {
  const n = (name ?? "").trim();
  return n || t("flock.block.thisMember", "this member");
}

export type MenuAction = { key: string; label: string; danger?: boolean; onClick: () => void };

/** "Block {name}" for a menu on someone else's thing (a chapter's Members
 *  rows). Posts, comments and journeys use ContentOptionsSheet instead
 *  (components/flock/FlagSheets.tsx). Never on your own things, and never for
 *  a missing author. */
export function blockActions(t: TFunction, opts: {
  authorId: string | null | undefined; myId: string | null | undefined; name: string | null | undefined;
  onBlock: () => void;
}): MenuAction[] {
  if (!opts.authorId || (opts.myId && opts.authorId === opts.myId)) return [];
  const out: MenuAction[] = [
    { key: "block", label: t("flock.block.action", "Block {{name}}", { name: blockName(t, opts.name) }), danger: true, onClick: opts.onBlock },
  ];
  return out;
}
