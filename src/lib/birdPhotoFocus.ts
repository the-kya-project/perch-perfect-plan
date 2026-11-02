/**
 * Where a bird photo's crop sits when nobody has set one (object-position).
 * Birds are mostly photographed with the head in the top part of the frame, so
 * a centered crop of a tall photo in a wide tile cuts the top of the head off.
 * 50% 25% keeps the upper part. A position saved from "Edit photo"
 * (birds.photo_position) always wins over this.
 */
export const BIRD_PHOTO_FOCUS = "50% 25%";
