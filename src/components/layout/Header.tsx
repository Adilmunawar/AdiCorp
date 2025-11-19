
import GlobalSearch from "./GlobalSearch";
import NotificationDropdown from "./NotificationDropdown";

export default function Header({ title }: { title: string }) {
  return (
    <header className="h-20 flex items-center justify-between px-8 border-b border-border/50 animate-fade-in bg-card/80 backdrop-blur-xl shadow-sm sticky top-0 z-50">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="relative">
            <img 
              src="/AdilMunawar-Uploads/31e3e556-6bb0-44a2-bd2d-6d5fa04f0ba9.png" 
              alt="AdiCorp Logo" 
              className="w-12 h-12 rounded-xl object-cover ring-2 ring-primary/20 shadow-lg"
            />
            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-card"></div>
          </div>
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground via-primary to-foreground bg-clip-text text-transparent">
              {title}
            </h1>
            <p className="text-xs text-muted-foreground font-medium">Professional HR Management</p>
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
