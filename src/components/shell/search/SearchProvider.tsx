import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** A command registered at runtime by a mounted page (e.g. "Export this register"). */
export interface PageCommand {
  id: string;
  label: string;
  icon?: LucideIcon;
  keywords?: string[];
  /** Group heading. Defaults to "This page". */
  group?: string;
  /** Navigate here when chosen. */
  href?: string;
  /** Or run this when chosen. */
  onSelect?: () => void;
}

interface SearchContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  commands: PageCommand[];
  register: (owner: string, commands: PageCommand[]) => void;
  unregister: (owner: string) => void;
}

const SearchContext = createContext<SearchContextValue | null>(null);

/** True on Apple devices, where the palette shortcut is Cmd+K. */
export const IS_APPLE = typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);

/** Modifier key label for shortcuts ("⌘" on Apple devices, "Ctrl" elsewhere). */
export const MOD_KEY = IS_APPLE ? "⌘" : "Ctrl";

/** Holds the palette open state and the commands pages register. Ctrl/Cmd+K toggles it. */
export function SearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [byOwner, setByOwner] = useState<Record<string, PageCommand[]>>({});

  const register = useCallback((owner: string, commands: PageCommand[]) => {
    setByOwner((prev) => ({ ...prev, [owner]: commands }));
  }, []);
  const unregister = useCallback((owner: string) => {
    setByOwner((prev) => {
      if (!(owner in prev)) return prev;
      const next = { ...prev };
      delete next[owner];
      return next;
    });
  }, []);
  const toggle = useCallback(() => setOpen((o) => !o), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commands = useMemo(() => Object.values(byOwner).flat(), [byOwner]);
  const value = useMemo(() => ({ open, setOpen, toggle, commands, register, unregister }), [open, toggle, commands, register, unregister]);
  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearch must be used within a SearchProvider");
  return ctx;
}

let ownerSeq = 0;

/**
 * Register palette commands while the calling component is mounted.
 * Pass a memoised array (or a stable one) to avoid re-registering every render.
 */
export function useRegisterSearchCommands(commands: PageCommand[]): void {
  const ctx = useContext(SearchContext);
  const owner = useRef(`page-${++ownerSeq}`);
  useEffect(() => {
    if (!ctx) return;
    const id = owner.current;
    ctx.register(id, commands);
    return () => ctx.unregister(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commands, ctx?.register, ctx?.unregister]);
}
