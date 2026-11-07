import { useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Camera, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { K, KyaHeading, KyaSheet } from "@/components/kya";
import { BirdThumb } from "@/components/flock/FlockPeople";
import { postSpaceLabel, VetNudgeCard } from "@/components/flock/PostParts";
import { AvatarError } from "@/lib/flockAvatar";
import { useMyProfile, useOwnBirdPhotoUrls, useOwnBirds, useRegions, useShownChoices, type OwnBird } from "@/lib/flockData";
import { createPost, discardPostPhotos, editPost, uploadPostPhoto, useInvalidatePosts, useVetSigns, type FlockPost } from "@/lib/flockPostData";
import { findVetSigns, MAX_BODY, MAX_PHOTOS, MAX_TITLE, POST_SPACES, rateLimitKind, type PostSpace, type RateKind } from "@/lib/flockPosts";
import { useFormInProgress } from "@/lib/formsInProgress";

export function rateMessage(t: TFunction, kind: RateKind): string {
  switch (kind) {
    case "posts": return t("flock.posts.rate.posts", "You've shared a lot this hour. Take a breather and post again a little later.");
    case "comments": return t("flock.posts.rate.comments", "You've commented a lot this hour. Try again a little later.");
    case "photos": return t("flock.posts.rate.photos", "That's the most photos for this hour. Post without them, or try again a little later.");
  }
}

type Photo = { key: string; preview: string; path: string | null; failed?: boolean };

/** Write a new post (Batch 3, screen 1), or edit your own (title and text). */
export function PostComposer({ initialSpace, editing, onDone }: {
  initialSpace?: PostSpace;
  editing?: FlockPost;
  onDone: (result: { space: PostSpace; postId: string }) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const invalidate = useInvalidatePosts();
  const { data: me } = useMyProfile();
  const { data: ownBirds } = useOwnBirds();
  const { data: shownChoices } = useShownChoices();
  const { data: signs } = useVetSigns();
  const shownBirds = (ownBirds ?? []).filter((b) => shownChoices?.get(b.id));
  const { data: birdPhotos } = useOwnBirdPhotoUrls(shownBirds, 120);
  const hasChapter = !!me?.region_slug && me.region_slug !== "other";
  const chapterName = useChapterName(me?.region_slug);
  const spaces = POST_SPACES.filter((s) => s !== "chapter" || hasChapter);

  const [space, setSpace] = useState<PostSpace>(editing?.space ?? (initialSpace && spaces.includes(initialSpace) ? initialSpace : "learn"));
  const [title, setTitle] = useState(editing?.title ?? "");
  const [body, setBody] = useState(editing?.body ?? "");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [bird, setBird] = useState<OwnBird | null>(null);
  const [pickingBird, setPickingBird] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = !!(body.trim() || title.trim() || photos.length);
  useFormInProgress(dirty && !busy);

  const uploading = photos.some((p) => !p.path && !p.failed);
  const canPost = body.trim().length > 0 && !busy && !uploading;

  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    const list = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > room) setError(t("flock.posts.photoMax", "Up to four photos in a post."));
    for (const f of list) {
      const key = crypto.randomUUID();
      setPhotos((ps) => [...ps, { key, preview: URL.createObjectURL(f), path: null }]);
      try {
        const path = await uploadPostPhoto(f);
        setPhotos((ps) => ps.map((p) => (p.key === key ? { ...p, path } : p)));
      } catch (e) {
        setPhotos((ps) => ps.filter((p) => p.key !== key));
        setError(e instanceof AvatarError ? e.message : t("flock.posts.photoError", "We couldn't add that photo. Try again."));
      }
    }
  };

  const removePhoto = (key: string) => {
    const p = photos.find((x) => x.key === key);
    setPhotos((ps) => ps.filter((x) => x.key !== key));
    if (p?.path) void discardPostPhotos([p.path]);
  };

  const submit = async (vetNudged: boolean) => {
    setError(null);
    if (!vetNudged && findVetSigns(`${title}\n${body}`, signs ?? []).length > 0) { setNudge(true); return; }
    setBusy(true);
    try {
      if (editing) {
        await editPost(editing.post_id, title, body);
        await invalidate();
        onDone({ space: editing.space, postId: editing.post_id });
      } else {
        const r = await createPost({ space, title, body, photoPaths: photos.flatMap((p) => (p.path ? [p.path] : [])), birdId: bird?.id ?? null, vetNudged });
        await invalidate();
        onDone({ space, postId: r.post_id });
      }
    } catch (e) {
      const k = rateLimitKind(e);
      setError(k ? rateMessage(t, k) : t("flock.posts.saveError", "We couldn't post that. Check your connection and try again."));
      setBusy(false);
    }
  };

  const cancel = () => {
    void discardPostPhotos(photos.flatMap((p) => (p.path ? [p.path] : [])));
    if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
    else void router.navigate({ to: "/flock" });
  };

  return (
    <div className="flex min-h-screen flex-col" style={{ background: "#fff", color: K.forest }} data-testid="composer">
      <header className="sticky top-0 z-10 flex items-center gap-2 px-2 pb-2 pt-[max(10px,env(safe-area-inset-top))] text-white" style={{ background: K.forest }}>
        <button type="button" onClick={cancel} className="min-h-[44px] px-3 text-[15px] font-[700]" data-testid="composer-cancel">{t("flock.posts.cancel", "Cancel")}</button>
        <KyaHeading as="h1" size={19} className="flex-1 text-center text-white">{editing ? t("flock.posts.editTitle", "Edit post") : t("flock.posts.newTitle", "New post")}</KyaHeading>
        <button type="button" onClick={() => void submit(false)} disabled={!canPost} data-testid="composer-post"
          className="min-h-[40px] rounded-full px-4 text-[15px] font-[700] disabled:opacity-50" style={{ background: K.lime, color: K.forest }}>
          {busy ? t("flock.posts.posting", "Posting…") : editing ? t("flock.posts.save", "Save") : space === "good" ? t("flock.posts.sendForReview", "Send for review") : t("flock.posts.post", "Post")}
        </button>
      </header>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 py-4">
        {!editing && (
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-[700]" style={{ color: K.quiet }} id="post-to">{t("flock.posts.postTo", "Post to")}</span>
            <div role="group" aria-labelledby="post-to" className="flex flex-wrap gap-2" data-testid="post-to">
              {spaces.map((s) => {
                const on = s === space;
                return (
                  <button key={s} type="button" aria-pressed={on} data-space={s} onClick={() => { setSpace(s); setNudge(false); }}
                    className="min-h-[40px] rounded-full px-3.5 text-[14px] font-[700]"
                    style={on ? { background: K.lime, border: `2px solid ${K.forest}` } : { background: "#fff", border: "1px solid #c9d3c8" }}>
                    {postSpaceLabel(t, s, chapterName)}
                  </button>
                );
              })}
            </div>
            {space === "good" && (
              <p className="m-0 text-[13.5px] leading-[1.45]" style={{ color: K.quiet }} data-testid="review-hint">
                {t("flock.posts.reviewHint", "We review Do good posts before they go live, usually within a day, so everything here is something members can trust.")}
              </p>
            )}
          </div>
        )}
        {editing && editing.space === "good" && editing.status === "live" && (
          <p className="m-0 text-[13.5px]" style={{ color: K.quiet }}>{t("flock.posts.editReviewHint", "Do good posts go back for a quick review after an edit.")}</p>
        )}
        <label className="sr-only" htmlFor="post-title">{t("flock.posts.titleLabel", "Title (optional)")}</label>
        <input id="post-title" value={title} maxLength={MAX_TITLE} onChange={(e) => setTitle(e.target.value)}
          placeholder={t("flock.posts.titleLabel", "Title (optional)")} data-testid="post-title"
          className="min-h-[48px] border-b text-[18px] font-[700] outline-none" style={{ borderColor: K.line, fontFamily: "'Newsreader', Georgia, serif" }} />
        <label className="sr-only" htmlFor="post-body">{t("flock.posts.bodyLabel", "Your post")}</label>
        <textarea id="post-body" value={body} maxLength={MAX_BODY} autoFocus onChange={(e) => { setBody(e.target.value); setNudge(false); }} rows={6}
          placeholder={t("flock.posts.bodyPlaceholder", "Ask a question, share what worked, or say hello.")} data-testid="post-body-input"
          className="min-h-[140px] resize-none text-[16px] leading-[1.5] outline-none" />
        {nudge && <VetNudgeCard busy={busy} onPostAnyway={() => void submit(true)} />}
        {!editing && (
          <>
            {photos.length > 0 && (
              <div className="grid grid-cols-4 gap-2" data-testid="composer-photos">
                {photos.map((p) => (
                  <div key={p.key} className="relative aspect-square overflow-hidden rounded-[12px]" style={{ background: K.mist }}>
                    <img src={p.preview} alt="" className="absolute inset-0 size-full object-cover" style={{ opacity: p.path ? 1 : 0.5 }} />
                    <button type="button" onClick={() => removePhoto(p.key)} aria-label={t("flock.posts.removePhoto", "Remove photo")}
                      className="absolute right-1 top-1 grid size-8 place-items-center rounded-full bg-black/60 text-white"><X className="size-4" aria-hidden="true" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" data-testid="photo-input"
                onChange={(e) => { void addPhotos(e.target.files); e.target.value = ""; }} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={photos.length >= MAX_PHOTOS}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-[14px] font-[700] disabled:opacity-50" style={{ borderColor: "#c9d3c8" }} data-testid="add-photos">
                <Camera className="size-4" aria-hidden="true" />{t("flock.posts.addPhotos", "Add photos")}
              </button>
            </div>
            {shownBirds.length > 0 && (
              <div className="flex items-center gap-3 rounded-[14px] p-3" style={{ background: K.mist }} data-testid="attach-bird">
                {bird ? (
                  <>
                    <BirdThumb name={bird.name} photo={birdPhotos[bird.id]} size={36} />
                    <span className="flex-1 text-[14px]">
                      <b>{bird.name}</b> · {t("flock.posts.birdNamePhoto", "name and photo only")}
                    </span>
                    <button type="button" onClick={() => setPickingBird(true)} className="min-h-[40px] text-[14px] font-[700]" style={{ color: K.moss }}>{t("flock.posts.change", "Change")}</button>
                  </>
                ) : (
                  <button type="button" onClick={() => setPickingBird(true)} className="min-h-[40px] flex-1 text-left text-[14px] font-[700]" style={{ color: K.forest }} data-testid="attach-bird-open">
                    {t("flock.posts.attachBird", "Attach a bird")}
                  </button>
                )}
              </div>
            )}
            <p className="m-0 text-[13px]" style={{ color: K.quiet }} data-testid="gps-note">{t("flock.posts.gpsNote", "Photos lose their location data when you post.")}</p>
          </>
        )}
        {error && <p role="alert" className="m-0 text-[15px]" style={{ color: K.red }} data-testid="composer-error">{error}</p>}
      </div>
      {pickingBird && (
        <KyaSheet onClose={() => setPickingBird(false)} closeLabel={t("flock.region.close", "Close")}
          title={<KyaHeading size={23}>{t("flock.posts.attachBird", "Attach a bird")}</KyaHeading>}>
          <p className="m-0 mb-3 text-[14px]" style={{ color: K.quiet }}>{t("flock.posts.attachLine", "Members see your bird's name and photo. Nothing from the care plan.")}</p>
          <div className="flex flex-col gap-2">
            {shownBirds.map((b) => (
              <button key={b.id} type="button" data-bird={b.id} onClick={() => { setBird(b); setPickingBird(false); }}
                className="flex min-h-[56px] items-center gap-3 rounded-[14px] px-3 text-left text-[16px] font-[700]" style={{ background: K.mist }}>
                <BirdThumb name={b.name} photo={birdPhotos[b.id]} size={40} />{b.name}
              </button>
            ))}
            {bird && (
              <button type="button" onClick={() => { setBird(null); setPickingBird(false); }} className="min-h-[48px] text-[15px] font-[700]" style={{ color: K.red }}>
                {t("flock.posts.noBird", "Don't attach a bird")}
              </button>
            )}
          </div>
        </KyaSheet>
      )}
    </div>
  );
}

function useChapterName(slug: string | null | undefined): string | null {
  const { data } = useRegions();
  return data?.find((r) => r.slug === slug)?.name ?? null;
}
