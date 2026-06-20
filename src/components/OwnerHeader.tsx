import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, Settings } from "lucide-react";
import { fetchScanFeed, getNotifSeenAt } from "@/lib/notificationsFeed";

// The two owner header icons — notifications (bell, with unread badge) and
// settings (gear). Reused in OwnerHeader and inline in the Explore mission band.
// `tone` adapts the hover tint for dark vs light backgrounds.
export function OwnerHeaderIcons() {
  const { data: scanFeed = [] } = useQuery({ queryKey: ["scan-feed"], queryFn: fetchScanFeed });
  const seenAt = getNotifSeenAt();
  const unread = (scanFeed as any[]).filter((n) => new Date(n.created_at).getTime() > seenAt).length;

  return (
    <div className="flex items-center gap-1 text-white">
      <Link to="/notifications" className="relative rounded-full p-2 hover:bg-white/10" aria-label="Notifications">
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex min-w-[16px] items-center justify-center rounded-full bg-warn-red px-1 text-[10px] font-bold leading-4 text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Link>
      <Link to="/account" className="rounded-full p-2 hover:bg-white/10" aria-label="Account settings">
        <Settings className="size-5" />
      </Link>
    </div>
  );
}

// Shared owner-screen header: dark-green brand band with a title and the two
// header icons. The dashboard keeps its own bespoke header (greeting + sign
// out); this is for the other primary tab screens (e.g. Sits).
export function OwnerHeader({ title }: { title: string }) {
  return (
    <header className="bg-[#1a3d2e] pt-[max(env(safe-area-inset-top),1rem)]">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-5 pb-6 pt-3">
        <h1 className="text-[27px] font-medium leading-tight text-white">{title}</h1>
        <OwnerHeaderIcons />
      </div>
    </header>
  );
}
