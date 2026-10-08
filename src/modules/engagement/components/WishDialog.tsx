import { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { WISH_SUGGESTIONS, occasionLabel, wishVerb } from "../lib/celebrations";
import type { Occasion } from "../lib/types";
import { PersonAvatar } from "./PersonAvatar";

interface WishDialogProps {
  occasion: Occasion | null;
  onOpenChange: (open: boolean) => void;
  onSend: (message: string) => Promise<unknown>;
  pending?: boolean;
}

/** Send a wish with an optional short note (one per person per occasion). */
export function WishDialog({ occasion, onOpenChange, onSend, pending }: WishDialogProps) {
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (occasion) setMessage("");
  }, [occasion]);
  if (!occasion) return null;
  const first = occasion.name.split(/\s+/)[0];
  return (
    <Dialog open={!!occasion} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="max-w-[calc(100vw-1.5rem)] rounded-2xl sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-3">
            <PersonAvatar name={occasion.name} src={occasion.avatar_url} size="md" />
            <div className="min-w-0 text-left">
              <DialogTitle className="truncate font-display text-base font-semibold">
                {wishVerb(occasion.kind)}
              </DialogTitle>
              <DialogDescription className="truncate text-xs">
                {occasion.name} · {occasionLabel(occasion)}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {WISH_SUGGESTIONS[occasion.kind].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setMessage(s)}
                className="rounded-full border border-primary/20 bg-primary/[0.05] px-2.5 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/10"
              >
                {s}
              </button>
            ))}
          </div>
          <label htmlFor="wish-message" className="sr-only">
            Your note
          </label>
          <Textarea
            id="wish-message"
            value={message}
            maxLength={280}
            rows={3}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={`Add a note for ${first} (optional)`}
            className="rounded-xl text-[13px]"
          />
          <p className="text-right text-[10px] text-muted-foreground">{message.length}/280</p>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" className="rounded-xl" disabled={pending} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="gap-1.5 rounded-xl" disabled={pending} onClick={() => void onSend(message.trim())}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send wishes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
