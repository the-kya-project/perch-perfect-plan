// Brand-styled gram-level weight chart (hand-rolled SVG, not a themed widget).
// Owner points are solid dark-green dots; sitter points are amber-ringed so a
// weigh-in's source reads at a glance. Responsive via viewBox.

export type WeightPoint = { at: string; grams: number; sitter: boolean };

const W = 320;
const H = 150;
const PAD = { top: 14, right: 12, bottom: 18, left: 30 };

export function WeightTrendChart({ points }: { points: WeightPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="grid h-[150px] place-items-center rounded-[14px] bg-[#efe9da] text-xs text-[#8a897f]">
        No weights in this window yet.
      </div>
    );
  }

  // Ascending by time for the line.
  const pts = [...points].sort((a, b) => +new Date(a.at) - +new Date(b.at));
  const times = pts.map((p) => +new Date(p.at));
  const grams = pts.map((p) => p.grams);
  const tMin = Math.min(...times), tMax = Math.max(...times);
  const gMinRaw = Math.min(...grams), gMaxRaw = Math.max(...grams);
  // Pad the gram axis so a flat line doesn't sit on the floor; min span 4g.
  const span = Math.max(gMaxRaw - gMinRaw, 4);
  const gMin = gMinRaw - span * 0.25;
  const gMax = gMaxRaw + span * 0.25;

  const x = (t: number) => tMax === tMin ? (W - PAD.right + PAD.left) / 2 : PAD.left + ((t - tMin) / (tMax - tMin)) * (W - PAD.left - PAD.right);
  const y = (g: number) => PAD.top + (1 - (g - gMin) / (gMax - gMin)) * (H - PAD.top - PAD.bottom);

  const linePath = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(times[i]).toFixed(1)},${y(p.grams).toFixed(1)}`).join(" ");
  const gridYs = [gMaxRaw, gMinRaw];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[150px] w-full" role="img" aria-label="Weight over time">
      {/* gridlines + gram labels at the real min/max */}
      {gridYs.map((g) => (
        <g key={g}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(g)} y2={y(g)} stroke="#e3dcc9" strokeWidth="1" />
          <text x={PAD.left - 4} y={y(g) + 3} textAnchor="end" fontSize="9" fill="#8a897f">{Math.round(g)}</text>
        </g>
      ))}
      {/* trend line */}
      {pts.length > 1 && <path d={linePath} fill="none" stroke="#1a3d2e" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
      {/* points: sitter = amber ring, owner = solid green */}
      {pts.map((p, i) => (
        p.sitter ? (
          <circle key={i} cx={x(times[i])} cy={y(p.grams)} r="4" fill="#fff" stroke="#BA7517" strokeWidth="2.5" />
        ) : (
          <circle key={i} cx={x(times[i])} cy={y(p.grams)} r="3.5" fill="#1a3d2e" />
        )
      ))}
    </svg>
  );
}
