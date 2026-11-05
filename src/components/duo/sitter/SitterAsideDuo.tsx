// The sitter's task screens on the iPhone Duo (the daily check, "Something's
// wrong"): the existing page, unchanged, in the right half, and a short dark
// left pane that says which bird it's about. The page's own header and its
// one main button (TaskFooter, pinned to the bottom of the right half) work
// as they do on the phone; Close / Back go into the side column.
//
// The same two wrappers render on every screen size, so turning the phone
// never remounts the page (a half-done check keeps its answers).
import type { ReactNode } from "react";
import { K, SERIF } from "@/components/kya";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { BIRD_PHOTO_FOCUS } from "@/lib/birdPhotoFocus";
import { useDuoMode } from "@/lib/duo";

export function SitterAsideDuo({ bird, title, line, children }: {
  bird: any;
  title: ReactNode;
  line?: ReactNode;
  children: ReactNode;
}) {
  const duo = useDuoMode() === "sideways";
  return (
    <div className={duo ? "duo-split setup-frame" : undefined}>
      {duo && (
        <section className="duo-pane duo-block-pane duo-block-pane-dark" data-duo-pane="left">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[24px]" style={{ background: "#12291f" }}>
            {bird?.photo_url ? (
              <BirdPhotoCrop url={bird.photo_url} original={bird.photo_url} position={bird.photo_position || BIRD_PHOTO_FOCUS} alt="" eager />
            ) : (
              <span className="absolute inset-0 grid place-items-center text-[64px] font-[700] text-white/85" style={{ fontFamily: SERIF }} aria-hidden="true">
                {(bird?.name?.slice(0, 1) ?? "?").toUpperCase()}
              </span>
            )}
          </div>
          <h2 className="m-0 mt-6 text-[30px] font-[600] leading-tight [text-wrap:balance]" style={{ fontFamily: SERIF }}>{title}</h2>
          {line && <p className="m-0 mt-2 text-[17px] leading-[1.5]" style={{ color: K.paleGreen }}>{line}</p>}
        </section>
      )}
      <div className={duo ? "duo-pane" : undefined} data-duo-pane={duo ? "right" : undefined} style={duo ? { background: K.mist } : undefined}>
        {children}
      </div>
    </div>
  );
}
