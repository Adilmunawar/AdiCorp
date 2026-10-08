/**
 * A small, safe text format for policies and letters, typed into a plain text box:
 *
 *   # Title                 ## Section heading
 *   - a bullet              1. a numbered step
 *   **bold words**          a blank line between paragraphs
 *
 * Parsed once into blocks and drawn both on screen (RichText) and into PDFs, so the
 * two always match. No HTML is ever taken from the text.
 */

export interface Span {
  text: string;
  bold: boolean;
}

export type Block = { kind: "h1" | "h2" | "p"; spans: Span[] } | { kind: "ul" | "ol"; items: Span[][] };

/** One line with its **bold** parts marked. */
export function toSpans(line: string): Span[] {
  const out: Span[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let at = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > at) out.push({ text: line.slice(at, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    at = m.index + m[0].length;
  }
  if (at < line.length) out.push({ text: line.slice(at), bold: false });
  return out.filter((s) => s.text.length > 0);
}

export function parseRichText(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let listKind: "ul" | "ol" | null = null;
  let items: Span[][] = [];

  const endParagraph = () => {
    if (paragraph.length) blocks.push({ kind: "p", spans: toSpans(paragraph.join(" ")) });
    paragraph = [];
  };
  const endList = () => {
    if (listKind && items.length) blocks.push({ kind: listKind, items });
    listKind = null;
    items = [];
  };

  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      endParagraph();
      endList();
      continue;
    }
    const heading = line.match(/^(#{1,2})\s+(.+)$/);
    if (heading) {
      endParagraph();
      endList();
      blocks.push({ kind: heading[1].length === 1 ? "h1" : "h2", spans: toSpans(heading[2]) });
      continue;
    }
    const bullet = line.match(/^[-*•]\s+(.+)$/);
    const numbered = line.match(/^\d{1,2}[.)]\s+(.+)$/);
    const listMatch = bullet ?? numbered;
    if (listMatch) {
      endParagraph();
      const kind = bullet ? "ul" : "ol";
      if (listKind !== kind) {
        endList();
        listKind = kind;
      }
      items.push(toSpans(listMatch[1]));
      continue;
    }
    // An indented line carries on the list item above it.
    if (listKind && items.length && /^\s{2,}/.test(raw)) {
      items[items.length - 1].push({ text: " ", bold: false }, ...toSpans(line));
      continue;
    }
    endList();
    paragraph.push(line);
  }
  endParagraph();
  endList();
  return blocks;
}

export function spanText(spans: Span[]): string {
  return spans.map((s) => s.text).join("");
}

/** Placeholders still waiting to be filled in, like "[Name, designation]". */
export function placeholders(source: string): string[] {
  return [...new Set(source.match(/\[[^\]\n]{1,80}\]/g) ?? [])];
}

/** Plain-text word count, for the reading-time estimate. */
export function wordCount(source: string): number {
  return source.replace(/[#*\-•]/g, " ").split(/\s+/).filter(Boolean).length;
}

/** Minutes to read at ~200 words a minute (at least 1). */
export function readingMinutes(source: string): number {
  return Math.max(1, Math.round(wordCount(source) / 200));
}

export const POLICY_MIN_CHARS = 200;
export const POLICY_MAX_CHARS = 60_000;

/** Why a policy text cannot be published yet, or null when it can (mirrors the server check). */
export function publishProblem(body: string): string | null {
  const text = body.trim();
  if (text.length < POLICY_MIN_CHARS) return "The text is too short to publish. Write the whole policy first (at least 200 characters).";
  if (text.length > POLICY_MAX_CHARS) return "The text is longer than 60,000 characters.";
  const left = placeholders(text);
  if (left.length) {
    return `Fill in everything in square brackets first: ${left.slice(0, 4).join(", ")}${left.length > 4 ? ` and ${left.length - 4} more` : ""}.`;
  }
  if (!parseRichText(text).length) return "The text is empty.";
  return null;
}

/** SHA-256 hex of a string (Web Crypto), used to show and verify fingerprints. */
export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Letters only, lower case, single spaces; accents removed ("José  Ali-Khan" = "jose ali khan"). */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}]+/gu, " ")
    .trim();
}

export function sameName(a: string, b: string): boolean {
  const x = normalizeName(a);
  return x.length >= 2 && x === normalizeName(b);
}
