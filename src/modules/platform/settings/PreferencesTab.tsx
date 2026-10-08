import { useEffect, useMemo, useState } from "react";
import { FileSignature, Plane, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/kit";
import { cn } from "@/lib/utils";
import { useUpdateSettings, type CompanySettings, type SettingsPatch } from "../api";
import { CONTROL, SaveBar, SettingRow, SettingsList, ToggleRow } from "../components/form";
import { useReportDirty } from "../components/unsaved";

interface PrefForm {
  require_push_notifications: boolean;
  self_service_edits: boolean;
  leave_requires_approval: boolean;
  letter_signatory_name: string;
  letter_signatory_title: string;
  letter_reference_prefix: string;
}

function fromSettings(s: CompanySettings): PrefForm {
  return {
    require_push_notifications: s.require_push_notifications,
    self_service_edits: s.self_service_edits,
    leave_requires_approval: s.leave_requires_approval,
    letter_signatory_name: s.letter_signatory_name ?? "",
    letter_signatory_title: s.letter_signatory_title ?? "",
    letter_reference_prefix: s.letter_reference_prefix ?? "HR",
  };
}

// Same rule as the server and the Letters settings (letter_settings): 2 to 8 letters or digits. A
// shorter limit here blocked every preference save once Letters had saved a longer prefix.
const PREFIX_RE = /^[A-Z0-9]{2,8}$/;

export function PreferencesTab({ settings }: { settings: CompanySettings }) {
  const { company } = useAuth();
  const initial = useMemo(() => fromSettings(settings), [settings]);
  const [form, setForm] = useState<PrefForm>(initial);
  const update = useUpdateSettings();
  useEffect(() => setForm(initial), [initial]);

  const set = <K extends keyof PrefForm>(key: K, value: PrefForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const prefixError = PREFIX_RE.test(form.letter_reference_prefix) ? null : "Use 2 to 8 letters or digits, for example NOP.";

  const patch = useMemo<SettingsPatch>(() => {
    const p: SettingsPatch = {};
    (Object.keys(form) as (keyof PrefForm)[]).forEach((k) => {
      const a = form[k];
      const b = initial[k];
      if (typeof a === "string" ? a.trim() !== String(b).trim() : a !== b) {
        (p as Record<string, unknown>)[k] = typeof a === "string" ? a.trim() || null : a;
      }
    });
    return p;
  }, [form, initial]);
  const dirty = Object.keys(patch).length > 0;
  useReportDirty(dirty);

  const save = async () => {
    if (prefixError) {
      toast.error("Check the reference prefix");
      return;
    }
    try {
      await update.mutateAsync(patch);
      toast.success("Preferences saved");
    } catch (e) {
      toast.error("Could not save", { description: e instanceof Error ? e.message : undefined });
    }
  };

  const year = new Date().getFullYear();
  const prefix = form.letter_reference_prefix || "XX";
  const signName = form.letter_signatory_name.trim();
  const signTitle = form.letter_signatory_title.trim() || "Human Resources";

  return (
    <div className="space-y-4">
      <SectionCard title="Employee portal" description="How the portal keeps people informed and what they can change themselves" icon={Smartphone} flush>
        <SettingsList>
          <ToggleRow
            id="require-push"
            label="Require notifications"
            description="Employees must allow notifications on their device before using the portal, so leave decisions, letters and payslips reach them straight away."
            checked={form.require_push_notifications}
            onChange={(v) => set("require_push_notifications", v)}
            status={form.require_push_notifications ? "Required" : "Optional"}
          />
          <ToggleRow
            id="self-service"
            label="Profile change requests"
            description="Employees can ask to update their phone, address, emergency contact and similar details. HR approves each request before it is applied."
            checked={form.self_service_edits}
            onChange={(v) => set("self_service_edits", v)}
          />
        </SettingsList>
      </SectionCard>

      <SectionCard title="Leave" description="Who decides on leave requests" icon={Plane} flush>
        <SettingsList>
          <ToggleRow
            id="leave-approval"
            label="Leave needs HR approval"
            description={
              form.leave_requires_approval
                ? "Every request waits for HR. Turn this off to approve requests within the remaining balance automatically."
                : "Requests within the remaining balance are approved and marked in attendance automatically; anything that cannot be approved stays pending for HR."
            }
            checked={form.leave_requires_approval}
            onChange={(v) => set("leave_requires_approval", v)}
            status={form.leave_requires_approval ? "Required" : "Automatic"}
          />
        </SettingsList>
      </SectionCard>

      <SectionCard title="HR letters" description="Signatory and reference numbers printed on issued letters" icon={FileSignature} flush>
        <SettingsList>
          <SettingRow id="sig-name" label="Signatory name" description="Printed under the signature line.">
            <Input id="sig-name" value={form.letter_signatory_name} maxLength={80} onChange={(e) => set("letter_signatory_name", e.target.value)} placeholder="For example, Ayesha Khan" className={CONTROL} />
          </SettingRow>
          <SettingRow id="sig-title" label="Signatory title" description="Their job title, under the name.">
            <Input id="sig-title" value={form.letter_signatory_title} maxLength={80} onChange={(e) => set("letter_signatory_title", e.target.value)} placeholder="For example, Head of People" className={CONTROL} />
          </SettingRow>
          <SettingRow id="ref-prefix" label="Reference prefix" description="Starts every letter number, so letters can be traced." error={prefixError}>
            <Input
              id="ref-prefix"
              value={form.letter_reference_prefix}
              maxLength={8}
              onChange={(e) => set("letter_reference_prefix", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
              aria-invalid={!!prefixError}
              aria-describedby={prefixError ? "ref-prefix-error" : undefined}
              className={cn(CONTROL, "max-w-[200px] font-mono uppercase")}
            />
          </SettingRow>
          <SettingRow label="Preview" description="How the reference and signature appear on a letter.">
            <div className="rounded-xl border border-border bg-muted/30 p-4" aria-label="Letter preview">
              <p className="text-xs text-muted-foreground">
                Ref: <span className="font-mono font-semibold text-foreground">{`${prefix}/HR/${year}/0001`}</span>
                <span className="text-muted-foreground">, then 0002 and so on</span>
              </p>
              <div className="mt-6 w-48 max-w-full border-t border-foreground/40 pt-1.5">
                <p className={cn("truncate text-[13px] font-semibold", signName ? "text-foreground" : "italic text-muted-foreground")} title={signName || undefined}>
                  {signName || "Signatory name"}
                </p>
                <p className="truncate text-xs text-muted-foreground" title={signTitle}>
                  {signTitle}
                </p>
                {company?.name && (
                  <p className="truncate text-xs text-muted-foreground" title={company.name}>
                    {company.name}
                  </p>
                )}
              </div>
            </div>
          </SettingRow>
        </SettingsList>
      </SectionCard>

      <SaveBar dirty={dirty} saving={update.isPending} onSave={() => void save()} onReset={() => setForm(initial)} />
    </div>
  );
}
