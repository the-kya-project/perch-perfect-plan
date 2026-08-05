// Minimal, dependency-free JSONC reader.
//
// Locale catalogs are authored as .jsonc so each key can carry its English
// source as a `// comment` (see src/locales/*.jsonc) — a non-technical person
// can read or correct a string without touching code. JSON can't hold comments
// and the sealed @lovable.dev/vite-tanstack-config forbids adding a Vite plugin,
// so we import the file as a raw string (Vite's built-in `?raw`) and strip
// comments here at module-eval time. Fully synchronous — no async, no FOUC.
//
// Only `//` line comments are supported (that is all the catalogs use). The
// stripper is STRING-AWARE so a `//` inside a value (e.g. "https://…") is never
// mistaken for a comment. The generator never emits block comments or trailing
// commas, so plain JSON.parse handles the rest.

export function stripLineComments(src: string): string {
  let out = "";
  let inStr = false;
  let esc = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      out += c;
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      // Skip to end of line, preserving the newline for accurate error offsets.
      while (i < src.length && src[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    out += c;
  }
  return out;
}

export function parseJsonc(src: string): Record<string, string> {
  return JSON.parse(stripLineComments(src));
}
