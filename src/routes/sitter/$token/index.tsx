import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSitterContext } from "./route";
import { toggleTaskCompletion } from "@/lib/sitter.functions";
import { Disclaimer } from "@/components/Disclaimer";
import { BrandLogo } from "@/components/BrandLogo";
import { Stethoscope, Calendar, PlayCircle, Clock, X } from "lucide-react";

export const Route = createFileRoute("/sitter/$token/")({
  component: SitterHome,
});

const FRESH_FOOD_TASK_PATTERN = /\b(fresh|chop|veg|veggies|salad|sprout)\b/i;
const REMOVAL_TASK_PATTERN = /^remove fresh food/i;

type FreshTimer = { startedAt: number; taskTitle: string };

function loadTimers(sitId: string, birdId: string): Record<string, FreshTimer> {
  try {
    const raw = localStorage.getItem(`freshTimers:${sitId}:${birdId}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveTimers(sitId: string, birdId: string, t: Record<string, FreshTimer>) {
  try { localStorage.setItem(`freshTimers:${sitId}:${birdId}`, JSON.stringify(t)); } catch {}
}
function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const CATS = ["morning", "midday", "evening", "bedtime", "custom"] as const;

function SitterHome() {
  const { token } = Route.useParams();
  const { data: ctx } = useSitterContext(token);
  const qc = useQueryClient();
  const toggle = useServerFn(toggleTaskCompletion);
  const m = useMutation({
    mutationFn: (vars: { taskId: string; completed: boolean }) =>
      toggle({ data: { token, taskId: vars.taskId, completed: vars.completed } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sitter-ctx", token] }),
  });

  const completedIds = new Set((ctx.completions ?? []).map((c: any) => c.routine_task_id));
  const grouped: Record<string, any[]> = {};
  for (const t of ctx.tasks) (grouped[t.category] ??= []).push(t);
  const todayLabel = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-sage-100 bg-white">
        <div className="mx-auto max-w-md px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <BrandLogo size="sm" showTagline={false} />
            <div className="rounded bg-sage-50 px-2 py-1 text-[10px] font-bold uppercase">Sit active</div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-full bg-sage-100 font-bold text-sage-700">
              {ctx.bird.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h1 className="text-sm font-semibold">Care for {ctx.bird.name}</h1>
              <p className="text-[11px] uppercase tracking-wider text-sage-600">{ctx.bird.species ?? "Parrot"}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-5 px-4 py-5">
        <Disclaimer />

        <Link
          to="/sitter/$token/scan" params={{ token }}
          className="flex items-center justify-between rounded-2xl bg-sage-900 p-5 text-white shadow-sm active:scale-[0.99]"
        >
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest opacity-70">Daily requirement</p>
            <p className="mt-1 text-lg font-semibold">Run today's health scan</p>
            {ctx.todayLog && <p className="mt-1 text-xs opacity-80">Latest scan: <TriagePill status={ctx.todayLog.triage_status} /></p>}
          </div>
          <div className="rounded-full bg-white/10 p-3"><Stethoscope className="size-5" /></div>
        </Link>

        {ctx.watchClips && ctx.watchClips.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-lg font-bold tracking-tight">Watch first</h2>
            <p className="text-xs text-sage-600">Short clips from {ctx.bird.name}'s owner. These are private to you.</p>
            <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
              {ctx.watchClips.map((c: any) => (
                <a
                  key={c.key}
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex w-60 shrink-0 snap-start flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-sage-100 shadow-sm"
                >
                  <div className="relative aspect-video bg-sage-900">
                    <video src={c.url} className="size-full object-cover opacity-90" preload="metadata" muted playsInline />
                    <div className="absolute inset-0 grid place-items-center">
                      <PlayCircle className="size-10 text-white drop-shadow" />
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-semibold leading-tight">{c.label}</p>
                    <p className="mt-0.5 text-[11px] uppercase tracking-wider text-sage-600">Tap to play</p>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}


        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="text-lg font-bold tracking-tight">Today's routine</h2>
            <span className="flex items-center gap-1 text-xs text-sage-600"><Calendar className="size-3.5" />{todayLabel}</span>
          </div>
          {ctx.tasks.length === 0 && <p className="rounded-xl bg-white p-4 text-sm text-sage-600 ring-1 ring-sage-100">The owner hasn't added any routine tasks yet.</p>}
          {CATS.map((cat) => grouped[cat]?.length ? (
            <div key={cat} className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-sage-600">{cat}</p>
              {grouped[cat].map((t: any) => {
                const done = completedIds.has(t.id);
                return (
                  <button
                    key={t.id}
                    onClick={() => m.mutate({ taskId: t.id, completed: !done })}
                    className={`flex w-full items-start gap-4 rounded-xl p-4 text-left ring-1 transition ${done ? "bg-sage-50 ring-sage-100 opacity-70" : "bg-white ring-sage-100 shadow-sm"}`}
                  >
                    <div className={`mt-0.5 size-6 shrink-0 rounded border-2 ${done ? "border-warn-green bg-warn-green" : "border-sage-200 bg-white"} grid place-items-center`}>
                      {done && <svg viewBox="0 0 20 20" className="size-4 text-white"><path fill="currentColor" d="M7.629 13.314 4.4 10.085l1.214-1.214 2.015 2.015 5.757-5.757 1.214 1.214z"/></svg>}
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-semibold ${done && "line-through"}`}>{t.title}{t.time_of_day && <span className="ml-2 text-[10px] font-normal uppercase text-sage-600">{t.time_of_day}</span>}</p>
                      {t.instructions && <p className="mt-1 text-xs leading-relaxed text-sage-600">{t.instructions}</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null)}
        </section>

        {ctx.plan?.food_instructions && (
          <section className="rounded-2xl bg-white p-4 ring-1 ring-sage-100">
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-sage-600">Food & water reminder</h3>
            <p className="mt-2 text-sm whitespace-pre-line text-sage-900">{ctx.plan.food_instructions}</p>
            <p className="mt-3 rounded bg-warn-amber/10 p-2 text-[11px] font-semibold text-warn-amber">Do not introduce new foods while the owner is away.</p>
          </section>
        )}
      </main>
    </>
  );
}

function TriagePill({ status }: { status: string }) {
  const map: Record<string, string> = { green: "bg-warn-green", yellow: "bg-warn-amber", red: "bg-warn-red" };
  return <span className={`inline-block size-2 rounded-full ${map[status] ?? "bg-sage-300"}`} />;
}
