// Challenges (backlog 1.10). Data and the pure helpers scripts/flock-shell.test.ts
// pins. Reads and writes go through database functions
// (20261124033000_flock_challenges.sql); entries are Flock posts in the
// 'challenge' space, so reactions, comments, reports and photos reuse the
// post code. Flock code only.
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FlockPost } from "@/lib/flockPostData";
import type { ReactionKind } from "@/lib/journeyData";

const sb = supabase as any;
function must<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}
const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const PAGE = 15;

export type ChallengeKind = "journey" | "standalone";
export type ChallengeState = "draft" | "upcoming" | "open" | "closed";
export type ChallengePrompt = { position: number; body: string; done: boolean };
export type ChallengeFace = { name: string; photo_path: string | null };
export type Challenge = {
  challenge_id: string; kind: ChallengeKind; title: string; description: string | null;
  template_slug: string | null; template_name: string | null; region_slug: string | null; region_name: string | null;
  state: ChallengeState; starts_on: string; ends_on: string; days_left: number;
  prompts: ChallengePrompt[]; member_count: number; faces: ChallengeFace[];
  joined: boolean; my_bird_id: string | null; my_bird_name: string | null; feature_ok: boolean; my_journey_id: string | null;
  done_count: number; total_count: number; finished: boolean;
  wrap_up: string | null; pinned_post_id: string | null; featured_post_ids: string[];
};
export type ChallengeEntry = FlockPost & { prompt: number | null };
export type AdminChallengeRow = {
  challenge_id: string; kind: ChallengeKind; title: string; region_slug: string | null; region_name: string | null;
  state: ChallengeState; starts_on: string; ends_on: string; member_count: number; entry_count: number; updated_at: string;
};
export type AdminChallenge = {
  challenge_id: string; kind: ChallengeKind; title: string; description: string | null; template_slug: string | null;
  region_slug: string | null; starts_on: string; ends_on: string; state: ChallengeState; prompts: string[];
  wrap_up: string | null; pinned_post_id: string | null; featured_post_ids: string[];
};
export type FeaturableEntry = { post_id: string; author_name: string | null; body: string; photo_count: number; prompt: number | null; created_at: string };
export type ChallengeDraft = {
  id: string | null; kind: ChallengeKind; title: string; description: string; template_slug: string;
  prompts: string[]; region_slug: string | null; starts_on: string; ends_on: string;
};

/** The same limits as the tables' checks. */
export const CHALLENGE_LIMITS = { title: 120, description: 600, prompt: 140, maxPrompts: 30, wrapUp: 2000, maxFeatured: 12 } as const;

/** Templates a challenge can't use: diet conversion and anything about food
 *  (private.flock_challenge_template_ok). */
export function challengeTemplateAllowed(t: { slug: string; category: string }): boolean {
  return t.slug !== "diet-conversion" && t.category !== "food";
}

export const challengeKeys = {
  all: ["flock", "challenges"] as const,
  current: ["flock", "challenges", "current"] as const,
  one: (id: string) => ["flock", "challenges", "one", id] as const,
  entries: (id: string) => ["flock", "challenges", "entries", id] as const,
  admin: ["flock", "challenges", "admin"] as const,
  adminOne: (id: string) => ["flock", "challenges", "admin", id] as const,
  featurable: (id: string) => ["flock", "challenges", "featurable", id] as const,
};

const KINDS: readonly ChallengeKind[] = ["journey", "standalone"];
const STATES: readonly ChallengeState[] = ["draft", "upcoming", "open", "closed"];
const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);
const str = (v: unknown): string | null => (v === null || v === undefined || v === "" ? null : String(v));

/** A row from the database, with anything unexpected made safe. */
export function cleanChallenge(row: any): Challenge {
  return {
    challenge_id: String(row?.challenge_id ?? ""),
    kind: KINDS.includes(row?.kind) ? row.kind : "standalone",
    title: String(row?.title ?? ""),
    description: str(row?.description),
    template_slug: str(row?.template_slug),
    template_name: str(row?.template_name),
    region_slug: str(row?.region_slug),
    region_name: str(row?.region_name),
    state: STATES.includes(row?.state) ? row.state : "closed",
    starts_on: String(row?.starts_on ?? ""),
    ends_on: String(row?.ends_on ?? ""),
    days_left: num(row?.days_left),
    prompts: asArray<any>(row?.prompts).map((p) => ({ position: num(p?.position), body: String(p?.body ?? ""), done: p?.done === true })),
    member_count: num(row?.member_count),
    faces: asArray<any>(row?.faces).map((f) => ({ name: String(f?.name ?? ""), photo_path: str(f?.photo_path) })),
    joined: row?.joined === true,
    my_bird_id: str(row?.my_bird_id),
    my_bird_name: str(row?.my_bird_name),
    feature_ok: row?.feature_ok === true,
    my_journey_id: str(row?.my_journey_id),
    done_count: num(row?.done_count),
    total_count: num(row?.total_count),
    finished: row?.finished === true,
    wrap_up: str(row?.wrap_up),
    pinned_post_id: str(row?.pinned_post_id),
    featured_post_ids: asArray<unknown>(row?.featured_post_ids).map(String),
  };
}

/** The prompt "Post today's entry" answers: the first one not done yet. */
export function nextPrompt(c: Pick<Challenge, "prompts">): ChallengePrompt | null {
  return c.prompts.find((p) => !p.done) ?? null;
}

/** Prompt lines typed in the admin form: one per line, blanks dropped. */
export function parsePrompts(text: string): string[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}

/** What stops a draft from being scheduled, in the order the form shows them. */
export type ChallengeProblem = "title" | "template" | "prompts" | "promptLength" | "dates" | "past";
export function challengeProblems(d: ChallengeDraft, today: string): ChallengeProblem[] {
  const out: ChallengeProblem[] = [];
  if (!d.title.trim()) out.push("title");
  if (d.kind === "journey" && !d.template_slug) out.push("template");
  if (d.kind === "standalone" && d.prompts.length === 0) out.push("prompts");
  if (d.kind === "standalone" && d.prompts.some((p) => p.length > CHALLENGE_LIMITS.prompt)) out.push("promptLength");
  if (!d.starts_on || !d.ends_on || d.ends_on < d.starts_on) out.push("dates");
  else if (d.starts_on < today) out.push("past");
  return out;
}

/** The database's refusals the screens explain; anything else is a plain
 *  "try again". */
export type ChallengeError =
  | "challenge_overlap" | "no_food_challenges" | "challenge_closed" | "join_first" | "already_posted"
  | "started_challenges_stay" | "wrap_up_after_close" | "feature_needs_permission";
const ERRORS: readonly ChallengeError[] = [
  "challenge_overlap", "no_food_challenges", "challenge_closed", "join_first", "already_posted",
  "started_challenges_stay", "wrap_up_after_close", "feature_needs_permission",
];
export function challengeError(e: unknown): ChallengeError | null {
  const m = (e as { message?: unknown } | null)?.message;
  return typeof m === "string" && (ERRORS as readonly string[]).includes(m) ? (m as ChallengeError) : null;
}

/** Today (Eastern, the Flock's day) as YYYY-MM-DD, for the admin form. */
export function flockTodayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// ---- Reads ---------------------------------------------------------------------------------

/** Open challenges the caller may see (Flock-wide first). */
export function useCurrentChallenges(enabled = true) {
  return useQuery({
    queryKey: challengeKeys.current,
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<Challenge[]> => asArray<any>(must(await sb.rpc("flock_challenges_current"))).map(cleanChallenge),
  });
}

export function useChallenge(id: string) {
  return useQuery({
    queryKey: challengeKeys.one(id),
    enabled: !!id,
    staleTime: 15_000,
    queryFn: async (): Promise<Challenge | null> => {
      const row = asArray<any>(must(await sb.rpc("flock_challenge", { p_id: id })))[0];
      return row ? cleanChallenge(row) : null;
    },
  });
}

export function useChallengeEntries(id: string) {
  return useInfiniteQuery({
    queryKey: challengeKeys.entries(id),
    enabled: !!id,
    staleTime: 30_000,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<ChallengeEntry[]> =>
      asArray<ChallengeEntry>(must(await sb.rpc("flock_challenge_entries", { p_id: id, p_before: pageParam, p_limit: PAGE })))
        .map((r) => ({ ...r, mine: asArray<ReactionKind>(r.mine), prompt: r.prompt ?? null })),
    getNextPageParam: (last) => (last.length < PAGE ? undefined : last[last.length - 1].created_at),
  });
}

export function useAdminChallenges() {
  return useQuery({
    queryKey: challengeKeys.admin,
    staleTime: 15_000,
    queryFn: async (): Promise<AdminChallengeRow[]> => asArray<AdminChallengeRow>(must(await sb.rpc("admin_challenges"))),
  });
}

export function useAdminChallenge(id: string | null) {
  return useQuery({
    queryKey: challengeKeys.adminOne(id ?? "new"),
    enabled: !!id,
    staleTime: 15_000,
    queryFn: async (): Promise<AdminChallenge | null> => {
      const row = asArray<any>(must(await sb.rpc("admin_challenge", { p_id: id })))[0];
      return row ? { ...row, prompts: asArray<string>(row.prompts), featured_post_ids: asArray<string>(row.featured_post_ids) } : null;
    },
  });
}

export function useFeaturableEntries(id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: challengeKeys.featurable(id ?? "none"),
    enabled: !!id && enabled,
    staleTime: 15_000,
    queryFn: async (): Promise<FeaturableEntry[]> => asArray<FeaturableEntry>(must(await sb.rpc("admin_challenge_featurable", { p_id: id }))),
  });
}

export function useInvalidateChallenges() {
  const qc = useQueryClient();
  return async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: challengeKeys.all }),
      qc.invalidateQueries({ queryKey: ["flock", "posts"] }),
      qc.invalidateQueries({ queryKey: ["flock", "badges"] }),
    ]);
  };
}

// ---- Writes --------------------------------------------------------------------------------

/** Join with one of your birds. Returns the journey a journey challenge
 *  already follows (null = start it). */
export async function joinChallenge(c: Pick<Challenge, "challenge_id">, birdId: string, featureOk: boolean): Promise<string | null> {
  const journey = must(await sb.rpc("flock_challenge_join", { p_id: c.challenge_id, p_bird_id: birdId, p_feature_ok: featureOk })) as string | null;
  return journey ?? null;
}

export async function setChallengeFeature(id: string, ok: boolean): Promise<void> {
  must(await sb.rpc("flock_challenge_set_feature", { p_id: id, p_ok: ok }));
}

/** Post an entry. Returns the post and whether the caller has now finished. */
export async function createChallengeEntry(input: {
  challenge: Pick<Challenge, "challenge_id" | "kind">; prompt: number | null; body: string; photoPaths: string[]; birdId: string | null; vetNudged: boolean;
}): Promise<{ postId: string; finished: boolean }> {
  const postId = must(await sb.rpc("flock_challenge_entry_create", {
    p_id: input.challenge.challenge_id, p_prompt: input.prompt, p_body: input.body, p_photo_paths: input.photoPaths,
    p_bird_id: input.birdId, p_vet_nudged: input.vetNudged,
  })) as string;
  const finished = must(await sb.rpc("flock_challenge_finished", { p_id: input.challenge.challenge_id })) === true;
  return { postId, finished };
}

export async function saveChallenge(d: ChallengeDraft): Promise<string> {
  return must(await sb.rpc("admin_challenge_save", {
    p_id: d.id, p_kind: d.kind, p_title: d.title.trim(), p_description: d.description.trim() || null,
    p_template_slug: d.kind === "journey" ? d.template_slug || null : null,
    p_prompts: d.kind === "standalone" ? d.prompts : [],
    p_region_slug: d.region_slug, p_starts_on: d.starts_on, p_ends_on: d.ends_on,
  })) as string;
}

export async function scheduleChallenge(id: string): Promise<void> {
  must(await sb.rpc("admin_challenge_schedule", { p_id: id }));
}
export async function unscheduleChallenge(id: string): Promise<void> {
  must(await sb.rpc("admin_challenge_unschedule", { p_id: id }));
}
export async function deleteChallenge(id: string): Promise<void> {
  must(await sb.rpc("admin_challenge_delete", { p_id: id }));
}
export async function pinChallengeEntry(id: string, postId: string | null): Promise<void> {
  must(await sb.rpc("admin_challenge_pin", { p_id: id, p_post_id: postId }));
}
export async function wrapUpChallenge(id: string, text: string, featured: string[]): Promise<void> {
  must(await sb.rpc("admin_challenge_wrap_up", { p_id: id, p_text: text, p_featured: featured }));
}
