import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowLeft, AlertTriangle, ShieldAlert } from "lucide-react";
import { useSitterContext } from "./route";
import { ClipPlayer } from "@/components/ClipPlayer";
import { track } from "@/lib/analytics";
import { normalizeFeedTimes, feedTimeLabel } from "@/lib/feedTimes";
import {
  WATER_FREQ_LABELS,
  TREATS_FREQ_LABELS,
  OUT_OF_CAGE_LABELS,
  BOWL_WASH_LABELS,
  prettyLabel,
  formatAmountUnit,
  formatRemovalMinutes,
} from "@/lib/labels";

export const Route = createFileRoute("/sitter/$token/care-sheet")({
  component: CareSheet,
});

function has(v: any): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}

// Join distinct, non-empty parts with newlines — drops blanks and case-
// insensitive duplicates so a field never prints the same value twice (e.g.
// out-of-cage mode + notes that hold the same string).
function joinUnique(parts: (string | null | undefined | false)[]): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const v = (p ?? "").toString().trim();
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
  }
  return out.join("\n");
}

function Section({ title, children, danger = false, coach }: { title: string; children: React.ReactNode; danger?: boolean; coach?: string }) {
  return (
    <section data-coach={coach} className={`rounded-2xl p-4 ${danger ? "bg-warn-red/5 ring-1 ring-warn-red/30" : "bg-[#efe9da] shadow-sm"}`}>
      <h2 className={`text-[11px] font-medium uppercase tracking-widest ${danger ? "text-warn-red" : "text-[#5f5e5a]"}`}>{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

// Renders owner free-text where some lines are prefixed with a literal "•"
// (legacy food_instructions formatting) as proper sage-styled list markup,
// so no raw bullet glyphs leak into the sitter view.
function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flushBullets = (key: string) => {
    if (!bullets.length) return;
    blocks.push(
      <ul key={key} className="list-disc space-y-1 pl-5 marker:text-[#5f5e5a]">
        {bullets.map((b, i) => (
          <li key={i} className="pl-0.5">{b}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };
  lines.forEach((raw, i) => {
    const m = raw.match(/^\s*•\s+(.*)$/);
    if (m) { bullets.push(m[1]); return; }
    flushBullets(`ul-${i}`);
    if (raw.trim()) blocks.push(<p key={i}>{raw}</p>);
  });
  flushBullets("ul-end");
  return <div className="space-y-1.5">{blocks}</div>;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (!has(value as any)) return null;
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-[#5f5e5a]">{label}</p>
      <div className="mt-0.5 text-sm text-[#1a3d2e] whitespace-pre-line">{value}</div>
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => (
        <span key={s} className="rounded-full bg-[#d6e8dc] px-2.5 py-0.5 text-xs font-medium text-[#1a5e3f]">{s}</span>
      ))}
    </div>
  );
}

function DangerChips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => (
        <span key={s} className="rounded-full bg-warn-red px-2.5 py-1 text-xs font-bold text-white">{s}</span>
      ))}
    </div>
  );
}


function CareSheet() {
  const { token } = Route.useParams();
  const { data: ctx } = useSitterContext(token);
  const bird = ctx.bird as any;
  const plan = (ctx.plan ?? {}) as any;
  const clips = ctx.watchClips ?? [];

  useEffect(() => { track("care_sheet_viewed", { surface: "sitter" }); }, []);


  const diet = (plan.diet_types ?? []) as string[];
  // diet_details is keyed by diet type -> array of { name, amount, unit, times[] }.
  const dietDetails = (plan.diet_details ?? {}) as Record<string, any[]>;
  const freshFoods = (plan.fresh_foods ?? []) as string[];
  const neverFeed = (plan.never_feed ?? []) as string[];
  const hazards = (plan.hazards ?? []) as string[];
  const feedingTimes = (plan.feeding_times ?? []) as string[];

  // Flatten every food (across diet types) into its own row so each food's
  // brand, amount, and its own feeding times all render — not just the first.
  const foodRows = Object.entries(dietDetails).flatMap(([type, items]) =>
    (Array.isArray(items) ? items : []).map((it: any) => ({
      type,
      name: (it?.name ?? "").toString().trim(),
      amount: it?.amount,
      unit: it?.unit,
      times: normalizeFeedTimes(it?.times),
      freeFed: !!it?.freeFed,
      note: (it?.note ?? "").toString().trim(),
    })),
  ).filter((f) => f.name || has(f.amount) || f.times.length || f.note);
  const hasPerFoodDetails = foodRows.length > 0;

  const showBasics = has(bird.name) || has(bird.species) || has(bird.age) || has(bird.photo_url);
  const showFeeding = diet.length || plan.food_brand || plan.amount_value || feedingTimes.length || freshFoods.length || plan.fresh_foods_other || plan.treats_notes || plan.treats_frequency || plan.water_frequency || plan.water_notes || plan.food_storage || plan.food_hygiene_notes || plan.food_instructions || plan.water_instructions || plan.fresh_food_removal_minutes;
  const showHandling = has(plan.step_up) || has(plan.step_up_notes) || has(plan.handlers) || has(plan.likes) || has(plan.fears_triggers) || has(plan.bite_risk) || has(plan.handling_rules) || has(plan.known_triggers);
  const showHome = has(plan.cage_location) || has(plan.out_of_cage_mode) || has(plan.out_of_cage_notes) || has(plan.out_of_cage_rules) || hazards.length || has(plan.hazards_other) || has(plan.off_limits) || has(plan.off_limits_rooms) || has(plan.safety_rules) || has(plan.other_pets);

  // Several fields have a combined "summary" sibling (food_instructions,
  // water_instructions, handling_rules, out_of_cage_rules, safety_rules) that
  // the walkthrough auto-assembles from the structured fields below. To avoid
  // showing the same info twice, render the structured/individual fields and
  // fall back to the combined summary only when the individuals are empty.
  const hasStructuredFood =
    diet.length > 0 ||
    has(plan.diet_other) ||
    hasPerFoodDetails ||
    has(plan.food_brand) ||
    has(plan.amount_value) ||
    feedingTimes.length > 0 ||
    freshFoods.length > 0 ||
    has(plan.fresh_foods_other) ||
    has(plan.treats_notes) ||
    has(plan.water_frequency) ||
    has(plan.water_notes) ||
    has(plan.food_storage);
  const showHealth = has(bird.normal_weight) || has(bird.normal_weight_min) || has(bird.normal_weight_max) || has(plan.whats_normal) || has(plan.normal_appetite) || has(plan.normal_droppings) || has(plan.normal_noise) || has(plan.normal_activity) || has(plan.normal_sleep) || has(plan.normal_behavior_with_strangers) || has(bird.medical_conditions) || has(bird.medications) || has(plan.medication_schedule) || ctx.baselineClipUrl;

  // Derive restriction detection from the structured fields (not a stored summary).
  const handlingDangerous = /\b(no|do not|don'?t|never|owner.?only)\b/i.test(
    `${plan.step_up ?? ""} ${plan.step_up_notes ?? ""} ${plan.handlers ?? ""}`,
  );

  const weightStr = (() => {
    if (has(bird.normal_weight_min) && has(bird.normal_weight_max)) return `${bird.normal_weight_min}–${bird.normal_weight_max} g`;
    if (has(bird.normal_weight)) return `${bird.normal_weight} g`;
    return null;
  })();

  return (
    <>
      <header className="bg-[#1a3d2e]" data-coach="cp-header">
        <div className="mx-auto flex max-w-md items-center gap-3 px-5 py-3">
          <Link to="/sitter/$token" params={{ token }} search={{ birdId: ctx.activeBirdId }} className="rounded p-1 text-white/90"><ArrowLeft className="size-5" /></Link>
          <div>
            <h1 className="text-sm font-medium text-white">{bird.name}'s care sheet</h1>
            <p className="text-[10px] uppercase tracking-wider text-[#cdeab0]">Owner-entered reference</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-5 py-5">
        {showBasics && (
          <Section title="Basics">
            <div className="flex items-center gap-4">
              {bird.photo_url ? (
                <img src={bird.photo_url} alt={bird.name} className="size-16 rounded-2xl object-cover ring-1 ring-[#e0d8c4]" style={{ objectPosition: bird.photo_position ?? "50% 50%" }} />
              ) : (
                <div className="grid size-16 place-items-center rounded-2xl bg-[#e3dcc9] text-xl font-medium text-[#2d6a4f]">{bird.name.slice(0,1).toUpperCase()}</div>
              )}
              <div className="flex-1">
                <p className="text-lg font-medium leading-tight">{bird.name}</p>
                {has(bird.species) && <p className="text-sm text-[#5f5e5a]">{bird.species}</p>}
                {has(bird.age) && <p className="text-xs text-[#5f5e5a]">{bird.age}</p>}
              </div>
            </div>
          </Section>
        )}

        {clips.length > 0 && (
          <Section title="Tips from the owner">
            <p className="text-xs text-[#5f5e5a]">See how it's done — short clips from the owner.</p>
            <div className="-mx-1 grid grid-cols-1 gap-3">
              {clips.map((c: any) => (
                <div key={c.key} className="overflow-hidden rounded-xl bg-[#e8e1d0] ring-1 ring-[#e0d8c4]">
                  <ClipPlayer src={c.url} label={c.label} className="aspect-video" />
                  <p className="px-2 py-1.5 text-[12px] font-medium leading-tight">{c.label}</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Safety-critical: never feed */}
        {neverFeed.length > 0 && (
          <Section title="Never feed — toxic to this bird" danger>
            <DangerChips items={neverFeed} />
            <p className="flex items-start gap-1.5 text-xs text-warn-red"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />Keep these completely out of reach.</p>
          </Section>
        )}

        {showFeeding && (
          <Section title="Feeding & food" coach="cp-food">
            <p className="rounded bg-warn-amber/10 p-2 text-[11px] font-medium text-warn-amber">Do not introduce new foods while the owner is away.</p>
            {!hasStructuredFood && has(plan.food_instructions) && <Field label="Diet overview" value={<RichText text={plan.food_instructions} />} />}
            {diet.length > 0 && <Field label="Diet types" value={<Chips items={diet} />} />}
            {has(plan.diet_other) && <Field label="Other diet" value={plan.diet_other} />}
            {hasPerFoodDetails ? (
              // One block per food, so each food's amount and its own feeding
              // times stay attached to the right food (chop in the morning,
              // pellets in the evening) — not collapsed into a single line.
              foodRows.map((f, i) => (
                <div key={`${f.type}-${i}`} className="rounded-lg bg-[#e8e1d0] p-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-[#5f5e5a]">
                    {f.type.charAt(0).toUpperCase() + f.type.slice(1).replace(/_/g, " ")}{f.name ? ` (${f.name})` : ""}
                  </p>
                  {has(f.amount) && (
                    <p className="mt-1 text-sm"><span className="text-[#5f5e5a]">Amount: </span>{f.unit ? formatAmountUnit(f.amount, f.unit) : f.amount}{f.freeFed ? " · free-fed" : ""}</p>
                  )}
                  {f.times.length > 0 && (
                    <p className="text-sm"><span className="text-[#5f5e5a]">When: </span>{f.times.map((ft) => feedTimeLabel(ft)).join(", ")}</p>
                  )}
                  {f.note && (
                    <p className="mt-1 text-sm"><span className="text-[#5f5e5a]">Note: </span>{f.note}</p>
                  )}
                </div>
              ))
            ) : (
              (has(plan.food_brand) || has(plan.amount_value)) && (
                <Field label="Brand & amount" value={`${plan.food_brand ?? ""}${has(plan.amount_value) ? ` — ${formatAmountUnit(plan.amount_value, plan.amount_unit)}` : ""}`.trim()} />
              )
            )}
            {/* Global feeding times only when no per-food times exist (legacy data). */}
            {!foodRows.some((f) => f.times.length > 0) && feedingTimes.length > 0 && (
              <Field label="Feeding times" value={<Chips items={feedingTimes} />} />
            )}
            {freshFoods.length > 0 && <Field label="Fresh foods" value={<Chips items={freshFoods} />} />}
            {has(plan.fresh_foods_other) && <Field label="Other fresh foods" value={plan.fresh_foods_other} />}
            {(has(plan.treats_notes) || has(plan.treats_frequency)) && (
              <Field label="Treats" value={`${plan.treats_notes ?? ""}${has(plan.treats_frequency) ? `\nFrequency: ${prettyLabel(plan.treats_frequency, TREATS_FREQ_LABELS)}` : ""}`.trim()} />
            )}
            {(has(plan.water_frequency) || has(plan.water_notes) || has(plan.water_instructions)) && (
              <Field
                label="Water"
                value={
                  has(plan.water_frequency) || has(plan.water_notes)
                    ? joinUnique([
                        plan.water_frequency && `Water ${prettyLabel(plan.water_frequency, WATER_FREQ_LABELS)}`,
                        plan.water_notes,
                      ])
                    : plan.water_instructions
                }
              />
            )}
            <div className="rounded-lg bg-[#e8e1d0] p-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-[#5f5e5a]">Freshness & hygiene</p>
              <ul className="mt-1.5 space-y-1 text-sm text-[#1a3d2e]">
                <li>Remove fresh food within <strong>{formatRemovalMinutes(plan.fresh_food_removal_minutes)}</strong> of serving.</li>
                <li>Wash food bowls: <strong>{prettyLabel(plan.food_bowl_wash_cadence, BOWL_WASH_LABELS) || "—"}</strong>.</li>
                <li>Wash water bowl: <strong>{prettyLabel(plan.water_bowl_wash_cadence, BOWL_WASH_LABELS) || "—"}</strong>.</li>
              </ul>
              {has(plan.food_hygiene_notes) && <p className="mt-2 text-xs text-[#5f5e5a] whitespace-pre-line">{plan.food_hygiene_notes}</p>}
            </div>
            {has(plan.food_storage) && <Field label="Food storage" value={plan.food_storage} />}
          </Section>
        )}

        {showHandling && (
          <>
            {(handlingDangerous || has(plan.bite_risk)) && (
              <div className="rounded-2xl bg-[#f4ead2] p-4 ring-1 ring-[#BA7517]/40">
                <p className="flex items-start gap-2 text-sm text-[#854F0B]">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#BA7517]" />
                  <span>This bird has handling restrictions — read the handling section below before any contact.</span>
                </p>
              </div>
            )}
            <Section title="Handling & personality" coach="cp-handling">
              {has(plan.step_up) && <Field label="Step up" value={plan.step_up} />}
              {has(plan.step_up_notes) && <Field label="Step up notes" value={plan.step_up_notes} />}
              {has(plan.handlers) && <Field label="Who can handle" value={plan.handlers} />}
              {!has(plan.step_up) && !has(plan.step_up_notes) && !has(plan.handlers) && has(plan.handling_rules) && (
                <Field label="Handling rules" value={plan.handling_rules} />
              )}
              {has(plan.likes) && <Field label="Likes" value={plan.likes} />}
              {(has(plan.fears_triggers) || has(plan.known_triggers)) && (
                <div className="rounded-lg bg-warn-amber/10 p-3 ring-1 ring-warn-amber/20">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-warn-amber">Fears & triggers</p>
                  <p className="mt-1 text-sm whitespace-pre-line">{joinUnique([plan.fears_triggers, plan.known_triggers])}</p>
                </div>
              )}
              {has(plan.bite_risk) && (
                <div className="rounded-lg bg-warn-red/5 p-3 ring-1 ring-warn-red/20">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-warn-red"><ShieldAlert className="size-3.5" />Bite warning signs</p>
                  <p className="mt-1 text-sm whitespace-pre-line">{plan.bite_risk}</p>
                </div>
              )}
            </Section>
          </>
        )}

        {hazards.length > 0 && (
          <Section title="Household hazards — keep away" danger>
            <DangerChips items={hazards} />
            {has(plan.hazards_other) && <p className="text-sm whitespace-pre-line text-warn-red">{plan.hazards_other}</p>}
          </Section>
        )}

        {showHome && (
          <Section title="Home & safety" coach="cp-home">
            {has(plan.cage_location) && <Field label="Cage location" value={plan.cage_location} />}
            {(has(plan.out_of_cage_mode) || has(plan.out_of_cage_notes) || has(plan.out_of_cage_rules)) && (
              <Field
                label="Out-of-cage rules"
                value={
                  has(plan.out_of_cage_mode) || has(plan.out_of_cage_notes)
                    ? joinUnique([prettyLabel(plan.out_of_cage_mode, OUT_OF_CAGE_LABELS), plan.out_of_cage_notes])
                    : plan.out_of_cage_rules
                }
              />
            )}
            {(has(plan.off_limits) || has(plan.off_limits_rooms)) && (
              <Field label="Off-limits areas" value={joinUnique([plan.off_limits, plan.off_limits_rooms])} />
            )}
            {hazards.length === 0 && has(plan.safety_rules) && <Field label="Safety rules" value={plan.safety_rules} />}
            {has(plan.other_pets) && <Field label="Other pets" value={plan.other_pets} />}
          </Section>
        )}

        {showHealth && (
          <Section title="What's normal & health" coach="cp-health">
            {weightStr && <Field label="Normal weight" value={weightStr} />}
            {has(plan.whats_normal) && <Field label="What's normal (overall)" value={plan.whats_normal} />}
            {has(plan.normal_appetite) && <Field label="Normal appetite" value={plan.normal_appetite} />}
            {has(plan.normal_droppings) && <Field label="Normal droppings" value={plan.normal_droppings} />}
            {has(plan.normal_noise) && <Field label="Normal noise" value={plan.normal_noise} />}
            {has(plan.normal_activity) && <Field label="Normal activity" value={plan.normal_activity} />}
            {has(plan.normal_sleep) && <Field label="Normal sleep" value={plan.normal_sleep} />}
            {has(plan.normal_behavior_with_strangers) && <Field label="With strangers" value={plan.normal_behavior_with_strangers} />}
            {has(bird.medical_conditions) && <Field label="Medical conditions" value={bird.medical_conditions} />}
            {(has(bird.medications) || has(plan.medication_schedule)) && (
              <Field label="Medications" value={joinUnique([bird.medications, plan.medication_schedule])} />
            )}
            {ctx.baselineClipUrl && (
              <div className="grid grid-cols-1 gap-2">
                {ctx.baselineClipUrl && (
                  <div className="overflow-hidden rounded-xl ring-1 ring-[#e0d8c4]">
                    <ClipPlayer src={ctx.baselineClipUrl} label="Normal-behavior clip" className="aspect-video" />
                    <p className="bg-white px-2 py-1 text-[11px] font-medium">Normal-behavior clip</p>
                  </div>
                )}
              </div>
            )}
          </Section>
        )}

        {(has(plan.when_to_call_owner) || has(plan.when_to_call_vet)) && (
          <Section title="When to call" danger coach="cp-emergency">
            {has(plan.when_to_call_owner) && <Field label="Call the owner" value={plan.when_to_call_owner} />}
            {has(plan.when_to_call_vet) && <Field label="Call the vet" value={plan.when_to_call_vet} />}
          </Section>
        )}

        <p className="px-1 text-center text-[11px] text-[#5f5e5a]">Owner-provided reference. For general care guidance, see the <Link to="/sitter/$token/guide" params={{ token }} className="underline">Care guide</Link>.</p>
      </main>
    </>
  );
}
