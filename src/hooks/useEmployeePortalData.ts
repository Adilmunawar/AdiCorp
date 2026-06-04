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
      
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('name, logo_url')
        .eq('id', employee.company_id)
        .single();
        
      if (companyError && companyError.code !== 'PGRST116') {
        console.error("Error fetching company data:", companyError);
      }
      
      return {
        ...(data as any),
        company: companyData
      } as {
        profile: any;
        attendance: any[];
        payslips: any[];
        documents: any[];
        company?: { name: string; logo_url: string };
      };
    },
    enabled: !!employee?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
