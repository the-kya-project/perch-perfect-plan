import { X, Share, Plus, MoreVertical } from "lucide-react";

// Install instructions popup (iOS + Android). Shown from the Account screen and
// from the notification settings when push isn't available until the app is
// added to the home screen. Self-attested — just instructions.
export function AddToHomeModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-2xl bg-[#f4f1e8] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium text-[#1a3d2e]">Add to home screen</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-[#5f5e5a] hover:bg-black/5">
            <X className="size-5" />
          </button>
        </div>
        <p className="text-sm text-[#5f5e5a]">Install Kya & Co. to open it like an app and receive push alerts.</p>
        <div className="mt-4 space-y-4">
          <div className="rounded-2xl bg-[#efe9da] p-4">
            <p className="text-sm font-medium text-[#1a3d2e]">iPhone &amp; iPad (Safari)</p>
            <ol className="mt-2 space-y-1.5 text-sm text-[#5f5e5a]">
              <li className="flex items-center gap-2"><Share className="size-4 shrink-0 text-[#2d6a4f]" /> Tap the Share button.</li>
              <li className="flex items-center gap-2"><Plus className="size-4 shrink-0 text-[#2d6a4f]" /> Choose “Add to Home Screen.”</li>
              <li>Tap “Add” to confirm.</li>
            </ol>
          </div>
          <div className="rounded-2xl bg-[#efe9da] p-4">
            <p className="text-sm font-medium text-[#1a3d2e]">Android (Chrome)</p>
            <ol className="mt-2 space-y-1.5 text-sm text-[#5f5e5a]">
              <li className="flex items-center gap-2"><MoreVertical className="size-4 shrink-0 text-[#2d6a4f]" /> Tap the menu (three dots).</li>
              <li className="flex items-center gap-2"><Plus className="size-4 shrink-0 text-[#2d6a4f]" /> Choose “Add to Home screen” / “Install app.”</li>
              <li>Tap “Add” / “Install” to confirm.</li>
            </ol>
          </div>
        </div>
        <button onClick={onClose} className="mt-4 w-full rounded-[14px] bg-[#1a3d2e] py-3 text-sm font-medium text-white">Got it</button>
      </div>
    </div>
  );
}
