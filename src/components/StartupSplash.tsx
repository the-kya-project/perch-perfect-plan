import { Loader2 } from "lucide-react";
import { BrandLockup } from "@/components/BrandLogo";

/** Full-screen forest loading screen with the logo and a spinner. Inline
 *  styles on purpose: it must fill the screen and clear the notch even when
 *  the stylesheet hasn't loaded. Static markup only (also server-rendered). */
export function StartupSplash() {
  return (
    <div
      aria-hidden
      style={{
        position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 24, background: "#1a3d2e",
        paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <BrandLockup orientation="stacked" variant="ink" size={180} alt="" />
      <Loader2 width={20} height={20} className="animate-spin" style={{ color: "#cdeab0" }} />
    </div>
  );
}
