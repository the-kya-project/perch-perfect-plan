import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { BadgeCheck, BookOpen, ExternalLink, FileText, ListChecks, PlayCircle, Link2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K, KyaHeading } from "@/components/kya";
import type { LibraryCard, LibraryResource } from "@/lib/flockLibrary";
import { loadTicks, saveTicks } from "@/lib/flockLibrary";
import type { LibraryResourceType, LibrarySubject } from "@/lib/flockNav";
import { parseBody, type Inline } from "@/lib/libraryMarkdown";

// The library's shared pieces: labels, the list card, the vet badge and the
// whole resource view (the member detail page and the admin preview draw the
// same thing). Flock code only.

export function resourceTypeLabel(t: TFunction, v: LibraryResourceType): string {
  switch (v) {
    case "guide": return t("flock.library.type.guide", "Guide");
    case "checklist": return t("flock.library.type.checklist", "Checklist");
    case "video": return t("flock.library.type.video", "Video");
    case "link": return t("flock.library.type.link", "Link");
  }
}

export function subjectLabel(t: TFunction, v: LibrarySubject): string {
  switch (v) {
    case "foraging": return t("flock.library.foraging", "Foraging");
    case "diet": return t("flock.library.diet", "Diet");
    case "training": return t("flock.library.training", "Training");
    case "hormones": return t("flock.library.hormones", "Hormones");
    case "conservation": return t("flock.library.conservation", "Conservation");
  }
}

export function ResourceTypeIcon({ type, className = "size-4" }: { type: LibraryResourceType; className?: string }) {
  const Icon = type === "checklist" ? ListChecks : type === "video" ? PlayCircle : type === "link" ? Link2 : BookOpen;
  return <Icon className={className} aria-hidden="true" />;
}

/** "Reviewed by an avian vet": shown only when the resource's flag is on. */
export function VetBadge({ reviewer, on }: { reviewer?: string | null; on?: string | null }) {
  const { t, i18n } = useTranslation();
  const when = on ? new Date(`${on}T12:00:00`).toLocaleDateString(i18n.language, { month: "short", day: "numeric", year: "numeric" }) : null;
  const detail = [reviewer, when].filter(Boolean).join(" · ");
  return (
    <span data-testid="vet-badge" className="inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-[700]" style={{ background: K.lime, color: K.forest }}>
      <BadgeCheck className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">
        {t("flock.library.vetReviewed", "Reviewed by an avian vet")}
        {detail && <span className="font-normal"> · {detail}</span>}
      </span>
    </span>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[12.5px] font-[700]" style={{ color: K.forest, border: `1px solid ${K.line}` }}>{children}</span>;
}

/** One resource in the Library list: cover (if any), type, title, summary. */
export function ResourceCard({ r, coverUrl }: { r: LibraryCard; coverUrl?: string }) {
  const { t } = useTranslation();
  return (
    <li>
      <Link to="/flock/library/$resourceId" params={{ resourceId: r.id }} data-resource={r.id}
        className="flex gap-3 rounded-[20px] bg-white p-3 active:scale-[0.99]" style={{ border: `1px solid ${K.line}`, color: K.forest }}>
        <span className="grid size-[76px] shrink-0 place-items-center overflow-hidden rounded-[14px]" style={{ background: K.mist }}>
          {r.cover_path && coverUrl
            ? <img src={coverUrl} alt="" className="size-full object-cover" loading="lazy" />
            : <ResourceTypeIcon type={r.resource_type} className="size-7" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-1.5 text-[12.5px] font-[700] uppercase tracking-[0.04em]" style={{ color: K.moss }}>
            <ResourceTypeIcon type={r.resource_type} className="size-3.5" />
            {resourceTypeLabel(t, r.resource_type)}
            {r.vet_reviewed && (
              <span className="inline-flex items-center gap-1 normal-case tracking-normal" style={{ color: K.forest }} data-testid="card-vet">
                · <BadgeCheck className="size-3.5" aria-hidden="true" />{t("flock.library.vetShort", "Vet reviewed")}
              </span>
            )}
          </span>
          <span className="text-[16px] font-[700] leading-[1.3]">{r.title}</span>
          {r.summary && <span className="line-clamp-2 text-[14px] leading-[1.45]" style={{ color: K.ink }}>{r.summary}</span>}
        </span>
      </Link>
    </li>
  );
}

function Inlines({ content }: { content: Inline[] }) {
  return (
    <>
      {content.map((n, i) => {
        if (n.kind === "strong") return <strong key={i}>{n.text}</strong>;
        if (n.kind === "em") return <em key={i}>{n.text}</em>;
        if (n.kind === "link") {
          return <a key={i} href={n.href} target="_blank" rel="noopener noreferrer" className="font-[700] underline underline-offset-2" style={{ color: K.moss }}>{n.text}</a>;
        }
        return <span key={i}>{n.text}</span>;
      })}
    </>
  );
}

/** The body, drawn from the safe Markdown subset (never as HTML). Checklist
 *  boxes can be ticked; ticks stay on this device (`tickKey`), or nowhere. */
export function ResourceBody({ body, tickKey }: { body: string; tickKey?: string }) {
  const blocks = useMemo(() => parseBody(body), [body]);
  const [ticks, setTicks] = useState<number[]>([]);
  useEffect(() => { setTicks(tickKey ? loadTicks(tickKey) : []); }, [tickKey]);
  const toggle = (n: number) => setTicks((cur) => {
    const next = cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n];
    if (tickKey) saveTicks(tickKey, next);
    return next;
  });
  let item = 0;
  return (
    <div className="flex flex-col gap-3 text-[16px] leading-[1.6]" style={{ color: K.ink }} data-testid="resource-body">
      {blocks.map((b, i) => {
        if (b.kind === "heading") {
          return <KyaHeading key={i} as={b.level === 2 ? "h2" : "h3"} size={b.level === 2 ? 21 : 18} className="mt-2"><span style={{ color: K.forest }}><Inlines content={b.content} /></span></KyaHeading>;
        }
        if (b.kind === "quote") {
          return <p key={i} className="m-0 rounded-[16px] px-4 py-3" style={{ background: K.lime, color: K.forest }}><Inlines content={b.content} /></p>;
        }
        if (b.kind === "list") {
          const Tag = b.ordered ? "ol" : "ul";
          return (
            <Tag key={i} className={`m-0 flex flex-col gap-1.5 pl-6 ${b.ordered ? "list-decimal" : "list-disc"}`}>
              {b.items.map((c, j) => <li key={j}><Inlines content={c} /></li>)}
            </Tag>
          );
        }
        if (b.kind === "checklist") {
          return (
            <ul key={i} className="m-0 flex list-none flex-col gap-1 p-0" data-testid="checklist">
              {b.items.map((c, j) => {
                const n = item++;
                const on = ticks.includes(n) !== c.checked;
                return (
                  <li key={j}>
                    <label className="flex min-h-[44px] cursor-pointer items-start gap-3 rounded-[14px] bg-white px-3 py-2.5" style={{ border: `1px solid ${K.line}` }}>
                      <input type="checkbox" checked={on} onChange={() => toggle(n)} className="mt-1 size-5 shrink-0" style={{ accentColor: K.forest }} />
                      <span className={on ? "line-through opacity-70" : ""}><Inlines content={c.content} /></span>
                    </label>
                  </li>
                );
              })}
            </ul>
          );
        }
        return <p key={i} className="m-0"><Inlines content={b.content} /></p>;
      })}
    </div>
  );
}

/** A whole resource: cover, type, title, summary, vet badge, tags, the link
 *  or PDF, then the body. The member page and the admin preview share it. */
export function ResourceView({ r, urls, tickKey }: {
  r: Pick<LibraryResource, "title" | "summary" | "body" | "resource_type" | "topics" | "species" | "cover_path" | "external_url" | "attachment_path" | "vet_reviewed" | "vet_reviewer" | "vet_reviewed_on">;
  urls: Record<string, string> | undefined;
  tickKey?: string;
}) {
  const { t } = useTranslation();
  const cover = r.cover_path ? urls?.[r.cover_path] : undefined;
  const pdf = r.attachment_path ? urls?.[r.attachment_path] : undefined;
  const linkLabel = r.resource_type === "video" ? t("flock.library.watch", "Watch the video") : t("flock.library.open", "Open the link");
  return (
    <article className="flex flex-col gap-4" data-testid="resource-view">
      {cover && <img src={cover} alt="" className="max-h-[300px] w-full rounded-[20px] object-cover" data-testid="resource-cover" />}
      <div className="flex flex-col gap-2.5">
        <span className="flex items-center gap-1.5 text-[13px] font-[700] uppercase tracking-[0.04em]" style={{ color: K.moss }} data-testid="resource-type">
          <ResourceTypeIcon type={r.resource_type} />{resourceTypeLabel(t, r.resource_type)}
        </span>
        <KyaHeading as="h2" size={26}><span style={{ color: K.forest }}>{r.title || t("flock.library.untitled", "Untitled")}</span></KyaHeading>
        {r.summary && <p className="m-0 text-[16.5px] leading-[1.5]" style={{ color: K.ink }}>{r.summary}</p>}
        {r.vet_reviewed && <div><VetBadge reviewer={r.vet_reviewer} on={r.vet_reviewed_on} /></div>}
        {(r.topics.length > 0 || r.species.length > 0) && (
          <div className="flex flex-wrap gap-1.5" data-testid="resource-tags" aria-label={t("flock.library.tags", "Tags")}>
            {r.topics.map((s) => <Tag key={s}>{subjectLabel(t, s)}</Tag>)}
            {r.species.map((s) => <Tag key={`sp-${s}`}>{s}</Tag>)}
          </div>
        )}
      </div>
      {(r.external_url || r.attachment_path) && (
        <div className="flex flex-col gap-2">
          {r.external_url && (
            <a href={r.external_url} target="_blank" rel="noopener noreferrer" data-testid="resource-link"
              className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full border-2 px-6 text-[16px] font-[700]"
              style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}>
              <ExternalLink className="size-5" aria-hidden="true" />{linkLabel}
            </a>
          )}
          {r.attachment_path && (pdf
            ? (
              <a href={pdf} target="_blank" rel="noopener noreferrer" data-testid="resource-pdf"
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full border-2 bg-white px-4 text-[15px] font-[700]"
                style={{ borderColor: K.forest, color: K.forest }}>
                <FileText className="size-5" aria-hidden="true" />{t("flock.library.pdf", "Open the PDF")}
              </a>
            )
            : <p className="m-0 text-[14px]" style={{ color: K.quiet }}>{t("flock.library.pdfLoading", "Getting the PDF ready…")}</p>)}
        </div>
      )}
      {r.body.trim() && <ResourceBody body={r.body} tickKey={tickKey} />}
    </article>
  );
}
