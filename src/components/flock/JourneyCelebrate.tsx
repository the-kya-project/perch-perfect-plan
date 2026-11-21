import type { ReactNode } from "react";
import { K } from "@/components/kya";
import { BirdThumb } from "@/components/flock/FlockPeople";
import type { FlockPhotoSrc } from "@/lib/flockData";

/** The bird's photo inside a progress ring (Batch 4, screen 3). */
export function ProgressRing({ name, photo, done, total, size = 168 }: { name: string; photo: FlockPhotoSrc; done: number; total: number; size?: number }) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <span className="relative grid place-items-center" style={{ width: size, height: size }} data-testid="progress-ring" data-done={done} data-total={total}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(205,234,176,0.18)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={K.lime} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`} />
      </svg>
      <BirdThumb name={name} photo={photo} size={size - stroke * 2 - 12} />
    </span>
  );
}

/** A full-screen forest moment with its buttons at the bottom. */
export function ForestMoment({ children, actions }: { children: ReactNode; actions: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center px-6 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(56px,env(safe-area-inset-top))] text-center"
      style={{ background: K.forest, color: "#fff" }}>
      <div className="flex flex-1 flex-col items-center justify-center gap-4">{children}</div>
      <div className="flex w-full max-w-sm flex-col items-stretch gap-2.5">{actions}</div>
    </div>
  );
}
