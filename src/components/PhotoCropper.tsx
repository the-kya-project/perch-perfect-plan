import { useRef, useState, useEffect } from "react";

type Props = {
  src: string;
  position: string | null | undefined; // e.g. "50% 30%"
  onChange: (pos: string) => void;
  size?: number; // px
};

function parsePos(p: string | null | undefined): { x: number; y: number } {
  if (!p) return { x: 50, y: 50 };
  const m = p.match(/(-?\d+(?:\.\d+)?)\s*%\s+(-?\d+(?:\.\d+)?)\s*%/);
  if (!m) return { x: 50, y: 50 };
  return { x: clamp(Number(m[1])), y: clamp(Number(m[2])) };
}
function clamp(n: number, min = 0, max = 100) { return Math.max(min, Math.min(max, n)); }

export function PhotoCropper({ src, position, onChange, size = 160 }: Props) {
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
        className="touch-none select-none overflow-hidden rounded-xl ring-1 ring-sage-200"
        style={{
          width: size,
          height: size,
          backgroundImage: `url(${src})`,
          backgroundSize: "cover",
          backgroundRepeat: "no-repeat",
          backgroundPosition: `${pos.x}% ${pos.y}%`,
          cursor: dragging ? "grabbing" : "grab",
        }}
        role="img"
        aria-label="Drag to reposition photo"
      />
      <p className="text-[10px] text-sage-600">Drag inside the frame to adjust what shows.</p>
    </div>
  );
}
