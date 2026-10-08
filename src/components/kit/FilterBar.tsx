import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Debounce a changing value. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export interface FilterBarProps {
  /** Current (debounced) search value. */
  search?: string;
  /** Called with the debounced value. Omit to hide the search box. */
  onSearchChange?: (value: string) => void;
  placeholder?: string;
  delay?: number;
  /** Selects, toggles, date pickers… rendered after the search box. */
  children?: ReactNode;
  /** Rendered at the far right (e.g. export button). */
  actions?: ReactNode;
  className?: string;
}

/** Search input with debounce plus slots for filter controls. Wraps on phones. */
export function FilterBar({ search = "", onSearchChange, placeholder = "Search…", delay = 300, children, actions, className }: FilterBarProps) {
  const [text, setText] = useState(search);
  const debounced = useDebouncedValue(text, delay);
  const onChangeRef = useRef(onSearchChange);
  onChangeRef.current = onSearchChange;
  const lastEmitted = useRef(search);

  // Follow the parent only when it changes the value itself (e.g. "clear filters"),
  // never when it echoes what we emitted, so in-flight typing is not overwritten.
  useEffect(() => {
    if (search !== lastEmitted.current) {
      lastEmitted.current = search;
      setText(search);
    }
  }, [search]);

  useEffect(() => {
    if (debounced !== lastEmitted.current) {
      lastEmitted.current = debounced;
      onChangeRef.current?.(debounced);
    }
  }, [debounced]);

  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center", className)}>
      {onSearchChange && (
        <div className="relative min-w-0 sm:w-64 sm:flex-none lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          {/* type=search gives phones the right keyboard; the native clear button is hidden in favour of ours. */}
          <Input
            value={text}
            type="search"
            enterKeyHint="search"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && text) {
                e.preventDefault();
                e.stopPropagation();
                setText("");
              }
            }}
            placeholder={placeholder}
            aria-label={placeholder}
            className="h-10 rounded-xl border-border bg-card pl-8 pr-9 text-base sm:h-9 sm:text-[13px] [&::-webkit-search-cancel-button]:appearance-none"
          />
          {text && (
            <button
              type="button"
              onClick={() => setText("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
      {children && <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>}
      {actions && <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{actions}</div>}
    </div>
  );
}
