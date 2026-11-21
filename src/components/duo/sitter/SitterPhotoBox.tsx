// A bird's photo in a box on the sitter's Duo pages. Renders nothing at all
// when there is no photo or it fails to load, so no empty dark box shows.
import { useEffect, useState, type CSSProperties } from "react";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { BIRD_PHOTO_FOCUS } from "@/lib/birdPhotoFocus";

export function SitterPhotoBox({ bird, className, style }: { bird: any; className: string; style?: CSSProperties }) {
  const url: string | null = bird?.photo_url || null;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed) return null;
  return (
    <div className={`relative overflow-hidden ${className}`} style={style} data-media-box="">
      <BirdPhotoCrop url={url} original={url} position={bird.photo_position || BIRD_PHOTO_FOCUS} alt="" eager onFail={() => setFailed(true)} />
    </div>
  );
}
