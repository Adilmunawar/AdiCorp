import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button. Default true. */
  destructive?: boolean;
  /** May return a promise; the dialog stays open with a spinner until it settles, and closes on success. */
  onConfirm: () => unknown | Promise<unknown>;
  /** Extra content between the description and the buttons (e.g. a reason field). */
  children?: ReactNode;
  confirmDisabled?: boolean;
}

/** Controlled confirm dialog. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = true,
  onConfirm,
  children,
  confirmDisabled,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);

  const run = async () => {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // The caller reports the error (toast); keep the dialog open so the user can retry or cancel.
    } finally {
      setPending(false);
    }
  };

  return (
    // The dialog is portalled, but React still bubbles its clicks (overlay included) to whatever rendered it:
    // inside a clickable table row, "Cancel" or "Delete" would also open that row.
    <span className="contents" onClick={(e) => e.stopPropagation()}>
      <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] rounded-2xl sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-bold">{title}</AlertDialogTitle>
            {description && <AlertDialogDescription className="text-sm">{description}</AlertDialogDescription>}
          </AlertDialogHeader>
          {children}
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel disabled={pending} className="rounded-xl">
              {cancelLabel}
            </AlertDialogCancel>
            <Button
              type="button"
              variant={destructive ? "destructive" : "default"}
              size="sm"
              className="h-10 rounded-xl"
              disabled={pending || confirmDisabled}
              onClick={run}
            >
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </span>
  );
}

export interface ConfirmButtonProps extends Omit<ButtonProps, "onClick" | "title"> {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => unknown | Promise<unknown>;
  /** Trigger content. */
  children: ReactNode;
}

/** A button that asks for confirmation (AlertDialog) before running `onConfirm`. */
export function ConfirmButton({
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = true,
  onConfirm,
  children,
  variant,
  className,
  ...buttonProps
}: ConfirmButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={variant ?? (destructive ? "outline" : "default")}
        className={cn(destructive && !variant && "text-destructive hover:text-destructive", className)}
        onClick={() => setOpen(true)}
        {...buttonProps}
      >
        {children}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        cancelLabel={cancelLabel}
        destructive={destructive}
        onConfirm={onConfirm}
      />
    </>
  );
}
