import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface EmployeeSession {
  id: string;
  name: string;
  cnic: string;
  company_id: string;
  rank: string;
  needs_password_change: boolean;
  avatar_url?: string;
}

interface EmployeeAuthContextType {
  employee: EmployeeSession | null;
  login: (cnic: string, password: string) => Promise<void>;
  logout: () => void;
  updateSession: (updates: Partial<EmployeeSession>) => void;
  isLoading: boolean;
}

const EmployeeAuthContext = createContext<EmployeeAuthContextType | undefined>(undefined);

export function EmployeeAuthProvider({ children }: { children: React.ReactNode }) {
  const [employee, setEmployee] = useState<EmployeeSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check local storage for an active session
    const stored = localStorage.getItem("employee_session");
    if (stored) {
      try {
        setEmployee(JSON.parse(stored));
      } catch (e) {
        localStorage.removeItem("employee_session");
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (cnic: string, password: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc("employee_login", {
        p_cnic: cnic,
        p_password: password
      });

      if (error) throw error;
      
      const res = data as any;
      if (res.error) {
        throw new Error(res.error);
      }

      const session: EmployeeSession = {
        id: res.id,
        name: res.name,
        cnic: res.cnic,
        company_id: res.company_id,
        rank: res.rank,
        needs_password_change: res.needs_password_change,
        avatar_url: res.avatar_url
      };

      setEmployee(session);
      localStorage.setItem("employee_session", JSON.stringify(session));
    } finally {
      setIsLoading(false);
    }
  };

  const updateSession = (updates: Partial<EmployeeSession>) => {
    if (!employee) return;
    const newSession = { ...employee, ...updates };
    setEmployee(newSession);
    localStorage.setItem("employee_session", JSON.stringify(newSession));
  };

  const logout = () => {
    setEmployee(null);
    localStorage.removeItem("employee_session");
  };

  return (
    <EmployeeAuthContext.Provider value={{ employee, login, logout, updateSession, isLoading }}>
      {children}
    </EmployeeAuthContext.Provider>
  );
}

export function useEmployeeAuth() {
  const context = useContext(EmployeeAuthContext);
  if (context === undefined) {
    throw new Error("useEmployeeAuth must be used within an EmployeeAuthProvider");
  }
  return context;
}
