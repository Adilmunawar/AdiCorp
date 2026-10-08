import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";
import { parseRichText, type Span } from "../lib/richText";

function Spans({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((s, i) =>
        s.bold ? (
          <strong key={i} className="font-semibold text-foreground">
            {s.text}
          </strong>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

/** Renders the policy/letter text format. Never renders HTML from the text. */
export const RichText = memo(function RichText({ source, className }: { source: string; className?: string }) {
  const blocks = useMemo(() => parseRichText(source), [source]);
  if (!blocks.length) return <p className="text-sm italic text-muted-foreground">Nothing written yet.</p>;
  return (
    <div className={cn("space-y-3 text-[13.5px] leading-relaxed text-foreground/90", className)}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "h1":
            return (
              <h2 key={i} className="pt-1 font-display text-lg font-bold tracking-tight text-foreground sm:text-xl">
                <Spans spans={b.spans} />
              </h2>
            );
          case "h2":
            return (
              <h3 key={i} className="pt-2 font-display text-[15px] font-bold text-foreground">
                <Spans spans={b.spans} />
              </h3>
            );
          case "p":
            return (
              <p key={i}>
                <Spans spans={b.spans} />
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-primary">
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Spans spans={it} />
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="list-decimal space-y-1.5 pl-5 marker:font-semibold marker:text-primary">
                {b.items.map((it, j) => (
                  <li key={j}>
                    <Spans spans={it} />
                  </li>
                ))}
              </ol>
            );
          default:
            return null;
        }
      })}
    </div>
  );
});

/** Quick reference for the text format, shown beside editors. */
export function FormatHelp({ className }: { className?: string }) {
  const rows: [string, string][] = [
    ["# Title", "Title"],
    ["## Section", "Heading"],
    ["- item", "Bullet"],
    ["1. step", "Numbered"],
    ["**bold**", "Bold"],
    ["[name]", "Blank to fill"],
  ];
  return (
    <div className={cn("grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] sm:grid-cols-3", className)}>
      {rows.map(([code, label]) => (
        <div key={code} className="flex min-w-0 items-center gap-1.5">
          <code className="shrink-0 rounded bg-muted px-1 py-0.5 font-mono text-[10.5px] text-foreground">{code}</code>
          <span className="truncate text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}
