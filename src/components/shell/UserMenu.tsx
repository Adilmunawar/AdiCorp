import { useNavigate } from "react-router-dom";
import { Bell, ChevronDown, ChevronsUpDown, LogOut, Search, Settings, UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { roleLabel, useAuth } from "@/context/AuthContext";
import { initials } from "@/components/kit/format";
import { adminRoutes } from "@/modules/registry";
import { MOD_KEY, useSearch } from "./search";
import { cn } from "@/lib/utils";

/** Display name for the signed-in staff member. */
export function useStaffName(): string {
  const { profile, user } = useAuth();
  const full = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
  return full || user?.email?.split("@")[0] || "Account";
}

function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-primary/15 bg-primary/10 text-[10px] font-bold text-primary",
        className,
      )}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : initials(name)}
    </span>
  );
}

export interface UserMenuProps {
  /** "sidebar": full-width card; "topbar": avatar button. */
  variant?: "sidebar" | "topbar";
  compact?: boolean;
}

/** Account menu: name, role, company, account page and sign out. */
export function UserMenu({ variant = "topbar", compact = false }: UserMenuProps) {
  const { user, profile, role, company, signOut } = useAuth();
  const navigate = useNavigate();
  const name = useStaffName();
  const { setOpen: openSearch } = useSearch();
  const canOpen = (path: string) => !!role && adminRoutes.some((r) => r.path === path && r.roles.includes(role));

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  const trigger =
    variant === "sidebar" ? (
      <button
        type="button"
        aria-label="Account menu"
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl border border-foreground/5 bg-foreground/[0.03] p-1.5 text-left transition-colors hover:bg-foreground/[0.06]",
          compact && "w-9 justify-center border-0 bg-transparent p-0.5",
        )}
      >
        <Avatar name={name} src={profile?.avatar_url} className="h-7 w-7" />
        {!compact && (
          <>
            <span className="min-w-0 flex-1 leading-none">
              <span className="block truncate text-[12px] font-semibold text-foreground">{name}</span>
              <span className="mt-1 block truncate text-[11px] text-muted-foreground">{roleLabel(role)}</span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          </>
        )}
      </button>
    ) : (
      <button
        type="button"
        aria-label={`Account menu for ${name}`}
        className="flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-full transition-[border-color,box-shadow,background-color] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9 sm:w-9 lg:h-auto lg:w-auto lg:border lg:border-border lg:bg-card lg:py-1 lg:pl-1 lg:pr-2.5 lg:shadow-sm lg:hover:border-foreground/20 lg:hover:bg-card lg:hover:shadow-md"
      >
        <Avatar name={name} src={profile?.avatar_url} className="h-8 w-8 lg:h-7 lg:w-7" />
        <span className="hidden min-w-0 text-left leading-tight lg:block">
          <span className="block max-w-[150px] truncate text-[12px] font-semibold text-foreground">{name}</span>
          <span className="block max-w-[150px] truncate text-[11px] text-muted-foreground">{roleLabel(role)}</span>
        </span>
        <ChevronDown className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground lg:block" aria-hidden />
      </button>
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={variant === "sidebar" ? "start" : "end"} side={variant === "sidebar" ? "top" : "bottom"} className="w-60 rounded-xl">
        <DropdownMenuLabel className="flex items-center gap-2.5 py-2 font-normal">
          <Avatar name={name} src={profile?.avatar_url} className="h-9 w-9" />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold">{name}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{user?.email}</span>
          </span>
        </DropdownMenuLabel>
        <div className="mx-2 mb-1.5 flex items-center justify-between rounded-lg bg-muted/60 px-2.5 py-1.5">
          <span className="truncate text-xs font-medium text-foreground/80">{company?.name ?? "No company"}</span>
          <span className="ml-2 shrink-0 rounded-full bg-primary/10 px-2 py-px text-[11px] font-semibold text-primary">{roleLabel(role)}</span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2 rounded-lg text-[13px] font-medium" onSelect={() => navigate("/account")}>
          <UserRound className="h-4 w-4 text-muted-foreground" /> My account
        </DropdownMenuItem>
        {canOpen("/notifications") && (
          <DropdownMenuItem className="gap-2 rounded-lg text-[13px] font-medium" onSelect={() => navigate("/notifications")}>
            <Bell className="h-4 w-4 text-muted-foreground" /> Notifications
          </DropdownMenuItem>
        )}
        {canOpen("/settings") && (
          <DropdownMenuItem className="gap-2 rounded-lg text-[13px] font-medium" onSelect={() => navigate("/settings")}>
            <Settings className="h-4 w-4 text-muted-foreground" /> Company settings
          </DropdownMenuItem>
        )}
        <DropdownMenuItem className="gap-2 rounded-lg text-[13px] font-medium" onSelect={() => openSearch(true)}>
          <Search className="h-4 w-4 text-muted-foreground" /> Search
          <DropdownMenuShortcut className="font-sans text-[11px] font-semibold tracking-normal">{MOD_KEY} K</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="gap-2 rounded-lg text-[13px] font-medium text-destructive focus:text-destructive" onSelect={handleSignOut}>
          <LogOut className="h-4 w-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
