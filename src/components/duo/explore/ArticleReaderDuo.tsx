// The in-app reader on the iPhone Duo: one article laid out like an open
// magazine across both panes.
//
// The article is ONE flow in CSS columns. Each column is exactly as wide as
// the narrower pane's text area and centered in its own pane, so a line can
// never run across the fold: the left pane holds the odd columns, the right
// pane the even ones, and a "page" is the pair on screen. Turning the page
// slides the flow by two columns. The first column starts with the photo, the
// eyebrow and the title; the last ends with "Read on thekyaproject.com".
//
// Only posts whose feed item carries content_html get here (ExploreDuo links
// the rest to the website). The body is cleaned in the browser before it is
// shown (lib/articleHtml.ts). A post without a body (or one that's gone)
// returns to Explore rather than showing an empty reader.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { K, SERIF } from "@/components/kya";
import { DUO } from "@/components/duo/DuoBlocks";
import { RailBack } from "@/components/DuoRail";
import { getBlogArticle } from "@/lib/blogFeed.functions";
import { sanitizeArticleHtml } from "@/lib/articleHtml";
import { BIRD_PHOTO_FOCUS } from "@/lib/birdPhotoFocus";
import { PostImage, postMeta } from "./ExploreDuo";

/** Space between a column and its pane's edges (both sides of the fold). */
const PAD = 36;
/** The page bar under the columns. */
const BAR = 84;

type Geo = { left: number; top: number; colW: number; gap: number; height: number; leftPane: { x: number; w: number }; rightPane: { x: number; w: number } };

export function ArticleReaderDuo({ id }: { id: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fn = useServerFn(getBlogArticle);
  const { data, isLoading } = useQuery({
    queryKey: ["explore-duo-article", id],
    queryFn: () => fn({ data: { id } }),
    staleTime: 10 * 60_000,
  });
  const back = useCallback(() => navigate({ to: "/explore", search: {} }), [navigate]);

  // No body (or no such post): back to Explore, which links it to the website.
  useEffect(() => {
    if (!isLoading && !data) navigate({ to: "/explore", search: {}, replace: true });
  }, [isLoading, data, navigate]);

  const html = useMemo(() => (data ? sanitizeArticleHtml(data.html, data.post.url ?? undefined) : ""), [data]);
  useEffect(() => {
    if (data && !html) navigate({ to: "/explore", search: {}, replace: true });
  }, [data, html, navigate]);

  const splitRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLElement>(null);
  const rightRef = useRef<HTMLElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState<Geo | null>(null);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(0);

  // Where the panes are: the columns are placed from their real edges.
  useLayoutEffect(() => {
    const split = splitRef.current, l = leftRef.current, r = rightRef.current;
    if (!split || !l || !r) return;
    const measure = () => {
      const s = split.getBoundingClientRect(), a = l.getBoundingClientRect(), b = r.getBoundingClientRect();
      const colW = Math.floor(Math.min(a.width, b.width) - 2 * PAD);
      const cL = a.left - s.left + a.width / 2, cR = b.left - s.left + b.width / 2;
      const top = Math.max(PAD, parseFloat(getComputedStyle(split).getPropertyValue("--reader-top")) || PAD);
      setGeo({
        left: Math.round(cL - colW / 2),
        top,
        colW,
        gap: Math.round(cR - cL - colW),
        height: Math.floor(s.height - top - BAR),
        leftPane: { x: a.left - s.left, w: a.width },
        rightPane: { x: b.left - s.left, w: b.width },
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(split);
    return () => ro.disconnect();
  }, [data]);

  // How many pages the flow makes: recounted as images and fonts arrive.
  const count = useCallback(() => {
    const el = flowRef.current;
    if (!el || !geo) return;
    const step = geo.colW + geo.gap;
    const cols = Math.max(1, Math.round((el.scrollWidth + geo.gap) / step));
    const n = Math.max(1, Math.ceil(cols / 2));
    setPages(n);
    setPage((p) => Math.min(p, n - 1));
  }, [geo]);
  useLayoutEffect(() => {
    count();
    const el = flowRef.current;
    if (!el) return;
    const imgs = [...el.querySelectorAll("img")];
    imgs.forEach((img) => img.addEventListener("load", count));
    void document.fonts?.ready.then(count);
    const late = window.setTimeout(count, 400);
    return () => {
      imgs.forEach((img) => img.removeEventListener("load", count));
      window.clearTimeout(late);
    };
  }, [count, html]);

  const go = useCallback((d: number) => setPage((p) => Math.min(Math.max(p + d, 0), pages - 1)), [pages]);

  // Arrow keys turn the page too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  // Swipe: a mostly-sideways drag of 50px or more turns the page.
  const startX = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => { startX.current = { x: e.clientX, y: e.clientY }; };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = startX.current;
    startX.current = null;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  };

  const post = data?.post;
  const meta = post ? postMeta(t, post, true) : "";
  const shift = geo ? page * 2 * (geo.colW + geo.gap) : 0;

  return (
    <div ref={splitRef} className="duo-split duo-reader relative" style={{ background: "#fff" }} data-duo-reader="">
      <RailBack onBack={back} />
      <section ref={leftRef} className="duo-pane" data-duo-pane="left" aria-hidden="true" style={{ overflow: "hidden" }} />
      <section ref={rightRef} className="duo-pane" data-duo-pane="right" aria-hidden="true" style={{ overflow: "hidden", boxShadow: "inset 14px 0 18px -16px rgba(26,61,46,0.28)" }} />

      {/* The article: one flow in columns, clipped to the two panes. */}
      <div className="absolute inset-0 overflow-hidden" onPointerDown={onPointerDown} onPointerUp={onPointerUp} style={{ touchAction: "pan-y" }}>
        {geo && post && html && (
          <article
            ref={flowRef}
            className="duo-reader-flow"
            aria-label={post.title}
            style={{
              position: "absolute",
              left: geo.left,
              top: geo.top,
              height: geo.height,
              width: 2 * geo.colW + geo.gap,
              columnWidth: geo.colW,
              columnGap: geo.gap,
              columnCount: 2,
              columnFill: "auto",
              transform: `translateX(${-shift}px)`,
              transition: "transform 260ms ease",
              ["--reader-img-max" as string]: `${Math.round(geo.height * 0.45)}px`,
            }}
          >
            <div className="duo-reader-hero" style={{ height: Math.round(geo.height * 0.42) }}>
              <PostImage post={post} width={900} className="size-full rounded-[22px]" />
            </div>
            {meta && <p className="duo-reader-eyebrow">{meta}</p>}
            <h1 className="duo-reader-title" style={{ fontFamily: SERIF }}>{post.title}</h1>
            <div className="duo-reader-body" dangerouslySetInnerHTML={{ __html: html }} />
            {post.url && (
              <p className="duo-reader-end">
                <a href={post.url} target="_blank" rel="noopener noreferrer">
                  {t("exploreDuo.readOnSite", "Read on thekyaproject.com")} <ArrowUpRight className="inline size-4 align-[-2px]" aria-hidden="true" />
                </a>
              </p>
            )}
          </article>
        )}
        {isLoading && (
          <div className="absolute left-0 top-0 p-9" aria-hidden="true">
            <div className="h-[260px] w-[360px] animate-pulse rounded-[22px] bg-[#e3ebe2]" />
          </div>
        )}
      </div>

      {/* Page bar: the count bottom left, Next page bottom right. */}
      {geo && post && html && (
        <>
          <div className="absolute flex items-center gap-3" style={{ left: geo.left, bottom: 22, height: 48 }}>
            {page > 0 && (
              <button type="button" onClick={() => go(-1)} aria-label={t("exploreDuo.previousPage", "Previous page")} className="grid size-11 place-items-center rounded-full border-2 bg-white active:scale-95" style={{ borderColor: DUO.forest, color: DUO.forest }}>
                <ChevronLeft className="size-5" aria-hidden="true" />
              </button>
            )}
            <span className="text-[15px] font-[700]" style={{ color: DUO.quiet }} aria-live="polite" data-reader-page="">
              {t("exploreDuo.pageOf", "Page {{page}} of {{total}}", { page: page + 1, total: pages })}
            </span>
          </div>
          {page < pages - 1 && (
            <button
              type="button"
              onClick={() => go(1)}
              className="absolute inline-flex min-h-[48px] items-center gap-1 whitespace-nowrap rounded-full px-6 text-[16px] font-[700] text-white active:scale-[0.98]"
              style={{ left: geo.left + 2 * geo.colW + geo.gap, transform: "translateX(-100%)", bottom: 22, background: DUO.forest }}
            >
              {t("exploreDuo.nextPage", "Next page")} <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          )}
        </>
      )}
      <style>{READER_CSS}</style>
    </div>
  );
}

/** Body type for the flow. Images never exceed ~45% of a column, keep the
 *  head of a photo (50% 25%) and never split across columns. */
const READER_CSS = `
.duo-reader-flow { color: ${K.ink}; font-size: 18px; line-height: 1.6; overflow-wrap: anywhere; }
.duo-reader-hero { break-inside: avoid; margin: 0 0 18px; }
.duo-reader-eyebrow { margin: 0; font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${DUO.quiet}; }
.duo-reader-title { margin: 6px 0 16px; font-size: 30px; font-weight: 600; line-height: 1.15; color: ${DUO.forest}; text-wrap: balance; break-after: avoid; }
.duo-reader-body > :first-child { margin-top: 0; }
.duo-reader-body p { margin: 0 0 14px; }
.duo-reader-body h2, .duo-reader-body h3, .duo-reader-body h4 { font-family: ${SERIF}; color: ${DUO.forest}; line-height: 1.2; margin: 20px 0 8px; break-after: avoid; break-inside: avoid; }
.duo-reader-body h2 { font-size: 24px; } .duo-reader-body h3 { font-size: 21px; } .duo-reader-body h4 { font-size: 18px; }
.duo-reader-body ul, .duo-reader-body ol { margin: 0 0 14px; padding-left: 22px; }
.duo-reader-body ul { list-style: disc; } .duo-reader-body ol { list-style: decimal; }
.duo-reader-body li::marker { color: #2d6a4f; }
.duo-reader-body li { margin: 0 0 6px; }
.duo-reader-body blockquote { break-inside: avoid; margin: 0 0 14px; padding: 4px 0 4px 16px; border-left: 3px solid #cfe9b7; font-family: ${SERIF}; font-size: 20px; color: ${DUO.forest}; }
.duo-reader-body a { color: #2d6a4f; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
.duo-reader-body img { display: block; width: 100%; max-height: var(--reader-img-max); object-fit: cover; object-position: ${BIRD_PHOTO_FOCUS}; border-radius: 18px; margin: 4px 0 14px; break-inside: avoid; }
.duo-reader-body figure { margin: 0 0 14px; break-inside: avoid; }
.duo-reader-body figure img { margin-bottom: 6px; }
.duo-reader-body figcaption { font-size: 14px; color: ${DUO.quiet}; line-height: 1.4; }
.duo-reader-body hr { border: 0; border-top: 1px solid ${DUO.line}; margin: 18px 0; }
.duo-reader-body table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 15px; line-height: 1.4; margin: 0 0 14px; break-inside: avoid; }
.duo-reader-body th, .duo-reader-body td { border-bottom: 1px solid ${DUO.line}; padding: 6px 6px 6px 0; text-align: left; vertical-align: top; }
.duo-reader-body th { color: ${DUO.forest}; }
.duo-reader-end { margin: 18px 0 0; font-size: 16px; break-inside: avoid; }
.duo-reader-end a { display: inline-flex; min-height: 48px; align-items: center; gap: 4px; color: #2d6a4f; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
`;
