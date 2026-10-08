import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface RatingStarsProps {
  value: number | null;
  onChange?: (value: number) => void;
  size?: "sm" | "md";
  className?: string;
  disabled?: boolean;
}

/** 1–5 star rating. Clicking the current value clears it. Read-only without `onChange`. */
export function RatingStars({ value, onChange, size = "md", className, disabled }: RatingStarsProps) {
  const current = value ?? 0;
  const iconClass = size === "sm" ? "h-3 w-3" : "h-4 w-4";

  if (!onChange) {
    if (!current) return null;
    return (
      <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`Rated ${current} of 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} className={cn(iconClass, n <= current ? "fill-warning text-warning" : "text-muted-foreground/30")} aria-hidden />
        ))}
      </span>
    );
  }

  return (
    <div role="radiogroup" aria-label="Rating" className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={current === n}
          aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
          disabled={disabled}
          onClick={() => onChange(current === n ? 0 : n)}
          className="rounded p-0.5 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Star className={cn(iconClass, n <= current ? "fill-warning text-warning" : "text-muted-foreground/40")} aria-hidden />
        </button>
      ))}
    </div>
  );
}
