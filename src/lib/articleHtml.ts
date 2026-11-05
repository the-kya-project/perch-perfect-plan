/**
 * Cleans a blog post's content_html (the JSON Feed's full body) before the
 * iPhone Duo's reader shows it (components/duo/explore/ArticleReaderDuo.tsx).
 *
 * Browser only: the browser's own HTML parser reads the body into an inert
 * document (DOMParser runs no scripts and loads nothing), and a NEW tree is
 * built from an allow list. Nothing is copied across wholesale, so anything not
 * named here is gone:
 *
 *   kept      headings, paragraphs, lists, blockquotes, images, figures,
 *             links, simple tables, emphasis, line breaks, rules
 *   unwrapped any other element (its text stays, the tag goes)
 *   dropped   script, style, iframe, object, embed, form controls, svg, math,
 *             template, noscript and everything inside them; every attribute
 *             except href (links), src/alt (images) and colspan/rowspan
 *             (table cells): so no inline styles, classes, ids or on* handlers
 *
 * Links must be http(s) or mailto and open outside the app (target=_blank,
 * which the app shell hands to the system browser). Images must be https or
 * http. Relative URLs resolve against the post's own URL.
 */

const KEEP = new Set([
  "h2", "h3", "h4", "p", "br", "hr", "ul", "ol", "li", "blockquote",
  "strong", "b", "em", "i", "a", "img", "figure", "figcaption",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
]);

/** Headings start at h2: the reader's title is the page's only h1. */
const RENAME: Record<string, string> = { h1: "h2", h5: "h4", h6: "h4" };

const DROP = new Set([
  "script", "style", "iframe", "frame", "frameset", "object", "embed", "applet",
  "form", "input", "button", "select", "option", "textarea", "label",
  "svg", "math", "template", "noscript", "canvas", "video", "audio", "source",
  "track", "link", "meta", "base", "head", "title",
]);

function safeUrl(raw: string | null, base: string | undefined, schemes: string[]): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim(), base);
    return schemes.includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

function copyChildren(from: Node, to: Node, doc: Document, base: string | undefined) {
  from.childNodes.forEach((child) => {
    for (const n of clean(child, doc, base)) to.appendChild(n);
  });
}

function clean(node: Node, doc: Document, base: string | undefined): Node[] {
  if (node.nodeType === Node.TEXT_NODE) return [doc.createTextNode(node.textContent ?? "")];
  if (node.nodeType !== Node.ELEMENT_NODE) return []; // comments, processing instructions
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (DROP.has(tag)) return [];
  const name = RENAME[tag] ?? tag;
  if (!KEEP.has(name)) {
    // Unknown wrapper (div, span, section...): keep what's inside.
    const frag = doc.createDocumentFragment();
    copyChildren(el, frag, doc, base);
    return [frag];
  }

  if (name === "img") {
    const src = safeUrl(el.getAttribute("src"), base, ["https:", "http:"]);
    if (!src) return [];
    const img = doc.createElement("img");
    img.setAttribute("src", src);
    img.setAttribute("alt", el.getAttribute("alt") ?? "");
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
    return [img];
  }

  const out = doc.createElement(name);
  if (name === "a") {
    const href = safeUrl(el.getAttribute("href"), base, ["https:", "http:", "mailto:"]);
    if (!href) {
      // A link we won't follow keeps its words.
      const frag = doc.createDocumentFragment();
      copyChildren(el, frag, doc, base);
      return [frag];
    }
    out.setAttribute("href", href);
    out.setAttribute("target", "_blank");
    out.setAttribute("rel", "noopener noreferrer");
  }
  if (name === "td" || name === "th") {
    for (const attr of ["colspan", "rowspan"]) {
      const v = el.getAttribute(attr);
      if (v && /^\d{1,2}$/.test(v)) out.setAttribute(attr, v);
    }
  }
  if (name !== "br" && name !== "hr") copyChildren(el, out, doc, base);
  return [out];
}

/** The cleaned body as an HTML string (empty when nothing worth showing is left). */
export function sanitizeArticleHtml(html: string, baseUrl?: string): string {
  if (typeof DOMParser === "undefined") return "";
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const doc = document.implementation.createHTMLDocument("");
  const root = doc.createElement("div");
  copyChildren(parsed.body, root, doc, baseUrl);
  // Drop empty paragraphs and wrappers left by stripped content.
  root.querySelectorAll("p, li, blockquote, h2, h3, h4, figure").forEach((el) => {
    if (!el.textContent?.trim() && !el.querySelector("img")) el.remove();
  });
  return root.textContent?.trim() || root.querySelector("img") ? root.innerHTML : "";
}
