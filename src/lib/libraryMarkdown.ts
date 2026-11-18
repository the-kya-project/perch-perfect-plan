// The library's body text: a small, safe subset of Markdown, turned into
// plain data that the app draws as React elements (never as HTML), so a
// resource can't carry a script or a style.
//
//   # Heading / ## Smaller heading      headings (the page title is the h1)
//   - item, * item, 1. item             lists
//   - [ ] item, - [x] item              checklist items (tickable on screen)
//   > a line                            a callout
//   **bold**, *italics*, [words](https://…), bare https:// links
//
// A blank line starts a new paragraph. Anything else is shown as written.
// Pure, so scripts/flock-shell.test.ts pins it.

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "em"; text: string }
  | { kind: "link"; text: string; href: string };

export type Block =
  | { kind: "heading"; level: 2 | 3; content: Inline[] }
  | { kind: "paragraph"; content: Inline[] }
  | { kind: "quote"; content: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "checklist"; items: { checked: boolean; content: Inline[] }[] };

/** Only web and email links; anything else (javascript:, data:) stays text. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  return /^(https?:\/\/|mailto:)[^\s<>"]+$/i.test(h) ? h : null;
}

const INLINE = /\*\*([^*\n]+?)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)|(?<![*\w])\*(?![\s*])([^*\n]+?)(?<!\s)\*(?![*\w])|(https?:\/\/[^\s<>()"]+[^\s<>()".,;:!?'])/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const push = (node: Inline) => {
    const last = out[out.length - 1];
    if (node.kind === "text" && last?.kind === "text") last.text += node.text;
    else if (node.kind !== "text" || node.text) out.push(node);
  };
  let at = 0;
  for (const m of text.matchAll(INLINE)) {
    const i = m.index ?? 0;
    push({ kind: "text", text: text.slice(at, i) });
    if (m[1] !== undefined) push({ kind: "strong", text: m[1] });
    else if (m[2] !== undefined) {
      const href = safeHref(m[3]);
      push(href ? { kind: "link", text: m[2], href } : { kind: "text", text: m[0] });
    } else if (m[4] !== undefined) push({ kind: "em", text: m[4] });
    else if (m[5] !== undefined) push({ kind: "link", text: m[5], href: m[5] });
    at = i + m[0].length;
  }
  push({ kind: "text", text: text.slice(at) });
  return out;
}

const HEADING = /^(#{1,3})\s+(.*)$/;
const CHECK = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/;
const BULLET = /^\s*[-*]\s+(.*)$/;
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;

export function parseBody(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "paragraph", content: parseInline(para.join(" ")) });
    para = [];
  };
  for (const raw of src.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) { flush(); continue; }
    const h = line.match(HEADING);
    const c = h ? null : line.match(CHECK);
    const l = h || c ? null : line.match(BULLET) ?? line.match(NUMBERED);
    const q = h || c || l ? null : line.match(QUOTE);
    if (!h && !c && !l && !q) { para.push(line.trim()); continue; }
    // A paragraph in between ends a list, so read the last block after it.
    flush();
    const last = blocks[blocks.length - 1];
    if (h) {
      blocks.push({ kind: "heading", level: h[1].length === 1 ? 2 : 3, content: parseInline(h[2].trim()) });
    } else if (c) {
      const item = { checked: c[1] !== " ", content: parseInline(c[2].trim()) };
      if (last?.kind === "checklist") last.items.push(item);
      else blocks.push({ kind: "checklist", items: [item] });
    } else if (l) {
      const ordered = !BULLET.test(line);
      const item = parseInline(l[1].trim());
      if (last?.kind === "list" && last.ordered === ordered) last.items.push(item);
      else blocks.push({ kind: "list", ordered, items: [item] });
    } else if (q) {
      const content = parseInline(q[1].trim());
      if (last?.kind === "quote") last.content.push({ kind: "text", text: " " }, ...content);
      else blocks.push({ kind: "quote", content });
    }
  }
  flush();
  return blocks;
}

/** The body as plain text (for a preview line): no Markdown marks. */
export function plainText(src: string): string {
  return parseBody(src)
    .flatMap((b) => (b.kind === "list" ? b.items : b.kind === "checklist" ? b.items.map((i) => i.content) : [b.content]))
    .map((c) => c.map((n) => n.text).join(""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
