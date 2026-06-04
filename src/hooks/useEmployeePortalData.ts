import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";

export function useEmployeePortalData() {
  const { employee } = useEmployeeAuth();

  return useQuery({
    queryKey: ["employee_portal_data", employee?.id],
    queryFn: async () => {
      if (!employee?.id) throw new Error("No employee session");

      const { data, error } = await supabase.rpc("get_employee_portal_data", {
        p_emp_id: employee.id
      });

      if (error) throw error;
      
      return data as {
        profile: any;
        company: { name: string; logo_url: string };
        attendance: any[];
        payslips: any[];
        documents: any[];
      };
    },
    enabled: !!employee?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
