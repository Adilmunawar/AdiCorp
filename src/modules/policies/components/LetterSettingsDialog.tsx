import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLetterSettings, useSaveLetterSettings } from "../lib/api";
import { errorMessage } from "../lib/company";

/** Reference prefix and the default signatory for letters. */
export function LetterSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { data, error } = useLetterSettings();
  const save = useSaveLetterSettings();
  const [prefix, setPrefix] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (open && data) {
      setPrefix(data.ref_prefix);
      setName(data.signatory_name);
      setTitle(data.signatory_title);
    }
  }, [open, data]);

  const prefixOk = /^[A-Z0-9]{2,8}$/.test(prefix);
  // The server's next number (this year's series in the company's calendar) with the prefix being typed.
  const nextRef = data ? data.next_ref.replace(/^[^/]*/, prefix || data.default_prefix) : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await save.mutateAsync({ prefix, name: name.trim(), title: title.trim() });
      toast.success("Letter settings saved");
      onOpenChange(false);
    } catch (err) {
      toast.error("Could not save", { description: errorMessage(err) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Letter settings</DialogTitle>
            <DialogDescription>References are numbered per year. The signatory is remembered from the last letter you issue.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="ls-prefix">Reference prefix</Label>
            <Input
              id="ls-prefix"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
              placeholder={data?.default_prefix ?? "NOP"}
              aria-invalid={!!data && !prefixOk}
              disabled={!data}
              className="font-mono uppercase"
            />
            <p className="text-[11px] text-muted-foreground">
              The next letter will be numbered <span className="font-mono text-foreground">{nextRef ?? "…"}</span>. Numbering starts again at 0001 each year.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ls-name">Signed by</Label>
              <Input id="ls-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Full name" disabled={!data} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ls-title">Designation</Label>
              <Input id="ls-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Human Resources" disabled={!data} />
            </div>
          </div>
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {errorMessage(error)}
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!prefixOk || name.trim().length < 2 || title.trim().length < 2 || save.isPending}>
              {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
