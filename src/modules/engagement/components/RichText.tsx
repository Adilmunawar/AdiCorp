import { Fragment, useRef, useState, type ReactNode } from "react";
import { Bold, Heading2, Italic, Link2, List, ListOrdered, Quote } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/*
 * Announcement formatting: a small, safe Markdown subset rendered to React elements
 * (never HTML strings). Supported: paragraphs, line breaks, "## " headings, "- " bullets,
 * "1. " numbered lists, "> " quotes, **bold**, *italic*, and [label](https://…) links
 * plus bare https links.
 */

const SAFE_URL = /^(https?:\/\/|mailto:)/i;

function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  // Order matters: links first, then bold, then italic, then bare URLs.
  // No lookbehind in the pattern: Safari before 16.4 (iOS 15 phones) rejects the whole script at
  // parse time. The "not inside a word" rule for * and _ is checked on the preceding character instead.
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*\n]+)\*(?!\w)|_([^_\n]+)_(?!\w)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text))) {
    const before = match.index > 0 ? text[match.index - 1] : "";
    if ((match[4] !== undefined && /[\w*]/.test(before)) || (match[5] !== undefined && /[\w_]/.test(before))) {
      // An asterisk or underscore inside a word (2*3*4, snake_case) is not emphasis: keep it as text.
      pattern.lastIndex = match.index + 1;
      continue;
    }
    if (match.index > last) out.push(text.slice(last, match.index));
    const key = `${keyBase}-${i++}`;
    if (match[1] !== undefined) {
      const href = match[2];
      out.push(
        SAFE_URL.test(href) ? (
          <a key={key} href={href} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-primary underline-offset-2 hover:underline">
            {match[1]}
          </a>
        ) : (
          match[1]
        ),
      );
    } else if (match[3] !== undefined) {
      out.push(
        <strong key={key} className="font-bold text-foreground">
          {match[3]}
        </strong>,
      );
    } else if (match[4] !== undefined || match[5] !== undefined) {
      out.push(<em key={key}>{match[4] ?? match[5]}</em>);
    } else if (match[6] !== undefined) {
      out.push(
        <a key={key} href={match[6]} target="_blank" rel="noopener noreferrer nofollow" className="break-all font-semibold text-primary underline-offset-2 hover:underline">
          {match[6]}
        </a>,
      );
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function withBreaks(lines: string[], keyBase: string): ReactNode[] {
  return lines.flatMap((line, i) => [
    ...(i > 0 ? [<br key={`${keyBase}-br-${i}`} />] : []),
    <Fragment key={`${keyBase}-l-${i}`}>{renderInline(line, `${keyBase}-${i}`)}</Fragment>,
  ]);
}

type Block =
  | { type: "p"; lines: string[] }
  | { type: "h"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; lines: string[] };

function parse(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let current: Block | null = null;
  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = /^#{1,3}\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: "h", text: heading[1] });
    } else if (bullet) {
      if (current?.type !== "ul") {
        flush();
        current = { type: "ul", items: [] };
      }
      (current as Extract<Block, { type: "ul" }>).items.push(bullet[1]);
    } else if (numbered) {
      if (current?.type !== "ol") {
        flush();
        current = { type: "ol", items: [] };
      }
      (current as Extract<Block, { type: "ol" }>).items.push(numbered[1]);
    } else if (quote) {
      if (current?.type !== "quote") {
        flush();
        current = { type: "quote", lines: [] };
      }
      (current as Extract<Block, { type: "quote" }>).lines.push(quote[1]);
    } else {
      if (current?.type !== "p") {
        flush();
        current = { type: "p", lines: [] };
      }
      (current as Extract<Block, { type: "p" }>).lines.push(line);
    }
  }
  flush();
  return blocks;
}

export function RichText({ source, className, clamp }: { source: string; className?: string; clamp?: boolean }) {
  const blocks = parse(source ?? "");
  return (
    <div className={cn("space-y-2.5 break-words text-[13px] leading-relaxed text-foreground/85", clamp && "line-clamp-4", className)}>
      {blocks.map((b, i) => {
        const key = `b${i}`;
        switch (b.type) {
          case "h":
            return (
              <h3 key={key} className="pt-1 font-display text-sm font-semibold text-foreground">
                {renderInline(b.text, key)}
              </h3>
            );
          case "ul":
            return (
              <ul key={key} className="list-disc space-y-1 pl-5 marker:text-primary">
                {b.items.map((item, j) => (
                  <li key={j}>{renderInline(item, `${key}-${j}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key} className="list-decimal space-y-1 pl-5 marker:font-bold marker:text-primary">
                {b.items.map((item, j) => (
                  <li key={j}>{renderInline(item, `${key}-${j}`)}</li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote key={key} className="rounded-r-xl border-l-[3px] border-primary/50 bg-primary/[0.04] py-1.5 pl-3 pr-2 italic text-foreground/75">
                {withBreaks(b.lines, key)}
              </blockquote>
            );
          default:
            return <p key={key}>{withBreaks(b.lines, key)}</p>;
        }
      })}
    </div>
  );
}

/** Plain text for previews (no formatting marks). */
export function plainText(source: string): string {
  return (source ?? "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,3}\s+|^\s*[-*•]\s+|^\s*\d+[.)]\s+|^>\s?/gm, "")
    .replace(/[*_`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface RichTextEditorProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
  rows?: number;
  invalid?: boolean;
}

type Tool = { label: string; icon: typeof Bold; apply: (selected: string) => { text: string; select?: [number, number] }; line?: boolean };

const TOOLS: Tool[] = [
  { label: "Bold", icon: Bold, apply: (s) => ({ text: `**${s || "bold text"}**`, select: [2, 2 + (s || "bold text").length] }) },
  { label: "Italic", icon: Italic, apply: (s) => ({ text: `*${s || "italic text"}*`, select: [1, 1 + (s || "italic text").length] }) },
  { label: "Heading", icon: Heading2, line: true, apply: (s) => ({ text: `## ${s || "Heading"}` }) },
  {
    label: "Bulleted list",
    icon: List,
    line: true,
    apply: (s) => ({ text: (s || "First point").split("\n").map((l) => `- ${l}`).join("\n") }),
  },
  {
    label: "Numbered list",
    icon: ListOrdered,
    line: true,
    apply: (s) => ({ text: (s || "First step").split("\n").map((l, i) => `${i + 1}. ${l}`).join("\n") }),
  },
  { label: "Quote", icon: Quote, line: true, apply: (s) => ({ text: (s || "Quote").split("\n").map((l) => `> ${l}`).join("\n") }) },
  {
    label: "Link",
    icon: Link2,
    apply: (s) => ({ text: `[${s || "link text"}](https://)`, select: [(s || "link text").length + 3, (s || "link text").length + 11] }),
  },
];

/** Textarea with a formatting toolbar and a live preview. */
export function RichTextEditor({ id, value, onChange, maxLength = 4000, placeholder, rows = 8, invalid }: RichTextEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [preview, setPreview] = useState(false);

  const run = (tool: Tool) => {
    const el = ref.current;
    if (!el) return;
    let start = el.selectionStart;
    let end = el.selectionEnd;
    if (tool.line) {
      // Line tools act on whole lines. (At position 0, lastIndexOf("\n", -1) still inspects index 0.)
      start = start > 0 ? value.lastIndexOf("\n", start - 1) + 1 : 0;
      const nextBreak = value.indexOf("\n", end);
      end = nextBreak === -1 ? value.length : nextBreak;
    }
    const selected = value.slice(start, end);
    const { text, select } = tool.apply(selected);
    const next = value.slice(0, start) + text + value.slice(end);
    if (next.length > maxLength) return;
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      if (select) el.setSelectionRange(start + select[0], start + select[1]);
      else el.setSelectionRange(start + text.length, start + text.length);
    });
  };

  return (
    <div className={cn("overflow-hidden rounded-xl border bg-background", invalid ? "border-destructive" : "border-input")}>
      <div className="flex items-center gap-0.5 border-b border-border/70 bg-muted/30 px-1.5 py-1">
        {TOOLS.map((tool) => (
          <button
            key={tool.label}
            type="button"
            title={tool.label}
            aria-label={tool.label}
            disabled={preview}
            onClick={() => run(tool)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-40"
          >
            <tool.icon className="h-3.5 w-3.5" />
          </button>
        ))}
        <div className="ml-auto flex rounded-lg bg-background p-0.5 text-[10px] font-bold uppercase tracking-wider">
          {(["Write", "Preview"] as const).map((label) => {
            const on = (label === "Preview") === preview;
            return (
              <button
                key={label}
                type="button"
                onClick={() => setPreview(label === "Preview")}
                aria-pressed={on}
                className={cn("rounded-md px-2 py-1 transition-colors", on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      {preview ? (
        <div className="max-h-[320px] min-h-[160px] overflow-y-auto px-3 py-2.5">
          {value.trim() ? <RichText source={value} /> : <p className="text-xs text-muted-foreground">Nothing to preview yet.</p>}
        </div>
      ) : (
        <Textarea
          id={id}
          ref={ref}
          value={value}
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-invalid={invalid || undefined}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[160px] resize-y rounded-none border-0 text-[13px] leading-relaxed shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      )}
      <div className="flex items-center justify-between border-t border-border/60 px-3 py-1.5 text-[10px] text-muted-foreground">
        <span>**bold** · *italic* · - list · [link](https://…)</span>
        <span className={cn("tabular font-semibold", value.length > maxLength * 0.9 && "text-warning")}>
          {value.length}/{maxLength}
        </span>
      </div>
    </div>
  );
}
