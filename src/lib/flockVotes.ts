// Do good voting and the founding vote (backlog 1.8). Data and the pure
// helpers scripts/flock-shell.test.ts pins. Reads and writes go through
// database functions (20261123183000_flock_votes.sql). Flock code only.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AvatarError, reencodeJpeg } from "@/lib/flockAvatar";

const sb = supabase as any;
const BUCKET = "flock-votes";
function must<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}
const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export type VoteState = "draft" | "open" | "closed";
export type VoteAudience = "members" | "founders";
export type VoteChoice = {
  choice_id: string; name: string; blurb: string | null; photo_path: string | null;
  /** Share of the votes, once closed. */
  percent: number | null;
  /** Share of the donation (all-members votes, once closed). Totals 100. */
  share: number | null;
  /** The part of `share` that came from votes, above the guaranteed 10%. */
  from_votes: number | null;
  /** Admins only. */
  votes: number | null;
  /** Founders-only votes, once closed: tied for the most votes. */
  top: boolean;
};
export type Vote = {
  vote_id: string; question: string; description: string | null; audience: VoteAudience; state: VoteState; closes_at: string;
  voters: number; my_choice: string | null; announcement: string | null; choices: VoteChoice[];
};
export type AdminVoteRow = {
  vote_id: string; question: string; audience: VoteAudience; state: VoteState; closes_at: string; voters: number; choice_count: number; updated_at: string;
};
export type ChoiceDraft = { key: string; name: string; blurb: string; photo_path: string | null };
export type VoteDraft = { id: string | null; question: string; description: string; audience: VoteAudience; closes_at: string; choices: ChoiceDraft[] };

/** What every choice in a donation vote is guaranteed
 *  (private.flock_vote_guaranteed_pct). The server does the sums. */
export const VOTE_GUARANTEED_PCT = 10;

/** The same limits as the tables' checks. */
export const VOTE_LIMITS = { question: 200, description: 600, choiceName: 120, choiceBlurb: 300, announcement: 1000, minChoices: 2, maxChoices: 8 } as const;

export const voteKeys = {
  all: ["flock", "votes"] as const,
  current: ["flock", "votes", "current"] as const,
  one: (id: string) => ["flock", "votes", "one", id] as const,
  admin: ["flock", "votes", "admin"] as const,
  photos: (paths: string[]) => ["flock", "votes", "photos", ...paths] as const,
};

const STATES: readonly VoteState[] = ["draft", "open", "closed"];

/** A row from the database, with anything unexpected made safe. */
export function cleanVote(row: any): Vote {
  return {
    vote_id: String(row?.vote_id ?? ""),
    question: String(row?.question ?? ""),
    description: row?.description ? String(row.description) : null,
    audience: row?.audience === "founders" ? "founders" : "members",
    state: STATES.includes(row?.state) ? row.state : "closed",
    closes_at: String(row?.closes_at ?? ""),
    voters: Number.isFinite(Number(row?.voters)) ? Number(row.voters) : 0,
    my_choice: row?.my_choice ? String(row.my_choice) : null,
    announcement: row?.announcement ? String(row.announcement) : null,
    choices: asArray<any>(row?.choices).map((c) => ({
      choice_id: String(c?.choice_id ?? ""), name: String(c?.name ?? ""), blurb: c?.blurb ? String(c.blurb) : null,
      photo_path: c?.photo_path ? String(c.photo_path) : null,
      percent: typeof c?.percent === "number" ? c.percent : null,
      share: typeof c?.share === "number" ? c.share : null,
      from_votes: typeof c?.from_votes === "number" ? c.from_votes : null,
      votes: typeof c?.votes === "number" ? c.votes : null,
      top: c?.top === true,
    })),
  };
}

/** Open votes, and votes that closed in the last two weeks (results). */
export function useCurrentVotes(enabled = true) {
  return useQuery({
    queryKey: voteKeys.current,
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<Vote[]> => asArray<any>(must(await sb.rpc("flock_votes_current"))).map(cleanVote),
  });
}

export function useVote(id: string) {
  return useQuery({
    queryKey: voteKeys.one(id),
    staleTime: 15_000,
    queryFn: async (): Promise<Vote | null> => {
      const row = asArray<any>(must(await sb.rpc("flock_vote", { p_id: id })))[0];
      return row ? cleanVote(row) : null;
    },
  });
}

export async function castVote(voteId: string, choiceId: string): Promise<void> {
  must(await sb.rpc("flock_vote_cast", { p_vote_id: voteId, p_choice_id: choiceId }));
}

/** One-hour signed links for choice photos, keyed by path. */
export function useVotePhotoUrls(paths: (string | null | undefined)[]) {
  const list = [...new Set(paths.filter((p): p is string => !!p))].sort();
  return useQuery({
    queryKey: voteKeys.photos(list),
    enabled: list.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(list, 3600);
      if (error) return {};
      const out: Record<string, string> = {};
      for (const d of data ?? []) if (d.path && d.signedUrl && !d.error) out[d.path] = d.signedUrl;
      return out;
    },
  });
}

export function useInvalidateVotes() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: voteKeys.all });
}

// ---- Admin --------------------------------------------------------------------------

export function useAdminVotes(enabled: boolean) {
  return useQuery({
    queryKey: voteKeys.admin,
    enabled,
    queryFn: async (): Promise<AdminVoteRow[]> => asArray<AdminVoteRow>(must(await sb.rpc("admin_votes"))),
  });
}

/** Create (no id) or update a draft. Returns its id. */
export async function saveVoteDraft(d: VoteDraft): Promise<string> {
  return must(await sb.rpc("admin_vote_save", {
    p_id: d.id, p_question: d.question.trim(), p_description: d.description.trim() || null, p_audience: d.audience,
    p_closes_at: new Date(d.closes_at).toISOString(),
    p_choices: d.choices.map((c) => ({ name: c.name.trim(), blurb: c.blurb.trim() || null, photo_path: c.photo_path })),
  }));
}
export async function openVote(id: string): Promise<void> { must(await sb.rpc("admin_vote_open", { p_id: id })); }
export async function closeVote(id: string): Promise<void> { must(await sb.rpc("admin_vote_close", { p_id: id })); }
export async function extendVote(id: string, closesAt: string): Promise<void> {
  must(await sb.rpc("admin_vote_extend", { p_id: id, p_closes_at: new Date(closesAt).toISOString() }));
}
export async function announceVote(id: string, text: string): Promise<void> {
  must(await sb.rpc("admin_vote_announce", { p_id: id, p_text: text.trim() || null }));
}
/** Delete a draft and its choice photos. */
export async function deleteVoteDraft(id: string): Promise<void> {
  const paths = asArray<string>(must(await sb.rpc("admin_vote_delete", { p_id: id })));
  await removeVotePhotos(paths);
}

/** Photos no choice points at any more. Best effort. */
export async function removeVotePhotos(paths: (string | null | undefined)[]): Promise<void> {
  const list = paths.filter((p): p is string => !!p);
  if (list.length) await supabase.storage.from(BUCKET).remove(list).then(() => undefined, () => undefined);
}

export class VotePhotoError extends Error {}

/** A choice's logo or photo, redrawn as a new JPEG (no EXIF/GPS), at most
 *  1200px and 2 MB. A transparent logo goes onto white, not JPEG's black. */
export async function uploadChoicePhoto(file: File): Promise<string> {
  let blob: Blob;
  try { blob = await reencodeJpeg(file, 1200, 2 * 1024 * 1024, "#ffffff"); }
  catch (e) { throw new VotePhotoError(e instanceof AvatarError ? e.message : "We couldn't read that photo. Try a JPEG or PNG."); }
  const path = `choices/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw new VotePhotoError("We couldn't save that photo. Try again.");
  return path;
}

// ---- Pure helpers -----------------------------------------------------------------------

/** Today and Do good: Today shows open votes only; Do good also shows a
 *  closed vote's results for a while after it closes. */
export function votesFor(votes: Vote[], where: "today" | "good"): Vote[] {
  return votes.filter((v) => v.state === "open" || (where === "good" && v.state === "closed"));
}

/** A founders-only vote's top choices (more than one on a tie), or none. */
export function topNames(v: Pick<Vote, "choices">): string[] {
  return v.choices.filter((c) => c.top).map((c) => c.name);
}

/** All-members votes share the donation; founders-only votes (Q&As, chapters)
 *  involve no donation and show plain results. */
export function isDonationVote(v: Pick<Vote, "audience">): boolean {
  return v.audience === "members";
}

export type RankedChoice = VoteChoice & { index: number };

/** Choices for the results, largest first (by share, or by percent on a
 *  founders-only vote). `index` is the choice's place in the vote, which keeps
 *  its color. Equal choices stay in the vote's order. */
export function rankedChoices(v: Pick<Vote, "choices">): RankedChoice[] {
  return v.choices
    .map((c, index) => ({ ...c, index }))
    .sort((a, b) => (b.share ?? 0) - (a.share ?? 0) || (b.percent ?? 0) - (a.percent ?? 0) || a.index - b.index);
}

const CHOICE_COLORS = [
  { solid: "#2d6a4f", pale: "#b9d3c4", text: "#ffffff" },
  { solid: "#f2b33d", pale: "#f6e7c4", text: "#1a3d2e" },
  { solid: "#9bcab8", pale: "#dbeae3", text: "#1a3d2e" },
  { solid: "#c8693f", pale: "#f1d6c8", text: "#ffffff" },
  { solid: "#4f7396", pale: "#cfdbe7", text: "#ffffff" },
  { solid: "#7f659f", pale: "#ddd4e8", text: "#ffffff" },
  { solid: "#b94f70", pale: "#f0d0da", text: "#ffffff" },
  { solid: "#69762f", pale: "#dde2c3", text: "#ffffff" },
] as const;

/** A choice's color, by its place in the vote (up to eight choices). */
export function choiceColor(index: number) {
  return CHOICE_COLORS[((index % CHOICE_COLORS.length) + CHOICE_COLORS.length) % CHOICE_COLORS.length];
}

/** "Dec 15" this year, "Dec 15, 2027" another year. */
export function voteDay(iso: string, lang: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(lang, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

export type VoteProblem = "question" | "choices" | "choiceName" | "closes";

/** What a draft still needs before it can open. */
export function openProblems(d: Pick<VoteDraft, "question" | "choices" | "closes_at">, now: Date = new Date()): VoteProblem[] {
  const out: VoteProblem[] = [];
  if (!d.question.trim()) out.push("question");
  if (d.choices.length < VOTE_LIMITS.minChoices || d.choices.length > VOTE_LIMITS.maxChoices) out.push("choices");
  if (d.choices.some((c) => !c.name.trim())) out.push("choiceName");
  const t = new Date(d.closes_at).getTime();
  if (!d.closes_at || Number.isNaN(t) || t <= now.getTime()) out.push("closes");
  return out;
}

/** An ISO time as the value a datetime-local input shows (local time). */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

let nextKey = 0;
export function newChoice(): ChoiceDraft {
  nextKey += 1;
  return { key: `choice-${nextKey}`, name: "", blurb: "", photo_path: null };
}

/** A new draft: two empty choices, closing in two weeks at 8 PM local
 *  (a sample; the admin picks the date). */
export function emptyVoteDraft(now: Date = new Date()): VoteDraft {
  const closes = new Date(now);
  closes.setDate(closes.getDate() + 14);
  closes.setHours(20, 0, 0, 0);
  return { id: null, question: "", description: "", audience: "members", closes_at: toLocalInput(closes.toISOString()), choices: [newChoice(), newChoice()] };
}

/** A saved vote as an editable draft. */
export function draftFromVote(v: Vote): VoteDraft {
  return {
    id: v.vote_id, question: v.question, description: v.description ?? "", audience: v.audience, closes_at: toLocalInput(v.closes_at),
    choices: v.choices.map((c) => ({ ...newChoice(), name: c.name, blurb: c.blurb ?? "", photo_path: c.photo_path })),
  };
}
