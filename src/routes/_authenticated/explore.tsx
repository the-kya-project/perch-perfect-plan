import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, ArrowUpRight, Headphones, Compass } from "lucide-react";
import { K, KyaPage, KyaBody, KyaCard, KyaHeading, KyaIconTile } from "@/components/kya";
import { TabHeader } from "@/components/headers";
import { WaitlistCard } from "@/components/WaitlistCard";
import { getBlogPosts, type BlogPost } from "@/lib/blogFeed.functions";
import { useTranslation } from "react-i18next";
import i18next from "i18next";

// The Kya Project marketing links.
const MISSION_URL = "https://www.thekyaproject.com/about";
const BLOG_URL = "https://www.thekyaproject.com/blog";

export const Route = createFileRoute("/_authenticated/explore")({
  head: () => ({ meta: [{ title: i18next.t("explore.pageTitle", "Explore — The Kya Project") }] }),
  component: Explore,
});

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
          <KyaCard className="p-5">
            <div className="flex items-start gap-3">
              <KyaIconTile size={44}><Headphones className="size-5" /></KyaIconTile>
              <div className="min-w-0 flex-1">
                <span className="inline-flex rounded-full px-2.5 py-1 text-[12px] font-[700]" style={{ background: K.mist, color: K.forest }}>{t("explore.comingSoonTag", "Coming soon")}</span>
                <KyaHeading size={20} as="h3" className="mt-2">{t("explore.podcastTitle", "The Kya Project Podcast")}</KyaHeading>
                <p className="m-0 mt-1 text-[15px] leading-[1.45]" style={{ color: K.quiet }}>{t("explore.podcastBody", "Conversations on parrots, rescue, and the wild.")}</p>
              </div>
            </div>
          </KyaCard>

          {/* Membership preview (no purchase yet). */}
          <KyaCard className="p-5">
            <KyaHeading size={21}>{t("explore.membershipHeadline", "Support the mission and get more")}</KyaHeading>
            <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.quiet }}>
              {t("explore.membershipBody", "When the community launches, members get AMAs, chapter access, and 20% of every membership funds rescue and conservation.")}
            </p>
          </KyaCard>
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

// The feed links the full-size original image, which is far bigger than the
// ~450px card needs. Route it through the weserv image proxy to serve a
// card-sized WebP; the <img> onError falls back to the original if the proxy is
// ever unavailable, so blog images always load.
/** "HUSBANDRY" / "husbandry" → "Husbandry". */
function sentenceCase(s: string): string {
  const v = s.trim().toLowerCase();
  return v.charAt(0).toUpperCase() + v.slice(1);
}

function sizedImage(url: string, width = 820): string {
  return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=${width}&q=72&output=webp&we`;
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
