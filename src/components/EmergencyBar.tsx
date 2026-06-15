import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";

export function EmergencyBar({ token }: { token: string }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-sage-200 bg-white px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3">
      <div className="mx-auto flex max-w-md items-center justify-between gap-2">
        <Link
          to="/sitter/$token"
          params={{ token }}
          activeOptions={{ exact: true }}
          className="flex flex-col items-center gap-0.5 text-sage-600 [&.active]:text-sage-900"
        >
          <div className="size-5 rounded-sm border-2 border-current" />
          <span className="text-[10px] font-bold uppercase">Today</span>
        </Link>
        <Link
          to="/sitter/$token/scan"
          params={{ token }}
          className="flex flex-col items-center gap-0.5 text-sage-600 [&.active]:text-sage-900"
        >
          <div className="size-5 rounded-full border-2 border-current" />
          <span className="text-[10px] font-bold uppercase">Scan</span>
        </Link>
        <Link
          to="/sitter/$token/guide"
          params={{ token }}
          className="flex flex-col items-center gap-0.5 text-sage-600 [&.active]:text-sage-900"
        >
          <div className="size-5 rounded-sm border-2 border-current" />
          <span className="text-[10px] font-bold uppercase">Guide</span>
        </Link>
        <Link
          to="/sitter/$token/emergency"
          params={{ token }}
          className="flex items-center gap-2 rounded-full bg-warn-red px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-warn-red/20 active:scale-95"
        >
          <AlertTriangle className="size-4" />
          Emergency
        </Link>
      </div>
    </nav>
  );
}
