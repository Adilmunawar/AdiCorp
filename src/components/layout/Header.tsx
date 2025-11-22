
import GlobalSearch from "./GlobalSearch";
import NotificationDropdown from "./NotificationDropdown";

export default function Header({ title }: { title: string }) {
  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-card/90 backdrop-blur-sm sticky top-0 z-50">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <img 
              src="/AdilMunawar-Uploads/31e3e556-6bb0-44a2-bd2d-6d5fa04f0ba9.png" 
              alt="AdiCorp Logo" 
              className="w-10 h-10 rounded-lg object-cover border border-border"
            />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              {title}
            </h1>
            <p className="text-xs text-muted-foreground">HR Management System</p>
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <GlobalSearch />
        <NotificationDropdown />
      </div>
    </header>
  );
}
