import { Share, Plus, MoreVertical, Compass, Download, Check } from "lucide-react";
import { useInstallState } from "@/lib/pwaInstall";

// Install instructions tailored to the visitor's platform + browser, with the
// real native prompt used where available (Android Chrome, desktop Chrome/Edge).
// One component behind every "add to home screen" surface so nobody sees steps
// that don't work for them. Renders nothing when already installed.

function Step({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {icon && <span className="mt-0.5 shrink-0 text-[#2d6a4f]">{icon}</span>}
      <span>{children}</span>
    </li>
  );
}

function Panel({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-[#efe9da] p-4">
      {title && <p className="text-sm font-medium text-[#1a3d2e]">{title}</p>}
      <div className={title ? "mt-2" : ""}>{children}</div>
    </div>
  );
}

export function InstallGuide({ onInstalled }: { onInstalled?: () => void }) {
  const { branch, promptInstall, ready } = useInstallState();

  async function install() {
    const r = await promptInstall();
    if (r === "accepted") onInstalled?.();
  }

  // Avoid a first-paint flash of the wrong platform before client detection runs.
  if (!ready) return <div className="h-24 animate-pulse rounded-2xl bg-[#efe9da]" />;

  if (branch === "installed") {
    return (
      <Panel>
        <p className="flex items-center gap-2 text-sm text-[#1a3d2e]">
          <Check className="size-4 shrink-0 text-[#2d6a4f]" /> You're all set. Kya & Co. is installed on this device.
        </p>
      </Panel>
    );
  }

  if (branch === "ios-safari") {
    return (
      <Panel title="Add to your home screen">
        <ol className="space-y-1.5 text-sm text-[#5f5e5a]">
          <Step icon={<Share className="size-4" />}>Tap the share button.</Step>
          <Step icon={<Plus className="size-4" />}>Choose Add to Home Screen.</Step>
          <Step>Tap Add to confirm.</Step>
        </ol>
      </Panel>
    );
  }

  if (branch === "ios-other") {
    return (
      <Panel title="Open in Safari to install">
        <p className="text-sm leading-relaxed text-[#5f5e5a]">
          On iPhone and iPad, only Safari can add this app to your home screen. Open this page in Safari, then tap the
          {" "}<Share className="inline size-4 align-text-bottom text-[#2d6a4f]" /> share button and choose Add to Home Screen.
        </p>
      </Panel>
    );
  }

  if (branch === "android-native" || branch === "desktop-native") {
    return (
      <Panel title="Install the app">
        <button
          type="button"
          onClick={install}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[13px] bg-[#1a3d2e] text-sm font-medium text-white active:scale-[0.99]"
        >
          <Download className="size-4" /> Install Kya &amp; Co.
        </button>
        {branch === "android-native" && (
          <p className="mt-2 text-xs text-[#5f5e5a]">Or open the menu (three dots) and tap Add to Home screen.</p>
        )}
      </Panel>
    );
  }

  if (branch === "android-other") {
    return (
      <Panel title="Add to your home screen">
        <ol className="space-y-1.5 text-sm text-[#5f5e5a]">
          <Step icon={<MoreVertical className="size-4" />}>Open your browser menu.</Step>
          <Step icon={<Plus className="size-4" />}>Choose Add to Home screen, or Install app.</Step>
          <Step>Confirm to add it.</Step>
        </ol>
      </Panel>
    );
  }

  // desktop, no native prompt
  return (
    <Panel title="Install is optional on a computer">
      <p className="flex items-start gap-2 text-sm leading-relaxed text-[#5f5e5a]">
        <Compass className="mt-0.5 size-4 shrink-0 text-[#2d6a4f]" />
        Push alerts and the home-screen app are made for your phone. If your browser offers it, you can still install from the
        install icon in the address bar.
      </p>
    </Panel>
  );
}
