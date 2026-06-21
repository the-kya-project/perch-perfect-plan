import { TRIAGE_DISCLAIMER } from "@/lib/triage";
import { Info } from "lucide-react";

export function Disclaimer({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="flex items-start gap-1.5 text-[11px] leading-snug text-[#5f5e5a]">
        <Info className="mt-px size-3 shrink-0" aria-hidden />
        <span>
          <span className="font-medium">Note:</span> Not a substitute for veterinary care. Call a vet for any medical concern.
        </span>
      </p>
    );
  }
  return (
    <div className="rounded-[16px] bg-[#1a3d2e] p-3 text-white">
      <p className="text-xs leading-relaxed opacity-90">
        <span className="font-medium">Note: </span>
        {TRIAGE_DISCLAIMER}
      </p>
    </div>
  );
}
