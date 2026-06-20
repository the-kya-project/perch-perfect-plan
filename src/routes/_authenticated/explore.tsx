import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowRight, ArrowUpRight, Headphones, Compass } from "lucide-react";
import { OwnerHeaderIcons } from "@/components/OwnerHeader";
import { OwnerTabBar } from "@/components/OwnerTabBar";
import { getBlogPosts, type BlogPost } from "@/lib/webflow.functions";

// The Kya Project marketing links.
const MISSION_URL = "https://www.thekyaproject.com/about";
const BLOG_URL = "https://www.thekyaproject.com/blog";

export const Route = createFileRoute("/_authenticated/explore")({
  head: () => ({ meta: [{ title: "Explore — The Kya Project" }] }),
  component: Explore,
});

function Explore() {
  const blogFn = useServerFn(getBlogPosts);
  const { data: blog, isLoading: blogLoading } = useQuery({
    queryKey: ["explore-blog"],
    queryFn: () => blogFn(),
    staleTime: 10 * 60_000,
  });

  return (
    <div className="min-h-screen bg-[#f4f1e8] pb-24">
      {/* Mission band — full-bleed dark green, leads the page and carries the
          header icons (bell + gear) top-right. */}
      <section className="bg-[#1a3d2e] pt-[max(env(safe-area-inset-top),1rem)]">
        <div className="mx-auto max-w-md px-5 pb-9 pt-3">
          <div className="flex justify-end">
            <OwnerHeaderIcons />
          </div>
          <p className="mt-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[#9FE1CB]">The Kya Project</p>
          <h1 className="mt-2 text-[30px] font-medium leading-[1.1] text-white">Better care, wilder futures.</h1>
          <p className="mt-3 text-sm leading-relaxed text-white/80">
            We help parrots thrive, at home and in the wild, through education, community, and support for rescue and conservation.
          </p>
          <a
            href={MISSION_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-[#cdeab0]"
          >
            Our mission <ArrowRight className="size-4" />
          </a>
        </div>
      </section>

      <main className="mx-auto max-w-md space-y-8 px-5 pt-7">
        {/* Community waitlist — the single lime accent moment. */}
        <section className="rounded-[22px] bg-[#cdeab0] p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#3f5e22]">Coming soon</p>
          <h2 className="mt-1.5 text-xl font-medium text-[#1f3d12]">Join the community</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#3f5e22]">
            A place for parrot people. Experience expert AMAs, local chapters, and a community that gives back to rescue.
          </p>
          <button
            type="button"
            onClick={() => toast.success("We'll let you know the moment the waitlist opens.")}
            className="mt-4 w-full rounded-[14px] bg-[#1a3d2e] py-3 text-sm font-medium text-white active:scale-[0.99]"
          >
            Join the waitlist
          </button>
        </section>

        {/* Latest from the blog — live pull from Webflow. */}
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="text-[21px] font-medium text-[#1a3d2e]">Latest from the blog</h2>
            <a href={BLOG_URL} target="_blank" rel="noreferrer" className="text-sm font-medium text-[#2d6a4f]">
              View all
            </a>
          </div>
          <BlogSection loading={blogLoading} connected={blog?.connected ?? false} posts={blog?.posts ?? []} />
        </section>

        {/* Podcast — dormant, built to activate without redesign. */}
        <section className="rounded-[22px] bg-[#efe9da] p-5">
          <div className="flex items-start gap-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#1a3d2e]">
              <Headphones className="size-5 text-[#cdeab0]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-base font-medium text-[#1a3d2e]">The Kya Project Podcast</h3>
                <span className="shrink-0 rounded-full bg-[#e3dcc9] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#5f5e5a]">Soon</span>
              </div>
              <p className="mt-1 text-sm text-[#5f5e5a]">Conversations on parrots, rescue, and the wild.</p>
            </div>
          </div>
        </section>

        {/* Membership preview — dark green, preview only (no purchase). */}
        <section className="rounded-[22px] bg-[#1a3d2e] p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#9FE1CB]">Membership</p>
          <h2 className="mt-1.5 text-xl font-medium text-white">Support the mission and get more</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/80">
            When the community launches, members get AMAs, chapter access, and 20% of every membership funds rescue and conservation.
          </p>
        </section>
      </main>

      <OwnerTabBar active="explore" />
    </div>
  );
}

function BlogSection({ loading, connected, posts }: { loading: boolean; connected: boolean; posts: BlogPost[] }) {
  if (loading) {
    return (
      <div className="space-y-4">
        {[0, 1].map((i) => (
          <div key={i} className="overflow-hidden rounded-[20px] bg-[#efe9da]">
            <div className="aspect-[16/9] w-full animate-pulse bg-[#e3dcc9]" />
            <div className="space-y-2 p-4">
              <div className="h-3 w-1/4 animate-pulse rounded bg-[#e3dcc9]" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-[#e3dcc9]" />
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
      <div className="rounded-[20px] border border-dashed border-[#d8cfb8] bg-[#efe9da] p-8 text-center">
        <Compass className="mx-auto size-7 text-[#2d6a4f]" />
        <p className="mt-3 font-medium text-[#1a3d2e]">{connected ? "No posts yet" : "Stories are on the way"}</p>
        <p className="mt-1 text-sm text-[#5f5e5a]">
          {connected
            ? "New writing from The Kya Project will appear here."
            : "We're lining up guides and stories on parrot care, rescue, and the wild."}
        </p>
      </div>
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
  const inner = (
    <>
      {post.image ? (
        <div className="aspect-[16/9] w-full overflow-hidden bg-[#e3dcc9]">
          <img src={post.image} alt={post.title} loading="lazy" className="size-full object-cover" />
        </div>
      ) : (
        <div className="grid aspect-[16/9] w-full place-items-center bg-[#e3dcc9]">
          <Compass className="size-7 text-[#2d6a4f]/60" />
        </div>
      )}
      <div className="p-4">
        {post.category && (
          <p className="text-[11px] font-medium uppercase tracking-wider text-[#2d6a4f]">{post.category}</p>
        )}
        <h3 className="mt-1 text-base font-medium leading-snug text-[#1a3d2e]">{post.title}</h3>
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[#5f5e5a]">
          {post.meta && <span>{post.meta}</span>}
          {post.url && <ArrowUpRight className="size-3.5" />}
        </div>
      </div>
    </>
  );

  const cls = "block overflow-hidden rounded-[20px] bg-[#efe9da] shadow-sm";
  return post.url ? (
    <a href={post.url} target="_blank" rel="noreferrer" className={`${cls} active:scale-[0.99]`}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
