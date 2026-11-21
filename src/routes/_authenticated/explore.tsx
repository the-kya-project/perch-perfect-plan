import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, ArrowUpRight, Compass } from "lucide-react";
import { K, KyaPage, KyaBody, KyaCard, KyaHeading, KyaIconTile } from "@/components/kya";
import { TabHeader } from "@/components/headers";
import { WaitlistCard } from "@/components/WaitlistCard";
import { MISSION_URL, MembershipCard, PodcastCard } from "@/components/explore/ExploreCards";
import { getBlogPosts, type BlogPost } from "@/lib/blogFeed.functions";
import { useTranslation } from "react-i18next";
import i18next from "i18next";
import { sentenceCase, sizedImage } from "@/lib/blogImage";
import { z } from "zod";
import { useDuoMode } from "@/lib/duo";
import { ExploreDuo } from "@/components/duo/explore/ExploreDuo";
import { ArticleReaderDuo } from "@/components/duo/explore/ArticleReaderDuo";

// The Kya Project marketing links.
const BLOG_URL = "https://www.thekyaproject.com/blog";

export const Route = createFileRoute("/_authenticated/explore")({
  head: () => ({ meta: [{ title: i18next.t("explore.pageTitle", "Explore — The Kya Project") }] }),
  // iPhone Duo only: ?read=<post id> opens the in-app reader, ?all=1 lists
  // every article. Today's layout ignores both.
  validateSearch: z.object({
    read: z.string().max(2000).optional().catch(undefined),
    all: z.coerce.number().optional().catch(undefined),
  }),
  component: ExploreRoute,
});

function ExploreRoute() {
  const duo = useDuoMode() === "sideways";
  const { read, all } = Route.useSearch();
  if (duo) return read ? <ArticleReaderDuo key={read} id={read} /> : <ExploreDuo all={!!all} />;
  return <Explore />;
}

function Explore() {
  const { t } = useTranslation();
  const blogFn = useServerFn(getBlogPosts);
  const { data: blog, isLoading: blogLoading } = useQuery({
    queryKey: ["explore-blog"],
    queryFn: () => blogFn(),
    staleTime: 10 * 60_000,
  });

  return (
    <KyaPage>
      <div className="mx-auto max-w-md">
        <TabHeader title={t("explore.missionTitle", "Better care, wilder futures")} line={t("explore.missionBody", "We help parrots thrive, at home and in the wild, through education, community, and support for rescue and conservation.")}>
          <a href={MISSION_URL} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 text-[15px] font-[700]" style={{ color: K.lime }}>
            {t("explore.ourMission", "Our mission")} <ArrowRight className="size-4" />
          </a>
        </TabHeader>

        <KyaBody className="gap-6">
          {/* Community waitlist */}
          <WaitlistCard />

          {/* Latest from the blog: the two newest posts, then the rest on the site. */}
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <KyaHeading size={23}>{t("explore.latestFromTheBlog", "Latest from the blog")}</KyaHeading>
              <a href={BLOG_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center text-[15px] font-[700]" style={{ color: K.moss }}>
                {t("explore.viewAll", "View all")}
              </a>
            </div>
            <BlogSection loading={blogLoading} connected={blog?.connected ?? false} posts={(blog?.posts ?? []).slice(0, 2)} />
            {blog?.connected && (blog?.posts?.length ?? 0) > 0 && (
              <a href={BLOG_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full border-2 bg-white text-[15px] font-[700] active:scale-[0.99]" style={{ borderColor: K.forest, color: K.forest }}>
                {t("explore.moreArticles", "More articles")}
              </a>
            )}
          </section>

          {/* Podcast: not live yet. */}
          <PodcastCard />

          {/* Membership preview (no purchase yet). */}
          <MembershipCard />
        </KyaBody>
      </div>
    </KyaPage>
  );
}

function BlogSection({ loading, connected, posts }: { loading: boolean; connected: boolean; posts: BlogPost[] }) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="space-y-4">
        {[0, 1].map((i) => (
          <div key={i} className="overflow-hidden rounded-[20px] bg-white">
            <div className="aspect-[16/9] w-full animate-pulse bg-[#e3ebe2]" />
            <div className="space-y-2 p-4">
              <div className="h-3 w-1/4 animate-pulse rounded bg-[#e3ebe2]" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-[#e3ebe2]" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Not wired yet, or wired but nothing to show — both render an intentional
  // calm state, never a broken-looking empty section.
  if (!connected || posts.length === 0) {
    return (
      <KyaCard className="px-5 py-6 text-center" style={{ color: K.forest }}>
        <div className="flex justify-center">
          <KyaIconTile size={48}><Compass className="size-6" /></KyaIconTile>
        </div>
        <KyaHeading size={21} as="h3" className="mt-3">{connected ? t("explore.noPostsYet", "No posts yet") : t("explore.storiesOnTheWay", "Stories are on the way")}</KyaHeading>
        <p className="m-0 mx-auto mt-1.5 max-w-[34ch] text-[15px] leading-[1.5]" style={{ color: K.quiet }}>
          {connected
            ? t("explore.newWritingWillAppear", "New writing from The Kya Project will appear here.")
            : t("explore.liningUpStories", "We're lining up guides and stories on parrot care, rescue, and the wild.")}
        </p>
      </KyaCard>
    );
  }

  return (
    <div className="space-y-4">
      {posts.map((p) => (
        <BlogCard key={p.id} post={p} />
      ))}
    </div>
  );
}

function BlogCard({ post }: { post: BlogPost }) {
  const img = post.image;
  const inner = (
    <>
      {img ? (
        <div className="aspect-[16/9] w-full overflow-hidden bg-[#e3ebe2]">
          <img
            src={sizedImage(img)}
            onError={(e) => { if (e.currentTarget.src !== img) e.currentTarget.src = img; }}
            alt={post.title}
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        </div>
      ) : (
        <div className="grid aspect-[16/9] w-full place-items-center bg-[#e3ebe2]">
          <Compass className="size-7 text-[#2d6a4f]/60" />
        </div>
      )}
      <div className="p-4">
        {post.category && (
          <span className="inline-flex rounded-full px-2.5 py-1 text-[12px] font-[700]" style={{ background: K.mist, color: K.forest }}>{sentenceCase(post.category)}</span>
        )}
        <h3 className="m-0 mt-2 text-[17px] font-[700] leading-snug" style={{ color: K.forest }}>{post.title}</h3>
        <div className="mt-1.5 flex items-center gap-1.5 text-[13px]" style={{ color: K.quiet }}>
          {post.meta && <span>{post.meta}</span>}
          {post.url && <ArrowUpRight className="size-3.5" />}
        </div>
      </div>
    </>
  );

  const cls = "block overflow-hidden rounded-[20px] bg-white";
  return post.url ? (
    <a href={post.url} target="_blank" rel="noreferrer" className={`${cls} active:scale-[0.99]`}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
