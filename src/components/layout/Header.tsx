

import { Button } from "@/components/ui/button";
import { PanelLeft } from "lucide-react";

interface HeaderProps {
  title: string;
  onMenuClick?: () => void;
  showMenuButton?: boolean;
}

export default function Header({ title, onMenuClick, showMenuButton = false }: HeaderProps) {
  // Only render on mobile to save space on desktop
  if (!showMenuButton) return null;

  return (
    <header className="h-12 flex items-center px-4 bg-background border-b md:hidden sticky top-0 z-50">
      <div className="flex items-center gap-3 min-w-0 w-full">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="h-9 w-9 rounded-lg shrink-0 hover:bg-muted"
          aria-label="Toggle sidebar"
        >
          <PanelLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-base font-semibold text-foreground truncate">{title}</h1>
      </div>
    </header>
  );
}
