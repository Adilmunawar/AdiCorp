import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmployeeAuth } from "@/context/EmployeeAuthContext";

export function useEmployeePortalData() {
  const { employee } = useEmployeeAuth();

  return useQuery({
    queryKey: ["employee_portal_data", employee?.id],
    queryFn: async () => {
      if (!employee?.id) throw new Error("No employee session");

      const [rpcResponse, leaveRequestsResponse] = await Promise.all([
        supabase.rpc("get_employee_portal_data", { p_emp_id: employee.id }),
        supabase.from("leave_requests").select("*").eq("employee_id", employee.id).eq("status", "approved")
      ]);

      if (rpcResponse.error) throw rpcResponse.error;
      if (leaveRequestsResponse.error) throw leaveRequestsResponse.error;
      
      const rpcData = rpcResponse.data as any;

      const { data: eventsData } = await supabase
        .from("events")
        .select("*")
        .eq("company_id", rpcData.profile.company_id)
        .eq("affects_attendance", true);

      return {
        profile: rpcData.profile,
        company: rpcData.company,
        attendance: rpcData.attendance,
        payslips: rpcData.payslips,
        documents: rpcData.documents,
        leave_requests: leaveRequestsResponse.data || [],
        events: eventsData || [],
      };
    },
    enabled: !!employee?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
