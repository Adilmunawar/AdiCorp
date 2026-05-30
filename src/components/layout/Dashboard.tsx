import { ReactNode, useState, useEffect } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useLocation } from "react-router-dom";

interface DashboardProps {
  children: ReactNode;
  title: string;
}

export default function Dashboard({ children, title }: DashboardProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isMobile = useIsMobile();
  const location = useLocation();

  useEffect(() => {
    if (!isMobile) setMobileSidebarOpen(false);
  }, [isMobile]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleSidebarToggle = () => {
    if (isMobile) {
      setMobileSidebarOpen((prev) => !prev);
      return;
    }

    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    localStorage.setItem('sidebar_collapsed', String(next));
  };

  return (
    <div className="h-screen overflow-hidden flex bg-muted/30 w-full">
      <Sidebar
        collapsed={sidebarCollapsed}
        mobileOpen={mobileSidebarOpen}
        onToggleCollapse={handleSidebarToggle}
      />

      {isMobile && mobileSidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-background/60 backdrop-blur-[1px]"
          onClick={() => setMobileSidebarOpen(false)}
          aria-label="Close sidebar"
        />
      )}

      <div className={cn(
        "flex-1 h-screen min-w-0 flex flex-col overflow-hidden transition-all duration-300",
        isMobile ? "ml-0" : sidebarCollapsed ? "ml-[60px]" : "ml-[220px]"
      )}>
        <Header title={title} onMenuClick={handleSidebarToggle} showMenuButton={isMobile} />
        <main
          className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 md:p-6 transition-opacity duration-300 ease-out"
          style={{
            opacity: mounted ? 1 : 0,
            transform: mounted ? "translateY(0)" : "translateY(8px)",
          }}
        >
          <div className="max-w-full">{children}</div>
        </main>
      </div>
    </div>
  );
}
