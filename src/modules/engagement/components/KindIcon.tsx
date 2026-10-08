import { Cake, PartyPopper, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CelebrationKind } from "../lib/types";

const ICONS: Record<CelebrationKind, LucideIcon> = { birthday: Cake, anniversary: PartyPopper, welcome: Sparkles };

/** Small line icon for a celebration kind (replaces emoji in the UI). */
export function KindIcon({ kind, className }: { kind: CelebrationKind | string; className?: string }) {
  const Icon = ICONS[kind as CelebrationKind] ?? PartyPopper;
  return <Icon className={cn("h-3.5 w-3.5 shrink-0", className)} aria-hidden />;
}
