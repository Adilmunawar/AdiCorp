import { useRef, type ChangeEvent } from "react";
import { toast } from "sonner";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { ConfirmButton } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useRemoveAvatar, useUpdateAvatar } from "../api";
import { PortalAvatar } from "./PortalAvatar";

interface AvatarUploaderProps {
  name: string;
  src: string | null | undefined;
  className?: string;
}

/** Profile photo with "change" (upload through portal-files) and "remove" actions. */
export function AvatarUploader({ name, src, className }: AvatarUploaderProps) {
  const input = useRef<HTMLInputElement>(null);
  const update = useUpdateAvatar();
  const remove = useRemoveAvatar();
  const busy = update.isPending || remove.isPending;

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    update.mutate(file, {
      onSuccess: () => toast.success("Profile photo updated"),
      onError: (err) => toast.error(err instanceof Error ? err.message : "Could not update your photo"),
    });
  };

  return (
    <div className={cn("flex items-center gap-4", className)}>
      <div className="relative">
        <PortalAvatar name={name} src={src} className="h-16 w-16 text-lg sm:h-20 sm:w-20" />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          aria-label="Change profile photo"
          className="absolute -bottom-0.5 -right-0.5 flex h-8 w-8 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-70"
        >
          {update.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
        </button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} onChange={onPick} aria-hidden />
      </div>
      {src && (
        <ConfirmButton
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 rounded-lg px-2 text-xs text-muted-foreground hover:text-destructive"
          disabled={busy}
          title="Remove your profile photo?"
          description="Your initials will be shown instead. You can upload a new photo at any time."
          confirmLabel="Remove photo"
          onConfirm={async () => {
            try {
              await remove.mutateAsync();
              toast.success("Profile photo removed");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not remove your photo");
            }
          }}
        >
          <Trash2 className="h-3.5 w-3.5" /> Remove
        </ConfirmButton>
      )}
    </div>
  );
}
