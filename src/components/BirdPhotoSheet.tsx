import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { persistBirdPhoto } from "@/lib/birdPhoto";
import { compressImageToDataUrl, dataUrlBytes, MAX_UPLOAD_BYTES } from "@/lib/imageUpload";
import { toast } from "sonner";
import { Camera, Image as ImageIcon, Crop, Trash2, X } from "lucide-react";

// First-class bird-photo management. Opened from the camera button on the bird
// main page hero. Menu → reposition step → save. The "focal point" is stored in
// birds.photo_position (a CSS object-position string), so the same photo frames
// correctly at any aspect via object-fit: cover (no destructive crop, no new
// columns). Existing photos already carry a position; null falls back to center.
export function BirdPhotoSheet({
  birdId, ownerId, currentPhoto, currentPosition, displayUrl, onClose, startAdjusting = false,
}: {
  birdId: string;
  ownerId: string;
  currentPhoto: string | null;        // stored photo_url (path / legacy data URL)
  currentPosition: string | null;     // stored photo_position
  displayUrl: string | null;          // signed URL for previewing the current photo
  onClose: () => void;
  // Open straight into the reposition step on the existing photo (the "Adjust
  // crop" nudge uses this so it's one tap to the crop UI).
  startAdjusting?: boolean;
}) {
  const qc = useQueryClient();
  const adjustNow = startAdjusting && !!currentPhoto && !!displayUrl;
  const [mode, setMode] = useState<"menu" | "reposition">(adjustNow ? "reposition" : "menu");
  // The image being repositioned: a freshly-picked data URL, or the current
  // signed URL when adjusting the existing crop. `pending` is the value to
  // persist on save (data URL → uploaded; existing path → kept).
  const [editUrl, setEditUrl] = useState<string | null>(adjustNow ? displayUrl : null);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(adjustNow ? currentPhoto : null);
  const [pos, setPos] = useState<string>(currentPosition ?? "50% 50%");
  const [busy, setBusy] = useState(false);

  const takeRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      if (dataUrlBytes(dataUrl) > MAX_UPLOAD_BYTES) {
        toast.error("That photo's a bit too large even after resizing. Try a different one.");
        return;
      }
      setEditUrl(dataUrl);
      setPendingPhoto(dataUrl);
      setPos("50% 50%"); // new photo starts centered; user repositions
      setMode("reposition");
    } catch {
      toast.error("Couldn't process that photo. Try a different one.");
    } finally {
      setBusy(false);
    }
  }

  function adjustExisting() {
    if (!displayUrl) return;
    setEditUrl(displayUrl);
    setPendingPhoto(currentPhoto); // keep the same stored photo, only reposition
    setPos(currentPosition ?? "50% 50%");
    setMode("reposition");
  }

  function invalidate() {
    ["bird-record", "bird-identity", "bird"].forEach((k) => qc.invalidateQueries({ queryKey: [k, birdId] }));
    qc.invalidateQueries({ queryKey: ["birds"] });
    qc.invalidateQueries({ queryKey: ["bird-photo-urls"] });
  }

  async function save() {
    setBusy(true);
    try {
      let ref = pendingPhoto;
      if (typeof ref === "string" && ref.startsWith("data:")) ref = await persistBirdPhoto(ownerId, ref);
      const { error } = await supabase.from("birds").update({ photo_url: ref, photo_position: ref ? pos : null } as any).eq("id", birdId);
      if (error) throw error;
      invalidate();
      toast.success("Photo updated.");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't save the photo.");
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm("Remove this bird's photo? You can add one again any time.")) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("birds").update({ photo_url: null, photo_position: null } as any).eq("id", birdId);
      if (error) throw error;
      invalidate();
      toast.success("Photo removed.");
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't remove the photo.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-[var(--ink)]/40" onClick={busy ? undefined : onClose} />
      <div className="relative w-full max-w-md rounded-t-2xl bg-[var(--cream)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl">
        <input ref={takeRef} type="file" accept="image/*,.heic,.heif" capture="environment" className="hidden" onChange={onFile} />
        <input ref={libRef} type="file" accept="image/*,.heic,.heif" className="hidden" onChange={onFile} />

        <div className="mb-3 flex items-center justify-between">
          <h2 className="t-section">{mode === "menu" ? "Bird photo" : "Reposition"}</h2>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="rounded-full p-1 text-[var(--mute)] active:bg-black/5 disabled:opacity-50"><X className="size-5" /></button>
        </div>

        {mode === "menu" ? (
          <div className="space-y-2">
            <SheetRow icon={<Camera className="size-5" />} label="Take photo" onClick={() => takeRef.current?.click()} disabled={busy} />
            <SheetRow icon={<ImageIcon className="size-5" />} label="Choose from library" onClick={() => libRef.current?.click()} disabled={busy} />
            {currentPhoto && displayUrl && <SheetRow icon={<Crop className="size-5" />} label="Adjust crop" onClick={adjustExisting} disabled={busy} />}
            {currentPhoto && <SheetRow icon={<Trash2 className="size-5" />} label="Remove photo" onClick={remove} disabled={busy} destructive />}
          </div>
        ) : (
          <div className="space-y-3">
            {editUrl && <RepositionBox src={editUrl} position={pos} onChange={setPos} />}
            <p className="t-meta text-center">Drag to frame the photo. The green <span className="font-[600] text-[var(--moss)]">Flock card</span> preview is exactly what your Home tile will show — frame the bird inside it, then save.</p>
            <div className="flex gap-2">
              <button type="button" disabled={busy} onClick={() => setMode("menu")} className="min-h-[44px] flex-1 rounded-[12px] border border-[var(--line)] bg-white text-[15px] font-[500] text-[var(--ink)] disabled:opacity-50">Back</button>
              <button type="button" disabled={busy} onClick={save} className="min-h-[44px] flex-1 rounded-[12px] bg-[var(--lime)] text-[15px] font-[500] text-[var(--ink)] disabled:opacity-50">{busy ? "Saving…" : "Save photo"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SheetRow({ icon, label, onClick, disabled, destructive }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; destructive?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[52px] w-full items-center gap-3 rounded-[14px] bg-white px-4 ring-1 ring-[var(--line2)] active:scale-[0.99] disabled:opacity-50"
    >
      <span className="shrink-0" style={{ color: destructive ? "var(--red-ink)" : "var(--moss)" }}>{icon}</span>
      <span className="text-[15px] font-[500]" style={{ color: destructive ? "var(--red-ink)" : "var(--ink)" }}>{label}</span>
    </button>
  );
}

// Reposition frame: drag the 3:2 hero preview to nudge object-position. A real
// tile-aspect preview sits beside it and renders the exact crop the flock card
// will show — because the hero (3:2 landscape) and the tile (~9:10 portrait)
// crop a single object-position to wildly different portions of the source,
// so a dashed-guide overlay can't honestly preview both at once.
function RepositionBox({ src, position, onChange }: { src: string; position: string; onChange: (pos: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(() => parse(position));
  const [dragging, setDragging] = useState(false);
  useEffect(() => { setPos(parse(position)); }, [position]);

  function onDown(e: React.PointerEvent) { (e.target as HTMLElement).setPointerCapture(e.pointerId); setDragging(true); }
  function onMove(e: React.PointerEvent) {
    if (!dragging || !ref.current) return;
    const dx = (e.movementX / ref.current.clientWidth) * 100;
    const dy = (e.movementY / ref.current.clientHeight) * 100;
    const next = { x: clamp(pos.x - dx), y: clamp(pos.y - dy) };
    setPos(next);
    onChange(`${next.x.toFixed(0)}% ${next.y.toFixed(0)}%`);
  }
  function onUp(e: React.PointerEvent) { (e.target as HTMLElement).releasePointerCapture(e.pointerId); setDragging(false); }

  const coverStyle = {
    backgroundImage: `url(${src})`,
    backgroundSize: "cover",
    backgroundRepeat: "no-repeat",
    backgroundColor: "var(--cream2)",
    backgroundPosition: `${pos.x}% ${pos.y}%`,
  } as const;

  return (
    // items-start + a fixed-width card so each box sizes from its OWN aspect
    // ratio. (flex-1 + aspect + items-stretch left the card with no definite
    // width and it overflowed off-screen.) min-w-0 lets the hero shrink to
    // make room for the card. The card is the real WYSIWYG flock-tile preview,
    // so it's sized prominently — what you frame here is what the tile shows.
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1 space-y-1">
        <div
          ref={ref}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="relative aspect-[3/2] w-full touch-none select-none overflow-hidden rounded-[14px] ring-1 ring-[var(--line)]"
          style={{ ...coverStyle, cursor: dragging ? "grabbing" : "grab" }}
          role="img"
          aria-label="Drag to reposition photo"
        >
          <span className="absolute left-2 top-2 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-[500] text-white">Drag to reposition</span>
        </div>
        <p className="t-meta text-center">Bird-record header</p>
      </div>
      {/* The real flock-tile preview at the actual 9:10 card aspect. Same
          object-position + cover as PhotoTile, so this IS the tile. */}
      <div className="shrink-0 space-y-1">
        <div className="relative aspect-[9/10] w-28 overflow-hidden rounded-[14px] ring-2 ring-[var(--moss)]" style={coverStyle}>
          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-[var(--moss)] px-2 py-0.5 text-[10px] font-[500] text-white">Flock card</span>
        </div>
        <p className="t-meta text-center">What the tile shows</p>
      </div>
    </div>
  );
}

function parse(p: string | null | undefined): { x: number; y: number } {
  if (!p) return { x: 50, y: 50 };
  const m = p.match(/(-?\d+(?:\.\d+)?)\s*%\s+(-?\d+(?:\.\d+)?)\s*%/);
  if (!m) return { x: 50, y: 50 };
  return { x: clamp(Number(m[1])), y: clamp(Number(m[2])) };
}
function clamp(n: number, min = 0, max = 100) { return Math.max(min, Math.min(max, n)); }
