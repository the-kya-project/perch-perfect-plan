import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { persistBirdPhoto } from "@/lib/birdPhoto";
import { compressImageToDataUrl, dataUrlBytes, MAX_UPLOAD_BYTES } from "@/lib/imageUpload";
import { toast } from "sonner";
import { Camera, Image as ImageIcon, Crop, Trash2 } from "lucide-react";
import { K, KyaSheet, KyaHeading, KyaPrimaryButton, KyaSecondaryButton, KyaIconTile } from "@/components/kya";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { friendlyError } from "@/lib/errorMessage";
import { Trans, useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
        toast.error(t("birdPhotoSheet.tooLarge", "That photo's a bit too large even after resizing. Try a different one."));
        return;
      }
      setEditUrl(dataUrl);
      setPendingPhoto(dataUrl);
      setPos("50% 50%"); // new photo starts centered; user repositions
      setMode("reposition");
    } catch {
      toast.error(t("birdPhotoSheet.processFailed", "Couldn't process that photo. Try a different one."));
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
      toast.success(t("birdPhotoSheet.updated", "Photo updated."));
      onClose();
    } catch (e: any) {
      toast.error(friendlyError(e, t("birdPhotoSheet.saveFailed", "Couldn't save the photo.")));
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(t("birdPhotoSheet.confirmRemove", "Remove this bird's photo? You can add one again any time."))) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("birds").update({ photo_url: null, photo_position: null } as any).eq("id", birdId);
      if (error) throw error;
      invalidate();
      toast.success(t("birdPhotoSheet.removed", "Photo removed."));
      onClose();
    } catch (e: any) {
      toast.error(friendlyError(e, t("birdPhotoSheet.removeFailed", "Couldn't remove the photo.")));
      setBusy(false);
    }
  }

  // Closing is blocked mid-save so an upload can't be orphaned half-way.
  const close = () => { if (!busy) onClose(); };

  return (
    <KyaSheet
      onClose={close}
      closeLabel={t("birdPhotoSheet.close", "Close")}
      title={<KyaHeading size={24}>{mode === "menu" ? t("birdPhotoSheet.title", "Bird photo") : t("birdPhotoSheet.reposition", "Reposition")}</KyaHeading>}
      footer={mode === "reposition" ? (
        <div className="flex flex-col gap-2.5">
          <KyaPrimaryButton disabled={busy} onClick={save}>{busy ? t("birdPhotoSheet.saving", "Saving…") : t("birdPhotoSheet.savePhoto", "Save photo")}</KyaPrimaryButton>
          <KyaSecondaryButton className="w-full" disabled={busy} onClick={() => setMode("menu")}>{t("birdPhotoSheet.back", "Back")}</KyaSecondaryButton>
        </div>
      ) : undefined}
    >
      <input ref={takeRef} type="file" accept="image/*,.heic,.heif" capture="environment" className="hidden" onChange={onFile} />
      <input ref={libRef} type="file" accept="image/*,.heic,.heif" className="hidden" onChange={onFile} />

      {mode === "menu" ? (
        <div className="overflow-hidden rounded-[20px] border-[1.5px]" style={{ borderColor: K.line }}>
          <SheetRow icon={<Camera className="size-5" />} label={t("birdPhotoSheet.takePhoto", "Take photo")} onClick={() => takeRef.current?.click()} disabled={busy} />
          <SheetRow icon={<ImageIcon className="size-5" />} label={t("birdPhotoSheet.chooseLibrary", "Choose from library")} onClick={() => libRef.current?.click()} disabled={busy} last={!currentPhoto} />
          {currentPhoto && displayUrl && <SheetRow icon={<Crop className="size-5" />} label={t("birdPhotoSheet.adjustCrop", "Adjust crop")} onClick={adjustExisting} disabled={busy} />}
          {currentPhoto && <SheetRow icon={<Trash2 className="size-5" />} label={t("birdPhotoSheet.removePhoto", "Remove photo")} onClick={remove} disabled={busy} destructive last />}
        </div>
      ) : (
        <div className="space-y-3">
          {editUrl && <RepositionBox src={editUrl} position={pos} onChange={setPos} />}
          <p className="m-0 text-center text-[14px] leading-[1.45]" style={{ color: K.ink }}><Trans i18nKey="birdPhotoSheet.frameHint" defaults="Drag to frame the photo. The green <1>Flock card</1> preview is exactly what your Home tile will show — frame the bird inside it, then save." components={{ 1: <span className="font-[700]" style={{ color: K.moss }} /> }} /></p>
        </div>
      )}
    </KyaSheet>
  );
}

function SheetRow({ icon, label, onClick, disabled, destructive, last }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; destructive?: boolean; last?: boolean }) {
  const color = destructive ? K.red : K.forest;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[56px] w-full items-center gap-3 bg-white px-4 text-left active:bg-black/[0.03] disabled:opacity-50"
      style={{ borderBottom: last ? undefined : `1px solid ${K.line}`, color }}
    >
      <KyaIconTile size={36} tone={destructive ? "mist" : "forest"}><span style={destructive ? { color: K.red } : undefined} className="grid place-items-center">{icon}</span></KyaIconTile>
      <span className="text-[15px] font-[700]">{label}</span>
    </button>
  );
}

// Reposition frame: drag the 3:2 hero preview to nudge object-position. A real
// tile-aspect preview sits beside it and renders the exact crop the flock card
// will show — because the hero (3:2 landscape) and the tile (~9:10 portrait)
// crop a single object-position to wildly different portions of the source,
// so a dashed-guide overlay can't honestly preview both at once.
function RepositionBox({ src, position, onChange }: { src: string; position: string; onChange: (pos: string) => void }) {
  const { t } = useTranslation();
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
    backgroundColor: K.mist,
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
          className="relative aspect-[3/2] w-full touch-none select-none overflow-hidden rounded-[14px] ring-1 ring-[#e3ebe2]"
          style={{ ...coverStyle, cursor: dragging ? "grabbing" : "grab" }}
          role="img"
          aria-label={t("birdPhotoSheet.dragAria", "Drag to reposition photo")}
        >
          <span className="absolute left-2 top-2 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-[500] text-white">{t("birdPhotoSheet.dragToReposition", "Drag to reposition")}</span>
        </div>
        <p className="m-0 text-center text-[12.5px]" style={{ color: K.quiet }}>{t("birdPhotoSheet.recordHeader", "Bird-record header")}</p>
      </div>
      {/* The real flock-tile preview at the actual 9:10 card aspect, rendered
          through the SAME BirdPhotoCrop component (img + object-cover) the Home
          tile uses — so this is byte-for-byte what the card will draw. */}
      <div className="shrink-0 space-y-1">
        <div className="relative aspect-[9/10] w-28 overflow-hidden rounded-[14px] ring-2 ring-[#2d6a4f]" style={{ background: K.mist }}>
          <BirdPhotoCrop url={src} position={`${pos.x}% ${pos.y}%`} eager />
          <span className="absolute bottom-1 left-1/2 -translate-x-1/2 rounded-full px-2 py-0.5 text-[10px] font-[700] text-white" style={{ background: K.moss }}>{t("birdPhotoSheet.flockCard", "Flock card")}</span>
        </div>
        <p className="m-0 text-center text-[12.5px]" style={{ color: K.quiet }}>{t("birdPhotoSheet.tileShows", "What the tile shows")}</p>
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
