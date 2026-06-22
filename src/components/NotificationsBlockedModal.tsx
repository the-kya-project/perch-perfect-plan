import { X, Settings, Bell } from "lucide-react";

// Shown when notifications are blocked at the device/browser level (permission
// "denied"). The web can't open OS app-notification settings directly, so this
// gives clear per-platform steps to turn them back on. After the user enables
// them in settings and returns, the settings page re-checks permission on focus.
export function NotificationsBlockedModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-2xl bg-[#f4f1e8] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium text-[#1a3d2e]">Turn on notifications</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-[#5f5e5a] hover:bg-black/5">
            <X className="size-5" />
          </button>
        </div>
        <p className="text-sm text-[#5f5e5a]">
          Notifications are turned off for this app in your device settings. Your phone won't ask
          again, so you'll need to switch them on there — it only takes a few taps.
        </p>
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl bg-[#efe9da] p-4">
            <p className="text-sm font-medium text-[#1a3d2e]">iPhone &amp; iPad</p>
            <ol className="mt-2 space-y-1.5 text-sm text-[#5f5e5a]">
              <li className="flex items-center gap-2"><Settings className="size-4 shrink-0 text-[#2d6a4f]" /> Open the Settings app.</li>
              <li className="flex items-center gap-2"><Bell className="size-4 shrink-0 text-[#2d6a4f]" /> Tap Notifications, then find “Parrot Care.”</li>
              <li>Turn on “Allow Notifications.”</li>
            </ol>
          </div>
          <div className="rounded-2xl bg-[#efe9da] p-4">
            <p className="text-sm font-medium text-[#1a3d2e]">Android</p>
            <ol className="mt-2 space-y-1.5 text-sm text-[#5f5e5a]">
              <li className="flex items-center gap-2"><Settings className="size-4 shrink-0 text-[#2d6a4f]" /> Press and hold the app icon, then tap App info (ⓘ).</li>
              <li className="flex items-center gap-2"><Bell className="size-4 shrink-0 text-[#2d6a4f]" /> Tap Notifications.</li>
              <li>Turn notifications on.</li>
            </ol>
            <p className="mt-2 text-xs text-[#8a897f]">
              Using Chrome without installing the app? Tap the ⋮ menu → Settings → Site settings →
              Notifications, then allow this site.
            </p>
          </div>
        </div>
        <button onClick={onClose} className="mt-4 w-full rounded-[14px] bg-[#1a3d2e] py-3 text-sm font-medium text-white">
          Done
        </button>
      </div>
    </div>
  );
}
