// Explore on the iPhone Duo (side column, two panes).
//
//   Left   the newest article as a cover story filling the pane.
//   Right  "Explore", the next three articles, then the community card, whose
//          button is the screen's one gold button. "See all" lists every
//          article in the right pane instead (?all=1).
//
// An article with a body in the feed (content_html) opens in the in-app reader
// (?read=<id>, ArticleReaderDuo); one without opens on the website, as today.
import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ArrowUpRight, ChevronRight, Compass } from "lucide-react";
import { SERIF } from "@/components/kya";
import { DUO, DuoTwoPane } from "@/components/duo/DuoBlocks";
import { RailBack } from "@/components/DuoRail";
import { WaitlistCard } from "@/components/WaitlistCard";
import { getExploreFeed, type ExplorePost } from "@/lib/blogFeed.functions";
import { sentenceCase, sizedPublicImage } from "@/lib/blogImage";
import { BIRD_PHOTO_FOCUS } from "@/lib/birdPhotoFocus";

export const EXPLORE_FEED_KEY = ["explore-duo-feed"] as const;

/** The Duo's view of the feed, cached for ten minutes like the phone's. */
export function useExploreFeed() {
  const fn = useServerFn(getExploreFeed);
  return useQuery({ queryKey: EXPLORE_FEED_KEY, queryFn: () => fn(), staleTime: 10 * 60_000 });
}

/** "Husbandry · 6 min" (either part may be missing). */
export function postMeta(t: TFunction, p: ExplorePost, read = false): string {
  const parts: string[] = [];
  if (p.category) parts.push(sentenceCase(p.category));
  if (p.readMinutes) parts.push(read ? t("exploreDuo.minRead", "{{n}} min read", { n: p.readMinutes }) : t("exploreDuo.min", "{{n}} min", { n: p.readMinutes }));
  return parts.join(" · ");
}

/** A post's link: the in-app reader when it has a body, else the website. */
function PostLink({ post, className, style, children, label }: { post: ExplorePost; className: string; style?: React.CSSProperties; children: ReactNode; label?: string }) {
  if (post.hasBody) {
    return <Link to="/explore" search={{ read: post.id }} className={className} style={style} aria-label={label} data-explore-post={post.id} data-opens="reader">{children}</Link>;
  }
  if (post.url) {
    return <a href={post.url} target="_blank" rel="noreferrer" className={className} style={style} aria-label={label} data-explore-post={post.id} data-opens="website">{children}</a>;
  }
  return <div className={className} style={style}>{children}</div>;
}

export function PostImage({ post, width, className }: { post: ExplorePost; width: number; className: string }) {
  const img = post.image;
  if (!img) {
    return <span className={`grid place-items-center ${className}`} style={{ background: "#2d6a4f" }}><Compass className="size-7 text-white/70" aria-hidden="true" /></span>;
  }
  return (
    <img
      src={sizedPublicImage(img, width)}
      onError={(e) => { if (e.currentTarget.src !== img) e.currentTarget.src = img; }}
      alt={post.imageAlt ?? ""}
      decoding="async"
      className={`object-cover ${className}`}
      style={{ objectPosition: BIRD_PHOTO_FOCUS }}
    />
  );
}

function CoverStory({ post }: { post: ExplorePost }) {
  const { t } = useTranslation();
  const meta = postMeta(t, post);
  return (
    <PostLink post={post} className="relative flex min-h-0 flex-1 flex-col justify-end overflow-hidden rounded-[28px] active:scale-[0.995]" style={{ background: DUO.forest }} label={post.title}>
      <PostImage post={post} width={1100} className="absolute inset-0 size-full" />
      <span aria-hidden="true" className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(14,33,25,0) 30%, rgba(14,33,25,0.55) 58%, rgba(14,33,25,0.92) 100%)" }} />
      <span className="relative flex flex-col gap-2 p-7 text-white">
        <span className="text-[13px] font-[700] uppercase tracking-[0.08em] text-white/85">
          {meta ? t("exploreDuo.featuredMeta", "Featured · {{meta}}", { meta }) : t("exploreDuo.featured", "Featured")}
        </span>
        <span className="text-[32px] font-[600] leading-[1.12] [text-wrap:balance]" style={{ fontFamily: SERIF }}>{post.title}</span>
        {post.summary && <span className="line-clamp-3 text-[16px] leading-[1.45] text-white/85">{post.summary}</span>}
        {!post.hasBody && post.url && (
          <span className="mt-1 inline-flex items-center gap-1 text-[14px] font-[700] text-white/85">
            {t("exploreDuo.onTheWebsite", "On thekyaproject.com")} <ArrowUpRight className="size-4" aria-hidden="true" />
          </span>
        )}
      </span>
    </PostLink>
  );
}

function PostRow({ post }: { post: ExplorePost }) {
  const { t } = useTranslation();
  const meta = postMeta(t, post);
  return (
    <li>
      <PostLink post={post} className="flex min-h-[80px] items-center gap-4 rounded-[20px] bg-white p-2.5 pr-4 active:scale-[0.99]">
        <PostImage post={post} width={160} className="size-16 shrink-0 rounded-[16px]" />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[16px] font-[700] leading-snug" style={{ color: DUO.forest }}>{post.title}</span>
          {meta && <span className="mt-0.5 block text-[14px]" style={{ color: DUO.quiet }}>{meta}</span>}
        </span>
        {post.hasBody
          ? <ChevronRight className="size-5 shrink-0" style={{ color: DUO.quiet }} aria-hidden="true" />
          : <ArrowUpRight className="size-5 shrink-0" style={{ color: DUO.quiet }} aria-hidden="true" />}
      </PostLink>
    </li>
  );
}

function Skeleton({ className }: { className: string }) {
  return <div className={`animate-pulse bg-[#e3ebe2] ${className}`} aria-hidden="true" />;
}

export function ExploreDuo({ all = false }: { all?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading } = useExploreFeed();
  const posts = data?.posts ?? [];
  const [cover, ...rest] = posts;

  const left = isLoading ? (
    <Skeleton className="min-h-0 flex-1 rounded-[28px]" />
  ) : cover ? (
    <CoverStory post={cover} />
  ) : (
    <div className="flex flex-1 flex-col items-center justify-center rounded-[28px] bg-white px-8 text-center">
      <Compass className="size-8" style={{ color: DUO.quiet }} aria-hidden="true" />
      <h2 className="m-0 mt-3 text-[26px] font-[600]" style={{ fontFamily: SERIF, color: DUO.forest }}>{t("explore.noPostsYet", "No posts yet")}</h2>
      <p className="m-0 mt-2 max-w-[34ch] text-[16px] leading-[1.5]" style={{ color: DUO.quiet }}>{t("explore.newWritingWillAppear", "New writing from The Kya Project will appear here.")}</p>
    </div>
  );

  const list = all ? posts : rest.slice(0, 3);
  const right = (
    <>
      {all && <RailBack onBack={() => navigate({ to: "/explore", search: {} })} />}
      <div className="flex items-end justify-between gap-3">
        <h1 className="m-0 text-[32px] font-[600] leading-tight" style={{ fontFamily: SERIF, color: DUO.forest }}>
          {all ? t("exploreDuo.allArticles", "All articles") : t("exploreDuo.title", "Explore")}
        </h1>
        {!all && posts.length > 1 && (
          <Link to="/explore" search={{ all: 1 }} className="inline-flex min-h-[44px] items-center gap-0.5 text-[16px] font-[700]" style={{ color: "#2d6a4f" }}>
            {t("exploreDuo.seeAll", "See all")} <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        )}
      </div>
      {isLoading ? (
        <div className="mt-5 flex flex-col gap-2.5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[84px] rounded-[20px]" />)}</div>
      ) : list.length > 0 ? (
        <ul className="m-0 mt-5 flex list-none flex-col gap-2.5 p-0" aria-label={all ? t("exploreDuo.allArticles", "All articles") : t("exploreDuo.moreArticles", "More articles")}>
          {list.map((p) => <PostRow key={p.id} post={p} />)}
        </ul>
      ) : null}
      {!all && <div className="mt-auto pt-6"><WaitlistCard duo /></div>}
    </>
  );

  return <DuoTwoPane left={left} right={right} leftLabel={t("exploreDuo.featured", "Featured")} rightLabel={t("exploreDuo.title", "Explore")} />;
}
