/** First letter of the person's name, falling back to their email. Shown as
 *  their avatar (AccountAvatar). */
export function avatarInitial(meta: Record<string, unknown> | undefined, email: string | undefined): string {
  const name = [meta?.display_name, meta?.full_name, meta?.name].find((v) => typeof v === "string" && v.trim()) as string | undefined;
  const source = (name ?? email ?? "").trim();
  return source ? source[0].toLocaleUpperCase() : "";
}
