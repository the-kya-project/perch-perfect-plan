// Presentational context for both-roles users. On a bird the signed-in user
// does NOT own, a compact house/teal banner explains the relationship so that
// gated controls read as intentional rather than missing. Renders nothing on
// birds the user owns (no clutter) — and nothing until we know the user is a
// member, so it never flashes on an owner's own birds.
import { House, Eye } from "lucide-react";
import { useBirdContext } from "@/lib/useBirdContext";

/** "Sarah" -> "Sarah's", "Chris" -> "Chris'". */
function possessive(name: string): string {
  const n = name.trim();
  if (!n) return "the";
  return /s$/i.test(n) ? `${n}'` : `${n}'s`;
}

export function MemberContextBanner({ birdId, className = "" }: { birdId: string; className?: string }) {
  const { isMember, presetLabel, ownerName } = useBirdContext(birdId);
  if (!isMember) return null; // owners (and no-access) get no banner

  const role = (presetLabel ?? "member").toLowerCase();
  const where = ownerName ? `${possessive(ownerName)} household` : "this household";
  return (
    <div
      className={`flex items-center gap-2.5 rounded-[14px] bg-[#e8f0f4] px-3.5 py-2.5 ring-1 ring-[var(--house)]/15 ${className}`}
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#dbe9ef] text-[var(--house)]">
        <House className="size-4" />
      </span>
      <p className="text-[13px] leading-snug text-[var(--ink)]">
        You're a <span className="font-[500]">{role}</span> in {where}.
      </p>
    </div>
  );
}

/** Quiet "View only" marker shown where an Edit entry would be when the member
 *  lacks the edit capability — so the reduced access reads as intentional, not
 *  broken. Muted, never alarming. */
export function ViewOnlyTag({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[13px] font-[500] text-[var(--mute)] ${className}`}>
      <Eye className="size-3.5" /> View only
    </span>
  );
}
