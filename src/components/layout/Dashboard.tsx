
import { ReactNode } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";

interface DashboardProps {
  children: ReactNode;
  title: string;
}

export default function Dashboard({ children, title }: DashboardProps) {
  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      
      <div className="flex-1 ml-64 min-h-screen flex flex-col">
        <Header title={title} />
        
        <main className="flex-1 p-8 overflow-auto bg-gradient-to-br from-background via-background to-muted/20">
          <div className="animate-fade-in max-w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
