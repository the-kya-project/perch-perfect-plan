import { X } from "lucide-react";
import { InstallGuide } from "@/components/InstallGuide";

// Install instructions popup. Shown from the Account screen and the notification
// settings (push needs the app on the home screen). The steps are tailored to
// the visitor's platform + browser via InstallGuide — no more one-size-fits-all
// iOS Safari flow shown to everyone.
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
        <p className="text-sm text-[#5f5e5a]">Install Kya &amp; Co. to open it like an app and receive push alerts.</p>
        <div className="mt-4">
          <InstallGuide onInstalled={onClose} />
        </div>
        <button onClick={onClose} className="mt-4 w-full rounded-[14px] bg-[#1a3d2e] py-3 text-sm font-medium text-white">Got it</button>
      </div>
    </div>
  );
}
