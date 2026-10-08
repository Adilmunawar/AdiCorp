import { useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMediaBelow } from "@/hooks/use-mobile";
import { EDITABLE_FIELDS, FIELD_LABELS, useRequestProfileUpdate, type EditableField, type PortalProfile, type ProfileChanges } from "../api";

interface ProfileEditSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: PortalProfile;
  /** Values of the pending request, shown instead of the record. */
  pending?: ProfileChanges | null;
}

type FormState = Record<EditableField, string>;

function initialState(profile: PortalProfile, pending?: ProfileChanges | null): FormState {
  const s = {} as FormState;
  for (const f of EDITABLE_FIELDS) s[f] = String(pending?.[f] ?? profile[f] ?? "");
  return s;
}

const SECTIONS: { title: string; fields: EditableField[] }[] = [
  { title: "Personal", fields: ["father_name", "date_of_birth", "gender", "education"] },
  { title: "Contact", fields: ["email", "phone", "emergency_contact", "address"] },
  { title: "Bank", fields: ["bank_name", "bank_account_number"] },
];

const INPUT_TYPES: Partial<Record<EditableField, string>> = { email: "email", phone: "tel", date_of_birth: "date" };
const AUTOCOMPLETE: Partial<Record<EditableField, string>> = { email: "email", phone: "tel", date_of_birth: "bday", address: "street-address" };

/** Request profile changes; HR reviews and applies them. */
export function ProfileEditSheet({ open, onOpenChange, profile, pending }: ProfileEditSheetProps) {
  const phone = useMediaBelow(640);
  const request = useRequestProfileUpdate();
  const [form, setForm] = useState<FormState>(() => initialState(profile, pending));

  useEffect(() => {
    if (open) {
      setForm(initialState(profile, pending));
    }
  }, [open, profile, pending]);

  const changes = useMemo(() => {
    const out: ProfileChanges = {};
    for (const f of EDITABLE_FIELDS) {
      const v = form[f].trim();
      if (v && v !== String(profile[f] ?? "").trim()) out[f] = v;
    }
    return out;
  }, [form, profile]);
  const changedCount = Object.keys(changes).length;

  const set = (field: EditableField, value: string) => setForm((s) => ({ ...s, [field]: value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (changedCount === 0) {
      toast.info("Nothing has changed");
      return;
    }
    request.mutate(changes, {
      onSuccess: (res) => {
        toast.success(res.replaced ? "Your pending request was updated" : "Request sent to HR", {
          description: "You'll get a notification when HR reviews it.",
        });
        onOpenChange(false);
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Could not send your request"),
    });
  };

  const renderField = (f: EditableField) => {
    const id = `pe-${f}`;
    if (f === "gender") {
      return (
        <Select value={form.gender || undefined} onValueChange={(v) => set("gender", v)}>
          <SelectTrigger id={id} className="h-10 rounded-xl">
            <SelectValue placeholder="Select" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="male">Male</SelectItem>
            <SelectItem value="female">Female</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      );
    }
    if (f === "address") {
      return <Textarea id={id} rows={2} maxLength={300} value={form.address} onChange={(e) => set("address", e.target.value)} autoComplete={AUTOCOMPLETE.address} className="resize-none rounded-xl" />;
    }
    return (
      <Input
        id={id}
        type={INPUT_TYPES[f] ?? "text"}
        autoComplete={AUTOCOMPLETE[f]}
        maxLength={f === "email" ? 254 : 120}
        value={form[f]}
        onChange={(e) => set(f, e.target.value)}
        className="h-10 rounded-xl"
      />
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={phone ? "bottom" : "right"} className={phone ? "max-h-[92dvh] overflow-y-auto rounded-t-3xl px-4 pb-6" : "w-full overflow-y-auto sm:max-w-md"}>
        <form onSubmit={submit} className="flex min-h-full flex-col">
          <SheetHeader className="text-left">
            <SheetTitle className="font-display text-base font-semibold">Request profile changes</SheetTitle>
            <SheetDescription className="text-xs">HR reviews every change before it is saved to your record.</SheetDescription>
          </SheetHeader>

          {pending && (
            <div className="mt-4 flex gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3 text-[11px] text-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden />
              You already have a request waiting for HR. Sending this form replaces it.
            </div>
          )}

          <div className="mt-4 flex-1 space-y-5">
            {SECTIONS.map((section) => (
              <fieldset key={section.title} className="space-y-3">
                <legend className="micro-label mb-2 text-primary">{section.title}</legend>
                {section.fields.map((f) => (
                  <div key={f} className="space-y-1.5">
                    <Label htmlFor={`pe-${f}`} className="flex items-center justify-between text-xs font-semibold">
                      {FIELD_LABELS[f]}
                      {changes[f] !== undefined && <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Changed</span>}
                    </Label>
                    {renderField(f)}
                  </div>
                ))}
              </fieldset>
            ))}
            <p className="text-[11px] text-muted-foreground">Your name, CNIC and job details are managed by HR. Ask HR directly if they need correcting.</p>
          </div>

          <SheetFooter className="sticky bottom-0 mt-5 gap-2 border-t border-border/60 bg-background pt-4 sm:flex-row">
            <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="h-10 rounded-xl" disabled={request.isPending || changedCount === 0}>
              {request.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {changedCount ? `Send ${changedCount} change${changedCount === 1 ? "" : "s"} to HR` : "Send to HR"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
