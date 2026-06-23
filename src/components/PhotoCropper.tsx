import { useRef, useState, useEffect } from "react";

type Props = {
  src: string;
  position: string | null | undefined; // e.g. "50% 30%"
  onChange: (pos: string) => void;
  /** Fires once when a drag ends — use to persist without a write per pointer move. */
  onCommit?: (pos: string) => void;
  size?: number; // px
  shape?: "square" | "circle";
  /** "cover" fills the frame (approved setup/identity look); "contain" scales the
      whole photo to fit, centered. Default "cover". */
  fit?: "cover" | "contain";
  /** Show the "Drag inside the frame…" caption. Default true. */
  showHint?: boolean;
};

function parsePos(p: string | null | undefined): { x: number; y: number } {
  if (!p) return { x: 50, y: 50 };
  const m = p.match(/(-?\d+(?:\.\d+)?)\s*%\s+(-?\d+(?:\.\d+)?)\s*%/);
  if (!m) return { x: 50, y: 50 };
  return { x: clamp(Number(m[1])), y: clamp(Number(m[2])) };
}
function clamp(n: number, min = 0, max = 100) { return Math.max(min, Math.min(max, n)); }

export function PhotoCropper({ src, position, onChange, onCommit, size = 160, shape = "square", fit = "cover", showHint = true }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(() => parsePos(position));
  const [dragging, setDragging] = useState(false);

  useEffect(() => { setPos(parsePos(position)); }, [position]);

  function commit(next: { x: number; y: number }) {
    setPos(next);
    onChange(`${next.x.toFixed(0)}% ${next.y.toFixed(0)}%`);
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging || !ref.current) return;
    // Drag moves the image: dragging right should reveal left side of image,
    // so background-position X increases. Use small sensitivity so a full
    // drag across the frame shifts focus across the full image.
    const dx = (e.movementX / ref.current.clientWidth) * 100;
    const dy = (e.movementY / ref.current.clientHeight) * 100;
    commit({ x: clamp(pos.x - dx), y: clamp(pos.y - dy) });
  }
  function onPointerUp(e: React.PointerEvent) {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (dragging) onCommit?.(`${pos.x.toFixed(0)}% ${pos.y.toFixed(0)}%`);
    setDragging(false);
  }

  return (
    <div className="space-y-1">
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`touch-none select-none overflow-hidden ring-1 ring-sage-200 ${shape === "circle" ? "rounded-full" : "rounded-xl"}`}
        style={{
          width: size,
          height: size,
          backgroundImage: `url(${src})`,
          // "contain" scales the WHOLE photo to fit the frame (no aggressive
          // crop), centered; "cover" fills the frame. Either way, dragging
          // nudges what shows.
          backgroundSize: fit,
          backgroundRepeat: "no-repeat",
          backgroundColor: "#e3dcc9",
          backgroundPosition: `${pos.x}% ${pos.y}%`,
          cursor: dragging ? "grabbing" : "grab",
        }}
        role="img"
        aria-label="Drag to reposition photo"
      />
      {showHint && <p className="text-[10px] text-sage-600">Drag inside the frame to adjust what shows.</p>}
    </div>
  );
}
