import { TRIAGE_DISCLAIMER } from "@/lib/triage";

export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-lg bg-sage-900 p-3 text-white">
      <p className={compact ? "text-[11px] leading-relaxed opacity-90" : "text-xs leading-relaxed opacity-90"}>
        <span className="font-bold uppercase">Notice: </span>
        {TRIAGE_DISCLAIMER}
      </p>
    </div>
  );
}

export function VetReviewBanner() {
  return (
    <div className="rounded-lg border border-warn-amber/40 bg-warn-amber/10 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-warn-amber">
        Not vet-reviewed
      </p>
      <p className="mt-1 text-xs leading-relaxed text-sage-900">
        All medical guidance and triage rules in this app are placeholders pending
        review by a licensed avian veterinarian. Do not rely on this for real care
        until review is complete.
      </p>
    </div>
  );
}
