import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { useSitterContext } from "./route";
import { SitterTabHeader } from "@/components/sitter/SitterChrome";
import { K, KyaBody, KyaCard, KyaHeading, KyaIconTile } from "@/components/kya";
import { getGuideCards } from "@/lib/sitter.functions";
import {
  Search, ChevronDown, Info,
  Star, Utensils, Smile, Heart, AlertTriangle, Home,
  Hand, Droplet, Activity, Moon, Wind,
  type LucideIcon,
} from "lucide-react";

export const Route = createFileRoute("/sitter/$token/guide")({
  component: Guide,
});

// Topic chips. The stored guide_cards categories are book chapters (01-…, 02-…);
// these map them to a small, sitter-friendly topic set. Per-entry overrides
// pull a few rules into a better-fitting topic. Done in the frontend so the
// underlying content stays intact and the mapping is easy to adjust.
type Topic = { key: string; label: string; icon: LucideIcon };
const TOPICS: Topic[] = [
  { key: "golden", label: "10 things to know", icon: Star },
  { key: "eating", label: "Eating", icon: Utensils },
  { key: "behavior", label: "Behavior", icon: Smile },
  { key: "health", label: "Health", icon: Heart },
  { key: "worry", label: "When to worry", icon: AlertTriangle },
  { key: "home", label: "Home", icon: Home },
];

const TOPIC_SUBHEAD: Record<string, string> = {
  golden: "The essentials, in one place.",
};

const CATEGORY_TOPIC: Record<string, string> = {
  "01-the-10-rules": "golden",
  "02-the-daily-health-scan": "health",
  "03-healthy-vs-sick": "worry",
  "04-droppings": "health",
  "05-body-language": "behavior",
  "06-trust-and-handling": "behavior",
  "07-food-and-water": "eating",
  "08-enrichment": "behavior",
  "09-the-safe-home": "home",
  "10-emergencies": "worry",
  "11-special-situations": "health",
  "12-keeping-the-owner-informed": "health",
};

// Per-entry overrides: these belong out of the golden-rules list.
const ENTRY_TOPIC: Record<string, string> = {
  "rule-emergency": "worry",
  "rule-doors-windows": "home",
};

function topicForCard(c: any): string {
  return ENTRY_TOPIC[c.slug] ?? CATEGORY_TOPIC[c.category] ?? "golden";
}

// Leading entry icon. Kept as its own component so the muted Tabler-style icon
// can later be swapped for a custom Kya line illustration without reworking the
// list — change only this component.
function iconForEntry(card: any): LucideIcon {
  const s = `${card.slug ?? ""} ${card.title ?? ""} ${card.category ?? ""} ${card.search_keywords ?? ""}`.toLowerCase();
  if (/emergenc|first.?aid|gets? out/.test(s)) return AlertTriangle;
  if (/hand|step.?up|handl|bite|perch/.test(s)) return Hand;
  if (/dropping|poop|stool/.test(s)) return Droplet;
  if (/breath|lung|respir|wheez|tail.?bob/.test(s)) return Activity;
  if (/sleep|night|bed|cover|rest/.test(s)) return Moon;
  if (/air|fume|smoke|ventil|teflon|candle|scent|window|door/.test(s)) return Wind;
  if (/eat|food|feed|diet|bowl|water|treat/.test(s)) return Utensils;
  if (/behav|mood|fear|stress|pluck|enrich|toy/.test(s)) return Smile;
  if (/health|sick|ill|weight|vet|molt/.test(s)) return Heart;
  return Star;
}

function EntryIcon({ card }: { card: any }) {
  const Icon = iconForEntry(card);
  return (
    <KyaIconTile size={38}>
      <Icon className="size-[19px]" />
    </KyaIconTile>
  );
}

// Literal-key topic/subhead labels. Written as a switch of literal t() calls (not
// a dynamic `topic.${key}` key) so i18next-parser can statically extract them.
function useTopicLabels() {
  const { t } = useTranslation();
  const topicLabel = (key: string, fallback: string): string => {
    switch (key) {
      case "golden": return t("sitter.guide.topic.golden", "10 things to know");
      case "eating": return t("sitter.guide.topic.eating", "Eating");
      case "behavior": return t("sitter.guide.topic.behavior", "Behavior");
      case "health": return t("sitter.guide.topic.health", "Health");
      case "worry": return t("sitter.guide.topic.worry", "When to worry");
      case "home": return t("sitter.guide.topic.home", "Home");
      default: return fallback;
    }
  };
  const subheadLabel = (key: string, fallback: string): string =>
    key === "golden" ? t("sitter.guide.subhead.golden", "The essentials, in one place.") : fallback;
  return { topicLabel, subheadLabel };
}

function Guide() {
  const { t } = useTranslation();
  const { topicLabel, subheadLabel } = useTopicLabels();
  const { token } = Route.useParams();
  const { data: ctx } = useSitterContext(token);
  const fn = useServerFn(getGuideCards);
  const { data: cards } = useSuspenseQuery({ queryKey: ["guide-cards"], queryFn: () => fn() });

  const [q, setQ] = useState("");
  const [topic, setTopic] = useState<string>("golden"); // golden rules is the default view
  const [open, setOpen] = useState<string | null>(null);

  const bird = ctx.bird as any;
  const multi = (ctx.birds?.length ?? 0) > 1;
  const sex = (bird?.sex ?? "").toString().trim().toLowerCase();
  // One sentence per pronoun form (Dutch needs whole sentences, not a slot).
  const line = multi
    ? t("sitter.guide.subtitleMulti", "The basics of parrot care. For each bird's own needs, always follow their care plan.")
    : sex.startsWith("f")
    ? t("sitter.guide.subtitleShe", "The basics of parrot care. For {{name}}'s own needs, always follow her care plan.", { name: bird.name })
    : sex.startsWith("m")
    ? t("sitter.guide.subtitleHe", "The basics of parrot care. For {{name}}'s own needs, always follow his care plan.", { name: bird.name })
    : t("sitter.guide.subtitleThey", "The basics of parrot care. For {{name}}'s own needs, always follow their care plan.", { name: bird.name });

  const searching = q.trim().length > 0;
  const ql = q.trim().toLowerCase();
  const matches = (c: any) =>
    [c.title, c.category, c.search_keywords, c.quick_answer, c.what_to_check, c.what_to_do, c.when_to_call_vet]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(ql);

  // Search overrides the active chip and spans every category; otherwise show
  // only the active topic's entries.
  const list = searching
    ? (cards as any[]).filter(matches)
    : (cards as any[]).filter((c) => topicForCard(c) === topic);

  const activeTopic = TOPICS.find((t) => t.key === topic);

  const isDroppings = (c: any) => /dropping|poop|stool/i.test(`${c.slug ?? ""} ${c.title ?? ""} ${c.search_keywords ?? ""}`);

  // Chip-row edge fades reflect scroll position so it's clear the row continues.
  const chipScrollRef = useRef<HTMLDivElement>(null);
  const [chipAtStart, setChipAtStart] = useState(true);
  const [chipAtEnd, setChipAtEnd] = useState(false);
  function updateChipFades() {
    const el = chipScrollRef.current;
    if (!el) return;
    setChipAtStart(el.scrollLeft <= 1);
    setChipAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 1);
  }
  useEffect(() => { updateChipFades(); }, [searching]);

  // No KyaPage: its bottom padding is for the owner's tab bar, and the sitter
  // layout already leaves room for the sitter's bar and the safe area.
  return (
    <div>
      <div className="mx-auto max-w-md">
        <div data-coach="guide-header">
          <SitterTabHeader token={token} title={t("sitter.guide.title", "Parrots 101")} line={line}>
            {/* Search lives in the header */}
            <div data-coach="guide-search" className="relative mt-5">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2" style={{ color: K.quiet }} aria-hidden="true" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("sitter.guide.searchPlaceholder", "What do you need to know?")}
                aria-label={t("sitter.guide.searchPlaceholder", "What do you need to know?")}
                className="h-12 w-full rounded-full border-0 bg-white pl-12 pr-4 text-[16px] outline-none placeholder:text-[#8a958d] focus:ring-2 focus:ring-[#cdeab0]"
                style={{ color: K.forest }}
              />
            </div>
          </SitterTabHeader>
        </div>

        <KyaBody>
          {/* Topic chips + section heading give way to search results when typing */}
          {!searching && (
            <>
              <div data-coach="guide-topics" className="relative -mx-4">
                <div
                  ref={chipScrollRef}
                  onScroll={updateChipFades}
                  className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                  {TOPICS.map((t_) => {
                    const on = topic === t_.key;
                    const CIcon = t_.icon;
                    return (
                      <button
                        key={t_.key}
                        type="button"
                        onClick={() => { setTopic(t_.key); setOpen(null); }}
                        aria-pressed={on}
                        className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border-[1.5px] px-4 text-[14.5px] font-[700] transition-colors"
                        style={on ? { background: K.forest, borderColor: K.forest, color: "#fff" } : { background: "#fff", borderColor: "#d5dfd5", color: K.forest }}
                      >
                        <CIcon className="size-4" aria-hidden="true" />
                        {topicLabel(t_.key, t_.label)}
                      </button>
                    );
                  })}
                  {/* trailing spacer so the last chip can scroll clear of the fade */}
                  <span aria-hidden className="shrink-0 pl-1" />
                </div>
                {!chipAtStart && (
                  <div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-[#f1f5f0] to-transparent" />
                )}
                {!chipAtEnd && (
                  <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#f1f5f0] to-transparent" />
                )}
              </div>

              <div className="px-1">
                <KyaHeading size={21}>{topicLabel(topic, activeTopic?.label ?? "")}</KyaHeading>
                {TOPIC_SUBHEAD[topic] && (
                  <p className="m-0 mt-1 text-[14px]" style={{ color: K.quiet }}>{subheadLabel(topic, TOPIC_SUBHEAD[topic])}</p>
                )}
              </div>
            </>
          )}

          {/* Entries — one white card of rows, collapsed by default, one open at a time */}
          {list.length > 0 ? (
            <KyaCard>
              {list.map((c: any, i: number) => {
                const isOpen = open === c.id;
                const hasDeeper = !!(c.what_to_check || c.what_to_do || c.when_to_call_vet);
                return (
                  <div key={c.id} style={{ borderTop: i > 0 ? `1px solid ${K.line}` : undefined }}>
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : c.id)}
                      aria-expanded={isOpen}
                      className="flex min-h-[62px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-black/[0.03]"
                      style={{ color: K.forest }}
                    >
                      <EntryIcon card={c} />
                      <span className="min-w-0 flex-1 text-[15px] font-[700] leading-[1.3]">{c.title}</span>
                      <ChevronDown className={`size-[18px] shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} style={{ color: K.quiet }} aria-hidden="true" />
                    </button>

                    {isOpen && (
                      <div className="pb-4 pl-[66px] pr-4 text-[14px] leading-[1.5]" style={{ color: K.ink }}>
                        {c.quick_answer && <p className="m-0">{c.quick_answer}</p>}
                        {hasDeeper && (
                          <div className={`flex flex-col gap-2 ${c.quick_answer ? "mt-3 border-t pt-3" : ""}`} style={{ borderColor: K.line }}>
                            {c.what_to_check && <p className="m-0"><span className="font-[700]" style={{ color: K.forest }}>{t("sitter.guide.whatToCheck", "What to check:")}</span> {c.what_to_check}</p>}
                            {c.what_to_do && <p className="m-0"><span className="font-[700]" style={{ color: K.forest }}>{t("sitter.guide.whatToDo", "What to do:")}</span> {c.what_to_do}</p>}
                            {c.when_to_call_vet && <p className="m-0"><span className="font-[700]" style={{ color: K.forest }}>{t("sitter.guide.whenToCallVet", "When to call the vet:")}</span> {c.when_to_call_vet}</p>}
                          </div>
                        )}
                        {isDroppings(c) && (
                          <p className="m-0 mt-3 text-[13px]" style={{ color: K.quiet }}>
                            {t("sitter.guide.droppingsHint.before", "If unsure, snap a photo for the owner in the")}{" "}
                            <Link to="/sitter/$token/scan" params={{ token }} className="font-[700] underline" style={{ color: K.moss }}>{t("sitter.guide.droppingsHint.linkCheck", "daily health check")}</Link>{t("sitter.guide.droppingsHint.after", ".")}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </KyaCard>
          ) : (
            <p className="m-0 px-1 text-[15px]" style={{ color: K.quiet }}>{t("sitter.guide.noMatches", "No entries match “{{q}}”.", { q })}</p>
          )}

          {/* Quiet disclaimer */}
          <p className="m-0 flex items-start gap-1.5 px-1 text-[12.5px] leading-[1.45]" style={{ color: K.quiet }}>
            <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span>{t("sitter.guide.disclaimer", "General guidance, not vet-reviewed. For anything urgent, use {{name}}'s emergency info.", { name: bird.name })}</span>
          </p>
        </KyaBody>
      </div>
    </div>
  );
}
