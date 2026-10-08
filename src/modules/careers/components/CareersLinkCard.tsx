import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Globe, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/kit";
import { useAuth } from "@/context/AuthContext";
import { useCompanySlug, useSetCompanySlug } from "../lib/api";
import { careersUrl, slugify } from "../lib/model";

export async function copyText(value: string, message = "Link copied.") {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(message);
  } catch {
    toast.error("Copy failed. Select the link and copy it manually.");
  }
}

/** The company's public careers address, with copy/open and (owner) a way to change it. */
export function CareersLinkCard({ openCount }: { openCount: number }) {
  const { isOwner } = useAuth();
  const { data: slug, isPending: isLoading, isError } = useCompanySlug();
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const url = slug ? careersUrl(slug) : "";

  const copy = async () => {
    await copyText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:p-5 sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 text-primary">
          <Globe className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="micro-label text-muted-foreground">Public careers page</p>
          {isLoading ? (
            <Skeleton className="mt-1 h-4 w-56" />
          ) : slug ? (
            <p className="truncate text-sm font-semibold text-foreground" title={url}>
              {url.replace(/^https?:\/\//, "")}
            </p>
          ) : (
            <p className="text-sm font-semibold text-foreground">{isError ? "Address could not be loaded" : "No address set yet"}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {!slug && !isLoading
              ? isError
                ? "Refresh the page to try again."
                : isOwner
                  ? "Choose an address to publish your open roles."
                  : "Ask the workspace owner to choose an address."
              : openCount === 0
                ? "No open roles are listed right now."
                : `${openCount} open ${openCount === 1 ? "role is" : "roles are"} listed. Share the link anywhere.`}
          </p>
        </div>
      </div>
      {!slug && !isLoading && !isError && isOwner && (
        <Button size="sm" onClick={() => setEditing(true)} className="self-start sm:self-auto">
          <Pencil className="mr-1.5 h-3.5 w-3.5" /> Set address
        </Button>
      )}
      {slug && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={copy} aria-label="Copy careers page link">
            {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open
            </a>
          </Button>
          {isOwner && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)} aria-label="Change careers page address">
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit address
            </Button>
          )}
        </div>
      )}
      {isOwner && !isError && !isLoading && <SlugDialog open={editing} onOpenChange={setEditing} current={slug ?? ""} />}
    </div>
  );
}

function SlugDialog({ open, onOpenChange, current }: { open: boolean; onOpenChange: (v: boolean) => void; current: string }) {
  const [value, setValue] = useState(current);
  const save = useSetCompanySlug();
  const next = slugify(value);
  const valid = next.length >= 2;

  // The dialog is opened from outside (open prop), so Radix never reports the opening; start from the saved address each time.
  useEffect(() => {
    if (open) setValue(current);
  }, [open, current]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Careers page address</DialogTitle>
          <DialogDescription>
            {current ? "Links already shared with the old address will stop working." : "Pick a short, recognisable address. Your open roles are listed there."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            save.mutate(next, { onSuccess: () => onOpenChange(false) });
          }}
        >
          <Label htmlFor="careers-slug">Address</Label>
          <div className="flex items-center gap-2">
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">/careers/</span>
            <Input id="careers-slug" value={value} maxLength={60} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
          </div>
          <p className="text-xs text-muted-foreground">
            {valid ? (
              <>
                Will be <span className="font-medium text-foreground">{careersUrl(next).replace(/^https?:\/\//, "")}</span>
              </>
            ) : (
              "Use at least 2 letters or digits."
            )}
          </p>
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid || next === current || save.isPending}>
              {save.isPending ? "Saving…" : "Save address"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
