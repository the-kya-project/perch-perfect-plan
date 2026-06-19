import { Link } from "@tanstack/react-router";
import { ClipboardList, Stethoscope, BookOpen, AlertTriangle } from "lucide-react";

// Persistent sitter bottom nav. Today / Scan / Guide are icon-above-label
// (active = dark green, inactive = readable muted gray). Emergency is always a
// solid red pill — the loudest item, never muted, independent of active tab.
export function EmergencyBar({ token }: { token: string }) {
  const item = "flex flex-col items-center gap-0.5 text-[#8a897f] [&.active]:text-[#1a3d2e]";
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#e3ded0] bg-[#f4f1e8]/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2.5 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-between gap-2">
        <Link to="/sitter/$token" params={{ token }} activeOptions={{ exact: true }} className={item} data-coach="nav-today">
          <ClipboardList className="size-5" />
          <span className="text-[11px] font-medium">Today</span>
        </Link>
        <Link to="/sitter/$token/scan" params={{ token }} className={item} data-coach="nav-scan">
          <Stethoscope className="size-5" />
          <span className="text-[11px] font-medium">Scan</span>
        </Link>
        <Link to="/sitter/$token/guide" params={{ token }} className={item} data-coach="nav-guide">
          <BookOpen className="size-5" />
          <span className="text-[11px] font-medium">Guide</span>
        </Link>
        <Link
          to="/sitter/$token/emergency"
          params={{ token }}
          data-coach="nav-emergency"
          className="flex items-center gap-2 rounded-full bg-[#993C1D] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#993C1D]/20 active:scale-95"
        >
          <AlertTriangle className="size-4 shrink-0" />
          Emergency
        </Link>
      </div>
    </nav>
  );
}
