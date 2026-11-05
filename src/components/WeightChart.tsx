// A bird's weight over a time window: gridlines on a fitted scale and the
// weights as a line. `wide` (iPhone Duo) adds the filled area and a gold dot on
// the latest weight; otherwise each weight is a dot, filled when it's yours.
// Shared by the weight page and Flock health's right pane on the Duo.
import { useTranslation } from "react-i18next";
import { K } from "@/components/kya";

export type ChartPoint = { id: string; grams: number; measured_at: string };

/** Round gridline values around the weights: a scale fitted to the range with
 *  a little room above and below, so small changes stay small. */
function niceScale(min: number, max: number): { lo: number; hi: number; ticks: number[] } {
  const span = Math.max(max - min, 4);
  const padded = span * 0.25;
  const raw = (span + padded * 2) / 3;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500];
  const step = steps.find((s) => s >= raw) ?? 1000;
  const lo = Math.floor((min - padded) / step) * step;
  const hi = Math.ceil((max + padded) / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 0.001; v += step) ticks.push(v);
  return { lo, hi, ticks };
}

export function WeightChart<E extends ChartPoint>({ points, start, end, isMine, lang, wide = false }: { points: E[]; start: number; end: number; isMine: (e: E) => boolean; lang: string; wide?: boolean }) {
  const { t } = useTranslation();
  const W = wide ? 420 : 320, H = wide ? 210 : 170, L = 34, R = 10, T = 10, B = 26;
  const { lo, hi, ticks } = niceScale(Math.min(...points.map((p) => p.grams)), Math.max(...points.map((p) => p.grams)));
  const x = (ms: number) => L + ((ms - start) / (end - start)) * (W - L - R);
  const y = (g: number) => T + (1 - (g - lo) / (hi - lo || 1)) * (H - T - B);
  const pts = points.map((p) => ({ p, cx: x(+new Date(p.measured_at)), cy: y(p.grams) }));
  const mid = start + (end - start) / 2;
  const fmt = (ms: number) => new Date(ms).toLocaleDateString(lang, { month: "short", day: "numeric" });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 block w-full" role="img" aria-label={t("birdWeight.chartAria", "Weight chart")}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={K.line} strokeWidth="1" />
          <text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill={K.quiet}>{v}</text>
        </g>
      ))}
      {wide && pts.length > 1 && (
        <polygon
          points={`${pts.map((q) => `${q.cx},${q.cy}`).join(" ")} ${pts[pts.length - 1].cx},${H - B} ${pts[0].cx},${H - B}`}
          fill="#cfe9b7"
          fillOpacity="0.6"
        />
      )}
      {pts.length > 1 && (
        <polyline points={pts.map((q) => `${q.cx},${q.cy}`).join(" ")} fill="none" stroke={K.forest} strokeWidth={wide ? 2.4 : 2} strokeLinejoin="round" strokeLinecap="round" />
      )}
      {wide && (() => {
        const q = pts[pts.length - 1];
        return <circle cx={q.cx} cy={q.cy} r={6.5} fill={K.sunflower} stroke={K.forest} strokeWidth="2" />;
      })()}
      {!wide && pts.map((q, i) => {
        const last = i === pts.length - 1;
        const r = last ? 5.5 : 4;
        return isMine(q.p)
          ? <circle key={q.p.id} cx={q.cx} cy={q.cy} r={r} fill={K.forest} />
          : <circle key={q.p.id} cx={q.cx} cy={q.cy} r={r} fill="#fff" stroke={K.moss} strokeWidth="2" />;
      })}
      <text x={L} y={H - 6} fontSize="11" fill={K.quiet}>{fmt(start)}</text>
      <text x={x(mid)} y={H - 6} fontSize="11" fill={K.quiet} textAnchor="middle">{fmt(mid)}</text>
      <text x={W - R} y={H - 6} fontSize="11" fill={K.quiet} textAnchor="end">{t("birdWeight.today", "Today")}</text>
    </svg>
  );
}
