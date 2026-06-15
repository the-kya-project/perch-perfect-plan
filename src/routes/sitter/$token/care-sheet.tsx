import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, AlertTriangle, ShieldAlert } from "lucide-react";
import { useSitterContext } from "./route";
import { ClipPlayer } from "@/components/ClipPlayer";

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
    <section className={`rounded-2xl p-4 ring-1 ${danger ? "bg-warn-red/5 ring-warn-red/30" : "bg-white ring-sage-100"}`}>
      <h2 className={`text-[11px] font-bold uppercase tracking-widest ${danger ? "text-warn-red" : "text-sage-600"}`}>{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (!has(value as any)) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-sage-500">{label}</p>
      <div className="mt-0.5 text-sm text-sage-900 whitespace-pre-line">{value}</div>
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => (
        <span key={s} className="rounded-full bg-sage-100 px-2.5 py-0.5 text-xs font-medium text-sage-800">{s}</span>
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

const CADENCE_LABELS: Record<string, string> = {
  after_each_fresh: "After every fresh-food serving",
  once_daily: "Once a day",
  every_few_days: "Every few days",
};

function CareSheet() {
  const { token } = Route.useParams();
  const { data: ctx } = useSitterContext(token);
  const bird = ctx.bird as any;
  const plan = (ctx.plan ?? {}) as any;
  const clips = ctx.watchClips ?? [];

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
      <header className="sticky top-0 z-10 border-b border-sage-100 bg-white">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
          <Link to="/sitter/$token" params={{ token }} search={{ birdId: ctx.activeBirdId }} className="rounded p-1 text-sage-600"><ArrowLeft className="size-5" /></Link>
          <div>
            <h1 className="text-sm font-bold">{bird.name}'s care sheet</h1>
            <p className="text-[10px] uppercase tracking-wider text-sage-600">Owner-entered reference</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 py-5">
        {showBasics && (
          <Section title="Basics">
            <div className="flex items-center gap-4">
              {bird.photo_url ? (
                <img src={bird.photo_url} alt={bird.name} className="size-16 rounded-2xl object-cover ring-1 ring-sage-200" style={{ objectPosition: bird.photo_position ?? "50% 50%" }} />
              ) : (
                <div className="grid size-16 place-items-center rounded-2xl bg-sage-100 text-xl font-bold text-sage-700">{bird.name.slice(0,1).toUpperCase()}</div>
              )}
              <div className="flex-1">
                <p className="text-lg font-bold leading-tight">{bird.name}</p>
                {has(bird.species) && <p className="text-sm text-sage-700">{bird.species}</p>}
                {has(bird.age) && <p className="text-xs text-sage-600">{bird.age}</p>}
              </div>
            </div>
          </Section>
        )}

        {clips.length > 0 && (
          <Section title="Watch-first clips">
            <p className="text-xs text-sage-600">Short clips from the owner.</p>
            <div className="-mx-1 grid grid-cols-1 gap-3">
              {clips.map((c: any) => (
                <div key={c.key} className="overflow-hidden rounded-xl bg-white ring-1 ring-sage-100">
                  <ClipPlayer src={c.url} label={c.label} className="aspect-video" />
                  <p className="px-2 py-1.5 text-[12px] font-semibold leading-tight">{c.label}</p>
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
            {diet.length > 0 && <Field label="Diet types" value={<Chips items={diet} />} />}
            {has(plan.diet_other) && <Field label="Other diet" value={plan.diet_other} />}
            {Object.entries(dietDetails).map(([k, d]) => (
              has(d?.brand) || has(d?.amount) || has(d?.notes) ? (
                <div key={k} className="rounded-lg bg-sage-50 p-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-sage-700">{k.replace(/_/g, " ")}</p>
                  {has(d.brand) && <p className="mt-1 text-sm"><span className="text-sage-500">Brand: </span>{d.brand}</p>}
                  {has(d.amount) && <p className="text-sm"><span className="text-sage-500">Amount: </span>{d.amount}</p>}
                  {has(d.notes) && <p className="text-sm whitespace-pre-line"><span className="text-sage-500">Notes: </span>{d.notes}</p>}
                </div>
              ) : null
            ))}
            {(has(plan.food_brand) || has(plan.amount_value)) && (
              <Field label="Brand & amount" value={`${plan.food_brand ?? ""}${has(plan.amount_value) ? ` — ${plan.amount_value}${plan.amount_unit ? ` ${plan.amount_unit}` : ""}` : ""}`.trim()} />
            )}
            {feedingTimes.length > 0 && <Field label="Feeding times" value={<Chips items={feedingTimes} />} />}
            {freshFoods.length > 0 && <Field label="Fresh foods" value={<Chips items={freshFoods} />} />}
            {has(plan.fresh_foods_other) && <Field label="Other fresh foods" value={plan.fresh_foods_other} />}
            {(has(plan.treats_notes) || has(plan.treats_frequency)) && (
              <Field label="Treats" value={`${plan.treats_notes ?? ""}${has(plan.treats_frequency) ? `\nFrequency: ${plan.treats_frequency}` : ""}`.trim()} />
            )}
            {(has(plan.water_frequency) || has(plan.water_notes) || has(plan.water_instructions)) && (
              <Field label="Water" value={[plan.water_frequency && `Refresh: ${plan.water_frequency}`, plan.water_notes, plan.water_instructions].filter(Boolean).join("\n")} />
            )}
            <div className="rounded-lg bg-sage-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-sage-600">Freshness & hygiene</p>
              <ul className="mt-1.5 space-y-1 text-sm text-sage-900">
                <li>Remove fresh food within <strong>{plan.fresh_food_removal_minutes ?? 120} min</strong> of serving.</li>
                <li>Wash food bowls: <strong>{CADENCE_LABELS[plan.food_bowl_wash_cadence] ?? plan.food_bowl_wash_cadence ?? "—"}</strong>.</li>
                <li>Wash water bowl: <strong>{CADENCE_LABELS[plan.water_bowl_wash_cadence] ?? plan.water_bowl_wash_cadence ?? "—"}</strong>.</li>
              </ul>
              {has(plan.food_hygiene_notes) && <p className="mt-2 text-xs text-sage-700 whitespace-pre-line">{plan.food_hygiene_notes}</p>}
            </div>
            {has(plan.food_storage) && <Field label="Food storage" value={plan.food_storage} />}
            {has(plan.food_instructions) && <Field label="Owner's feeding notes" value={plan.food_instructions} />}
            <p className="rounded bg-warn-amber/10 p-2 text-[11px] font-semibold text-warn-amber">Do not introduce new foods while the owner is away.</p>
          </Section>
        )}

        {showHandling && (
          <>
            {handlingDangerous && (
              <Section title="Handling — read first" danger>
                {has(plan.handling_rules) && <Field label="Handling rules" value={plan.handling_rules} />}
                {has(plan.step_up) && <Field label="Step up" value={plan.step_up} />}
              </Section>
            )}
            <Section title="Handling & personality">
              {!handlingDangerous && has(plan.step_up) && <Field label="Step up" value={plan.step_up} />}
              {has(plan.step_up_notes) && <Field label="Step up notes" value={plan.step_up_notes} />}
              {has(plan.handlers) && <Field label="Who can handle" value={plan.handlers} />}
              {!handlingDangerous && has(plan.handling_rules) && <Field label="Handling rules" value={plan.handling_rules} />}
              {has(plan.likes) && <Field label="Likes" value={plan.likes} />}
              {(has(plan.fears_triggers) || has(plan.known_triggers)) && (
                <div className="rounded-lg bg-warn-amber/10 p-3 ring-1 ring-warn-amber/20">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-warn-amber">Fears & triggers</p>
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
              <Field label="Out-of-cage rules" value={[plan.out_of_cage_mode, plan.out_of_cage_notes, plan.out_of_cage_rules].filter(Boolean).join("\n")} />
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
                  <div className="overflow-hidden rounded-xl ring-1 ring-sage-100">
                    <img src={ctx.baselineDroppingsUrl} alt="Baseline droppings" className="aspect-video w-full object-cover" />
                    <p className="bg-white px-2 py-1 text-[11px] font-semibold">Baseline droppings</p>
                  </div>
                )}
                {ctx.baselineClipUrl && (
                  <div className="overflow-hidden rounded-xl ring-1 ring-sage-100">
                    <ClipPlayer src={ctx.baselineClipUrl} label="Normal-behavior clip" className="aspect-video" />
                    <p className="bg-white px-2 py-1 text-[11px] font-semibold">Normal-behavior clip</p>
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

        <p className="px-1 text-center text-[11px] text-sage-500">Owner-provided reference. For general care guidance, see the <Link to="/sitter/$token/guide" params={{ token }} className="underline">Care guide</Link>.</p>
      </main>
    </>
  );
}
