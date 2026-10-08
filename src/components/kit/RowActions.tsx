import { useState, type ReactNode } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "./ConfirmButton";

export interface RowAction {
  label: string;
  icon?: LucideIcon;
  onSelect: () => unknown | Promise<unknown>;
  destructive?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  /** Ask before running. */
  confirm?: { title: ReactNode; description?: ReactNode; confirmLabel?: string };
  /** Draw a separator above this action. */
  separated?: boolean;
}

export interface RowActionsProps {
  actions: RowAction[];
  /** Accessible label of the trigger and sheet title on phones. */
  label?: string;
  className?: string;
}

/** Per-row actions: a dropdown on desktop and a bottom sheet on phones, with optional confirm step. */
export function RowActions({ actions, label = "Actions", className }: RowActionsProps) {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<RowAction | null>(null);
  const visible = actions.filter((a) => !a.hidden);
  if (visible.length === 0) return null;

  const choose = (action: RowAction) => {
    setSheetOpen(false);
    if (action.confirm) {
      setPendingConfirm(action);
      return;
    }
    void action.onSelect();
  };

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      className={cn("h-10 w-10 rounded-lg text-muted-foreground hover:text-foreground sm:h-8 sm:w-8", className)}
      onClick={(e) => {
        e.stopPropagation();
        if (isMobile) setSheetOpen(true);
      }}
    >
      <MoreHorizontal className="h-4 w-4" />
    </Button>
  );

  return (
    <>
      {isMobile ? (
        <>
          {trigger}
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetContent side="bottom" className="rounded-t-2xl px-3 pb-6 pt-4" onClick={(e) => e.stopPropagation()}>
              <SheetHeader className="px-2 pb-2 text-left">
                <SheetTitle className="text-sm font-bold">{label}</SheetTitle>
                <SheetDescription className="sr-only">Choose an action</SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-1">
                {visible.map((action) => (
                  <button
                    key={action.label}
                    type="button"
                    disabled={action.disabled}
                    onClick={() => choose(action)}
                    className={cn(
                      "flex h-11 items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-50",
                      action.destructive && "text-destructive",
                    )}
                  >
                    {action.icon && <action.icon className="h-4 w-4" aria-hidden />}
                    {action.label}
                  </button>
                ))}
              </div>
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[180px] rounded-xl" onClick={(e) => e.stopPropagation()}>
            {visible.map((action, i) => (
              <div key={action.label}>
                {action.separated && i > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  disabled={action.disabled}
                  onSelect={() => choose(action)}
                  className={cn("gap-2 rounded-lg text-xs font-semibold", action.destructive && "text-destructive focus:text-destructive")}
                >
                  {action.icon && <action.icon className="h-3.5 w-3.5" aria-hidden />}
                  {action.label}
                </DropdownMenuItem>
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {pendingConfirm?.confirm && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setPendingConfirm(null)}
          title={pendingConfirm.confirm.title}
          description={pendingConfirm.confirm.description}
          confirmLabel={pendingConfirm.confirm.confirmLabel ?? pendingConfirm.label}
          destructive={pendingConfirm.destructive ?? true}
          onConfirm={pendingConfirm.onSelect}
        />
      )}
    </>
  );
}
