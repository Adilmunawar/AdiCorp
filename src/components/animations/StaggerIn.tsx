import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface StaggerInProps {
  children: React.ReactNode;
  staggerDelay?: number;
  className?: string;
}

export default function StaggerIn({ children, staggerDelay = 100, className }: StaggerInProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <div className={className} style={{ opacity: 0 }} />;

  return (
    <div className={cn(className)}>
      {React.Children.map(children, (child, index) => {
        if (!React.isValidElement(child)) return child;
        return (
          <div
            className="animate-in fade-in slide-in-from-bottom-4 fill-mode-both"
            style={{ animationDelay: `${index * staggerDelay}ms`, animationDuration: '500ms' }}
          >
            {child}
          </div>
        );
      })}
    </div>
  );
}
