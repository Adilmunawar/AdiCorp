import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { errorMessage, useDepartments, useSaveAnnouncement } from "../lib/api";
import type { AnnouncementAudience, StaffAnnouncement } from "../lib/types";
import { RichTextEditor } from "./RichText";

interface AnnouncementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit this one; create when null. */
  announcement: StaffAnnouncement | null;
}

export function AnnouncementDialog({ open, onOpenChange, announcement }: AnnouncementDialogProps) {
  const save = useSaveAnnouncement();
  const departments = useDepartments();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [pinned, setPinned] = useState(false);
  const [audience, setAudience] = useState<AnnouncementAudience>("all");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(announcement?.title ?? "");
    setContent(announcement?.content ?? "");
    setPinned(announcement?.pinned ?? false);
    setAudience(announcement?.audience ?? "all");
    setDepartmentId(announcement?.department_id ?? "");
    setTried(false);
  }, [open, announcement]);

  const titleError = title.trim().length < 3 ? "Give it a title of at least 3 characters." : title.trim().length > 120 ? "Keep the title under 120 characters." : null;
  const contentError = !content.trim() ? "Write the announcement first." : content.length > 4000 ? "Keep it under 4000 characters." : null;
  const audienceError = audience === "department" && !departmentId ? "Choose the department that should see it." : null;
  const hasDepartments = (departments.data?.length ?? 0) > 0;

  const submit = async () => {
    setTried(true);
    if (titleError || contentError || audienceError) return;
    try {
      await save.mutateAsync({
        id: announcement?.id ?? null,
        title: title.trim(),
        content: content.trim(),
        pinned,
        audience,
        department_id: audience === "department" ? departmentId : null,
      });
      toast.success(announcement ? "Announcement updated." : "Announcement posted. Everyone it is for has been notified.");
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[92dvh] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-base font-semibold">{announcement ? "Edit announcement" : "New announcement"}</DialogTitle>
          <DialogDescription className="text-xs">
            {announcement ? "Edits are shown right away. Nobody is notified again." : "Everyone in the audience gets a notification in the portal and on their devices."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="announcement-title" className="micro-label">
              Title
            </Label>
            <Input
              id="announcement-title"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Office closed on Friday for maintenance"
              aria-invalid={(tried && !!titleError) || undefined}
              className="h-10 rounded-xl"
            />
            {tried && titleError && <p className="text-[11px] font-semibold text-destructive">{titleError}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="announcement-content" className="micro-label">
              Message
            </Label>
            <RichTextEditor
              id="announcement-content"
              value={content}
              onChange={setContent}
              maxLength={4000}
              invalid={tried && !!contentError}
              placeholder="What do people need to know? Use the toolbar for headings, lists and links."
            />
            {tried && contentError && <p className="text-[11px] font-semibold text-destructive">{contentError}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="micro-label">Who sees it</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as AnnouncementAudience)}>
                <SelectTrigger className="h-10 rounded-xl" aria-label="Audience">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone</SelectItem>
                  <SelectItem value="department" disabled={!hasDepartments}>
                    One department
                    {hasDepartments ? "" : departments.isPending ? " (loading…)" : departments.isError ? " (could not load departments)" : " (none set up yet)"}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            {audience === "department" && (
              <div className="space-y-1.5">
                <Label className="micro-label">Department</Label>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger className="h-10 rounded-xl" aria-label="Department" aria-invalid={(tried && !!audienceError) || undefined}>
                    <SelectValue placeholder="Choose a department" />
                  </SelectTrigger>
                  <SelectContent>
                    {(departments.data ?? []).map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {tried && audienceError && <p className="text-[11px] font-semibold text-destructive">{audienceError}</p>}
              </div>
            )}
          </div>

          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-3.5 py-3">
            <span>
              <span className="block text-xs font-bold">Pin to the top</span>
              <span className="block text-[11px] text-muted-foreground">Pinned announcements stay above the rest until you unpin them.</span>
            </span>
            <Switch checked={pinned} onCheckedChange={setPinned} aria-label="Pin to the top" />
          </label>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" className="rounded-xl" disabled={save.isPending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {announcement ? "Save changes" : "Post announcement"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
