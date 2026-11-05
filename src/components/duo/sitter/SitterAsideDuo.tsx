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
import { SitterPhotoBox } from "./SitterPhotoBox";
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
          <SitterPhotoBox bird={bird} className="mb-6 aspect-[4/3] w-full rounded-[24px]" style={{ background: "#12291f" }} />
          <h2 className="m-0 text-[30px] font-[600] leading-tight [text-wrap:balance]" style={{ fontFamily: SERIF }}>{title}</h2>
          {line && <p className="m-0 mt-2 text-[17px] leading-[1.5]" style={{ color: K.paleGreen }}>{line}</p>}
        </section>
      )}
      <div className={duo ? "duo-pane" : undefined} data-duo-pane={duo ? "right" : undefined} style={duo ? { background: K.mist } : undefined}>
        {children}
      </div>
    </div>
  );
}
