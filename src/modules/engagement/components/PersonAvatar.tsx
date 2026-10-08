import { useState } from "react";
import { initials } from "@/components/kit";
import { cn } from "@/lib/utils";

const SIZES = {
  xs: "h-6 w-6 text-[9px]",
  sm: "h-8 w-8 text-[10px]",
  md: "h-10 w-10 text-xs",
  lg: "h-14 w-14 text-sm",
} as const;

export interface PersonAvatarProps {
  name: string | null | undefined;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}

/** Round avatar with an initials fallback (also used when the image fails to load). */
export function PersonAvatar({ name, src, size = "sm", className }: PersonAvatarProps) {
  const [broken, setBroken] = useState(false);
  return (
    <span
      className={cn(
        "flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full border border-primary/15 bg-primary/10 font-bold text-primary",
        SIZES[size],
        className,
      )}
      aria-hidden
    >
      {src && !broken ? <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" onError={() => setBroken(true)} /> : initials(name ?? "?")}
    </span>
  );
}
