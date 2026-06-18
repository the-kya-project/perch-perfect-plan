// Phase 4 — assembled sitter_intro.
// Pure, deterministic string assembly from existing care-plan fields. No AI,
// no API calls. Up to three sentences (opening / handling / likes), each
// omitted when its source field is empty. A given bird always renders the same
// intro (alternate phrasings are chosen by hashing the bird id); different
// birds vary. Pronouns come from the bird's `sex` field, falling back to a
// pronoun-neutral "they".

type Pronoun = {
  subj: string; // they / she / he
  Subj: string; // They / She / He
  obj: string; // them / her / him
  poss: string; // their / her / his
  pl: boolean; // plural verb agreement (they)
};

function pronoun(sex: string | null | undefined): Pronoun {
  const s = (sex ?? "").trim().toLowerCase();
  if (s.startsWith("f")) return { subj: "she", Subj: "She", obj: "her", poss: "her", pl: false };
  if (s.startsWith("m")) return { subj: "he", Subj: "He", obj: "him", poss: "his", pl: false };
  return { subj: "they", Subj: "They", obj: "them", poss: "their", pl: true };
}

// "is" contraction: She's / He's / They're
const isC = (p: Pronoun) => (p.pl ? "'re" : "'s");
// 3rd-person present "-s": she loves / they love
const s3 = (p: Pronoun) => (p.pl ? "" : "s");

const NUMBER_WORDS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
  "nineteen", "twenty",
];

function spelledAge(age: string | null | undefined): string | null {
  const n = parseInt((age ?? "").trim(), 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return n <= 20 ? NUMBER_WORDS[n] : String(n);
}

function cap(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Deterministic index from the bird id, salted per sentence so the three
// sentences vary independently but stay stable for a given bird.
function pick<T>(birdId: string, salt: string, options: T[]): T {
  let h = 2166136261;
  const key = birdId + "|" + salt;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return options[(h >>> 0) % options.length];
}

function splitLikes(likes: string | null | undefined): string[] {
  return (likes ?? "")
    .split(/,|\band\b/gi)
    .map((x) => x.trim())
    .filter(Boolean);
}

function joinOxford(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

// Owner-only / talk-only handling: not a step_up value, so infer it from the
// "who can handle" text and step-up notes.
const OWNER_ONLY = /\bowner[- ]only\b|\btalk only\b|\bonly (me|the owner|her owner|his owner|their owner)\b|\bdon'?t (try to )?(pick|handle)\b|\bno handling\b|\bhands?[- ]off\b/i;

export type IntroBird = { id: string; name: string; sex?: string | null; species?: string | null; age?: string | null };
export type IntroPlan = { step_up?: string | null; step_up_notes?: string | null; handlers?: string | null; likes?: string | null };

export function assembleSitterIntro(bird: IntroBird, plan: IntroPlan): string {
  const p = pronoun(bird.sex);
  const name = (bird.name ?? "").trim() || "your bird";
  const species = (bird.species ?? "").trim() || "parrot";
  const age = spelledAge(bird.age);

  // 1) Opening — always present.
  const opening = age
    ? pick(bird.id, "opening", [
        `Meet ${name}, a ${age}-year-old ${species}.`,
        `This is ${name}, your ${age}-year-old ${species} for the week.`,
        `Say hello to ${name}, a ${age}-year-old ${species}.`,
      ])
    : pick(bird.id, "opening-noage", [
        `Meet ${name}, a ${species}.`,
        `This is ${name}, your ${species} for the week.`,
        `Say hello to ${name}, a ${species}.`,
      ]);

  // 2) Handling — owner-only takes precedence, else keyed off step_up.
  const handlingText = `${plan.handlers ?? ""} ${plan.step_up_notes ?? ""}`;
  const stepUp = (plan.step_up ?? "").trim().toLowerCase();
  let handling = "";
  if (OWNER_ONLY.test(handlingText)) {
    handling = pick(bird.id, "handling", [
      `${p.Subj}'d love your company, but let ${p.obj} come to you — only ${p.poss} owner does the handling.`,
      `Feel free to talk to ${p.obj} and keep ${p.obj} company, but leave the handling to ${p.poss} owner.`,
      `${p.Subj} enjoy${s3(p)} company through the bars — please don't try to pick ${p.obj} up; that's an owner-only job.`,
    ]);
  } else if (stepUp === "yes") {
    handling = pick(bird.id, "handling", [
      `${p.Subj}${isC(p)} happy to step up onto a familiar hand.`,
      `${p.Subj}'ll step right up onto your hand once ${p.subj} know${s3(p)} you.`,
      `Offer a steady hand and ${p.subj}${isC(p)} glad to step up.`,
    ]);
  } else if (stepUp === "sometimes") {
    handling = pick(bird.id, "handling", [
      `${p.Subj}'ll step up when ${p.subj}${isC(p)} in the mood — no pressure if ${p.subj}${isC(p)} not.`,
      `Some days ${p.subj}'ll step up, some days ${p.subj} won't — let ${p.obj} decide.`,
      `${p.Subj} step${s3(p)} up on ${p.poss} own terms, so follow ${p.poss} lead.`,
    ]);
  } else if (stepUp === "no") {
    handling = pick(bird.id, "handling", [
      `${p.Subj}'d rather not step up, so let ${p.obj} stay where ${p.subj}${isC(p)} comfortable.`,
      `Stepping up isn't ${p.poss} thing — keep interactions calm and hands-off.`,
      `${p.Subj} prefer${s3(p)} to stay put; no need to get ${p.obj} to step up.`,
    ]);
  }

  // 3) Likes — present when any likes exist.
  const likes = splitLikes(plan.likes);
  let likesSentence = "";
  if (likes.length === 1) {
    const like = likes[0];
    likesSentence = pick(bird.id, "likes", [
      `${p.Subj}${isC(p)} a sucker for ${like}.`,
      `${cap(like)} is the quickest way to win ${p.obj} over.`,
      `${p.Subj} love${s3(p)} ${like}.`,
    ]);
  } else if (likes.length >= 2) {
    const joined = joinOxford(likes);
    likesSentence = pick(bird.id, "likes", [
      `${cap(joined)} are the way to ${p.poss} heart.`,
      `${p.Subj} love${s3(p)} ${joined}.`,
      `Win ${p.obj} over with ${joined}.`,
    ]);
  }

  return [opening, handling, likesSentence]
    .map((x) => x.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

// Recompute and persist sitter_intro for a bird. Called after the relevant
// setup steps save (Basics, Behavior). Pulls the full inputs (split across the
// bird and its care plan) so a single-step save still produces a complete
// intro. Never overwrites owner_edited_intro. Fire-and-forget; failures are
// non-fatal to the save flow.
export async function recomputeSitterIntro(birdId: string): Promise<void> {
  const { supabase } = await import("@/integrations/supabase/client");
  const [{ data: bird }, { data: plan }] = await Promise.all([
    supabase.from("birds").select("id, name, sex, species, age").eq("id", birdId).maybeSingle(),
    supabase.from("care_plans").select("step_up, step_up_notes, handlers, likes").eq("bird_id", birdId).maybeSingle(),
  ]);
  if (!bird) return;
  const intro = assembleSitterIntro(bird as IntroBird, (plan ?? {}) as IntroPlan);
  await supabase.from("birds").update({ sitter_intro: intro } as any).eq("id", birdId);
}
