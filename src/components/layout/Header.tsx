
import GlobalSearch from "./GlobalSearch";
import NotificationDropdown from "./NotificationDropdown";
import { Button } from "@/components/ui/button";
import { PanelLeft } from "lucide-react";

interface HeaderProps {
  title: string;
  onMenuClick?: () => void;
  showMenuButton?: boolean;
}

export default function Header({ title, onMenuClick, showMenuButton = false }: HeaderProps) {
  return (
    <header className="h-10 flex items-center justify-between px-3 md:px-5 bg-card/95 backdrop-blur-sm sticky top-0 z-50">
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        {showMenuButton && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onMenuClick}
            className="h-7 w-7 rounded-lg shrink-0"
            aria-label="Toggle sidebar"
          >
            <PanelLeft className="h-3.5 w-3.5" />
          </Button>
        )}
        <h1 className="text-sm font-semibold text-foreground truncate">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden sm:block scale-90 origin-right">
          <GlobalSearch />
        </div>
        <div className="scale-90 origin-right">
          <NotificationDropdown />
        </div>
      </div>
    </header>
  );
}
