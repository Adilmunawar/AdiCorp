import { useState } from "react";
import { initials } from "@/components/kit";
import { cn } from "@/lib/utils";

interface PortalAvatarProps {
  name: string;
  src?: string | null;
  className?: string;
}

/** Round photo with an initials fallback (also used when the image fails to load). */
export function PortalAvatar({ name, src, className }: PortalAvatarProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const showImage = !!src && failed !== src;
  return (
    <span
      className={cn(
        "flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full border border-primary/15 bg-primary/10 font-bold text-primary",
        className,
      )}
      aria-hidden
    >
      {showImage ? (
        <img src={src ?? undefined} alt="" className="h-full w-full object-cover" onError={() => setFailed(src ?? null)} />
      ) : (
        initials(name)
      )}
    </span>
  );
}
