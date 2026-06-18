import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowLeft, AlertTriangle, ShieldAlert } from "lucide-react";
import { useSitterContext } from "./route";
import { ClipPlayer } from "@/components/ClipPlayer";
import { track } from "@/lib/analytics";
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

function Section({ title, children, danger = false }: { title: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <section className={`rounded-2xl p-4 ${danger ? "bg-warn-red/5 ring-1 ring-warn-red/30" : "bg-[#efe9da] shadow-sm"}`}>
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
  const dietDetails = (plan.diet_details ?? {}) as Record<string, { brand?: string; amount?: string; notes?: string }>;
  const freshFoods = (plan.fresh_foods ?? []) as string[];
  const neverFeed = (plan.never_feed ?? []) as string[];
  const hazards = (plan.hazards ?? []) as string[];
  const feedingTimes = (plan.feeding_times ?? []) as string[];

  const showBasics = has(bird.name) || has(bird.species) || has(bird.age) || has(bird.photo_url);
  const showFeeding = diet.length || plan.food_brand || plan.amount_value || feedingTimes.length || freshFoods.length || plan.fresh_foods_other || plan.treats_notes || plan.treats_frequency || plan.water_frequency || plan.water_notes || plan.food_storage || plan.food_hygiene_notes || plan.food_instructions || plan.water_instructions || plan.fresh_food_removal_minutes;
  const showHandling = has(plan.step_up) || has(plan.step_up_notes) || has(plan.handlers) || has(plan.likes) || has(plan.fears_triggers) || has(plan.bite_risk) || has(plan.handling_rules) || has(plan.known_triggers);
  const showHome = has(plan.cage_location) || has(plan.out_of_cage_mode) || has(plan.out_of_cage_notes) || has(plan.out_of_cage_rules) || hazards.length || has(plan.hazards_other) || has(plan.off_limits) || has(plan.off_limits_rooms) || has(plan.safety_rules) || has(plan.other_pets);
  const showHealth = has(bird.normal_weight) || has(bird.normal_weight_min) || has(bird.normal_weight_max) || has(plan.whats_normal) || has(plan.normal_appetite) || has(plan.normal_droppings) || has(plan.normal_noise) || has(plan.normal_activity) || has(plan.normal_sleep) || has(plan.normal_behavior_with_strangers) || has(bird.medical_conditions) || has(bird.medications) || has(plan.medication_schedule) || ctx.baselineDroppingsUrl || ctx.baselineClipUrl;

  const handlingDangerous = /\b(no|do not|don'?t|never)\b/i.test(plan.handling_rules ?? "") || /\b(no|do not|don'?t|never)\b/i.test(plan.step_up ?? "");

  const weightStr = (() => {
    if (has(bird.normal_weight_min) && has(bird.normal_weight_max)) return `${bird.normal_weight_min}–${bird.normal_weight_max} g`;
    if (has(bird.normal_weight)) return `${bird.normal_weight} g`;
    return null;
  })();

  return (
    <>
      <header className="bg-[#1a3d2e]">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
          <Link to="/sitter/$token" params={{ token }} search={{ birdId: ctx.activeBirdId }} className="rounded p-1 text-white/90"><ArrowLeft className="size-5" /></Link>
          <div>
            <h1 className="text-sm font-medium text-white">{bird.name}'s care sheet</h1>
            <p className="text-[10px] uppercase tracking-wider text-[#cdeab0]">Owner-entered reference</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 py-5">
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
          <Section title="Watch-first clips">
            <p className="text-xs text-[#5f5e5a]">Short clips from the owner.</p>
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
          <Section title="Feeding & food">
            <p className="rounded bg-warn-amber/10 p-2 text-[11px] font-medium text-warn-amber">Do not introduce new foods while the owner is away.</p>
            {has(plan.food_instructions) && <Field label="Diet overview" value={<RichText text={plan.food_instructions} />} />}
            {diet.length > 0 && <Field label="Diet types" value={<Chips items={diet} />} />}
            {has(plan.diet_other) && <Field label="Other diet" value={plan.diet_other} />}
            {Object.entries(dietDetails).map(([k, d]) => (
              has(d?.brand) || has(d?.amount) || has(d?.notes) ? (
                <div key={k} className="rounded-lg bg-[#e8e1d0] p-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-[#5f5e5a]">{k.replace(/_/g, " ")}</p>
                  {has(d.brand) && <p className="mt-1 text-sm"><span className="text-[#5f5e5a]">Brand: </span>{d.brand}</p>}
                  {has(d.amount) && <p className="text-sm"><span className="text-[#5f5e5a]">Amount: </span>{(d as any).unit ? formatAmountUnit(d.amount, (d as any).unit) : d.amount}</p>}
                  {has(d.notes) && <p className="text-sm whitespace-pre-line"><span className="text-[#5f5e5a]">Notes: </span>{d.notes}</p>}
                </div>
              ) : null
            ))}
            {(has(plan.food_brand) || has(plan.amount_value)) && (
              <Field label="Brand & amount" value={`${plan.food_brand ?? ""}${has(plan.amount_value) ? ` — ${formatAmountUnit(plan.amount_value, plan.amount_unit)}` : ""}`.trim()} />
            )}
            {feedingTimes.length > 0 && <Field label="Feeding times" value={<Chips items={feedingTimes} />} />}
            {freshFoods.length > 0 && <Field label="Fresh foods" value={<Chips items={freshFoods} />} />}
            {has(plan.fresh_foods_other) && <Field label="Other fresh foods" value={plan.fresh_foods_other} />}
            {(has(plan.treats_notes) || has(plan.treats_frequency)) && (
              <Field label="Treats" value={`${plan.treats_notes ?? ""}${has(plan.treats_frequency) ? `\nFrequency: ${prettyLabel(plan.treats_frequency, TREATS_FREQ_LABELS)}` : ""}`.trim()} />
            )}
            {(has(plan.water_frequency) || has(plan.water_notes) || has(plan.water_instructions)) && (
              <Field
                label="Water"
                value={[
                  plan.water_frequency && `Water ${prettyLabel(plan.water_frequency, WATER_FREQ_LABELS)}`,
                  plan.water_notes,
                  plan.water_instructions,
                ].filter(Boolean).join("\n")}
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
            {(handlingDangerous || has(plan.bite_risk) || neverFeed.length > 0) && (
              <Section title="Handling — read first" danger>
                <ul className="space-y-1.5 text-sm text-[#1a3d2e]">
                  {handlingDangerous && (
                    <li className="flex gap-2"><ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn-red" /><span>Handling restrictions apply — see the rules below before any contact.</span></li>
                  )}
                  {has(plan.bite_risk) && (
                    <li className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn-red" /><span>Watch for bite warning signs — full list in Handling & personality.</span></li>
                  )}
                  {neverFeed.length > 0 && (
                    <li className="flex gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn-red" /><span>Never feed the toxic items listed above.</span></li>
                  )}
                </ul>
              </Section>
            )}
            <Section title="Handling & personality">
              {has(plan.step_up) && <Field label="Step up" value={plan.step_up} />}
              {has(plan.step_up_notes) && <Field label="Step up notes" value={plan.step_up_notes} />}
              {has(plan.handlers) && <Field label="Who can handle" value={plan.handlers} />}
              {has(plan.handling_rules) && <Field label="Handling rules" value={plan.handling_rules} />}
              {has(plan.likes) && <Field label="Likes" value={plan.likes} />}
              {(has(plan.fears_triggers) || has(plan.known_triggers)) && (
                <div className="rounded-lg bg-warn-amber/10 p-3 ring-1 ring-warn-amber/20">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-warn-amber">Fears & triggers</p>
                  <p className="mt-1 text-sm whitespace-pre-line">{[plan.fears_triggers, plan.known_triggers].filter(Boolean).join("\n")}</p>
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
          <Section title="Home & safety">
            {has(plan.cage_location) && <Field label="Cage location" value={plan.cage_location} />}
            {(has(plan.out_of_cage_mode) || has(plan.out_of_cage_notes) || has(plan.out_of_cage_rules)) && (
              <Field label="Out-of-cage rules" value={[prettyLabel(plan.out_of_cage_mode, OUT_OF_CAGE_LABELS), plan.out_of_cage_notes, plan.out_of_cage_rules].filter(Boolean).join("\n")} />
            )}
            {(has(plan.off_limits) || has(plan.off_limits_rooms)) && (
              <Field label="Off-limits areas" value={[plan.off_limits, plan.off_limits_rooms].filter(Boolean).join("\n")} />
            )}
            {has(plan.safety_rules) && <Field label="Safety rules" value={plan.safety_rules} />}
            {has(plan.other_pets) && <Field label="Other pets" value={plan.other_pets} />}
          </Section>
        )}

        {showHealth && (
          <Section title="What's normal & health">
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
              <Field label="Medications" value={[bird.medications, plan.medication_schedule].filter(Boolean).join("\n")} />
            )}
            {(ctx.baselineDroppingsUrl || ctx.baselineClipUrl) && (
              <div className="grid grid-cols-1 gap-2">
                {ctx.baselineDroppingsUrl && (
                  <div className="overflow-hidden rounded-xl ring-1 ring-[#e0d8c4]">
                    <img src={ctx.baselineDroppingsUrl} alt="Baseline droppings" className="aspect-video w-full object-cover" />
                    <p className="bg-white px-2 py-1 text-[11px] font-medium">Baseline droppings</p>
                  </div>
                )}
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
          <Section title="When to call" danger>
            {has(plan.when_to_call_owner) && <Field label="Call the owner" value={plan.when_to_call_owner} />}
            {has(plan.when_to_call_vet) && <Field label="Call the vet" value={plan.when_to_call_vet} />}
          </Section>
        )}

        <p className="px-1 text-center text-[11px] text-[#5f5e5a]">Owner-provided reference. For general care guidance, see the <Link to="/sitter/$token/guide" params={{ token }} className="underline">Care guide</Link>.</p>
      </main>
    </>
  );
}
