import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Camera, Plus, Share2, Check, X, Loader2 } from "lucide-react";
import { compressImageToDataUrl, dataUrlBytes, MAX_UPLOAD_BYTES } from "@/lib/imageUpload";
import { uploadJournalPhoto, signJournalPhotos } from "@/lib/journalPhoto";
import { shareMomentCard } from "@/lib/momentCard";

export const Route = createFileRoute("/_authenticated/birds/$birdId/moments")({
  head: () => ({ meta: [{ title: "Moments — Parrot Care Co-Pilot" }] }),
  component: MomentsFacet,
});

type AnchorKey = "gotcha_day" | "hatch_day";
type AnchorPhoto = { anchor: string; year: number; photo_path: string };
type Custom = { id: string; title: string | null; on_date: string | null; photo_path: string | null };
type Anchor = { key: AnchorKey; label: string; baseISO: string };

// ---- date helpers ----
const todayMid = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12); };
function nextOccurrence(baseISO: string) {
  const base = new Date(`${baseISO}T12:00:00`);
  const t = todayMid();
  let d = new Date(t.getFullYear(), base.getMonth(), base.getDate(), 12);
  if (d < t) d = new Date(t.getFullYear() + 1, base.getMonth(), base.getDate(), 12);
  return { date: d, years: d.getFullYear() - base.getFullYear() };
}
const daysUntil = (d: Date) => Math.round((+d - +todayMid()) / 86_400_000);
function relDay(d: Date) {
  const n = daysUntil(d);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n < 7) return `on ${d.toLocaleDateString(undefined, { weekday: "long" })}`;
  return `on ${d.toLocaleDateString(undefined, { month: "long", day: "numeric" })}`;
}
const fmtDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const monthDay = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function MomentsFacet() {
  const { birdId } = Route.useParams();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: bird } = useQuery({
    queryKey: ["bird-moments-id", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("birds").select("name, birth_date, acquired_on").eq("id", birdId).maybeSingle();
      return data as { name: string; birth_date: string | null; acquired_on: string | null } | null;
    },
  });

  const { data: anchorPhotos = [] } = useQuery({
    queryKey: ["anchor-photos", birdId],
    refetchOnWindowFocus: true,
    queryFn: async () => {
      // Cast: anchor_photos + moments.photo_path land in the generated types only
      // after the migration is applied and types are regenerated.
      const { data, error } = await (supabase as any).from("anchor_photos").select("anchor, year, photo_path").eq("bird_id", birdId);
      if (error) return []; // table may not exist until the migration is applied
      return (data ?? []) as AnchorPhoto[];
    },
  });

  const { data: customs = [] } = useQuery({
    queryKey: ["moments", birdId],
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("moments")
        .select("id, title, on_date, photo_path")
        .eq("bird_id", birdId).eq("auto_generated", false)
        .order("on_date", { ascending: false });
      if (error) return [];
      return (data ?? []) as Custom[];
    },
  });

  // Sign every photo path in one batch.
  const allPaths = [...anchorPhotos.map((a) => a.photo_path), ...customs.map((c) => c.photo_path).filter(Boolean) as string[]];
  const { data: urls = {} } = useQuery({
    queryKey: ["moment-photo-urls", birdId, allPaths.slice().sort().join(",")],
    enabled: allPaths.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async () => Object.fromEntries(await signJournalPhotos(allPaths)),
  });
  const urlFor = (p: string | null | undefined) => (p ? (urls as Record<string, string>)[p] ?? null : null);

  const name = bird?.name ?? "This bird";
  const photoByYear = new Map(anchorPhotos.map((a) => [`${a.anchor}:${a.year}`, a.photo_path]));

  // Derived anchors (only when the identity date exists).
  const anchors: Anchor[] = [];
  if (bird?.acquired_on) anchors.push({ key: "gotcha_day", label: "Gotcha-day", baseISO: bird.acquired_on });
  if (bird?.birth_date) anchors.push({ key: "hatch_day", label: "Hatch-day", baseISO: bird.birth_date });

  const anchorTitle = (a: Anchor, years: number) =>
    a.key === "gotcha_day" ? `${years} year${years === 1 ? "" : "s"} together` : `${name} turns ${years}`;

  // Featured keepsake = soonest upcoming anchor.
  const featured = anchors
    .map((a) => ({ a, occ: nextOccurrence(a.baseISO) }))
    .sort((x, y) => +x.occ.date - +y.occ.date)[0];
  const featuredPhoto = featured
    ? urlFor(photoByYear.get(`${featured.a.key}:${featured.occ.date.getFullYear()}`) ?? [...anchorPhotos].filter((p) => p.anchor === featured.a.key).sort((m, n) => n.year - m.year)[0]?.photo_path)
    : null;

  // Nudge = an anchor within ~7 days.
  const nudge = anchors
    .map((a) => ({ a, occ: nextOccurrence(a.baseISO) }))
    .filter((x) => daysUntil(x.occ.date) <= 7 && daysUntil(x.occ.date) >= 0)
    .sort((x, y) => +x.occ.date - +y.occ.date)[0];

  async function addAnchorPhoto(anchor: AnchorKey, year: number, file: File) {
    setBusy(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      if (dataUrlBytes(dataUrl) > MAX_UPLOAD_BYTES) { toast.error("That photo's a bit too large even after resizing. Try a different one."); return; }
      const path = await uploadJournalPhoto(birdId, dataUrl);
      const { error } = await (supabase as any).from("anchor_photos").upsert({ bird_id: birdId, anchor, year, photo_path: path }, { onConflict: "bird_id,anchor,year" });
      if (error) throw error;
      toast.success("Photo saved.");
      qc.invalidateQueries({ queryKey: ["anchor-photos", birdId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't save the photo.");
    } finally {
      setBusy(false);
    }
  }

  async function share(opts: { photoUrl?: string | null; title: string; context: string }) {
    try {
      const r = await shareMomentCard(opts);
      if (r === "saved") toast.success("Saved a card to your photos.");
    } catch (e: any) {
      if (e?.name !== "AbortError") toast.error("Couldn't create the share card.");
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f1e8] pb-24">
      <header className="sticky top-0 z-10 border-b border-[#e3ded0] bg-[#f4f1e8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3 px-5 py-3">
          <Link to="/birds/$birdId" params={{ birdId }} aria-label="Back to bird record" className="-ml-1 rounded p-1 text-[#1a3d2e]">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-base font-medium text-[#1a3d2e]">Moments</h1>
          {busy && <Loader2 className="ml-auto size-4 animate-spin text-[#5f5e5a]" />}
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-5 px-5 py-5">
        {/* Upcoming nudge — only within ~7 days */}
        {nudge && (
          <section className="flex items-center gap-3 rounded-[16px] bg-[#efe9da] p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#f6e7c4] text-[#854F0B]"><Camera className="size-5" /></span>
            <p className="min-w-0 flex-1 text-sm text-[#1a3d2e]">
              {anchorTitle(nudge.a, nudge.occ.years)} {relDay(nudge.occ.date)} — mark it with a photo.
            </p>
            <label className="inline-flex min-h-[44px] shrink-0 cursor-pointer items-center gap-1.5 rounded-[14px] bg-[#cdeab0] px-4 text-sm font-medium text-[#1a3d2e]">
              <Plus className="size-4" /> Add
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) addAnchorPhoto(nudge.a.key, nudge.occ.date.getFullYear(), f); }} />
            </label>
          </section>
        )}

        {/* Featured keepsake card */}
        {featured && (
          <section>
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[18px]">
              {featuredPhoto ? (
                <img src={featuredPhoto} alt="" className="absolute inset-0 size-full object-cover" />
              ) : (
                <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#7fa890,#cdeab0)" }} />
              )}
              <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(26,61,46,.92) 0%, rgba(26,61,46,0) 48%)" }} />
              <span className="absolute right-4 top-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/90">The Kya Project</span>
              <div className="absolute inset-x-0 bottom-0 p-5">
                <p className="text-xl font-medium leading-tight text-white">{anchorTitle(featured.a, featured.occ.years)}</p>
                <p className="mt-1 text-sm text-white/85">{name} · {monthDay(featured.a.baseISO)}</p>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 px-1">
              <p className="text-xs text-[#5f5e5a]">Save to your photos or share anywhere.</p>
              <button
                type="button"
                onClick={() => share({ photoUrl: featuredPhoto, title: anchorTitle(featured.a, featured.occ.years), context: `${name} · ${monthDay(featured.a.baseISO)}` })}
                className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full bg-[#1a3d2e] px-3.5 text-sm font-medium text-white"
              >
                <Share2 className="size-4" /> Share
              </button>
            </div>
          </section>
        )}

        {/* Milestones — auto anchors with year-over-year photo slots */}
        {anchors.map((a) => {
          const baseYear = new Date(`${a.baseISO}T12:00:00`).getFullYear();
          const thisYear = todayMid().getFullYear();
          const years: number[] = [];
          for (let y = baseYear; y <= thisYear; y++) years.push(y);
          return (
            <section key={a.key} className="rounded-[16px] bg-white p-4 ring-1 ring-[#e3dcc9]">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium text-[#1a3d2e]">{a.label}</p>
                <p className="text-xs text-[#8a897f]">{monthDay(a.baseISO)} · yearly</p>
              </div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {years.map((y) => {
                  const path = photoByYear.get(`${a.key}:${y}`);
                  const url = urlFor(path);
                  const isCurrent = y === thisYear;
                  return (
                    <div key={y} className="shrink-0 text-center">
                      {url ? (
                        <button type="button" onClick={() => share({ photoUrl: url, title: anchorTitle(a, y - baseYear), context: `${name} · ${y}` })} className="block size-16 overflow-hidden rounded-xl ring-1 ring-[#e3dcc9]">
                          <img src={url} alt="" className="size-full object-cover" />
                        </button>
                      ) : (
                        <label className={`grid size-16 cursor-pointer place-items-center rounded-xl ${isCurrent ? "border-2 border-dashed border-[#2d6a4f] text-[#2d6a4f]" : "text-white/80"}`} style={isCurrent ? undefined : { background: "linear-gradient(135deg,#7fa890,#cdeab0)" }}>
                          <Plus className="size-5" />
                          <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) addAnchorPhoto(a.key, y, f); }} />
                        </label>
                      )}
                      <span className="mt-1 block text-[10px] text-[#8a897f]">{y}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {anchors.length === 0 && (
          <p className="rounded-[16px] bg-[#efe9da] p-6 text-center text-sm text-[#5f5e5a]">
            Add {name}'s hatch date and the day they came home in Identity, and their yearly moments will appear here.
          </p>
        )}

        {/* Your own — secondary */}
        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-[#8a897f]">Your own</h2>
          {customs.length > 0 && (
            <ul className="space-y-2">
              {customs.map((c) => {
                const url = urlFor(c.photo_path);
                return (
                  <li key={c.id} className="flex items-center gap-3 rounded-[14px] bg-white p-3 ring-1 ring-[#e3dcc9]">
                    {url ? <img src={url} alt="" className="size-11 shrink-0 rounded-lg object-cover" /> : <span className="size-11 shrink-0 rounded-lg" style={{ background: "linear-gradient(135deg,#7fa890,#cdeab0)" }} />}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[#1a3d2e]">{c.title || "Milestone"}</p>
                      <p className="truncate text-xs text-[#8a897f]">{c.on_date ? fmtDate(c.on_date) : ""}</p>
                    </div>
                    <button type="button" onClick={() => share({ photoUrl: url, title: c.title || "Milestone", context: `${name}${c.on_date ? ` · ${monthDay(c.on_date)}` : ""}` })} aria-label="Share" className="grid size-9 shrink-0 place-items-center rounded-full text-[#2d6a4f]">
                      <Share2 className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <button type="button" onClick={() => setAdding(true)} className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[14px] border border-dashed border-[#c8bfa6] text-sm font-medium text-[#5f5e5a]">
            <Plus className="size-4" /> Add a milestone
          </button>
        </section>
      </main>

      {adding && (
        <AddMilestone birdId={birdId} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); qc.invalidateQueries({ queryKey: ["moments", birdId] }); }} />
      )}
    </div>
  );
}

function AddMilestone({ birdId, onClose, onSaved }: { birdId: string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [photoData, setPhotoData] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const valid = title.trim().length > 0 && !!date;

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    try {
      const d = await compressImageToDataUrl(file);
      if (dataUrlBytes(d) > MAX_UPLOAD_BYTES) { toast.error("That photo's a bit too large even after resizing."); return; }
      setPhotoData(d);
    } catch { toast.error("Couldn't process that photo."); }
    finally { setPhotoBusy(false); }
  }

  async function save() {
    if (!valid) return;
    setSaving(true);
    try {
      let photo_path: string | null = null;
      if (photoData) photo_path = await uploadJournalPhoto(birdId, photoData);
      const { error } = await (supabase as any).from("moments").insert({
        bird_id: birdId, kind: "custom", title: title.trim(), on_date: date, recurs: false, auto_generated: false, photo_path,
      });
      if (error) throw error;
      toast.success("Milestone added.");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <div className="absolute inset-0 bg-black/30" onClick={saving ? undefined : onClose} />
      <div className="relative w-full max-w-md rounded-t-2xl bg-[#f4f1e8] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium text-[#1a3d2e]">Add a milestone</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-[#5f5e5a]"><X className="size-5" /></button>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-[#5f5e5a]">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="e.g. First free-flight trip" className="h-11 w-full rounded-xl border border-[#c8bfa6] bg-[#fbfaf2] px-3 text-sm text-[#1a3d2e]" />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-[#5f5e5a]">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 w-full rounded-xl border border-[#c8bfa6] bg-[#fbfaf2] px-3 text-sm text-[#1a3d2e]" />
        </label>
        <div className="mt-3">
          <span className="mb-1 block text-xs font-medium text-[#5f5e5a]">Photo (optional)</span>
          {photoData ? (
            <div className="flex items-center gap-3">
              <img src={photoData} alt="" className="h-16 w-16 rounded-lg object-cover" />
              <button type="button" onClick={() => setPhotoData(null)} className="text-xs font-medium text-[#854F0B] underline">Remove</button>
            </div>
          ) : (
            <label className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#c8bfa6] bg-[#fbfaf2] text-sm font-medium text-[#5f5e5a]">
              {photoBusy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
              {photoBusy ? "Processing…" : "Add a photo"}
              <input type="file" accept="image/*" className="hidden" disabled={photoBusy} onChange={pick} />
            </label>
          )}
        </div>
        <div className="mt-5 flex gap-2">
          <button type="button" onClick={save} disabled={!valid || saving || photoBusy} className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[14px] bg-[#1a3d2e] text-sm font-medium text-white disabled:opacity-50">
            <Check className="size-4" /> {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onClose} disabled={saving} className="min-h-[44px] rounded-[14px] border border-[#c8bfa6] px-4 text-sm font-medium text-[#5f5e5a]">Cancel</button>
        </div>
      </div>
    </div>
  );
}
