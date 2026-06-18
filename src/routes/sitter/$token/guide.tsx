import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useSitterContext } from "./route";
import { getGuideCards } from "@/lib/sitter.functions";
import {
  Search, ArrowLeft, ChevronDown, Info,
  Star, Utensils, Smile, Heart,
  Hand, Droplet, Activity, Moon, Wind,
  type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/sitter/$token/guide")({
  component: Guide,
});

function objectPronoun(sex: string | null | undefined): string {
  const s = (sex ?? "").trim().toLowerCase();
  if (s.startsWith("f")) return "her";
  if (s.startsWith("m")) return "him";
  return "them";
}

function cleanLabel(category: string): string {
  const s = category.replace(/^\d+[-_]/, "").replace(/[-_]/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : category;
}

// Icon chosen per topic chip from its label/keywords.
function chipIcon(category: string): LucideIcon {
  const s = category.toLowerCase();
  if (/eat|food|feed|diet|water/.test(s)) return Utensils;
  if (/behav|mood|personal/.test(s)) return Smile;
  if (/health|medical|vet|sick/.test(s)) return Heart;
  return Star;
}

// Leading entry icon. Kept as its own component so the muted Tabler-style icon
// can later be swapped for a custom Kya line illustration without reworking the
// list — change only this component.
function iconForEntry(card: any): LucideIcon {
  const s = `${card.slug ?? ""} ${card.title ?? ""} ${card.category ?? ""} ${card.search_keywords ?? ""}`.toLowerCase();
  if (/hand|step.?up|handl|bite|perch/.test(s)) return Hand;
  if (/dropping|poop|stool|droppings/.test(s)) return Droplet;
  if (/breath|lung|respir|wheez|tail.?bob/.test(s)) return Activity;
  if (/sleep|night|bed|cover|rest/.test(s)) return Moon;
  if (/air|fume|smoke|ventil|teflon|candle|scent/.test(s)) return Wind;
  if (/eat|food|feed|diet|bowl|water|treat/.test(s)) return Utensils;
  if (/behav|mood|fear|stress|pluck/.test(s)) return Smile;
  if (/health|sick|ill|weight|vet|molt/.test(s)) return Heart;
  return Star;
}

function EntryIcon({ card }: { card: any }) {
  const Icon = iconForEntry(card);
  return (
    <span className="grid size-[38px] shrink-0 place-items-center rounded-[11px] bg-[#e2ddcb] text-[#2d6a4f]">
      <Icon className="size-5" />
    </span>
  );
}

function Guide() {
  const { token } = Route.useParams();
  const { data: ctx } = useSitterContext(token);
  const fn = useServerFn(getGuideCards);
  const { data: cards } = useSuspenseQuery({ queryKey: ["guide-cards"], queryFn: () => fn() });

  const [q, setQ] = useState("");
  const [topic, setTopic] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const bird = ctx.bird as any;
  const pron = objectPronoun(bird.sex);

  const searching = q.trim().length > 0;
  const ql = q.trim().toLowerCase();
  const matches = (c: any) =>
    [c.title, c.category, c.search_keywords, c.quick_answer, c.what_to_check, c.what_to_do, c.when_to_call_vet]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(ql);

  const categories = Array.from(new Set((cards as any[]).map((c) => c.category))).sort();

  let list = cards as any[];
  if (searching) list = list.filter(matches);
  else if (topic) list = list.filter((c) => c.category === topic);

  const isWatch = (c: any) => c.emergency_level === "red" || c.emergency_level === "yellow";
  const isDroppings = (c: any) => /dropping|poop|stool/i.test(`${c.slug ?? ""} ${c.title ?? ""} ${c.search_keywords ?? ""}`);

  return (
    <div className="min-h-screen bg-[#f4f1e8] pb-28">
      <header className="bg-[#1a3d2e] pt-[max(env(safe-area-inset-top),0.75rem)]">
        <div className="mx-auto max-w-md px-4 pb-5 pt-2">
          <div className="flex items-center gap-2">
            <Link to="/sitter/$token" params={{ token }} className="-ml-1 rounded-full p-1 text-white/90 hover:bg-white/10" aria-label="Back">
              <ArrowLeft className="size-5" />
            </Link>
            <h1 className="text-lg font-medium text-white">Care guide</h1>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[#cdeab0]">
            The why behind the what. {bird.name}'s care sheet is the source of truth for {pron} — this is here when you want to understand something.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-4 px-4 py-5">
        {/* Search — the hero */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#8a897f]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="What do you need to know?"
            className="w-full rounded-2xl border border-[#e0d8c4] bg-[#efe9da] py-3.5 pl-12 pr-4 text-sm text-[#1a3d2e] outline-none placeholder:text-[#8a897f] focus:border-[#2d6a4f]"
          />
        </div>

        {/* Topic chips + golden-rules label give way to search results when typing */}
        {!searching && (
          <>
            <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categories.map((cat) => {
                const on = topic === cat;
                const CIcon = chipIcon(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => setTopic(on ? null : cat)}
                    aria-pressed={on}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                      on ? "bg-[#1a3d2e] text-white" : "bg-[#efe9da] text-[#1a3d2e]"
                    }`}
                  >
                    <CIcon className="size-3.5" />
                    {cleanLabel(cat)}
                  </button>
                );
              })}
            </div>

            <div>
              <p className="text-[11px] font-medium uppercase tracking-widest text-[#8a897f]">The golden rules</p>
              <p className="mt-0.5 text-xs text-[#5f5e5a]">The ones marked watch closely matter most.</p>
            </div>
          </>
        )}

        {/* Entries — collapsed by default, one open at a time */}
        <div className="space-y-2.5">
          {list.map((c: any) => {
            const watch = isWatch(c);
            const isOpen = open === c.id;
            const hasDeeper = !!(c.what_to_check || c.what_to_do || c.when_to_call_vet);
            return (
              <div
                key={c.id}
                className={`overflow-hidden bg-[#efe9da] ${
                  watch ? "rounded-2xl rounded-l-none border-l-[3px] border-[#BA7517]" : "rounded-2xl"
                }`}
              >
                <button
                  onClick={() => setOpen(isOpen ? null : c.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 p-3 text-left"
                >
                  <EntryIcon card={c} />
                  <span className="flex-1 text-sm font-medium text-[#1a3d2e]">{c.title}</span>
                  {watch && (
                    <span className="shrink-0 rounded-full bg-[#f4e4c4] px-2 py-0.5 text-[10px] font-medium text-[#84600f]">
                      watch closely
                    </span>
                  )}
                  <ChevronDown className={`size-4 shrink-0 text-[#8a897f] transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>

                {isOpen && (
                  <div className="px-3 pb-4 pl-[3.75rem]">
                    {c.quick_answer && (
                      <p className="text-sm leading-relaxed text-[#3a3a36]">{c.quick_answer}</p>
                    )}
                    {hasDeeper && (
                      <div className="mt-3 space-y-2 border-t border-[#e0d8c4] pt-3 text-sm leading-relaxed text-[#3a3a36]">
                        {c.what_to_check && <p><span className="font-medium text-[#1a3d2e]">What to check:</span> {c.what_to_check}</p>}
                        {c.what_to_do && <p><span className="font-medium text-[#1a3d2e]">What to do:</span> {c.what_to_do}</p>}
                        {c.when_to_call_vet && <p><span className="font-medium text-[#1a3d2e]">When to call the vet:</span> {c.when_to_call_vet}</p>}
                      </div>
                    )}
                    {isDroppings(c) && (
                      <p className="mt-3 text-xs leading-relaxed text-[#5f5e5a]">
                        If unsure, snap a photo for the owner in the{" "}
                        <Link to="/sitter/$token/scan" params={{ token }} className="font-medium text-[#2d6a4f] underline">health scan</Link>.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {list.length === 0 && (
            <p className="px-1 text-sm text-[#5f5e5a]">No entries match “{q}”.</p>
          )}
        </div>

        {/* Quiet disclaimer */}
        <p className="flex items-start gap-1.5 px-1 pt-2 text-[11px] leading-snug text-[#8a897f]">
          <Info className="mt-px size-3.5 shrink-0 text-[#BA7517]" />
          <span>General guidance, not vet-reviewed. For anything urgent, use {bird.name}'s emergency info.</span>
        </p>
      </main>
    </div>
  );
}
